# T3 Thread startup harness

The startup harness launches real T3 Thread windows and measures the path from harness admission to an inputable composer, or to a prepared composer in workspace-isolated mode. It is a local diagnostic tool. It does not send a message, start provider work, capture the screen, or publish telemetry.

## Run an installed artifact

The default target is the verified current production installation. Each run opens a normal unsent draft and closes its independent Electron process after readiness is observed.

```text
pnpm perf:thread:startup --runs 5
```

Use a trace-capable installed artifact. An older artifact closes the optional trace pipe without milestones, so the harness reports a bounded timeout rather than inventing readiness.

The installer prepares executable code before publishing a release. For a direct candidate, run `node scripts/thread-launcher.mjs --prepare /path/to/T3-Thread.AppImage` before measuring repeat-launch latency. Without preparation, the first direct launch includes one-time expansion. Later launches verify the artifact and prepared code without extracting again. Label cold preparation and repeat-launch series separately. Prepared code is retained when clients close; writable profiles and runtime directories remain independent.

## Run an explicit candidate

An explicit artifact and server origin must be supplied together. The channel controls the native application identity.

```text
pnpm perf:thread:startup \
  --artifact /opt/t3-thread/T3-Thread.AppImage \
  --server-url https://thread.example.test \
  --channel staging \
  --runs 5 \
  --workspace 4 \
  --timeout-ms 15000 \
  --output-dir /tmp/t3-thread-startup-evidence
```

When targeting an interactive desktop, that desktop session must be unlocked. A normal run requires both a focused Thread window and a CSS-visible, content-editable composer. Focus and composer readiness may arrive in either order.

`--workspace 4` measures composer preparation without forcing native focus. Preparation means one concrete editor is mounted, content-editable, and enabled. Native visibility is not required because Chromium reports a window on an inactive workspace as hidden. The harness preserves a compositor assignment that already placed the exact Thread window on workspace 4. Otherwise it moves that window without following it, then restores the workspace and focused window that were active before the run. The requested workspace and the prepared target are recorded in the summary. Workspace isolation controls measurement interference and is not itself evidence of a speedup.

When the invoking shell has no display variables, the harness imports only the graphical display and session bus fields from the current user service manager. It ignores every unrelated environment field.

## Evidence

Every run writes one private JSON trace. `summary.json` records the exact readiness target and reports min, p50, p95, and max elapsed time for each milestone. It also ranks contiguous startup segments by p50 so the largest cumulative costs are visible first.

The main milestones are launcher admission, prepared-release verification, child spawn, Electron module evaluation, activation input, Electron readiness, window creation, document load, preload evaluation, activation delivery, composer mount, and composer inputability. `launcher.release-verified` separates release verification from process startup. Window visibility, launcher acknowledgement, focus, and renderer completion remain side milestones because they can overlap the contiguous critical path.

Timestamps use monotonic process clocks anchored to their process time origin. Records contain only a fixed milestone name, process role, contract version, and timestamp. Paths, origins, activation identities, draft text, credentials, and process identifiers are excluded.

## Interpretation

Use at least five runs on an otherwise idle machine. Compare p50 for ordinary improvement and p95 for startup variance. Treat the ranked segments as leads, then confirm any optimization with another complete series against the same artifact channel and server state.

The harness begins inside its wrapper. The desktop keybinding and any user-owned entry adapter execute before this boundary and need a separate outer measurement if their cost becomes material.

## Native headless verification

A separate, disposable Wayland compositor can exercise the actual Electron shell while the user's desktop stays locked. This is a fixture strategy, not a `--headless` option on the startup command. Headless Chromium alone does not prove native window placement or Wayland keyboard delivery.

The validated fixture uses a headless labwc host and nested Hyprland with an explicit virtual output. Its private window rule assigns Thread to virtual workspace 4. Bubblewrap hides the host runtime directory, display sockets, session bus and physical input devices. Only the render device and necessary read-only graphics metadata are available. A private session bus, keyring, application configuration and server state keep enrollment separate from the user's environment. No global package installation or desktop configuration change is needed when the compositor dependencies are provided in a verified portable prefix.

Supply all graphical environment variables explicitly inside this fixture. Never let a missing virtual display fall back to the host user service manager. A TLS fixture may trust its exact test certificate through Electron's SPKI allowlist; do not disable certificate verification globally or weaken Thread's HTTPS and protected-storage requirements.

Test the production web bundle through the normal server authentication and WebSocket paths. Establish disposable enrollment before timing repeat launches. Record the shell artifact, served bundle, compositor versions, connection conditions and whether each launch uses AppImage extraction or an already expanded executable. Keep remote debugging loopback-only and confined to the disposable client. Do not send provider work merely to prove typing.

For native input, establish the virtual keyboard before sending the test text, keep it alive until the editor has received the complete text, and assert exact draft content and native focus. Immediate virtual-device creation and teardown can lose an initial key or remove focus. Reading before the keyboard has finished produces a false failure. Composer readiness and the later verified input event are separate boundaries; neither is a physical shortcut measurement.

Matched five-run fixture measurements isolated roughly one second between per-launch AppImage extraction and an already expanded copy of the same candidate. That comparison identifies release preparation as an optimization target. It is not an installed-path improvement, a warm resident-client result, or evidence that remote server startup has disappeared. FUSE mounting was unavailable inside the restricted namespace and is not an accepted substitute based on this fixture.
