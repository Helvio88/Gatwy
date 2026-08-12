# Changelog

## 0.19.1

### Packaging

- Docker base image moved from `node:22-bookworm-slim` (glibc 2.36) to `node:22-trixie-slim` so bundled moonlight-web-stream binaries (GLIBC_2.38/2.39) can load.
- Image build now runs `web-server -V`/`help` after downloading moonlight-web, so wrong glibc/arch fails at build time instead of at session start.

### Moonlight / Sunshine

- If the moonlight-web process exits before ready, Gatwy fails fast and surfaces early stderr (e.g. missing GLIBC symbols) in the error shown to the UI.

## 0.19.0

### Moonlight / Sunshine

- Added **Moonlight** as a first-class Remote Control protocol alongside RDP and VNC.
- Browser sessions stream a Sunshine (GameStream-compatible) host through a bundled [moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream) runtime inside the Gatwy container.
- **PIN pairing flow**: on first connect to an unpaired host, Gatwy shows a modal with a 4-digit PIN to enter in the Sunshine web UI. Pairing material is persisted under `/app/data` (moonlight-web storage + Gatwy encrypted backup) and survives container restarts.
- Subsequent connects skip PIN and stream directly (default app: Desktop).
- **Forget pairing** is available from the connection editor and the Moonlight session chrome.
- RBAC: new `protocols.moonlight` permission, granted by default to admin/user roles that already have RDP/VNC.
- Audit events: `session.moonlight.connect`, `session.moonlight.disconnect`, `session.moonlight.pair`.

### Packaging

- Docker image now bundles moonlight-web `web-server` + `streamer` binaries.
- Compose example builds from the git repo (`docker compose up --build`).
- README updated for this Helvio88/Gatwy fork and Moonlight networking notes.

## 0.18.0

- Prior release baseline (upstream Gatwy feature set).
