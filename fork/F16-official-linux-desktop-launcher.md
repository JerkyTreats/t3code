# F16 Official Linux Desktop Launcher

Date: 2026-09-06
Status: active

## Intent

Keep one canonical production server and one production T3 Code Electron identity in the default installed product topology. Keep staging as an explicit isolated development option. The independently packaged T3 Thread application may run any number of process-private clients against the canonical production server without starting another backend.

## Required Behavior

- Install one user systemd service that owns the long-running production server independently from Electron windows.
- Keep the separately managed staging host as an explicit nonproduction development environment rather than a default installation requirement.
- Install one visible `T3 Code` desktop entry and one visible `T3 Thread` desktop entry by default. Install `T3 Code Staging` only through explicit development configuration.
- Retain the official content-addressed T3 Code AppImage manifest, checksum validation, authenticated launch handoff, readiness validation, and production T3 Code single-instance ownership.
- Accept either a completed renderer load or the first visible renderer paint as launcher readiness. Withdraw that readiness on later main-frame navigation, load failure, renderer loss, or window close without treating subframe or in-page loading as a client restart.
- Run the verified AppImage in extract-and-run mode so Omarchy app-scope migration cannot detach Electron from a live FUSE mount owner during handoff.
- After an authenticated handoff primary exits, verify and stop only its exact PID-derived Omarchy app scope so no bundled backend survives into the replacement generation.
- Retain an isolated production T3 Code profile. Give every T3 Thread process a unique writable Chromium profile and connection; its protected enrollment is shared only under the F27 exact-origin contract.
- Require an explicit credential-free HTTPS production origin at default installation. Require a separate matching staging origin only when staging development support is explicitly selected.
- Use the matching standalone origin's browser session for both HTTP and WebSocket authentication without requesting a bundled-backend bearer token.
- Keep the canonical production host available to independently authenticated client applications without placing Thread authority in either T3 Code Electron identity.
- Do not start the AppImage bundled backend for either managed identity.
- Never point either Electron identity at server state or let Electron own either server lifecycle.
- Keep Kubernetes ownership limited to internal DNS, TLS, and reverse proxy publication.
- Keep the default production application entries to `T3 Code` and `T3 Thread`. An explicit development install may add `T3 Code Staging` without changing production defaults.
- Treat production as the only default durable T3 Code environment. Explicit staging remains a separate development environment. Auxiliary launch state and Electron profile state do not create another server environment.
- Do not copy Electron for either T3 Code identity, create replacement CSS, or issue pairing credentials from the desktop bootstrap.
- Focus a verified healthy T3 Code primary on repeat ordinary activation and start it only when absent. Do not restart a healthy Electron client as an ordinary launch step.
- After fresh readiness, reverify process ownership while waiting a bounded interval for the compositor to publish the exact PID and class before declaring focus failure. Never fall back to an ambient-profile Electron activation from this path.
- Focus the validated Hyprland address through the legacy dispatcher or the newer Lua dispatcher without weakening PID and class selection.
- Only canonical `systemctl --user is-active` results of `active` and `inactive` authorize ordinary focus or absent-client start. Every other service state fails before runtime or lifecycle mutation.
- Keep installation idempotent and production server activation explicit. Default installation and client launch never restart, stop, replace, deploy, migrate, enable, or disable the production server.
- Treat the optional desktop icon as managed configuration. Exact requested bytes may repair a missing version-one ownership claim, while omission removes a previously owned icon and unrecognized bytes fail closed.
- Detect managed content, mode, release pointer, official launchers, exact production wiring, server ownership drift, and application identity drift through one public doctor command.

## Durable Owners

- `scripts/quattro-native-bootstrap.mjs`
- `scripts/install-linux-desktop.mjs`
- `scripts/install-linux-production-topology.mjs`
- `scripts/install-linux-thread.mjs`
- `scripts/linux-thread-release-artifact.mjs`
- `scripts/linux-desktop-launcher.mjs`
- `apps/desktop/src/app/DesktopLauncherRuntime.ts`
- `apps/desktop/src/fork/StandaloneDesktopPolicy.ts`
- `apps/web/src/fork/desktopLauncherActivation.ts`

The protected intake decision is `F16.INTAKE.OUTCOME`. Standalone selection belongs to `StandaloneDesktopPolicy.ts` and fails before local backend allocation when any identity field is incomplete. Launcher admission and readiness belong to `DesktopLauncherRuntime.ts`; hosted activation belongs to `desktopLauncherActivation.ts`. Current DesktopApp, Environment, Clerk, Window, preload, IPC, root route and ChatView are mechanical adapters. Normal upstream desktop startup remains available outside the explicit standalone identity.

Desktop bootstrap resolves the legacy user-data choice and acquires Clerk synchronously before Electron readiness. Launcher runtime I/O starts afterward, and Clerk obtains authenticated handoff support when configuring its instance handler. This preserves the user-data-before-lock order and keeps normal bundled startup available alongside standalone launch admission.

Trusted Code launcher submission waits for the actual mounted composer text and send readiness, then uses the ordinary chat send path. A direct committed-context notification observes child-only changes without polling. Known pre-submit refusal requires explicit retry. An uncertain send outcome cannot retry through the launcher owner; the user must inspect the ordinary conversation before deciding to send again. Completion follows successful admission of the exact staged prompt and draft identity. Completion retries do not resend. Missing projects, unavailable drafts and invested drafts remain visible recovery states. Thread launch text always remains under user Send control.

Current operator commands are `install:production:linux` and `doctor:production:linux`. Installation requires explicit verified Code and Thread artifacts and the matching credential-free HTTPS origin. Staging is opt-in. Installation does not activate the server. Existing data and service ownership must be preserved; source and installed evidence are recorded separately in the intake ledger.

## Upstream Substrate

- Electron single-instance primitives consumed by the current Clerk adapter for T3 Code production and optional staging identities
- Electron window, backend, renderer, and update lifecycle
- standard server-facing authentication and client-local saved behavior
- server production bundle and bundled web client

The Omarchy theme source and its desktop bridge remain the retained F02 owner and adapters consumed by F16. They are not upstream substrate.

## Non Ownership Boundaries

- F16 does not own the separate T3 Thread Electron implementation defined by F27.
- F16 does not start or persist an Electron bundled backend for either managed identity.
- F16 does not migrate, copy, inspect, or repair production application state.
- F16 does not create DNS records, certificates, reverse proxy routes, or Kubernetes resources.
- F16 does not issue pairing credentials or place credentials in a launcher, URL, log, or tracked file.
- F16 does not create or distribute a Thread broker credential or Electron handoff socket.
- F16 does not identify ownership from a port, process name, or command substring.
- F16 does not replace packaged Omarchy files or choose the user default agent.
- F16 does not restart or otherwise mutate the canonical production server during client installation, client launch, client focus, or installed client acceptance.

## Verification

- `scripts/quattro-native-bootstrap.test.mjs` supplies focused bootstrap evidence. Bootstrap tests cover the default one-production-environment topology, explicit staging opt-in, official-launcher reuse, isolated client profiles, explicit matching origins, absence of a desktop backend port, idempotency, unrelated-file preservation, and explicit adoption.
- Validation tests reject unsafe release paths and unavailable official launchers before managed writes.
- Doctor tests cover content drift, mode drift, release-pointer drift, unexpected default application identities, and server ownership drift.
- Thread process and hosted-client isolation are verified under F27 rather than through T3 Code desktop bootstrap authority.
- Native validation covers Bash syntax, systemd unit syntax, desktop-entry syntax, executable launchers, and exact file modes.
- Runtime verification confirms the canonical production server keeps the same identity while T3 Code and several T3 Thread processes open and close, each client uses the production origin without a bundled backend listener, and the active Omarchy theme reaches supported renderers through the official bridge.

## Reconciliation Rule

Retain upstream Electron lifecycle and client behavior. Preserve the official artifact verification launcher, the independent production host, explicit staging isolation, client-private profiles, and the smallest Quattro adapter needed to join those existing owners without creating another production server environment.

## Current Evidence

The desktop runtime selects the same production or staging handoff directory as the installed launcher. Staging readiness and activation stay under the staging runtime directory; an unknown channel cannot read production handoff state. The runtime tests exercise readiness publication, withdrawal and authenticated activation independently for both channels. Staging desktop acceptance requires that actual readiness record in addition to a mapped window and hosted connectivity.

Focused tests execute standalone selection before backend acquisition, current DesktopApp composition, Clerk and window lifecycle, preload and IPC, primary cookie transport, renderer launcher coordination and exact send completion. Installer and topology tests execute verified bytes, ownership drift, idempotency and transactional rollback. The clean current AppImages also pass isolated installation and all six client close/crash cases. Native Wayland focus passed two actual launcher focus calls on unchanged Code main and preload bytes, with simulated service status. That bounded bridge does not claim live default service activation or an identical whole AppImage. The intake evidence records both identities and limits.

## Compatibility

F01 remains the Code descriptor and exact-origin updater authority. F27 owns the separately packaged Thread client and its enrollment. Client startup and shutdown do not control the production server process or migrate its data. Keep prior release artifacts and browser profiles for deliberate downgrade. Resolve old pending fork outbox work in the old client before cutover; these tools do not migrate or resend it.
