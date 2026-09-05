# F17 External Admin Portal Device Authority

Date: 2026-09-05
Status: active

## Intent

The separately deployed Admin portal is the trusted device-administration authority for T3 Code environments. It authorizes new browser and Electron devices and manages their lifecycle through a narrow server API.

T3 Code owns the protected resource boundary. It does not own an embedded Admin product surface.

The portal credential is intentionally a high-value device-admission root. Its ability to issue a standard-client pairing credential is an explicit authority, not an accidental scope amplification. That authority must remain isolated from every unrelated T3 Code capability.

## Required Behavior

- Represent the portal as a persisted and signed authority class that cannot be inferred from generic scopes, labels, subjects, browser origins, or network location.
- Issue the portal credential only through an explicit operator command with a bounded lifetime and clear high-value credential handling.
- Require the portal authority class on every portal route. Generic access tokens, standard clients, administrative clients, cookies, and bootstrap credentials fail closed.
- Permit the portal to list privacy-safe browser and Electron device presence.
- Mark manageable devices with a durable server-issued class only when they consume a portal-created enrollment grant.
- Never derive lifecycle authority from client labels, device metadata, connection metadata, session method, or self-asserted product surface.
- Exclude headless operators and every client without the server-issued managed-device class from inventory and lifecycle mutation.
- Permit the portal to issue one-time standard-client pairing credentials with a server-owned fixed scope set.
- Permit the portal to enable, disable, and delete authorized devices with expected-revision checks.
- Permit the portal to list and revoke active pairing requests without returning their credentials.
- Treat device admission as transitive standard-client authority. Do not describe the portal credential as non-transitive or access-only.
- Deny the portal credential from WebSocket tickets, WebSocket upgrades, RPC methods, orchestration, terminals, files, Git, source control, providers, reviews, relay controls, server lifecycle, and settings.
- Keep portal endpoints behind a fail-closed route allowlist enforced before ordinary application dispatch.
- Accept portal authorization only through the dedicated server-to-server credential mode. Cookie-only and browser-origin calls fail closed.
- Deny portal credentials on the public session-state endpoint and every route outside the six-method allowlist.
- Apply no-store controls to every portal response, including errors and presence data.
- Keep pairing credentials one-time, atomically consumed, and persisted only as keyed digests.
- Never place a pairing credential or digest in inventory, streams, logs, traces, analytics, errors, or durable client state.
- Return only device identifier, optional label, device type, optional platform, authority state, connection state, creation time, last-connected time, and revision where a lifecycle mutation requires it.
- Never return session identifiers, subjects, granted scopes, network addresses, user agents, endpoint inventory, account relationships, orchestration state, or transport causes.
- Exclude the portal principal from the standard-device inventory.
- Recheck manageable-device eligibility inside every lifecycle write and return the same not-found result for ineligible and nonexistent clients.
- Commit disable and delete state before interrupting exact-device connections.
- Close an exact active session promptly when its credential is revoked.
- Bound portal credential lifetime, pairing credential lifetime, pairing creation rate, presence polling rate, and outstanding pairing requests.
- Treat Tailscale as a reachability control only. Application authorization remains authoritative.
- Keep the old embedded T3 Code Admin route, navigation, state, streams, and components absent.
- Keep legacy access inventory and plaintext pairing surfaces absent.

## Owner Modules

- `packages/contracts/src/auth.ts`
- `packages/contracts/src/environmentHttp.ts`
- `apps/server/src/auth/AdminAccess.ts`
- `apps/server/src/auth/DeviceAdministratorPolicy.ts`
- `apps/server/src/auth/ClientConnectionRegistry.ts`
- `apps/server/src/auth/EnvironmentAuth.ts`
- `apps/server/src/auth/PairingGrantStore.ts`
- `apps/server/src/auth/SessionAuthorityPolicy.ts`
- `apps/server/src/auth/SessionStore.ts`
- `apps/server/src/auth/http.ts`
- `apps/server/src/cli/auth.ts`
- `apps/server/src/persistence/AuthClients.ts`
- `apps/server/src/persistence/AuthPairingLinks.ts`
- `apps/server/src/persistence/AuthSessions.ts`
- `apps/server/src/persistence/Migration42Backup.ts`
- `apps/server/src/persistence/Migrations/042_ReconcileUpstreamAndSettingsAdmin.ts`
- `apps/server/src/persistence/Migrations/058_PairingEnrollmentClass.ts`

## Fork Seams

- explicit portal authority class
- fail-closed portal HTTP allowlist
- privacy-safe device projection
- fixed standard-device pairing issuance
- revisioned device lifecycle
- digest-only pairing persistence
- exact-session and exact-device revocation
- schema-inspecting migration convergence

## Non Ownership Boundaries

- The Admin portal user interface, browser state, deployment, and secret storage are owned by the separate portal project.
- T3 Code does not render or route an Admin settings product.
- Tailscale topology does not select application authority.
- OAuth, cloud inventory, provider identity, and relay identity do not imply portal authority.
- Standard clients cannot acquire portal authority through scope delegation.

## Upstream Reconciliation Rule

- Preserve current upstream authentication and client metadata substrate only when it can carry the explicit portal authority without widening it.
- Reject plaintext pairing persistence, credential inventory, legacy access streams, and generic access-scope aliases.
- Preserve historical migration 42 source unchanged. Continue explicit enrollment through append-only migration 58, whose nullable `client_management_class` column leaves every existing grant unclassified.
- The portal issuer alone sets `portal-managed-device`; atomic grant consumption returns the persisted value and session issuance copies it into the durable client row. Subject and presentation metadata never supply enrollment authority.
- Preserve upstream environment-specific cookie names, legacy cookie handoff, desktop session replacement, connected-session expiry visibility, metadata, and DPoP diagnostics.
- Take the private rollback snapshot whenever the highest journal identifier is below 42, even if a partial lineage already resembles the canonical schema.
- Prefer narrow HTTP adapters over adding portal behavior to general RPC or settings hosts.

## Verification

- An authorization matrix proves no credential, generic access credentials, cookies, bootstrap credentials, and standard clients cannot call portal routes.
- Portal tests prove the exact allowed route set and deny WebSocket tickets, WebSocket upgrades, every RPC method, and every unrelated HTTP domain.
- Pairing tests prove fixed standard scopes, one-time atomic consumption, expiry, revocation, rate limits, and outstanding-request bounds.
- Privacy tests prove exact response allowlists and the absence of credentials, scopes, sessions, subjects, network data, endpoints, and transport causes.
- Lifecycle tests cover enable, disable, delete, expected revisions, stale conflicts, post-commit disconnect, exact-session revocation, and restart durability.
- Lifecycle tests also prove portal-enrolled browser and Electron devices remain manageable while headless operator credentials stay invisible and untouchable even after spoofing connection metadata.
- Migration tests cover fresh databases, current upstream migration 41, released fork migration 41, partial lineages, journal-pending canonical schemas, repeated startup, transaction rollback, and backup restoration.
- Privacy tests prove credentials, digests, and private topology never enter responses, logs, traces, or analytics.
- Full repository gates and a fresh adversarial security review pass before canary use.

## Compatibility Notes

- Existing access-only portal credentials are invalid and must be rotated after deployment.
- Clients without the server-issued managed-device class must be re-enrolled through the external portal before it can manage their lifecycle. Existing explicitly enrolled clients retain that class through this intake.
- The portal HTTP paths may remain stable while their credential class and authorization semantics become stricter.
- The portal must treat its credential as a device-admission root and keep it outside browser state.
- Binary rollback after migration 42 requires restoration of the matching pre-migration 42 database snapshot.

## Proposal Trace

- Strengths, weaknesses, security tradeoffs, and repository fit were evaluated before this contract changed.
- Explicit user confirmation on 2026-08-22 approved the separate portal device-administrator model and removal of embedded T3 Code Admin.

## Protected Decisions And Isolation Evidence

| Decision                                                            | Durable owner                                                          | Mechanical adapters                                              | Focused evidence                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F17-D01 explicit external authority and signed persistence equality | `auth/SessionAuthorityPolicy.ts`                                       | `auth/SessionStore.ts`, `auth/EnvironmentAuth.ts`, `cli/auth.ts` | `SessionAuthorityPolicy.test.ts` executes issuance, reconstruction and claim agreement without the session host; `DeviceAdministratorAuthority.test.ts` proves signed persistence integration                     |
| F17-D02 six-route server-to-server admission and bounded polling    | `auth/DeviceAdministratorPolicy.ts`, `auth/authorizationCredential.ts` | `auth/http.ts`, broad HTTP dispatch                              | `DeviceAdministratorPolicy.test.ts` runs the same exact route and credential matrix against replacement hosts and exercises rate windows                                                                          |
| F17-D03 durable managed-device enrollment                           | `auth/PairingGrantStore.ts`, `persistence/AuthPairingLinks.ts`         | `auth/EnvironmentAuth.ts`, migration 58                          | `DeviceAdministratorAuthority.test.ts` closes and reopens the real database around portal issuance, grant consumption, and inventory; an identical spoofed subject stays unclassified                             |
| F17-D04 private inventory and revisioned lifecycle                  | `auth/AdminAccess.ts`, `persistence/AuthClients.ts`                    | six Admin HTTP handlers                                          | `AdminAccess.test.ts` and `DeviceAdministratorAuthority.test.ts` prove private keys, fixed scopes, hidden operators, stale conflicts, expiry and outstanding limits                                               |
| F17-D05 post-commit exact connection teardown                       | `auth/ClientConnectionRegistry.ts`, `auth/SessionAuthorityPolicy.ts`   | `auth/SessionStore.ts`, WebSocket client and session guards      | `SessionAuthorityPolicy.test.ts` directly proves lifecycle admission and failure ordering; `AdminAccess.test.ts` and `DeviceAdministratorAuthority.test.ts` prove committed exact teardown and admission rechecks |
| F17-D06 pre42 rollback snapshot                                     | `persistence/Migration42Backup.ts`                                     | shared SQLite initialization in `persistence/Layers/Sqlite.ts`   | `Migration42Backup.test.ts` covers pending canonical schemas and restoration; `Layers/Sqlite.test.ts` migrates released fork 41 through the real startup adapter, closes, restores, and reopens journal 41        |

Paths in this table are relative to `apps/server/src` unless a migration or contract is named.

`SessionAuthorityPolicy.ts` owns authority fallback, portal issuance limits and credential mode,
managed-class selection, signed and persisted agreement, expiry, disabled and deleted client
admission, and transport exclusion. Its inputs are explicit claim and state records; it performs
no cryptographic verification, SQL access, metadata inference, or connection effects.

`SessionStore.ts` calls that owner when reconstructing authority and when preparing signed and
persisted fields. It retains cryptography, repository calls, upstream session replacement, metadata,
connection reference counting, and credential events as adapters or accepted substrate. The two
selected SessionStore conflicts therefore map owner-produced fields and preserve upstream
replacement mechanics rather than select authority policy. Direct replacement-host tests execute
those decisions without importing SessionStore.

The `server.ts` global HTTP adapter executes `guardDeviceAdministratorHttpRequest` before dispatch,
including public session, descriptor, OAuth, cloud and static handlers. The owner denies unrelated
routes even when a signed portal credential is revoked or expired. Every portal response installs
no-store headers before credential checks. A normal cookie cannot hide a portal bearer token.
Credential selection and all-token inspection share case-insensitive scheme and whitespace
normalization in `auth/authorizationCredential.ts`. The boundary wraps CORS, so portal-bearing
OPTIONS requests are denied with no-store before preflight can return. Ordinary preflight remains
available.

The `ws.ts` WebSocket adapter registers exact client and exact session guards, then calls
`SessionStore.assertClientAdmission` inside the guards before starting transport work. This closes
the gap between initial authentication and a concurrent disable, delete, or revoke. The server
lifetime owns one shared registry and one session-revocation subscription. Each later RPC and
subscription start calls the same persisted admission check before dispatch.

Same-runtime revocation signals interrupt the exact session immediately. Independent CLI runtimes
persist revocation through separate database connections and do not share that PubSub. One server
watcher checks the distinct active session identifiers one second after each completed pass, with
at most eight admission reads in flight and a one-second timeout per read. Failed or timed-out
admission closes only that session. The observation delay is the one-second interval plus queued
read batches and database execution, each read bounded by its timeout; it is not a universal
one-second teardown promise under load. RPC admission observes persisted revocation immediately
without waiting for that watcher. `server.test.ts` proves this with two independent real auth
runtimes over one fresh file database, an already-open RPC connection and live subscription,
clock-controlled observation, and a live peer that still completes RPC on its existing connection.
The disable test also keeps its subscription source open, so natural finite-stream completion
cannot substitute for revocation teardown. Registry tests cover shared checks, failed
reads, timeout teardown, and guard cleanup.

`@t3tools/shared/nodeSqliteClient`, upstream environment identity, OAuth and DPoP machinery remain
upstream substrate. They do not select portal authority. Legacy access HTTP inventory, RPC streams,
and pairing-change streams remain absent. Private operator CLI listing and internal session
revocation events remain generic auth substrate.

These focused tests prove owner behavior and replacement-host admission. The broad server
integration and full repository gates remain separate required evidence before acceptance.
