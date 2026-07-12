# F13 Auth Access Management

Date: 2026-06-02
Status: active

## Intent

Auth access management is exposed through the fork native API and Connections settings so pairing links and client sessions can be managed without CLI work while preserving local-first desktop and saved environment flows.

## Required Behavior

- The server exposes auth access snapshot through WebSocket stream methods and exposes pairing link creation, pairing link revocation, client session revocation, and other-client session revocation through Environment HttpApi methods.
- RPC errors use the shared auth access error contract instead of leaking server-only auth service errors.
- NativeApi exposes the auth access surface through the RPC-backed adapter.
- Native API capability detection reports access management availability and disables controls when the active transport cannot support it.
- Standard paired client scopes include relay read and relay write so mobile and managed relay clients can complete relay setup without an administrative session.
- Connections settings can create temporary pairing links, list and revoke active pairing links, list client sessions, revoke non-current client sessions, and revoke other client sessions.
- Current session revocation remains disabled in the settings UI.
- Existing paste pairing-link, saved environment reconnect, disconnect, forget, SSH connect, and local-first desktop fallback flows remain unchanged.

## Owner Modules

- `packages/contracts/src/auth.ts`
- `packages/contracts/src/environmentHttp.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/server/src/auth/http.ts`
- `apps/server/src/ws.ts`
- `packages/client-runtime/src/rpc/client.ts`
- `apps/web/src/environments/primary/index.ts`
- `apps/web/src/environments/primary/httpClient.ts`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/web/src/environments`

## Fork Seams

- auth access contracts
- Environment HttpApi auth access methods
- WebSocket auth access stream methods
- web EnvironmentApi adapter
- Connections settings access management UI
- saved environment connection flows

## One Shot Rebuild Notes

- Restore contracts and RPC methods before settings UI.
- Keep standard client scopes aligned with relay endpoints used by paired mobile and managed relay clients.
- Keep transport capability gating visible in NativeApi.
- Preserve current session revocation protection.
- Verify saved environment flows after adding access management actions.
- Keep local-first desktop fallback intact.

## Upstream Replay Rule

- Replay upstream auth and hosted connectivity changes through the fork NativeApi and Connections settings surface.
- Preserve local-first desktop behavior and saved environment workflows when upstream changes pairing or access management flows.
- Override changes that expose destructive session revocation without current-session protection or transport capability gating.

## Verification

- Connections settings can create a pairing link and refresh the access snapshot.
- Connections settings can revoke active pairing links.
- Connections settings can list client sessions, revoke non-current sessions, and revoke other sessions.
- NativeApi forwards auth access actions through RPC in browser-backed and desktop-backed web flows.
- Saved environment pairing, reconnect, disconnect, forget, and SSH connect flows continue to work unchanged.
- Mobile and managed relay pairing tokens include relay write scope for relay configuration and link proof calls.

## Compatibility Checks

- Auth access RPC methods remain additive.
- Current session revocation stays disabled in UI.
- Browser backed and desktop backed transports report capability accurately.
