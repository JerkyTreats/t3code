# Fork Product Verification

Date: 2026-05-26
Status: active

## Intent

Create outcome based guarantees for fork owned behavior before rebuilding on a fresh upstream base.

The verification target is user visible behavior and persisted workflow safety, not current component names or file layout.

## Rebuild Strategy

Use latest `upstream/main` as the new structural base.

Re-port Omarchy product behavior behind explicit local fork seams instead of carrying broad mixed edits through upstream shaped files.

Expected seam roots:

- `apps/web/src/fork`
- `apps/server/src/fork`
- `apps/desktop/src/fork`
- `packages/contracts/src/fork`
- `packages/shared/src/fork`

Fork seams should encode product decisions from `patch.md`, not generic pass through wrappers.

Preferred seam modules:

- composer policy for draft autonomy, screenshot action availability, runtime access controls, and rich draft affordances
- plan presentation policy for fractional progress, plan ready labels, fullscreen in memory preview, and markdown navigation behavior
- Git workflow policy for fork first identity, promotion backups, source branch cleanup, worktree close, and worktree discard semantics
- provider instance policy for routing identity, legacy fallback, and active instance capability selection
- Omarchy desktop adapters for theme source, palette projection, screenshot command selection, artifact handling, and clipboard fallback
- source control policy for provider lane semantics, publish behavior, GitHub only issue boundaries, and change request terminology

Avoid copying whole upstream components into fork folders unless the entire component is fork owned. Prefer small policy modules that upstream shaped components call at explicit integration points.

## Rebuild Sequence

1. Create a new branch from latest `upstream/main`.
2. Add the fork verification registry and this audit plan first.
3. Add minimal fork seam modules for protected features.
4. Port fork features one at a time from `patch.md`.
5. Add or move outcome tests before wiring large UI or runtime changes for each feature.
6. Update `patch.md` owner modules to point at the new fork seams.
7. Run `bun fmt`, `bun lint`, `bun typecheck`, and focused tests after each major slice.
8. Switch `main` only after the fork preservation gate passes.

## Source Of Truth

- `patch.md` defines protected fork behavior.
- `packages/shared/src/forkVerification.ts` defines the initial outcome scenario registry.
- Existing unit, integration, and browser tests provide partial evidence.
- Manual smoke remains required only for desktop or OS mediated flows that cannot be reliably automated yet.

## Current Audit

## Completed Rebuild Lanes

- Commit `72c723df` ports `F1` product identity through shared identity helpers, desktop environment wiring, web fallback branding, and release script naming.
- Commit `b2ce22b7` ports the `F10` Codex binary resolver and app server initialize version path.
- Commit `5780a8a3` ports the desktop side of `F2` and `F3` through Omarchy theme and screenshot fork services, IPC bridge wiring, and web theme projection.
- This lane ports `F3` screenshot attach through a web fork seam, the active composer draft store, and browser coverage for the visible screenshot control.
- Current working change ports `F4` rich draft mode through fork formatting helpers, active draft state, and browser coverage for the visible toolbar.

Remaining work in those areas:

- `F2` still needs browser level assertions for projected CSS variables.
- `F10` still needs settings UI coverage for detected binaries and active instance capability routing.

### Covered With Meaningful Existing Tests

- Plan activity ingestion and proposed plan projection
- Plan progress derivation in session logic
- Plan preview helpers and native file write forwarding
- Worktree lifecycle cleanup helpers
- Git promotion success and conflict paths
- Source control provider detection and publish service behavior
- Provider instance settings, status cache, routing, and composer capability helpers
- Codex model discovery and provider registry behavior
- Auth access native API forwarding
- Omarchy screenshot capture command behavior
- Branding constants for web and desktop package identity

### Needs Stronger Fork Outcome Tests

- Composer draft survival across Git panel actions, screenshot attach, provider switches, and settings side effects
- Visual presence and placement of fork composer chrome
- Sidebar fractional plan progress rendered in grouped and ungrouped projects
- Fullscreen in memory plan preview route behavior
- Markdown overflow behavior for wide tables and code blocks
- Fork first GitHub identity through real remote combinations
- Worktree discard routing after runtime teardown
- Omarchy theme projection from desktop state to web CSS variables
- Desktop screenshot capture through Omarchy tooling with clipboard fallback
- Source control publish through UI and native API capability boundaries
- Auth access management in Connections settings with current session revocation disabled

## Framework Layers

### Contract Registry

The shared fork verification registry enumerates every protected feature from `F1` through `F13`.

Each feature must have:

- owner modules
- at least two outcome scenarios
- at least one automated verification level
- globally unique scenario ids

This layer is intentionally independent of React components, Effect layers, and current upstream file layout.

### Unit Layer

Use unit tests for pure policy decisions and state transitions.

Examples:

- draft state is unchanged by unrelated panel actions
- provider instance ids survive model selection updates
- fork first remote selection chooses the fork remote
- plan progress derives the expected current step and total step count

### Integration Layer

Use integration tests for server workflows and persistence.

Examples:

- promotion creates a backup branch before merge and cleanup
- publish pushes to the ensured remote
- provider session routing uses instance identity
- auth access RPCs preserve current session safety

### Browser Layer

Use browser tests for visible fork UX contracts.

Examples:

- composer chrome exposes screenshot and access controls
- grouped sidebar still shows plan progress on concrete thread rows
- markdown preview opens without file write
- wide markdown content scrolls instead of clipping

### Manual Layer

Keep manual checks for OS mediated flows until stable automation exists.

Examples:

- Omarchy theme updates appear in desktop app
- Omarchy screenshot tooling produces and attaches the expected image
- desktop restart preserves explicit Codex binary selection

## Product Area Audit Matrix

Subagent audits were run per product lane against the upstream rebuild branch.

### Branding And Release Identity

Features: `F1`

Difficulty: 7 of 10

Finding: the rebuild restores upstream names across desktop metadata, runtime branding, web fallback branding, release naming, nightly naming, and announcement copy. Current fork branding is also inconsistent, so the rewrite should not copy the old desktop branding file as authoritative.

Required seams:

- `packages/shared/src/productIdentity.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `scripts/lib/product-identity.ts`

Required tests:

- desktop environment resolves stable, nightly, and dev display names as Omarchy
- web fallback branding resolves as Omarchy without a desktop bridge
- release, nightly, Discord, and staged package metadata use Omarchy display names
- technical identifiers such as app id, executable name, storage directory, and protocol scheme remain stable unless a separate migration is approved

First port steps:

1. Add shared product identity helpers.
2. Replace visible literals in desktop, web, build, release, nightly, and announcement paths.
3. Update fork verification owners to point at the new identity seam.
4. Add identity and packaging tests before wider desktop work.

### Desktop Omarchy

Features: `F1`, `F2`, `F3`

Difficulty: 7 of 10

Finding: the rebuild has a cleaner Effect desktop split. Omarchy theme projection and screenshot capture are now restored behind desktop fork services and IPC bridge methods. The new composer owns image draft state, so the remaining screenshot attach work belongs in `ChatComposer` instead of main process code.

Required seams:

- `apps/desktop/src/fork/DesktopForkIdentity.ts`
- `apps/desktop/src/fork/OmarchyThemeSource.ts`
- `apps/desktop/src/fork/DesktopSystemThemeService.ts`
- `apps/desktop/src/fork/OmarchyScreenshotCapture.ts`
- `apps/desktop/src/fork/DesktopScreenshotService.ts`
- `packages/contracts/src/ipc.ts`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`

Required tests:

- Omarchy theme read, missing state fallback, light mode, required colors, and watcher update
- web theme hook applies `data-system-theme-source` and projected CSS variables from desktop bridge state
- screenshot command preference, legacy fallback, output directory resolution, file settling, clipboard fallback, and cancellation
- IPC exposes screenshot capture, theme get, and theme subscribe methods
- composer screenshot capture attaches to the active draft

First port steps:

1. Restore desktop identity through the fork identity seam. Done in `72c723df`.
2. Add IPC schemas and bridge methods for theme and screenshot. Done in `5780a8a3`.
3. Wire desktop services into Effect layers and desktop bootstrap. Done in `5780a8a3`.
4. Port theme projection into the rebuild web hook. Done in `5780a8a3`.
5. Wire screenshot capture through `ChatComposer` draft ownership. Done in this lane.

### Web Composer And Draft Autonomy

Features: `F3`, `F4`, `F5`, `F10`, `F12`

Difficulty: 8 of 10

Finding: upstream split the composer into a clearer `ChatComposer`, which helps the rewrite. The fork chrome, rich draft mode, screenshot action, runtime access affordances, and draft isolation guarantees still need to be ported.

Required seams:

- `apps/web/src/fork/composerPolicy.ts`
- `apps/web/src/fork/composerDraftPolicy.ts`
- `apps/web/src/fork/composerChromePolicy.ts`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerProviderInstancePolicy.ts`
- `apps/web/src/fork/gitDraftIsolationPolicy.ts`

Required tests:

- visible composer chrome includes screenshot and runtime access controls
- rich draft mode and toolbar survive the rebuild draft store. Done in current working change.
- screenshot attach writes to the active draft and preview state
- Git panel actions do not clear prompt text, images, or terminal chips
- provider switches keep draft ownership and selected provider instance
- slash commands and skills come from the active custom provider instance

First port steps:

1. Add composer fork policy modules. Started in current working change.
2. Port screenshot data URL conversion and draft attach logic. Done in this lane.
3. Add rich draft mode to the rebuild draft store. Done in current working change.
4. Wire top action chrome and toolbar into `ChatComposer`. Started in current working change.
5. Add browser tests before porting broader UI behavior. Started in current working change.

### Plan Sidebar And Markdown Preview

Features: `F8`, `F9`

Difficulty: 7 of 10

Finding: the rebuild regresses fractional plan progress and lacks fullscreen in memory plan preview. Markdown rendering should preserve upstream file link chips while restoring fork route aware navigation and overflow behavior.

Required seams:

- `apps/web/src/fork/planPresentationPolicy.ts`
- `apps/web/src/fork/planPreviewPolicy.ts`
- `apps/web/src/fork/markdownNavigationPolicy.ts`
- `apps/web/src/fork/markdownOverflowPolicy.ts`
- `apps/web/src/components/DocumentMarkdownRenderer.tsx`
- `apps/web/src/components/PlanConversationDocument.tsx`
- `apps/web/src/chatPanelRouteSearch.ts`

Required tests:

- running plan progress renders labels such as `3/5`
- grouped and ungrouped sidebar rows show fractional progress
- proposed plan and plan sidebar open fullscreen preview without writing a file
- route search preserves preview thread and plan ids
- wide markdown tables and code blocks scroll instead of clipping

First port steps:

1. Restore plan progress data flow.
2. Route labels through a plan presentation seam.
3. Port route search and document preview components.
4. Merge fork markdown navigation with upstream file link chips.
5. Add layout tests for wide markdown content.

### Server Git Workflow

Features: `F5`, `F6`, `F7`

Difficulty: 7 of 10

Finding: fork PR head and worktree behavior partly survived in upstream shaped code, but repository identity is upstream first and branch promotion is missing from the rebuild server path.

Required seams:

- `apps/server/src/fork/gitIdentityPolicy.ts`
- `apps/server/src/fork/sourceControlContextPolicy.ts`
- `apps/server/src/fork/gitPromotionPolicy.ts`
- `apps/server/src/fork/worktreeLifecycle.ts`
- `apps/server/src/fork/gitPrHeadPolicy.ts`

Required tests:

- repository identity prefers fork remote over upstream when both exist
- source control provider context targets the fork remote for repo and issue flows
- cross repo PR lookup uses fork owner selection without matching unrelated PRs
- promotion creates a backup branch, merges, pushes, and deletes source only after success
- promotion conflicts leave merge state and keep the source branch
- discard tears down session, terminals, worktree, status cache, and thread state before routing

First port steps:

1. Add server fork seam modules.
2. Wire repository identity and provider context through fork first policy.
3. Port promotion behind `gitPromotionPolicy`.
4. Keep `GitWorkflowService` as the upstream facade while routing fork lifecycle rules through the seam.
5. Add focused server tests before wiring web actions.

### Source Control Provider Lane

Features: `F6`, `F7`

Difficulty: 7 of 10

Finding: upstream now has provider neutral source control primitives, a VCS driver split, and a `GitActionsControl`. Fork publish, provider context, GitHub issue boundaries, and add project clone behavior need to be mapped into those structures rather than restoring the old panel wholesale.

Required seams:

- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
- `apps/server/src/sourceControl/SourceControlRepositoryService.ts`
- `apps/server/src/fork/sourceControlContextPolicy.ts`
- `apps/web/src/components/git-panel/PublishRepositoryDialog.tsx`
- `apps/web/src/fork/sourceControlPresentationPolicy.ts`

Required tests:

- provider context chooses fork remote when `origin` is upstream and another remote is the fork
- publish remote collision reports the actual remote name
- empty repository publish returns remote added without push
- cross provider change requests preserve provider boundaries
- publish UI disables when provider capability or authentication is missing
- add project clone defaults to SSH and preserves raw URL bypass

First port steps:

1. Reconcile contracts and shared source control presentation first.
2. Adapt provider registry through fork context policy.
3. Wire publish and issue flows through provider neutral services.
4. Port publish UI after server behavior tests pass.

### Provider Instances And Codex Discovery

Features: `F10`, `F12`

Difficulty: 7 of 10

Finding: the rebuild has a stronger provider driver and instance registry substrate. Fork Codex binary pinning and explicit version discovery are now restored for provider status probing, and the app server probe uses the resolved Codex CLI version for `clientInfo.version`.

Required seams:

- `apps/server/src/fork/codexCapabilityDiscovery.ts`
- `apps/server/src/fork/providerInstanceRouting.ts`
- `apps/web/src/fork/providerInstanceCapabilities.ts`
- `apps/web/src/fork/codexBinarySettings.ts`

Required tests:

- app server initialize uses the resolved Codex CLI version
- explicit Codex binary path stays pinned across discovery
- settings display detected binaries and persist absolute path choice
- active custom instance slash commands and skills insert without draft ownership changes
- two Codex instances can carry distinct homes, skills, and custom models

First port steps:

1. Port binary resolver into the Codex discovery seam. Done in `b2ce22b7`.
2. Replace hard coded app server probe version. Done in `b2ce22b7`.
3. Preserve rebuild provider registry and status cache shape. Done in `b2ce22b7`.
4. Route composer skills and slash commands through active instance capability policy.

### Auth Access And Remote Pairing

Features: `F13`

Difficulty: 7 of 10

Finding: auth services and HTTP flows exist in the rebuild, but F13 mutating access management is not preserved as a capability gated local API. Upstream live auth subscription should be kept, while mutations should be routed through the same backend abstraction.

Required seams:

- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/rpc/wsRpcClient.ts`
- `apps/web/src/localApi.ts`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/web/src/environments/primary/auth.ts`

Required tests:

- `WS_METHODS` and RPC groups include all mutating auth methods
- web RPC client exposes auth snapshot, create link, revoke link, revoke session, revoke others, and live subscribe
- local API capability gates access management by active transport
- settings can revoke individual pairing links and non current clients through the stream
- current session revoke remains absent or disabled and server protected
- hosted pairing, manual pairing, saved remote reconnect, and SSH reconnect still work

First port steps:

1. Restore F13 RPC contract methods in rebuild contract style.
2. Add typed server handlers for snapshot and mutations.
3. Extend `wsRpcClient`, IPC, and `localApi`.
4. Keep live subscription state in settings while routing mutations through the local API seam.
5. Add pairing and SSH reconnect regressions.

## Integration Order

1. Product identity and desktop IPC contracts.
2. Provider instance discovery and Codex binary selection.
3. Server Git identity, source control context, and promotion.
4. Composer draft autonomy and screenshot attach.
5. Plan sidebar, markdown preview, and markdown overflow.
6. Auth access management and remote pairing.
7. Release, packaging, and manual desktop smoke.

Each lane must land with its outcome tests or a documented manual evidence gap before the next lane depends on it.

## Rewrite Gate

Before switching to an upstream base rewrite branch:

1. Keep `packages/shared/src/forkVerification.test.ts` passing.
2. Map every contract scenario to an existing or new test file.
3. Mark any scenario that is manual only and explain why automation is not practical yet.
4. Add browser tests for composer chrome, sidebar plan progress, and plan preview before replacing the web shell.
5. Add integration tests for fork first GitHub identity and worktree discard routing before replacing Git workflow internals.
6. Add desktop unit tests for Omarchy theme projection and screenshot fallback before replacing desktop startup.

## Next Test Slices

### Slice A: Web Fork UX

- Composer draft survival through Git panel open, close, and publish affordances
- Composer screenshot and runtime access controls visible in fork chrome
- Sidebar grouped project rows show plan progress such as `1/4`
- Plan preview opens from proposed plan without writing a workspace file
- Wide markdown tables and code blocks scroll horizontally

### Slice B: Server Workflow Safety

- Fork first remote identity with `origin`, `upstream`, and pull request head remotes
- Promotion backup branch creation before destructive follow through
- Worktree discard teardown order and thread cleanup
- Source control publish empty repository and committed repository paths

### Slice C: Provider And Auth

- Provider instance status keeps same driver instances distinct
- Composer reads slash commands and skills from the active provider instance
- Codex model and skill discovery prefer app server responses
- Connections settings cannot revoke the current session

### Slice D: Desktop Omarchy

- Theme reader emits `omarchy` source and projected palette values. Covered by `apps/desktop/src/fork/OmarchyThemeSource.test.ts`.
- Missing Omarchy state degrades without claiming generic system authority. Covered by `apps/desktop/src/fork/OmarchyThemeSource.test.ts`.
- Screenshot capture prefers `omarchy-capture-screenshot`. Covered by `apps/desktop/src/fork/OmarchyScreenshotCapture.test.ts`.
- Clipboard fallback captures an image when Omarchy writes only to clipboard. Covered by `apps/desktop/src/fork/OmarchyScreenshotCapture.test.ts`.
- Composer attach flow still needs web coverage.

## Completion Criteria

The upstream-base rewrite is not ready until:

- all contract scenarios have an evidence link in the active intake note
- all automated fork scenario tests pass
- manual only scenarios have a documented smoke script or checklist
- `bun fmt`, `bun lint`, and `bun typecheck` pass
