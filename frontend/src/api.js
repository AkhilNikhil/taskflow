import { supabase } from "./supabaseClient";

export const BASE_API_URL = import.meta.env.VITE_API_URL || "";
export const DIRECT_BACKEND_URL = (
  window.__APP_CONFIG__?.BACKEND_URL || import.meta.env.VITE_DIRECT_BACKEND_URL || ""
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 100000;

async function timedFetch(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest(endpoint, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const method = (options.method || "GET").toUpperCase();
  const isSafeToRetry = method === "GET" || method === "HEAD";   // never re-send POST/PUT/DELETE
  const canFallback = isSafeToRetry && !BASE_API_URL && DIRECT_BACKEND_URL;

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${BASE_API_URL}${cleanEndpoint}`;
  const reqOptions = { ...options, headers };

  let response;
  try {
    response = await timedFetch(url, reqOptions);
  } catch (err) {
    if (!canFallback) throw err;
    response = await timedFetch(`${DIRECT_BACKEND_URL}${cleanEndpoint}`, reqOptions);
  }

  if (canFallback && (response.status === 502 || response.status === 504)) {
    try {
      const fb = await timedFetch(`${DIRECT_BACKEND_URL}${cleanEndpoint}`, reqOptions);
      if (fb.status !== 502 && fb.status !== 504) response = fb;
    } catch {
      /* keep original response */
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const responseData = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 403 && /^Account is (suspended|disabled)/i.test(responseData?.message || "")) {
      window.dispatchEvent(new CustomEvent("account-blocked", { detail: responseData.message }));
    }
    const error = new Error(responseData?.message || responseData?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = responseData;
    throw error;
  }
  return responseData;
}
