#!/bin/sh
# Download a pinned moonlight-web-stream release and apply Gatwy chrome patches.
#
# moonlight-web-stream is GPL-3.0. Gatwy is MIT. This script is opt-in only —
# the default Docker image does not run it and does not embed those binaries.
#
# Usage:
#   fetch-moonlight-web [dest] [version] [arch]
#   MOONLIGHT_WEB_DIR=/opt/moonlight-web MOONLIGHT_WEB_VERSION=v2.10.0 fetch-moonlight-web
#
# arch: Docker TARGETARCH (amd64|arm64) or uname -m (x86_64|aarch64).
set -eu

DEST="${1:-${MOONLIGHT_WEB_DIR:-/opt/moonlight-web}}"
VERSION="${2:-${MOONLIGHT_WEB_VERSION:-v2.10.0}}"
ARCH_HINT="${3:-${TARGETARCH:-}}"

echo "moonlight-web-stream is licensed under GPL-3.0."
echo "Source:  https://github.com/MrCreativ3001/moonlight-web-stream"
echo "Release: https://github.com/MrCreativ3001/moonlight-web-stream/releases/tag/${VERSION}"
echo "Gatwy remains MIT; this download is optional and is not part of the default image."
echo

if [ -z "$ARCH_HINT" ]; then
  ARCH_HINT="$(uname -m)"
fi
case "$ARCH_HINT" in
  amd64|x86_64) ML_ARCH=x86_64-unknown-linux-gnu ;;
  arm64|aarch64) ML_ARCH=aarch64-unknown-linux-gnu ;;
  *)
    echo "Unsupported architecture: $ARCH_HINT" >&2
    exit 1
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download moonlight-web-stream" >&2
  exit 1
fi

URL="https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/${VERSION}/moonlight-web-${ML_ARCH}.tar.gz"
TMP_TGZ="$(mktemp)"
trap 'rm -f "$TMP_TGZ"' EXIT

echo "Downloading ${URL}"
curl -fsSL -o "$TMP_TGZ" "$URL"

mkdir -p "$DEST"
tar -xzf "$TMP_TGZ" -C "$DEST" --strip-components=1
chmod +x "$DEST/web-server" "$DEST/streamer"

if [ -x "$DEST/web-server" ]; then
  "$DEST/web-server" -V \
    || "$DEST/web-server" --help \
    || "$DEST/web-server" help \
    || true
fi

PATCH_DIR="${MLW_PATCH_DIR:-}"
if [ -z "$PATCH_DIR" ]; then
  if [ -d /opt/gatwy/mlw-patches ]; then
    PATCH_DIR=/opt/gatwy/mlw-patches
  else
    SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    if [ -d "$SCRIPT_DIR/../docker/mlw-patches" ]; then
      PATCH_DIR="$SCRIPT_DIR/../docker/mlw-patches"
    fi
  fi
fi

if [ -n "${PATCH_DIR}" ] && [ -f "$PATCH_DIR/patch-static.sh" ]; then
  echo "Applying Gatwy stream chrome patches from $PATCH_DIR"
  chmod +x "$PATCH_DIR/patch-static.sh" 2>/dev/null || true
  sh "$PATCH_DIR/patch-static.sh" "$DEST/static" "$PATCH_DIR"
else
  echo "No Gatwy mlw-patches directory found; skipped static patches."
fi

echo "moonlight-web-stream installed at $DEST"
echo "Set MOONLIGHT_WEB_DIR=$DEST if it is not already."
