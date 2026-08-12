#!/bin/sh
set -e

# Ensure the data directory (which may be a bind-mount owned by root on the
# host) is writable by the node user before dropping privileges.
chown -R node:node /app/data

# Optional opt-in: download moonlight-web-stream (GPL-3.0) at container start.
# Never runs unless MOONLIGHT_DOWNLOAD is 1/true/yes — silent GPL fetch is not OK.
ml_flag=$(printf '%s' "${MOONLIGHT_DOWNLOAD:-0}" | tr '[:upper:]' '[:lower:]')
case "$ml_flag" in
  1|true|yes)
    dest="${MOONLIGHT_WEB_DIR:-/opt/moonlight-web}"
    if [ ! -x "$dest/web-server" ] || [ ! -x "$dest/streamer" ]; then
      echo "[Gatwy] MOONLIGHT_DOWNLOAD=$MOONLIGHT_DOWNLOAD: fetching moonlight-web-stream (GPL-3.0) into $dest"
      fetch-moonlight-web "$dest"
      chown -R node:node "$dest"
    else
      echo "[Gatwy] MOONLIGHT_DOWNLOAD set; moonlight-web already present at $dest"
    fi
    ;;
esac

# Prefer gosu (Debian) with a fallback to su-exec (Alpine) for local/dev images.
if command -v gosu >/dev/null 2>&1; then
  exec gosu node "$@"
elif command -v su-exec >/dev/null 2>&1; then
  exec su-exec node "$@"
else
  exec runuser -u node -- "$@"
fi
