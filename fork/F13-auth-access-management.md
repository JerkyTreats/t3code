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
- Linux desktop launch selects `gnome-libsecret` unconditionally. Missing Secret Service support is reported as a capability error with actionable guidance rather than as a generic pairing failure.

## Owner Modules

- `packages/contracts/src/auth.ts`
- `packages/contracts/src/environmentHttp.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/server/src/auth/http.ts`
- `apps/server/src/auth/EnvironmentAuth.ts`
- `apps/server/src/ws.ts`
- `packages/client-runtime/src/state/auth.ts`
- `packages/client-runtime/src/connection/credentialStore.ts`
- `apps/web/src/environments/primary/index.ts`
- `apps/web/src/environments/primary/httpClient.ts`
- `apps/web/src/environments/primary/auth.ts`
- `apps/web/src/state/auth.ts`
- `apps/web/src/connection/storage.ts`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/desktop/src/app/DesktopConnectionCatalogStore.ts`
- `apps/desktop/src/app/DesktopApp.ts`
- `apps/desktop/src/electron/ElectronSafeStorage.ts`
- `apps/desktop/src/settings/DesktopSavedEnvironments.ts`
- `apps/desktop/src/ipc/methods/connectionCatalog.ts`
- `apps/desktop/scripts/electron-launcher.mjs`

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

## One Shot Origin Rebuild Notes

- Restore Environment HTTP mutation contracts and durable RPC snapshot stream before settings UI.
- Keep standard client scopes aligned with relay endpoints used by paired mobile and managed relay clients.
- Keep environment scope capability gating visible in Connections settings.
- Preserve current session revocation protection.
- Verify saved environment flows after adding access management actions.
- Keep local-first desktop fallback intact.
- Keep secure-storage failures distinct from host, token, or pairing failures.
- Verify launcher arguments and connection catalog persistence together on Linux.

## Origin Rebuild Rule

- Rebuild auth and hosted connectivity changes only from origin-owned changes through Environment HTTP, durable RPC state, and Connections settings.
- Preserve local-first desktop behavior and saved environment workflows when origin changes pairing or access management flows.
- Reject changes that expose destructive session revocation without current-session protection or capability gating.
- Reject changes that persist saved credentials outside the secure connection catalog or silently fall back to plaintext.

## Verification

- Connections settings can create a pairing link and refresh the access snapshot.
- Connections settings can revoke active pairing links.
- Connections settings can list client sessions, revoke non-current sessions, and revoke other sessions.
- Durable RPC auth snapshots reconcile after reconnect while Environment HTTP mutations refresh the visible snapshot.
- Saved environment pairing, reconnect, disconnect, forget, and SSH connect flows continue to work unchanged.
- Mobile and managed relay pairing tokens include relay write scope for relay configuration and link proof calls.
- Linux launcher tests prove `gnome-libsecret` selection.
- Missing Secret Service support produces a secure-storage capability error and never writes plaintext credentials.

## Compatibility Checks

- Auth access RPC methods remain additive.
- Current session revocation stays disabled in UI.
- Browser backed and desktop backed environments report access capability accurately.
- Existing secure connection catalog entries remain readable.
