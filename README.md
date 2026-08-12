<div align="center">

# Gatwy
### ![alt text](https://github.com/kotoxie/Gatwy/blob/master/packages/client/public/favicon.png?raw=true)


### Self-host your entire remote access stack in one Docker container — RDP, SSH, VNC, Moonlight/Sunshine, Telnet, SMB, SFTP, FTP, MySQL & PostgreSQL.


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Fork note:** This repository ([Helvio88/Gatwy](https://github.com/Helvio88/Gatwy)) is a fork of [kotoxie/Gatwy](https://github.com/kotoxie/Gatwy) with Moonlight/Sunshine streaming support. Deploy by building from source with Docker Compose.

</div>

---

## 🚀 Why Gatwy?

Most browser-based remote access tools relay your display through a server-side engine, adding latency and complexity. Gatwy's RDP client runs **entirely in your browser** using WebAssembly, while Moonlight sessions use an in-container streamer that forwards Sunshine/GameStream into the browser (WebSocket transport by default, WebRTC optional).

One container. Open your browser and connect.

---

## ✨ Highlights

- **10 protocols** — RDP (WebAssembly), SSH, VNC, Moonlight/Sunshine, Telnet, SMB, SFTP, FTP, PostgreSQL, MySQL
- **Split-pane workspace** — unlimited sessions side by side with drag-and-drop tabs
- **Session recording & audit** — encrypted RDP video, SSH asciinema, command-level audit log with auto-redacted passwords, file activity tracking
- **Granular RBAC** — fine-grained permissions, custom roles, per-connection sharing, protocol-level access control (including `protocols.moonlight`)
- **Auth flexibility** — local accounts, LDAP/AD, OpenID Connect (SSO), MFA (TOTP), IP access rules
- **Alerting** — SMTP, Telegram, Slack, Webhook channels with a no-code rule builder
- **Encrypted backup & restore** — single-file `.geb` backup with AES-256 encryption

---

## 🐳 Quick Start (build from git)

```bash
git clone https://github.com/Helvio88/Gatwy.git
cd Gatwy
docker compose up --build -d
```

`docker-compose.yml` builds from the repo context:

```yaml
services:
  gatwy:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gatwy
    restart: unless-stopped
    ports:
      - '7443:7443'
      # Optional WebRTC UDP range (only if you switch Moonlight off WebSocket transport)
      # - '40000-40100:40000-40100/udp'
    volumes:
      - ./data:/app/data
    environment:
      - GATWY_ENCRYPTION_KEY=your-64-char-hex-key  # openssl rand -hex 32
```

Open **`https://<YOUR_IP>:7443`** — on first launch you'll be prompted to create an admin account.

> ⚠️ The browser will warn about the self-signed certificate. Accept the exception to proceed.

### Without Docker (Node.js 22+)

```bash
git clone https://github.com/Helvio88/Gatwy.git && cd Gatwy
npm install && npm run build && npm start
```

> Moonlight streaming requires the bundled `web-server` / `streamer` binaries (installed automatically in the Docker image under `/opt/moonlight-web`). For bare-metal runs, download a [moonlight-web-stream release](https://github.com/MrCreativ3001/moonlight-web-stream/releases) and set `MOONLIGHT_WEB_DIR` to that folder.

---

## Moonlight / Sunshine

1. Create a connection under Remote Control → Moonlight.
2. Host = Sunshine PC hostname/IP. Port = 47989 (GameStream HTTP; override in advanced fields if needed).
3. Preferred app defaults to Desktop. Resolution defaults to Auto (client area); fixed presets are available in the connection editor and session controls. Touch mode defaults to point-and-drag (session panel).
4. Connect — if unpaired, enter the PIN Gatwy shows into the Sunshine web UI (usually `https://<pc>:47990`).
5. Streaming starts in a Gatwy tab. Use Forget pairing in the session controls to re-pair. In Auto mode, resizing the browser/tab restarts the stream at the new viewport size so the host desktop follows.

Gatwy enables Moonlight **Optimize game settings** (`sops`) on every stream start so Sunshine can honor the client resolution. On the Sunshine PC, Audio/Video → resolution should remain **client** / **automatic** (not a fixed host mode).

### Sunshine firewall / ports

On the Sunshine PC, allow at least:

| Port | Proto | Purpose |
|------|-------|---------|
| 47989 | TCP | GameStream HTTP |
| 47984 | TCP | GameStream HTTPS |
| 47990 | TCP | Sunshine web UI (PIN entry) |
| 48010 | TCP | RTSP |
| 47998–48000 | UDP | Video / audio / control |

Gatwy ↔ Sunshine must be reachable on those ports from the Gatwy container (same LAN is the common case).

### Gatwy Moonlight networking notes

- Default browser transport is **WebSocket** (works through Gatwy’s single HTTPS port `7443` — no extra UDP publish required).
- For WebRTC instead, publish UDP `40000-40100` on the Gatwy host and set `MOONLIGHT_WEBRTC_NAT_1TO1_HOST` to the Gatwy host’s LAN/public IP.
- Pairing certs live under `/app/data/moonlight-web` plus an encrypted backup in `/app/data/moonlight/pairings/`.

Credits: [Moonlight](https://moonlight-stream.org/), [Sunshine](https://github.com/LizardByte/Sunshine), [moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream).

---

## ⚙️ Configuration

| Variable | Default | Description |
|---|---|---|
| `GATWY_ENCRYPTION_KEY` | *(auto-generated file)* | 64-char hex AES-256 key. **Set this in production.** Generate with `openssl rand -hex 32` |
| `PORT` | `7443` | HTTPS port |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | *(auto)* | Custom TLS certificate & key paths |
| `DATA_DIR` | `/app/data` | Database, certs, recordings, logs, Moonlight pairing |
| `MOONLIGHT_WEB_DIR` | `/opt/moonlight-web` | Path to moonlight-web `web-server` + `streamer` |
| `MOONLIGHT_WEBRTC_PORT_MIN` / `_MAX` | `40000` / `40100` | WebRTC UDP range inside the container |
| `MOONLIGHT_WEBRTC_NAT_1TO1_HOST` | *(unset)* | Optional public/LAN IP advertised for WebRTC ICE |

> ⚠️ If no encryption key env var is set, Gatwy auto-generates one at `/app/data/encryption.key` with a warning banner. Fine for home-lab — not recommended for production.

---

## 🔄 Updating

```bash
git pull
docker compose up --build -d
```

---

## 📄 License

[MIT](LICENSE) — based on upstream [kotoxie/Gatwy](https://github.com/kotoxie/Gatwy). Moonlight streaming integrates [moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream); see that project for its license terms.
