# F10 Codex Model And Binary Selection

Date: 2026-07-29
Status: active

## Intent

Codex provider setup follows the installed Codex app-server capability surface instead of relying on stale hardcoded model lists or ambiguous shell binary resolution.

## Required Behavior

- Codex provider models prefer `model/list` from the selected Codex app-server when available.
- Codex provider skills prefer `skills/list` from the selected Codex app-server when available.
- Custom Codex models configured by the user remain merged into the provider model list.
- A selected instance resolves its own declared default model and never borrows a model from another instance.
- A ready selected instance with an empty catalog or a missing selected slug is non-dispatchable for
  composer and background text generation.
- App-server initialization uses the resolved Codex CLI version as the client version so newer models are not rejected as requiring a newer Codex.
- Quote-aware global Codex launch arguments precede the subcommand for provider probes, sessions, and
  text generation.
- Settings expose detected supported Codex binaries when available.
- Binary discovery is bounded to an explicit configured path and normalized process PATH candidates,
  including quoted Windows entries and command shims.
- Binary version probes bound captured stdout and stderr while continuing to drain child streams.
- Desktop and WSL backends contribute candidates through their hydrated process environments without filesystem-wide scans.
- An explicit non bare Codex binary path selected by the user remains pinned and must not be silently replaced by another PATH or environment candidate.
- Desktop launch preserves an explicit configured Codex binary path for the backend child process.

## Owner Modules

- `apps/desktop/scripts/electron-launcher.mjs`
- `apps/desktop/src/main.ts`
- `apps/server/src/provider/Layers/CodexProvider.ts`
- `apps/server/src/provider/Layers/CodexBinaryDiscovery.ts`
- `apps/server/src/provider/Layers/codexLaunchArgs.ts`
- `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
- `apps/server/src/textGeneration/CodexTextGeneration.ts`
- `apps/server/src/provider/providerSnapshot.ts`
- `apps/web/src/components/settings/ProviderInstanceCard.tsx`
- `apps/web/src/components/settings/ProviderSettingsForm.tsx`
- `apps/web/src/modelSelection.ts`
- `packages/contracts/src/server.ts`

## Fork Seams

- Codex CLI binary resolver
- Codex app-server initialization
- Codex launch argument tokenizer and spawn composition
- provider snapshot capability projection
- settings Codex binary selection
- desktop launcher environment bridge

## One Shot Origin Rebuild Notes

- Restore binary resolver and tests before provider setup wiring.
- Restore quote-aware launch argument composition before provider spawn wiring.
- Send resolved Codex CLI version through app-server initialize.
- Keep live model and skill discovery authoritative for the exact selected instance.
- Keep explicit absolute binary paths pinned across desktop restart.
- Recheck settings UI after origin provider settings changes.

## Origin Rebuild Rule

- Rebuild provider model changes only from origin-owned changes so Codex app-server model discovery remains authoritative when available.
- Reject origin changes that reintroduce a hardcoded Codex only model catalog as the primary source.
- Reject origin binary resolution changes that silently replace an explicit user selected Codex binary path.

## Verification

- A Codex app-server `model/list` response containing a new model such as `gpt-5.5` appears in the Codex model selector without a code update to the built in fallback list.
- A Codex app-server `skills/list` response containing an enabled skill appears in provider status and can be used by the composer.
- App-server initialize sends the resolved Codex CLI version as `clientInfo.version`.
- Initialize version probes retain only bounded stdout and stderr prefixes while fully draining flooded
  streams.
- Probe, session, and text-generation spawns receive the configured launch arguments.
- Settings show detected supported Codex binaries and selecting one persists its absolute path.
- Restarting the desktop app keeps the configured Codex binary path for the backend process.
- Explicit binary path pinning does not fall through to a newer PATH or environment binary unless the user selected bare `codex`.
- Discovery remains bounded and labels WSL backend candidates without inventing host paths.
- Two Codex instances cannot inherit one another's model default.

## Compatibility Checks

- Provider settings decode preserves existing custom model state.
- Settings decode defaults missing launch arguments to an empty value.
- Desktop launch preserves configured binary path for server child processes.
