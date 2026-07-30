# F12 Provider Instance Identity Seam

Date: 2026-07-29
Status: active

## Intent

Provider status and settings can carry provider instance identity without collapsing every runtime view back to one provider kind row.

## Required Behavior

- Provider snapshots preserve legacy `provider` while carrying additive `instanceId` and `driver` fields when available.
- Provider status aggregation keys snapshots by instance identity so two snapshots with the same driver kind do not overwrite each other.
- Server settings accept and preserve the `providerInstances` envelope for custom instance definitions.
- Web provider instance projection uses `instanceId` as the routing identity and derives `driver`
  presentation and capability context from the final routed instance after fallback, with legacy provider
  kind fallback for older snapshots.
- Provider adapter routing, provider sessions, runtime events, recovery, and stop flows carry `providerInstanceId` while preserving legacy provider kind fallback.
- Custom provider instances materialize as provider registry snapshots without duplicating singleton adapter event streams.
- Singleton adapters receive one runtime event subscription by adapter object identity.
- Shared adapter events with an explicit instance id route exactly once. Ambiguous untagged shared events are rejected.
- Legacy untagged shared-adapter sessions recover only through a matching persisted exact-instance binding.
- Shared-adapter routing and recovery reject active sessions explicitly tagged to another instance.
- Ordinary and resumed adapter start results reject explicit instance ids that differ from the request or binding.
- Provider fallback keeps an explicit enabled available instance, then prefers ready instances over non-error instances.
- A local no-provider state disables dispatch only when no configured target exists and is never persisted or sent.
- Instance-local model resolution never borrows another same-driver instance model.
- Provider settings expose custom instance add, enable, disable, and delete controls in the fork settings layout.
- Provider snapshots may carry provider slash commands, and the composer slash command menu must read commands from the active provider instance snapshot.
- Provider snapshots may carry provider skills, and the composer skill menu must read skills from the active provider instance snapshot.
- Claude skill discovery bounds directory iteration and file reads before allocation across user and
  project roots, skips malformed entries, and gives project entries collision precedence.
- Composer skill tokens render as `$skill` chips when metadata is available while preserving the raw prompt token value.
- Full custom adapter materialization and turn routing remain owned by the provider runtime seam and must preserve fork composer draft ownership plus Codex model and binary selection behavior.

## Owner Modules

- `packages/contracts/src/providerInstance.ts`
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/server.ts`
- `packages/contracts/src/settings.ts`
- `packages/shared/src/model.ts`
- `apps/server/src/provider/providerSnapshot.ts`
- `apps/server/src/provider/providerStatusCache.ts`
- `apps/server/src/provider/Services/ProviderInstanceRegistry.ts`
- `apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts`
- `apps/server/src/provider/Services/ProviderAdapterRegistry.ts`
- `apps/server/src/provider/Services/ProviderSessionDirectory.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.ts`
- `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`
- `apps/server/src/provider/Layers/ProviderSessionDirectory.ts`
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `apps/server/src/provider/Drivers/ClaudeSkills.ts`
- `apps/server/src/provider/Layers/CodexAdapter.ts`
- `apps/server/src/provider/Layers/ClaudeAdapter.ts`
- `apps/server/src/provider/Layers/CursorAdapter.ts`
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- `apps/web/src/providerInstances.ts`
- `apps/web/src/providerModels.ts`
- `apps/web/src/modelSelection.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ComposerCommandMenu.tsx`
- `apps/web/src/components/chat/composerSlashCommandSearch.ts`
- `apps/web/src/providerSkillPresentation.ts`
- `apps/web/src/composer-editor-mentions.ts`
- `apps/web/src/composer-logic.ts`
- `apps/web/src/components/ComposerPromptEditor.tsx`
- `apps/web/src/components/chat/ProviderModelPicker.tsx`
- `apps/web/src/components/settings/SettingsPanels.tsx`

## Fork Seams

- provider instance contracts
- provider snapshot projection
- provider status aggregation
- provider adapter routing
- adapter object identity subscription ownership
- deterministic instance fallback and local no-provider state
- web provider instance helpers
- composer command and skill presentation

## One Shot Origin Rebuild Notes

- Restore additive contracts before runtime and settings wiring.
- Keep legacy provider kind fallback until persisted thread and session state is fully instance aware.
- Preserve unknown instance data during settings decode.
- Rebuild composer command and skill menus from active instance snapshots.
- Keep provider instance routing compatible with Codex model discovery and composer draft ownership.
- Preserve explicit configured instance and exact model intent while snapshots are absent or transiently
  errored until the exact instance reports a ready authoritative model catalog.
- Correlate thread, project, draft, and legacy model candidates to the final routed instance before
  resolution, and read interaction controls from that exact instance snapshot.

## Origin Rebuild Rule

- Rebuild provider instance work only from origin-owned changes through the provider runtime seam so fork composer draft ownership, screenshot controls, and Codex model discovery remain intact.
- Preserve legacy provider kind compatibility until all persisted thread, model selection, and session routing paths are instance aware.
- Override changes that drop unknown or unavailable instance data during settings decode or provider status projection.

## Verification

- Legacy provider snapshots decode without instance fields.
- Instance aware provider snapshots decode with `instanceId`, `driver`, display metadata, and continuation metadata.
- Provider status cache and aggregation preserve distinct snapshots that share a driver kind.
- Web provider instance helpers keep custom instances distinct from default instances.
- Provider service routes start, send, recover, and stop flows through `providerInstanceId`.
- Two instance ids sharing one adapter produce one event, one session listing call, and one shutdown call.
- Ready fallback wins over an earlier warning instance, while an explicit errored target remains durable for offline retry.
- No configured target renders a disabled no-provider composer state and cannot dispatch the sentinel.
- Composer model selection preserves custom instance ids across draft and persisted selections.
- Settings can create, enable, disable, and delete custom provider instances.
- Claude slash commands discovered from provider capabilities appear in the composer slash command menu for the active provider instance.
- Selecting a provider slash command inserts the command into the draft without changing active draft ownership.
- Codex skills discovered from provider capabilities appear in the composer skill menu for the active provider instance.
- Selecting a provider skill inserts the `$skill` token into the draft without changing active draft ownership.
- Existing prompts without skill metadata remain editable as plain text.

## Compatibility Checks

- Settings decode remains tolerant of older and newer provider instance envelopes.
- Persisted model selection does not collapse custom instances to provider kind.
- Runtime recovery and stop flows preserve `providerInstanceId`.
- Durable outbox retry preserves exact instance id and model across disconnect and reconnect.
