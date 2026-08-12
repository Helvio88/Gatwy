#!/bin/sh
set -e

# Ensure the data directory (which may be a bind-mount owned by root on the
# host) is writable by the node user before dropping privileges.
chown -R node:node /app/data

# Prefer gosu (Debian) with a fallback to su-exec (Alpine) for local/dev images.
if command -v gosu >/dev/null 2>&1; then
  exec gosu node "$@"
elif command -v su-exec >/dev/null 2>&1; then
  exec su-exec node "$@"
else
  exec runuser -u node -- "$@"
fi
