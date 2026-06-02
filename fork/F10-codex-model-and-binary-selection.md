# F10 Codex Model And Binary Selection

Date: 2026-06-02
Status: active

## Intent

Codex provider setup follows the installed Codex app-server capability surface instead of relying on stale hardcoded model lists or ambiguous shell binary resolution.

## Required Behavior

- Codex provider models prefer `model/list` from the selected Codex app-server when available.
- Codex provider skills prefer `skills/list` from the selected Codex app-server when available.
- Built in Codex models remain only as a fallback when app-server model discovery is unavailable.
- Custom Codex models configured by the user remain merged into the provider model list.
- App-server initialization uses the resolved Codex CLI version as the client version so newer models are not rejected as requiring a newer Codex.
- Settings expose detected supported Codex binaries when available.
- An explicit non bare Codex binary path selected by the user remains pinned and must not be silently replaced by another PATH or environment candidate.
- Desktop launch preserves an explicit configured Codex binary path for the backend child process.

## Owner Modules

- `apps/desktop/scripts/electron-launcher.mjs`
- `apps/desktop/src/main.ts`
- `apps/server/src/codexAppServerManager.ts`
- `apps/server/src/provider/Layers/CodexProvider.ts`
- `apps/server/src/provider/codexAppServer.ts`
- `apps/server/src/provider/codexCliBinary.ts`
- `apps/server/src/provider/providerSnapshot.ts`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- `packages/contracts/src/server.ts`

## Fork Seams

- Codex CLI binary resolver
- Codex app-server initialization
- provider snapshot capability projection
- settings Codex binary selection
- desktop launcher environment bridge

## One Shot Rebuild Notes

- Restore binary resolver and tests before provider setup wiring.
- Send resolved Codex CLI version through app-server initialize.
- Prefer live model and skill discovery before fallback model lists.
- Keep explicit absolute binary paths pinned across desktop restart.
- Recheck settings UI after upstream provider settings changes.

## Upstream Intake Rule

- Adapt upstream provider model changes so Codex app-server model discovery remains authoritative when available.
- Reject upstream changes that reintroduce a hardcoded Codex only model catalog as the primary source.
- Reject upstream binary resolution changes that silently replace an explicit user selected Codex binary path.

## Verification

- A Codex app-server `model/list` response containing a new model such as `gpt-5.5` appears in the Codex model selector without a code update to the built in fallback list.
- A Codex app-server `skills/list` response containing an enabled skill appears in provider status and can be used by the composer.
- App-server initialize sends the resolved Codex CLI version as `clientInfo.version`.
- Settings show detected supported Codex binaries and selecting one persists its absolute path.
- Restarting the desktop app keeps the configured Codex binary path for the backend process.
- Explicit binary path pinning does not fall through to a newer PATH or environment binary unless the user selected bare `codex`.

## Compatibility Checks

- Provider settings decode preserves existing custom model state.
- Desktop launch preserves configured binary path for server child processes.
