# F13 Auth Access Management

Date: 2026-06-02
Status: active

## Intent

Auth access management is exposed through Environment HTTP mutations, the durable RPC snapshot stream, and Connections settings so pairing links and client sessions can be managed without CLI work while preserving local-first desktop and saved environment flows.

## Required Behavior

- The server exposes the auth access snapshot through the durable `subscribeAuthAccess` RPC stream.
- Pairing link creation, pairing link revocation, client session revocation, and other-client session revocation use Environment HTTP methods.
- Stream and HTTP errors use shared auth access contracts instead of leaking server-only auth service errors.
- The client-runtime environment atom owns durable snapshot reconciliation across reconnects.
- Access management controls derive capability from authenticated environment scopes and remain disabled when the active environment cannot support them.
- Standard paired client scopes include relay read and relay write so mobile and managed relay clients can complete relay setup without an administrative session.
- Connections settings can create temporary pairing links, list and revoke active pairing links, list client sessions, revoke non-current client sessions, and revoke other client sessions.
- Current session revocation remains disabled in the settings UI.
- Existing paste pairing-link, saved environment reconnect, disconnect, forget, SSH connect, and local-first desktop fallback flows remain unchanged.
- Desktop saved-environment credentials persist only through the secure connection catalog and never fall back to plaintext.
- Desktop connection catalog persistence preserves the boolean `setConnectionCatalog` IPC contract and maps false to the typed `secure-storage-unavailable` capability reason.
- Linux desktop launch selects `gnome-libsecret` unconditionally. Missing Secret Service support is reported as a capability error with actionable guidance rather than as a generic pairing failure.
- Linux Secret Service guidance names the required `gnome-keyring` and `libsecret` packages, asks the user to start or unlock the login keyring, and directs them to restart T3 Code.
- T3 Connect is generally available. Signed-out web, desktop, and mobile entry points route to account sign-in without an enrollment or approval waitlist.
- Relay credentials authenticate only while an active environment link exists for the same environment id and public key.
- Link finalization and unlink serialize on the same user and environment identity. Unlink revokes the link and matching credentials in one database transaction before external tunnel teardown begins.
- Shutdown tunnel release uses that same identity lock and requires the link to remain active.
- Managed endpoint deprovision and shutdown release claim the captured allocation generation so stale work cannot delete a newer tunnel or allocation.
- Managed tunnel creation enforces the account limit before allocation and supports a durable per-user override.
- Server shutdown releases restart-authorized CLI managed tunnels while retaining allocation and hostname identity for the next startup.
- Managed tunnels installed by paired web or mobile clients remain live across shutdown because those clients do not install restart reprovision credentials.

## Owner Modules

- `packages/contracts/src/auth.ts`
- `packages/contracts/src/environmentHttp.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/relay.ts`
- `apps/server/src/auth/http.ts`
- `apps/server/src/auth/EnvironmentAuth.ts`
- `apps/server/src/cloud/http.ts`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `packages/client-runtime/src/state/auth.ts`
- `packages/client-runtime/src/connection/credentialStore.ts`
- `apps/web/src/environments/primary/index.ts`
- `apps/web/src/environments/primary/httpClient.ts`
- `apps/web/src/environments/primary/auth.ts`
- `apps/web/src/state/auth.ts`
- `apps/web/src/connection/storage.ts`
- `apps/web/src/connection/secureStoragePresentation.ts`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/web/src/components/clerk/useT3ConnectAuthPrompt.tsx`
- `apps/mobile/src/Stack.tsx`
- `apps/mobile/src/features/settings/SettingsRouteScreen.tsx`
- `apps/desktop/src/app/DesktopConnectionCatalogStore.ts`
- `apps/desktop/src/app/DesktopApp.ts`
- `apps/desktop/src/electron/ElectronSafeStorage.ts`
- `apps/desktop/src/settings/DesktopSavedEnvironments.ts`
- `apps/desktop/src/ipc/methods/connectionCatalog.ts`
- `apps/desktop/scripts/electron-launcher.mjs`
- `infra/relay/src/environments/EnvironmentCredentials.ts`
- `infra/relay/src/environments/ManagedEndpointAllocations.ts`
- `infra/relay/src/environments/ManagedEndpointProvider.ts`
- `infra/relay/src/environments/ManagedTunnelLimits.ts`
- `infra/relay/src/http/Api.ts`
- `infra/relay/src/persistence/schema.ts`
- `infra/relay/src/worker.ts`

## Fork Seams

- auth access contracts
- Environment HTTP auth access mutation methods
- durable auth access RPC snapshot stream
- client-runtime auth snapshot projection
- authenticated scope capability resolver
- Connections settings access management UI
- saved environment connection flows
- desktop secure connection catalog
- Linux secure-storage launch selection
- generally available Connect authentication entry points
- relay credential and active-link validation
- transactional unlink and credential revocation
- generation-safe managed endpoint lifecycle
- managed tunnel account limits
- server shutdown tunnel release

## One Shot Origin Rebuild Notes

- Restore Environment HTTP mutation contracts and durable RPC snapshot stream before settings UI.
- Keep standard client scopes aligned with relay endpoints used by paired mobile and managed relay clients.
- Keep environment scope capability gating visible in Connections settings.
- Preserve current session revocation protection.
- Verify saved environment flows after adding access management actions.
- Keep local-first desktop fallback intact.
- Keep secure-storage failures distinct from host, token, or pairing failures.
- Verify launcher arguments and connection catalog persistence together on Linux.
- Keep legacy mobile waitlist deep links compatible by routing them to sign-in without restoring enrollment behavior.
- Validate credentials against the active link and matching public key.
- Serialize link finalization and unlink so an unlink cannot revoke a concurrently issued same-key generation.
- Serialize shutdown release with link finalization and unlink so successful unlink cannot strand released allocation or DNS state.
- Capture allocation generation before unlink commits, then perform external teardown only after the database transaction succeeds.
- Keep shutdown release distinct from unlink so allocation and hostname identity survive restart.

## Origin Rebuild Rule

- Rebuild auth and hosted connectivity changes only from origin-owned changes through Environment HTTP, durable RPC state, and Connections settings.
- Preserve local-first desktop behavior and saved environment workflows when origin changes pairing or access management flows.
- Reject changes that expose destructive session revocation without current-session protection or capability gating.
- Reject changes that persist saved credentials outside the secure connection catalog or silently fall back to plaintext.
- Reject changes that authenticate orphaned relay credentials, let concurrent unlink invalidate a newly issued credential, or let stale cleanup remove a newer managed endpoint generation.
- Reject changes that restore waitlist enrollment to a T3 Connect authentication entry point.

## Verification

- Connections settings can create a pairing link and refresh the access snapshot.
- Connections settings can revoke active pairing links.
- Connections settings can list client sessions, revoke non-current sessions, and revoke other sessions.
- Durable RPC auth snapshots reconcile after reconnect while Environment HTTP mutations refresh the visible snapshot.
- Saved environment pairing, reconnect, disconnect, forget, and SSH connect flows continue to work unchanged.
- Mobile and managed relay pairing tokens include relay write scope for relay configuration and link proof calls.
- Linux launcher tests prove `gnome-libsecret` selection.
- Desktop app startup tests prove `gnome-libsecret` selection.
- Missing Secret Service support produces a secure-storage capability error and never writes plaintext credentials.
- A false desktop catalog persistence result retains boolean IPC compatibility and reaches the same typed secure-storage remediation.
- Web pairing and saved-environment presentation converts that typed capability failure into actionable Linux Secret Service remediation.
- Signed-out web and mobile Connect prompts route to sign-in, including the legacy mobile waitlist deep link.
- Relay credential tests require an active matching environment link.
- Link lifecycle tests require one lock identity for link finalization and unlink.
- Shutdown release race tests require unlink to remove DNS and allocation capacity after a concurrent release.
- Unlink tests prove database commit precedes external deprovision and database failure prevents teardown.
- Managed endpoint tests prove stale deprovision and release claims cannot delete newer generations.
- Tunnel limit tests cover defaults, per-user overrides, and persistence failures.
- Shutdown release tests cover successful deletion, relay refusal, and preservation of a newer runtime generation.

## Compatibility Checks

- Auth access RPC methods remain additive.
- Current session revocation stays disabled in UI.
- Browser backed and desktop backed environments report access capability accurately.
- Existing secure connection catalog entries remain readable.
- The legacy mobile waitlist deep link remains readable as a sign-in alias.
- Tunnel release remains additive to the relay client API.
- Existing managed allocations remain readable after the tunnel limit migration.
