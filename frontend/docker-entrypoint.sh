#!/bin/sh
set -e

if [ -z "${BACKEND_URL}" ]; then
  echo "[TaskFlow Entrypoint] ERROR: BACKEND_URL is not set." >&2
  echo "[TaskFlow Entrypoint] Set it to your backend's address, e.g.:" >&2
  echo "[TaskFlow Entrypoint]   BACKEND_URL=https://your-backend.onrender.com" >&2
  echo "[TaskFlow Entrypoint] (Docker Compose users: this is set for you automatically.)" >&2
  exit 1
fi

CLEAN_BACKEND=$(echo "$BACKEND_URL" | sed 's:/*$::')
echo "[TaskFlow Entrypoint] Nginx reverse-proxying /api/ -> ${CLEAN_BACKEND}"

cp /etc/nginx/conf.d/default.conf.template /etc/nginx/conf.d/default.conf
sed -i "s|__BACKEND_URL__|${CLEAN_BACKEND}|g" /etc/nginx/conf.d/default.conf

# Public URL for the browser-side wake-up ping (only meaningful for https backends)
case "$CLEAN_BACKEND" in
  https://*) PUBLIC_URL="$CLEAN_BACKEND" ;;
  *)         PUBLIC_URL="" ;;
esac
printf 'window.__APP_CONFIG__ = { BACKEND_URL: "%s" };\n' "$PUBLIC_URL" > /usr/share/nginx/html/config.js

exec nginx -g "daemon off;"
