# Upstream Intake v0.0.25

Date: 2026-06-06
Status: implementation plan

## Scope

Integrate upstream `v0.0.25` from `pingdotgg/t3code` into the Omarchy fork.

Target upstream tag: `v0.0.25`

Target upstream commit: `348a9140e9d352fdcb1779d467b4b68000b61bdf`

Current fork head during intake review: `bc2cac1851f57dec5e826efccda86d586d93f71f`

Merge base: `4f0f24f055fe5f5346f7e73372e8cdc167e052f9`

Selected workflow: merge and repair

No user decisions remain open. The package manager and toolchain transition is accepted with matching repository rule updates.

## Intake Summary

The upstream range has 30 commits.

A dry merge reports direct conflicts across server orchestration, persistence migrations, source control, WebSocket routing, web composer and timeline surfaces, settings, Git controls, shared contracts, and desktop packaging.

Raw diff size from merge base to `v0.0.25`:

- 4273 changed files
- 980261 inserted lines
- 15940 deleted lines

Diff size excluding vendored reference repos:

- 834 changed files
- 80944 inserted lines
- 15940 deleted lines

Large vendored areas:

- `.repos/alchemy-effect`
- `.repos/effect-smol`

These are accepted as upstream reference tooling support unless they create CI, package manager, or artifact size issues.

## Upstream Commit Inventory

- `e6330ead8` Bump Effect to beta.73 and migrate compatibility APIs
- `83f0cc9e3` Add Claude Opus 4.8 support
- `6b3050ee7` Migrate TypeScript checks to Effect TSGo
- `31268945f` Extract collection performance refactors from mobile stack
- `cf07d0632` Extract independent web cleanup from mobile stack
- `e3accd6e9` Ensure Electron runtime is installed in release workflow
- `b3e8c0334` T3 Code Mobile WIP
- `e3f140588` Add vendored reference repo subtree sync tooling
- `a04c09a19` Use HttpApi for Environment APIs and standardize authn authz
- `bd851c020` Add Alchemy reference repo subtree
- `f0116e44b` Include standard Linux AppImage icons for Niri and Noctalia
- `d78e02cd0` Probe Cursor models via list_available_models
- `b440dd181` Migrate workspace to Vite+ and pnpm
- `6e6163255` Prebundle react-dom client for browser tests
- `f5849f7d7` Surface redacted stdout for failed SSH commands
- `4956415f7` Preserve SSH HTTP auth status
- `e4643eccc` Build web before desktop release packaging
- `30d36b8c4` Let setup-vp install dependencies
- `1288909b6` Surface desktop packaging subprocess output
- `dca93d0ee` Setup EAS CI
- `6a1c4da52` Use workspace electron-builder for desktop packaging
- `37bf0f0d1` Remove duplicated pnpm root config
- `4f3d00f06` Install dependency closures in partial release jobs
- `4c262c4b4` Split CI workflow jobs
- `80b40ce96` Fix mobile native static analysis source discovery
- `52ae8e88d` Preserve desktop artifact arch
- `203f58e45` Fix desktop packaging patched dependencies
- `a6edad197` Filter staged desktop patched dependencies
- `9fc485afa` Install hosted web workspace closure
- `348a9140e` Bundle patched diff parser dependency

## Product Lane Decisions

- `accept` upstream package manager move to pnpm, Vite+, Vite+ test runner, TSGo, and Effect beta 73.
- `accept` upstream mobile product lane as upstream-owned scope.
- `accept` upstream vendored reference repo tooling and subtree sync support.
- `accept` upstream Environment HttpApi contracts and server route primitive.
- `accept` upstream client-runtime package as the shared browser and mobile runtime state primitive.
- `accept` upstream provider model discovery improvements, including Cursor `list_available_models`.
- `accept` upstream desktop release packaging fixes, but replay fork desktop identity.
- `replay` fork desktop Omarchy product identity on the upstream desktop and release packaging shape.
- `replay` fork Omarchy screenshot capture on upstream desktop IPC and composer attachment paths.
- `replay` fork composer draft autonomy, rich draft controls, screenshot action, and fork chrome on upstream composer changes.
- `replay` fork GitHub identity, Git promotion, source control publish, and Git panel behavior on upstream VCS and source control primitives.
- `replay` fork plan status cues and plan markdown preview on upstream web performance and runtime state changes.
- `replay` fork auth access management UI and NativeApi surfaces on upstream Environment HttpApi and auth scopes.
- `replay` provider instance identity and Codex model discovery behavior on upstream provider runtime changes.
- `override` any upstream behavior that silently routes fork user-facing GitHub actions to upstream remotes.
- `override` any upstream behavior that restores generic Electron desktop identity for Omarchy desktop builds.
- `override` any upstream behavior that drops current-session revocation protection or transport capability gating.

## Toolchain Rule Update

The accepted toolchain move requires repository rule updates in the implementation change.

Update the completion requirements from Bun-specific commands to the upstream accepted toolchain commands.

Expected command mapping:

- replace `bun fmt` with `pnpm fmt`
- replace `bun lint` with `pnpm lint`
- replace `bun typecheck` with `pnpm typecheck`
- replace `bun run test` with `pnpm test`

Repository policy updates are required in the same implementation series:

- `AGENTS.md`
- `patch.md`
- affected fork specs if owner modules or verification commands changed
- governance notes if command policy is recorded there

Do not run old Bun verification commands after the toolchain transition unless a targeted compatibility check explicitly asks for them.

## Direct Conflict Inventory

Dry merge conflicts reported by `git merge-tree --write-tree HEAD v0.0.25`:

- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/orchestration/http.ts`
- `apps/server/src/persistence/Migrations.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts`
- `apps/server/src/server.ts`
- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/components/ChatView.browser.tsx`
- `apps/web/src/components/DiffPanel.tsx`
- `apps/web/src/components/GitActionsControl.browser.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- `apps/web/src/environmentApi.ts`
- `apps/web/src/hooks/useThreadActions.ts`
- `apps/web/src/lib/gitReactQuery.test.ts`
- `apps/web/src/lib/gitReactQuery.ts`
- `apps/web/src/lib/projectReactQuery.ts`
- `apps/web/src/session-logic.ts`
- `packages/client-runtime/src/wsRpcClient.ts`
- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/rpc.ts`
- `packages/shared/package.json`
- `scripts/build-desktop-artifact.ts`

The Git and project React Query conflicts are modify-delete conflicts because upstream moves shared runtime state into `packages/client-runtime`.

## Replay Order

### Slice 1 Toolchain And Dependency Substrate

Decision: `accept`

Upstream primitives:

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `vp`
- `vpr`
- `@effect/tsgo`
- Vite+ configs
- Effect beta 73 patch

Implementation notes:

- Take upstream package manager metadata and lockfile.
- Remove stale Bun workspace catalog ownership from root `package.json`.
- Preserve package scripts needed by fork release and desktop flows through the new toolchain.
- Update repository completion rules before marking the intake complete.
- Re-run command policy references so local docs no longer require old Bun commands.

Verification evidence:

- `pnpm fmt`
- `pnpm lint`
- `pnpm typecheck`
- focused tests listed by later slices

### Slice 2 Persistence And Auth Scope Migration

Decision: `replay`

Upstream primitives:

- `apps/server/src/persistence/Migrations/031_AuthAuthorizationScopes.ts`
- upstream auth scope model
- `packages/shared/src/oauthScope.ts`

Fork seams:

- migration ordering policy
- `apps/server/src/persistence/Migrations.ts`
- fork issue link migration

Implementation notes:

- Preserve fork migrations `031_RepairProjectionThreadShellSummary` and `032_ProjectionThreadIssueLink`.
- Renumber upstream auth scope migration to the next unused durable id.
- Rename the upstream migration file to match the new id.
- Update all migration tests that reference the upstream id.
- Do not rewrite already-applied fork migration ids.

Verification evidence:

- migration unit tests
- persistence migration through-id test
- auth scope migration test

### Slice 3 Environment HttpApi And Auth Access

Decision: `accept` plus `replay`

Upstream primitives:

- `packages/contracts/src/environmentHttp.ts`
- `apps/server/src/auth/http.ts`
- `apps/server/src/orchestration/http.ts`
- `apps/web/src/environments/primary/httpClient.ts`
- `packages/client-runtime/src/environmentConnection.ts`

Fork seams:

- `F13` auth access contracts
- `apps/server/src/ws.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- native API adapter surfaces

Implementation notes:

- Accept typed Environment HttpApi.
- Preserve saved environment reconnect, disconnect, forget, SSH connect, local-first desktop fallback, and browser-backed flows.
- Keep auth access management additive through RPC and NativeApi where the active transport supports it.
- Keep current-session revocation disabled.
- Preserve transport capability gating in the settings UI.

Verification evidence:

- auth HTTP handler tests
- environment runtime connection tests
- Connections settings tests
- auth access RPC and NativeApi tests

### Slice 4 Server Runtime, Orchestration, And Client Runtime

Decision: `accept` plus `replay`

Upstream primitives:

- `packages/client-runtime`
- shared `wsRpcClient`
- shared `wsTransport`
- thread detail state
- shell snapshot state
- terminal session state
- orchestration HttpApi route

Fork seams:

- orchestration projection snapshot query
- WebSocket native API routing
- local thread and draft ownership
- terminal UI state cleanup

Implementation notes:

- Move web runtime state to upstream client-runtime modules where the upstream primitive now exists.
- Preserve fork local dispatch snapshots, active draft behavior, and terminal context cleanup.
- Keep browser and desktop transport error handling compatible.
- Resolve `wsRpcClient` conflicts by taking upstream client-runtime location and replaying fork RPC methods.

Verification evidence:

- WebSocket transport tests
- orchestration recovery tests
- terminal session state tests
- thread detail subscription tests

### Slice 5 Source Control, Git Workflow, Review, And VCS

Decision: `accept` plus `replay` plus targeted `override`

Upstream primitives:

- provider-neutral source control registry
- source control repository service
- VCS driver work
- review service
- mobile Git and review state consumers
- `packages/client-runtime/src/vcsActionState.ts`
- `packages/client-runtime/src/vcsStatusState.ts`
- `packages/client-runtime/src/vcsRefState.ts`

Fork seams:

- `apps/server/src/fork/sourceControlContextPolicy.ts`
- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
- `apps/server/src/git/GitManager.ts`
- `apps/web/src/components/GitActionsControl.tsx`
- source control NativeApi and RPC capability adapters

Implementation notes:

- Replay fork-first source control context selection by routing upstream registry selection through `pickForkSourceControlContext`.
- Preserve fork promotion semantics, including backup branch creation, merge to target branch, target branch push, and guarded source cleanup.
- Preserve empty repo publish behavior that returns `remote_added`.
- Preserve raw Git URL clone bypass.
- Keep GitHub issues GitHub-only until non-GitHub parity exists.
- Migrate web Git state to client-runtime VCS state without reintroducing draft ownership coupling.

Verification evidence:

- source control provider registry tests
- Git manager promotion tests
- publish empty repo test
- Git actions control tests
- review diff preview tests

### Slice 6 Desktop Identity, Packaging, Theme, And Screenshots

Decision: `accept` plus `replay` plus targeted `override`

Upstream primitives:

- Electron runtime install workflow
- desktop packaging subprocess output capture
- workspace electron-builder packaging
- Linux AppImage icon fixes for Niri and Noctalia
- desktop Effect module split

Fork seams:

- `packages/shared/src/productIdentity.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/fork`
- desktop screenshot IPC
- desktop theme projection
- `scripts/build-desktop-artifact.ts`

Implementation notes:

- Accept release and packaging reliability changes.
- Replay Omarchy desktop product identity through shared product identity.
- Keep app id, storage path, desktop entry, and window class stable unless a separate migration is approved.
- Replay Omarchy theme projection after desktop module changes.
- Replay Omarchy screenshot command probing, stable PNG wait, clipboard fallback, and active composer attachment.
- Adapt `scripts/build-desktop-artifact.ts` to pnpm workspace config while preserving fork product identity fields.

Verification evidence:

- desktop environment tests
- screenshot capture tests
- desktop packaging script tests
- release smoke
- manual desktop launch smoke when feasible

### Slice 7 Web Composer, Timeline, Sidebar, Plan, And Markdown

Decision: `accept` plus `replay` plus targeted `override`

Upstream primitives:

- collection performance refactors
- web cleanup from mobile stack
- client-runtime thread detail and terminal state
- composer path search state
- timeline render stability changes
- markdown browser test updates

Fork seams:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerRichDraft.ts`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/DocumentMarkdownRenderer.tsx`
- plan and file preview route state

Implementation notes:

- Replay rich draft toolbar and active draft formatting over upstream composer changes.
- Keep runtime access and screenshot actions in fork composer chrome.
- Keep draft text, images, screenshots, attachments, terminal context chips, and local thread draft state composer-owned.
- Accept upstream path search through client-runtime if it can preserve fork draft ownership.
- Preserve plan progress cues, including fractional plan progress.
- Preserve fullscreen in-memory plan preview and rich document markdown behavior.
- Preserve wide markdown overflow handling.

Verification evidence:

- ChatView browser tests
- ChatMarkdown browser tests
- composer draft tests
- composer rich draft tests
- screenshot attach tests
- Sidebar logic tests
- plan markdown preview tests

### Slice 8 Provider Runtime, Model Discovery, And Settings

Decision: `accept` plus `replay`

Upstream primitives:

- Effect beta 73 provider migrations
- TSGo typecheck
- Cursor `list_available_models`
- Claude Opus 4.8 support
- Codex app-server generated metadata refresh
- settings panel updates

Fork seams:

- `apps/server/src/provider`
- `packages/contracts/src/providerInstance.ts`
- `packages/contracts/src/model.ts`
- `apps/web/src/providerInstances.ts`
- `apps/web/src/modelSelection.ts`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- Codex binary resolver
- provider snapshot projection

Implementation notes:

- Accept upstream provider model additions and Cursor live model probing.
- Preserve Codex `model/list` and `skills/list` discovery as authoritative when available.
- Preserve explicit non-bare Codex binary path pinning.
- Preserve provider instance identity, legacy provider fallback, custom instance settings, slash commands, and skill chips.
- Preserve settings layout affordances for provider instances after upstream settings changes.

Verification evidence:

- provider registry tests
- Codex provider tests
- Cursor provider tests
- model selection tests
- provider instance card and settings tests
- provider skill presentation tests

### Slice 9 Mobile Lane And Reference Repos

Decision: `accept`

Upstream primitives:

- `apps/mobile`
- mobile native modules
- mobile EAS preview workflow
- mobile native static check script
- subtree sync tooling
- `.repos/alchemy-effect`
- `.repos/effect-smol`

Fork seams:

- CI job policy
- package manager workspace inclusion
- artifact size and clone ergonomics

Implementation notes:

- Accept mobile as upstream-owned surface.
- Do not apply Omarchy desktop branding requirements to mobile by default.
- Keep CI mobile native checks if the toolchain and runners support them.
- Record any future mobile fork policy separately if product decisions change.
- Accept reference repos as upstream tooling support unless they break local workflow.

Verification evidence:

- mobile static check if local tools are available
- mobile package typecheck if practical
- CI configuration review
- subtree sync script tests

### Slice 10 Governance And Patch Guide Sync

Decision: `replay`

Upstream primitives:

- accepted toolchain rules
- new owner module locations from client-runtime and Environment HttpApi

Fork seams:

- `AGENTS.md`
- `patch.md`
- `fork`
- `governance`

Implementation notes:

- Update completion requirements to accepted pnpm commands.
- Update feature specs whose owner modules move to `packages/client-runtime`.
- Update `F13` to include Environment HttpApi surfaces if the owner module set changes.
- Update `F11` and `F7` if Git and source control owner modules move.
- Update `F1` only if desktop release identity owner modules change.
- Keep policy edits in their own commit or clearly separated slice.

Verification evidence:

- policy and spec files contain no stale Bun completion commands
- protected feature owner modules match final code
- pull request replay notes include all reviewed feature ids

## Protected Feature Mapping

| Feature | Decision | Upstream Primitive | Fork Seam |
| --- | --- | --- | --- |
| `F1` | `replay` and `override` | desktop packaging and release fixes | product identity, desktop environment, release scripts |
| `F2` | `replay` | desktop Effect module split | Omarchy theme projection adapter |
| `F3` | `replay` | desktop IPC and composer attachment path | Omarchy screenshot capture service and composer screenshot helper |
| `F4` | `replay` | upstream composer updates and client-runtime path search | composer draft store, rich draft helper, composer chrome |
| `F5` | `replay` | client-runtime VCS state and Git controls | Git panel isolation and draft ownership boundary |
| `F6` | `override` | source control provider registry | fork source control context policy |
| `F7` | `replay` and `override` | VCS driver and Git manager updates | promotion policy and worktree lifecycle |
| `F8` | `replay` | sidebar and activity state updates | plan presentation policy and sidebar logic |
| `F9` | `replay` | markdown browser test updates and route state changes | document markdown renderer and plan preview surfaces |
| `F10` | `replay` | provider model discovery and Codex metadata | Codex binary resolver and app-server model discovery |
| `F11` | `replay` | provider-neutral source control primitives | source control provider lane and publish workflow |
| `F12` | `replay` | provider runtime and settings updates | provider instance identity seam |
| `F13` | `replay` | Environment HttpApi and auth scopes | auth access RPC, NativeApi adapter, Connections settings |
| `F14` | `replay` | client-runtime project paths and source control state | project management route, inference dashboard, project adapters |

## Selective Port Exceptions

No selective port exception is planned.

The selected approach is ancestry-based merge and repair. Slice boundaries are for conflict repair and review clarity, not for avoiding upstream ancestry.

## Verification Gate

Required before review:

- `pnpm fmt`
- `pnpm lint`
- `pnpm typecheck`
- focused tests for each touched package
- release smoke if desktop packaging or release workflow changes
- browser tests for protected web surfaces
- migration tests covering fork and upstream migration ordering
- manual evidence for Omarchy screenshot capture when local desktop capability is available

Do not mark the intake ready until the fork preservation gate is complete:

- each touched protected feature has `accept`, `replay`, or `override` notes
- each replayed behavior names the upstream primitive used
- each replayed or overridden behavior names the fork seam used
- active drafts, screenshots, attachments, local Git context, sidebar cues, panel workflows, and Omarchy desktop flows are verified
- `patch.md` and affected fork specs reflect changed owner modules and verification commands
