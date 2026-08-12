# Third-party components

Gatwy is licensed under the [MIT License](LICENSE) (Copyright kotoxie).

## moonlight-web-stream (optional)

[moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream) is licensed under **GPL-3.0**.

It is **not** part of Gatwy’s default source tree or default Docker image. Gatwy only downloads or embeds those binaries when you opt in:

- **Runtime (recommended):** set `MOONLIGHT_DOWNLOAD=1` on the container. That one env var is enough — the entrypoint fetches moonlight-web-stream into `/opt/moonlight-web` (or `MOONLIGHT_WEB_DIR` if you override the path).
- **Build (optional bake-in):** `docker build --build-arg INCLUDE_MOONLIGHT=1 …` or compose `build.args: INCLUDE_MOONLIGHT: "1"`.
- **Manual / bare metal:** `scripts/fetch-moonlight-web.sh` or a [release tarball](https://github.com/MrCreativ3001/moonlight-web-stream/releases). Set `MOONLIGHT_WEB_DIR` only for a custom path.

Pinned release used by the opt-in helpers: **v2.10.0**.

Without that runtime, the Moonlight protocol reports `available: false`. Other protocols are unchanged.

Related projects: [Moonlight](https://moonlight-stream.org/), [Sunshine](https://github.com/LizardByte/Sunshine).
