#!/bin/sh
set -e

# glibc sidecar for moonlight-web-stream (GPL-3.0). Gatwy stays Alpine / MIT.
# Never fetches unless ENABLE_MOONLIGHT is 1/true/yes.
ml_flag=$(printf '%s' "${ENABLE_MOONLIGHT:-0}" | tr '[:upper:]' '[:lower:]')
case "$ml_flag" in
  1|true|yes)
    ;;
  *)
    echo "[moonlight-web] ENABLE_MOONLIGHT is unset; not fetching moonlight-web-stream"
    exec sleep infinity
    ;;
esac

dest="/opt/moonlight-web"
data="/data"
mkdir -p "$dest" "$data"

if [ ! -x "$dest/web-server" ] || [ ! -x "$dest/streamer" ]; then
  echo "[moonlight-web] ENABLE_MOONLIGHT=$ENABLE_MOONLIGHT: fetching moonlight-web-stream (GPL-3.0) into $dest"
  fetch-moonlight-web "$dest"
else
  echo "[moonlight-web] ENABLE_MOONLIGHT set; moonlight-web already present at $dest"
fi
chmod +x "$dest/web-server" "$dest/streamer"

config_path="$data/config.json"
cat > "$config_path" <<EOF
{
  "web_server": {
    "bind_address": "0.0.0.0:19080",
    "url_path_prefix": "/mlw",
    "forwarded_header": {
      "username_header": "X-Gatwy-Moonlight-User",
      "auto_create_missing_user": true
    },
    "first_login_create_admin": true,
    "first_login_assign_global_hosts": true,
    "session_cookie_secure": false
  },
  "data_storage": {
    "type": "json",
    "path": "$data/data.json",
    "session_expiration_check_interval": { "secs": 300, "nanos": 0 }
  },
  "moonlight": {
    "default_http_port": 47989,
    "pair_device_name": "Gatwy"
  },
  "streamer_path": "$dest/streamer",
  "webrtc": {
    "port_range": { "min": 40000, "max": 40100 },
    "ice_servers": [
      {
        "urls": [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:3478"
        ],
        "username": "",
        "credential": ""
      }
    ],
    "network_types": ["udp4", "udp6"],
    "include_loopback_candidates": true
  },
  "log": {
    "level_filter": "INFO",
    "file_path": null,
    "dev_venator": false
  }
}
EOF

# uid 1000 matches the Gatwy node user so shared moonlight-web pairings stay writable.
chown -R moonlight:moonlight "$dest" "$data"
cd "$dest"

exec runuser -u moonlight -- "$dest/web-server" \
  --config-path "$config_path" \
  --bind-address 0.0.0.0:19080 \
  --path-prefix /mlw \
  --forwarded-header X-Gatwy-Moonlight-User \
  --streamer-path "$dest/streamer" \
  --webrtc-port-range 40000:40100 \
  run
