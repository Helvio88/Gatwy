# Changelog

## 0.19.4

### Moonlight / Sunshine

- Connecting overlay inside the embedded `/mlw` iframe no longer uses moonlight-web’s huge cyan neon splash. Gatwy injects (and Docker-patches) quiet chrome: dark translucent panel, muted “Connecting…” copy, subtle gray/white spinner — aligned with RDP session status.
- Stream start now forces Moonlight **Optimize game settings** (`sops: true`) so Sunshine can apply `dd_resolution_option=auto` / client width×height. Applied via `mlSettings`, WebSocket `StartStream.settings` wrap, and a build-time patch of moonlight-web `static/stream/index.js`.
- Width/height from Auto and presets still flow into `StartStream.settings` as before; sops is enabled by default for Gatwy sessions (no MLW UI toggle required).
- **Host still required:** in Sunshine → Audio/Video, keep output resolution on **client** / **automatic**. If that is disabled, the host will not resize even with sops on.

## 0.19.3

### Reliability / DB

- sql.js persistence no longer uses `PRAGMA journal_mode = WAL` (not meaningful for full-DB file export); uses `MEMORY` instead.
- Database saves are atomic: write to a temp file, fsync, then rename over the primary path so a mid-write kill cannot truncate/`malformed` the live DB.
- On open, a malformed or integrity-check-failed DB is quarantined to `${dbPath}.corrupt-<timestamp>` (plus any `-wal`/`-shm` leftovers), then Gatwy starts a fresh empty DB and runs migrations — avoiding fatal startup crash-loops.
- Backup restore (`restoreDbFromBytes`) also persists via the same atomic save path.

## 0.19.2

### Moonlight UI polish

- Session chrome now uses the same right-edge flyout panel pattern as RDP (status, fullscreen, bitrate/FPS, resolution, forget pairing, disconnect).
- Pairing modal aligns with other Gatwy session overlays.
- On-stream stats HUD restyled via same-origin `/mlw` CSS injection: small, muted, semi-transparent corner text instead of the default high-contrast overlay.
- README: treat Moonlight like any other protocol (no bold/hype); drop PIN pairing from highlights.

### Moonlight resolution

- Stream resolution presets (720p–4K and common laptop sizes) plus Auto (client area) default.
- Preference persisted per connection (`extra_config_json` / session settings API).
- Auto mode re-measures the session viewport on resize (debounced), updates moonlight-web launch settings, and cleanly restarts the stream so Sunshine follows the new desktop size — not CSS letterboxing.

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
