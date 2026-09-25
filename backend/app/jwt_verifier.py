import hashlib
import os
import time
import uuid
from typing import Any, Dict, Optional

import jwt
import requests
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError


class AuthError(Exception):
    """Exception raised for authentication and JWT verification errors."""

    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


_jwk_client: Optional[PyJWKClient] = None
_remote_cache: Dict[str, tuple] = {}
REMOTE_CACHE_TTL = 30      # seconds
REMOTE_CACHE_MAX = 500


def _supabase_url() -> str:
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    if not url:
        raise AuthError("Server auth is not configured (SUPABASE_URL missing)", 500)
    return url.rstrip("/")


def get_jwk_client(supabase_url: str) -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)
    return _jwk_client


def _validate_sub(payload: Dict[str, Any]) -> Dict[str, Any]:
    sub = payload.get("sub")
    if not sub:
        raise AuthError("Token payload missing subject ('sub') claim", 401)
    try:
        uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise AuthError("Token subject ('sub') is not a valid UUID", 401)
    return payload


def _verify_remote(token: str, supabase_url: str, audience: str) -> Dict[str, Any]:
    """Ask Supabase Auth to validate the token. Fails CLOSED on any problem."""
    cache_key = hashlib.sha256(token.encode()).hexdigest()
    cached = _remote_cache.get(cache_key)
    if cached and cached[0] > time.time():
        return cached[1]

    headers = {"Authorization": f"Bearer {token}"}
    anon = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    if anon:
        headers["apikey"] = anon

    try:
        resp = requests.get(f"{supabase_url}/auth/v1/user", headers=headers, timeout=6)
    except requests.RequestException:
        raise AuthError("Authentication service temporarily unavailable", 503)

    if resp.status_code == 200:
        data = resp.json()
        payload = {
            "sub": data.get("id"),
            "email": data.get("email"),
            "user_metadata": data.get("user_metadata", {}),
            "app_metadata": data.get("app_metadata", {}),
            "role": data.get("role", "authenticated"),
            "aud": audience,
        }
        if len(_remote_cache) >= REMOTE_CACHE_MAX:
            _remote_cache.clear()
        _remote_cache[cache_key] = (time.time() + REMOTE_CACHE_TTL, payload)
        return payload
    if resp.status_code in (400, 401, 403):
        raise AuthError("Session token rejected", 401)
    raise AuthError("Authentication service temporarily unavailable", 503)


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    if not token or not isinstance(token, str):
        raise AuthError("Authentication token is missing or empty", 401)

    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise AuthError("Invalid token", 401)

    alg = header.get("alg", "")
    if not alg or alg.lower() == "none":
        raise AuthError("Unsigned tokens are not accepted", 401)

    audience = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    supabase_url = _supabase_url()
    issuer = f"{supabase_url}/auth/v1"
    secret = os.getenv("SUPABASE_JWT_SECRET")
    payload: Optional[Dict[str, Any]] = None

    # 1. Asymmetric keys (RS256 / ES256) via JWKS
    if alg.startswith(("RS", "ES")):
        try:
            signing_key = get_jwk_client(supabase_url).get_signing_key_from_jwt(token)
            payload = jwt.decode(token, signing_key.key, algorithms=[alg],
                                 audience=audience, issuer=issuer, leeway=10,
                                 options={"verify_exp": True})
        except jwt.ExpiredSignatureError:
            raise AuthError("Token has expired", 401)
        except PyJWKClientConnectionError:
            raise AuthError("Authentication service temporarily unavailable", 503)
        except Exception:
            raise AuthError("Token verification failed", 401)

    # 2. Symmetric (HS256) with the project's JWT secret
    elif alg == "HS256" and secret:
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"],
                                 audience=audience, issuer=issuer, leeway=10,
                                 options={"verify_exp": True})
        except jwt.ExpiredSignatureError:
            raise AuthError("Token has expired", 401)
        except (jwt.InvalidAudienceError, jwt.InvalidIssuerError):
            raise AuthError("Token audience or issuer is invalid", 401)
        except jwt.PyJWTError:
            payload = None  # wrong/rotated secret: let Supabase decide (step 3)

    # 3. Ask Supabase directly (cached, fails closed)
    if payload is None:
        payload = _verify_remote(token, supabase_url, audience)

    # NOTE: there is intentionally NO "trust unsigned claims" fallback any more.
    return _validate_sub(payload)
