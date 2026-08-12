# Changelog

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
