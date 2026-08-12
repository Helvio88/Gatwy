# Stage 1: Build
# moonlight-web-stream glibc binaries need GLIBC_2.38+; bookworm is 2.36.
# node:22-noble is not published — use Debian trixie (glibc ≥ 2.39).
FROM node:22-trixie-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all dependencies
RUN npm install

# Copy source
COPY tsconfig.base.json ./
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build client then server
RUN npm run build --workspace=packages/client
RUN npm run build --workspace=packages/server

# Stage 2: Production
FROM node:22-trixie-slim

ARG TARGETARCH
ARG MOONLIGHT_WEB_VERSION=v2.10.0

WORKDIR /app

# Runtime deps: curl/ca-certs for healthcheck, gosu for privilege drop,
# openssl for TLS helpers. moonlight-web-stream is a glibc binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gosu openssl \
  && rm -rf /var/lib/apt/lists/*

# Bundle moonlight-web-stream (server-side Moonlight client + WebRTC/WS streamer)
RUN set -eux; \
  case "$TARGETARCH" in \
    amd64) ML_ARCH=x86_64-unknown-linux-gnu ;; \
    arm64) ML_ARCH=aarch64-unknown-linux-gnu ;; \
    *) echo "Unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/moonlight-web.tar.gz \
    "https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/${MOONLIGHT_WEB_VERSION}/moonlight-web-${ML_ARCH}.tar.gz"; \
  mkdir -p /opt/moonlight-web; \
  tar -xzf /tmp/moonlight-web.tar.gz -C /opt/moonlight-web --strip-components=1; \
  chmod +x /opt/moonlight-web/web-server /opt/moonlight-web/streamer; \
  rm -f /tmp/moonlight-web.tar.gz; \
  ldd --version | head -1; \
  /opt/moonlight-web/web-server -V \
    || /opt/moonlight-web/web-server --help \
    || /opt/moonlight-web/web-server help

# Gatwy chrome: quiet connecting overlay + force sops on StartStream (Sunshine client resolution)
COPY docker/mlw-patches/ /tmp/gatwy-mlw-patches/
# Explicit sh: slim image has no bash; script is POSIX + sed/node only.
RUN chmod +x /tmp/gatwy-mlw-patches/patch-static.sh \
  && sh /tmp/gatwy-mlw-patches/patch-static.sh /opt/moonlight-web/static /tmp/gatwy-mlw-patches \
  && rm -rf /tmp/gatwy-mlw-patches

ENV MOONLIGHT_WEB_DIR=/opt/moonlight-web

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --omit=dev --workspace=packages/server

# Copy built server
COPY --from=builder /app/packages/server/dist packages/server/dist/

# Copy built client
COPY --from=builder /app/packages/client/dist packages/client/dist/

# Pre-create data directory with correct ownership BEFORE declaring VOLUME.
RUN mkdir -p /app/data && chown -R node:node /app /opt/moonlight-web

# Copy entrypoint — runs as root, chowns /app/data, then drops to node user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7443
# Optional WebRTC UDP range when not using WebSocket transport
EXPOSE 40000-40100/udp

VOLUME /app/data

ENV DATA_DIR=/app/data
ENV NODE_ENV=production
# @marsaud/smb2 uses ntlm which calls DES-ECB — a legacy cipher disabled in OpenSSL 3.
ENV NODE_OPTIONS="--openssl-legacy-provider"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -fsk https://localhost:7443/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "packages/server/dist/index.js"]
