#!/usr/bin/env bash
# Patch bundled moonlight-web static assets for Gatwy chrome + sops.
set -euo pipefail

STATIC_DIR="${1:-/opt/moonlight-web/static}"
PATCH_DIR="${2:-/tmp/gatwy-mlw-patches}"

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "moonlight-web static dir missing: $STATIC_DIR" >&2
  exit 1
fi

install -m 0644 "$PATCH_DIR/gatwy-stream.css" "$STATIC_DIR/styles/gatwy-stream.css"
install -m 0644 "$PATCH_DIR/gatwy-sops.js" "$STATIC_DIR/gatwy-sops.js"

STREAM_HTML="$STATIC_DIR/stream.html"
if [[ -f "$STREAM_HTML" ]] && ! grep -q 'gatwy-stream.css' "$STREAM_HTML"; then
  # Insert Gatwy CSS + early sops hook after the standard stylesheet link.
  sed -i \
    's#<link rel="stylesheet" href="styles/standard.css" id="style">#<link rel="stylesheet" href="styles/standard.css" id="style">\n    <link rel="stylesheet" href="styles/gatwy-stream.css" id="gatwy-style">\n    <script src="gatwy-sops.js"></script>#' \
    "$STREAM_HTML"
fi

STREAM_INDEX="$STATIC_DIR/stream/index.js"
if [[ -f "$STREAM_INDEX" ]] && ! grep -q 'sops:' "$STREAM_INDEX"; then
  # Add sops:true next to hdr in StartStream settings object.
  # Matches both pretty and minified-ish TypeScript emit shapes.
  python3 - <<'PY' "$STREAM_INDEX"
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
# Common emit: hdr: (_a = this.settings.hdr) !== null && _a !== void 0 ? _a : false,
pat = re.compile(
    r'(hdr:\s*(?:\([^)]+\)|[^\n,]+),)',
    re.MULTILINE,
)
def repl(m):
    chunk = m.group(1)
    if 'sops' in chunk:
        return chunk
    return chunk + '\n                sops: true,'
new, n = pat.subn(repl, text, count=1)
if n == 0:
    # Fallback: insert before closing of settings object that has bitrate_kbps
    pat2 = re.compile(
        r'(bitrate_kbps:\s*this\.settings\.bitrate,[\s\S]*?hdr:\s*[^\n,]+,)',
        re.MULTILINE,
    )
    def repl2(m):
        return m.group(1) + '\n                sops: true,'
    new, n = pat2.subn(repl2, text, count=1)
if n == 0:
    print('warning: could not patch sops into stream/index.js', file=sys.stderr)
else:
    path.write_text(new)
    print(f'patched sops into {path}')
PY
fi

echo "Gatwy moonlight-web static patches applied in $STATIC_DIR"
