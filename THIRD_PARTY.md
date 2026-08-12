# Third-party components

Gatwy is licensed under the [MIT License](LICENSE) (Copyright kotoxie).

## moonlight-web-stream (optional)

[moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream) is licensed under **GPL-3.0**.

It is **not** part of Gatwy’s default source tree or default Docker image. Gatwy only downloads or embeds those binaries when you opt in:

- Build: `docker build --build-arg INCLUDE_MOONLIGHT=1 …` (or `docker-compose.moonlight.yml`)
- Runtime: `MOONLIGHT_DOWNLOAD=1` (entrypoint fetch) or a manual install with `scripts/fetch-moonlight-web.sh`
- Bare metal: download a [release](https://github.com/MrCreativ3001/moonlight-web-stream/releases) and set `MOONLIGHT_WEB_DIR`

Pinned release used by the opt-in helpers: **v2.10.0**.

Without that runtime, the Moonlight protocol reports `available: false`. Other protocols are unchanged.

Related projects: [Moonlight](https://moonlight-stream.org/), [Sunshine](https://github.com/LizardByte/Sunshine).
