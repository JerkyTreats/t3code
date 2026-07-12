# Scripts

- `pnpm dev` — Starts the server and web development processes through the repository runner.
- `pnpm dev:server` — Starts just the WebSocket server.
- `pnpm dev:web` — Starts just the Vite dev server for the web app.
- Dev commands set `T3CODE_HOME` to an isolated base directory so dev state does not share prod state.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `pnpm dev -- --base-dir ~/.t3-2`
- `scripts/t3code-dev-serve` — Runs the built server on loopback with guarded dev defaults.
- `pnpm start` — Runs the production server.
- `pnpm build` — Builds application and package workspaces through Vite+.
- `pnpm typecheck` — Runs strict TypeScript checks for all packages.
- `pnpm test` — Runs workspace tests.
- `pnpm dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform, target, and architecture.
- `pnpm dist:desktop:dmg` — Builds a shareable macOS `.dmg` into `./release`.
- `pnpm dist:desktop:dmg:x64` — Builds an Intel macOS `.dmg`.
- `pnpm dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `pnpm dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop `.dmg` packaging notes

- Default build is unsigned/not notarized for local sharing.
- The DMG build uses `assets/macos-icon-1024.png` as the production app icon source.
- Desktop production windows load the bundled UI from `t3://app/index.html`, not a `127.0.0.1` document URL.
- Desktop packaging includes `apps/server/dist` and starts the `t3` backend on loopback with an auth token for WebSocket and API traffic.
- Your tester can still open it on macOS by right-clicking the app and choosing **Open** on first launch.
- To keep staging files for debugging package contents, run `pnpm dist:desktop:dmg -- --keep-stage`.
- To allow code-signing/notarization when configured in CI/secrets, add: `--signed`.
- Windows `--signed` uses Azure Trusted Signing and expects:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required, for example service principal with secret:
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Running multiple dev instances

Set `T3CODE_DEV_INSTANCE` to any value to deterministically shift all dev ports together.

- Default dev-runner ports: server `13773`, web `5733`
- Shifted ports: `base + offset`
- Example: `T3CODE_DEV_INSTANCE=branch-a pnpm dev:desktop`

If you want full control instead of hashing, set `T3CODE_PORT_OFFSET` to a numeric offset.

## Local Server Boundaries

- Prod systemd service: `t3code-host.service`
- Prod port: `3773`
- Prod base directory: `/home/jerkytreats/.t3`
- Prod command path: `/home/jerkytreats/.local/bin/t3code-host-serve`
- Desktop local backend: Electron managed loopback server with bootstrap auth
- Dev CLI port default: `3774`
- Dev CLI base directory default: `/home/jerkytreats/.t3-dev`
- Dev CLI command: `scripts/t3code-dev-serve`
- Dev systemd service: `t3code-dev.service`
- Dev service port: `3775`
- Dev service enabled state: disabled by default

`scripts/t3code-dev-serve` refuses to start if `T3CODE_HOME` points at `/home/jerkytreats/.t3` or if `T3CODE_PORT` is `3773`. Use another loopback port when Electron already owns the dev default, for example:

```sh
T3CODE_PORT=3775 scripts/t3code-dev-serve
```
