# v0.0.30 Product Feature Rebuild Map

Date: 2026-07-29
Status: implementation in progress

## Objective

Map how the opinionated T3 Code fork should reproduce the useful product outcomes in stable upstream release `v0.0.30` while preserving every active fork contract from `F1` through `F15`.

The intended implementation result is functional alignment with the selected release plus preserved fork behavior. The selected release is a read-only design reference. It is not an accepted source-control base.

## Authority And Source Control Boundary

The active Origin Only Source Control Policy prohibits copying, replaying, merging, rebasing, cherry-picking, porting, rebuilding from, or otherwise accepting upstream code into an accepted branch.

Implementation must therefore:

- start from an `origin` owned branch based on current `origin/main`
- use `v0.0.30` only for read-only behavioral and architectural inspection
- implement desired outcomes as new origin-owned work
- keep every write target and change request target bound to `origin`
- require a direct user policy decision before any different intake method

The words `preserve`, `rebuild`, `override`, and `defer` in this guide all describe origin-owned implementation decisions.

## Build Blockers

Implementation must not begin until these blockers are closed:

1. Complete the Policy Proposal Flow for `patch.md` and the active feature specs.
2. Replace stale upstream replay language with origin-owned reference and rebuild language.
3. Update stale `F13` owner and seam language to current Environment HTTP plus durable RPC architecture.
4. Extend `F4` with global prompt stash behavior.
5. Extend `F8` with Sidebar V2, settled lifecycle, and auto-settle behavior.
6. Add `F15` for connection resilience, offline send durability, diagnostics, and transport efficiency.
7. Add `F15` to `patch.md` and the preservation order.
8. Confirm the decision defaults recorded in this guide.
9. Materialize this guide and a new execution ledger in a clean isolated worktree.

The outcome contracts in `F1` through `F15` are authoritative following the confirmed Policy Proposal Flow. Any instruction inside active specs to replay or accept upstream code is non-executable under the active Origin Only Source Control Policy.

### Source Control Preflight Zero

Before creating the branch or worktree:

1. Read `governance/commit_policy.md`.
2. Verify `origin` is `JerkyTreats/t3code`.
3. Verify upstream push remains disabled.
4. Verify the chosen base equals the recorded `origin/main`.
5. Record the exact commands and results in the execution ledger immediately after worktree creation.

Repeat the remote and target verification immediately before every branch, worktree, commit, push, merge, or integration mutation.

No push or remote change is authorized by this guide.

The planned implementation branch is `product/v0.0.30-origin-rebuild`.

The planned isolated worktree is `/home/jerkytreats/t3code-v030-rebuild`.

The planned base is the recorded `origin/main` commit `a5a11adc8253f7ff26fa9fb21b283b2f239d7613`.

The current dirty checkout is never an implementation target.

## Baseline

| Item | Value |
| --- | --- |
| Current fork branch | `main` |
| Current fork head | `a5a11adc8253f7ff26fa9fb21b283b2f239d7613` |
| Current origin head | `a5a11adc8253f7ff26fa9fb21b283b2f239d7613` |
| Latest stable reference tag | `v0.0.30` |
| Stable reference commit | `60af905e70c944228cb35a74fa50740ec4b2d1f7` |
| Stable release date | 2026-07-29 |
| Shared merge base for comparison | `c1ec1915fc16f3dc1ec5d47d9a97f6210a574526` |
| Fork-only commits after comparison base | 8 |
| Reference-only commits after comparison base | 250 |
| Reference commits from `v0.0.29` through `v0.0.30` | 28 |
| Fork changed paths outside vendored references | 374 |
| Reference changed paths outside vendored references | 898 |
| Overlapping changed paths outside vendored references | 139 |

The stable reference is `v0.0.30`. The `v0.0.31` tags visible on 2026-07-29 are prereleases and are excluded from this map.

The current working tree also contains unrelated user edits and desktop core dumps. Design work must not modify or clean them.

## Requirements Read

- `governance/upstream_merge_policy.md`
- `governance/compatibility_policy.md`
- `patch.md`
- all active feature specs from `fork/F01` through `fork/F15`
- `.plans/33-upstream-intake-v0.0.28.md`
- `.plans/34-connection-resilience-program.md`
- `.plans/35-upstream-history-rebuild.md`

## Scope

Included:

- every protected fork feature from `F1` through `F14`
- `F15` connection resilience and offline send durability
- the Sidebar V2 switch and its interaction with fork plan and project behavior
- stable release transport, snapshot, provider, Git, desktop, web, and settings outcomes
- preservation of durable offline sending, reconnect reconciliation, diagnostics, and Electron recovery
- implementation sequencing, contracts, tests, static scans, and cross-domain boundaries

Excluded:

- direct code implementation in this design pass
- any upstream merge, replay, cherry-pick, rebase, checkout, or copy
- `v0.0.31` prerelease behavior
- new hosted deployment adoption
- broad mobile product divergence beyond contract compatibility
- any push, pull request, release, issue mutation, or remote write

## Decision Vocabulary

| Decision | Meaning |
| --- | --- |
| Preserve | Keep the current origin-owned fork outcome and owner seam |
| Rebuild | Implement a useful release outcome as new origin-owned behavior |
| Override | Keep fork policy where the release outcome conflicts with a protected contract |
| Defer | Leave a release outcome out until a product decision or prerequisite exists |

## Change Pressure By Protected Feature

The counts below compare owner modules named by each active feature spec against the shared comparison base.

| Feature | Owner modules | Fork changed | Reference changed | Overlap | Absent in reference |
| --- | ---: | ---: | ---: | ---: | ---: |
| `F1` | 8 | 7 | 4 | 3 | 1 |
| `F2` | 9 | 9 | 6 | 6 | 2 |
| `F3` | 8 | 8 | 5 | 5 | 3 |
| `F4` | 13 | 7 | 7 | 3 | 4 |
| `F5` | 14 | 10 | 7 | 6 | 2 |
| `F6` | 4 | 4 | 1 | 1 | 1 |
| `F7` | 4 | 3 | 3 | 3 | 0 |
| `F8` | 26 | 12 | 20 | 10 | 2 |
| `F9` | 12 | 12 | 6 | 6 | 4 |
| `F10` | 7 | 5 | 7 | 5 | 0 |
| `F11` | 19 | 11 | 12 | 9 | 1 |
| `F12` | 32 | 6 | 21 | 6 | 0 |
| `F13` | 21 | 7 | 7 | 5 | 0 |
| `F14` | 25 | 22 | 8 | 6 | 15 |
| `F15` | 30 | 21 | 14 | 11 | 10 |

This distribution rules out a package-wide replacement strategy. Every high-overlap surface needs outcome-level implementation behind named fork seams.

## Product Architecture Decisions

### Origin-Owned Release Substrate

Decision: rebuild selected outcomes

Useful stable release outcomes include:

- HTTP gzip for large JSON snapshots
- WebSocket `permessage-deflate` negotiation
- bounded and pruned thread activity payloads
- faster offline catch-up and dropped-event protection
- settled thread lifecycle and immediate merged pull request settlement
- bounded Git ref refresh invalidation
- shared filesystem browse navigation
- provider selection hardening
- desktop updater relaunch correctness

These outcomes must be implemented through current origin-owned services and contracts. Package, lockfile, generated schema, and dependency changes must be evaluated one by one. They are not an intake unit.

### Connection Resilience Preservation

Decision: preserve current guarantees and rebuild transport efficiency around them

Current origin behavior includes:

- durable thread outbox state
- stable command and message identities
- explicit retry and discard for terminal failures
- structured connection diagnostics and a persistent flight recorder
- V2 thread sync with bounded paging and deferred payload hydration
- shell-first project state and active-thread detail ownership
- subscribe-first snapshot, replay, and live sequencing
- renderer crash recovery with bounded backoff

The stable reference removes current fork files such as `packages/client-runtime/src/state/threadOutbox.ts`, `packages/client-runtime/src/connection/diagnostics.ts`, and `packages/client-runtime/src/state/threadSyncDiagnostics.ts`.

Those deletions are rejected. Compression, payload pruning, and settled lifecycle work must remain additive to the current resilience model.

### Provider Instance Identity

Decision: preserve `F12` and rebuild newer selection safeguards

The core instance contract already exists in both trees. Current origin routes provider sessions, snapshots, settings, commands, skills, recovery, and stop behavior through `providerInstanceId`.

Useful stable release outcomes to rebuild:

- deterministic fallback to a ready or non-error provider instance
- an explicit local no-provider selection that cannot be persisted or dispatched
- instance-scoped default model resolution
- custom model slug preservation without driver-specific corruption
- authoritative removal of stale OpenCode models
- Claude skill discovery through the active instance
- MCP credential lifetime refresh on active turns

The main integration rule is exact identity first. A fallback may select another instance only through one explicit resolver and must reset the model to that instance's own default.

### Sidebar V2

Decision: rebuild as an optional surface and preserve `F8` plus `F14`

The current fork has no Sidebar V2 implementation. The stable reference provides:

- `apps/web/src/components/SidebarV2.tsx`
- `apps/web/src/components/AppSidebarLayout.tsx`
- persisted `sidebarV2Enabled`
- persisted `sidebarV2ConfiguredByUser`
- persisted `sidebarAutoSettleAfterDays`
- a Beta settings switch
- server-backed settled lifecycle
- project grouping and project actions

The fork implementation must use a product seam rather than a direct component transplant.

Recommended initial behavior:

- default Sidebar V2 off in stable fork builds
- honor an explicit persisted user choice
- expose the switch in settings
- keep Sidebar V1 available during the first release
- require plan progress, project actions, concrete environment identity, and right-panel entry parity before enabling by default
- defer thread snoozing to a separate lifecycle feature
- preserve environment capability gating, bulk settle, unread state, delete, rename, and keyboard traversal

`sidebarV2ConfiguredByUser` is required so a stored default value cannot be mistaken for an explicit opt-out.

`sidebarAutoSettleAfterDays` uses these exact rules:

- decoding default is 3
- null disables inactivity auto-settle
- enabled values are integers from 1 through 90
- invalid UI values do not persist

### Source Control And Git

Decision: preserve origin-only behavior and rebuild the ref lifecycle

Current origin evidence:

- Git is a unified right-panel surface in `apps/web/src/rightPanelStore.ts:24` and `apps/web/src/components/RightPanelTabs.tsx:490`.
- Project-scoped Git does not own composer text or attachments in `apps/web/src/components/git-panel/GitPanelSurface.tsx:17`.
- Terminal Git failure releases action state and refreshes status in `apps/server/src/ws.ts:1833`.
- Worktree teardown is ordered through `apps/web/src/lib/threadDeletionWorkflow.ts:35`.
- Mutation target resolution is origin-only in `apps/server/src/sourceControl/SourceControlProviderRegistry.ts:275`.
- GitHub creation supplies an explicit repository target in `apps/server/src/sourceControl/GitHubCli.ts:916`.
- Promotion publishes its backup before merge and target push in `apps/server/src/git/GitManager.ts:1942`.
- Publish rejects a requested or returned non-origin remote in `apps/server/src/sourceControl/SourceControlRepositoryService.ts:222`.

The current ref stream polls every five seconds and retains streams for five minutes in `packages/client-runtime/src/state/vcs.ts:25`. This is the confirmed resource-storm gap.

Useful stable release outcomes to rebuild:

- optional `refresh` on `VcsListRefsInput`
- one live refresh per connection generation
- capped retry instead of fixed polling
- revision-based invalidation with a persistence lock
- server snapshot coalescing by Git common directory
- generation checks that reject stale scan results
- invalidation after every ref-affecting action settlement
- explicit fresh refs for pull request worktree preparation
- bounded paginated branch loading

Fork hardening that must land with the ref lifecycle:

- preserve status refresh after terminal action failure
- carry optional promotion `targetBranch` through the shared VCS action manager
- invalidate refs on promotion success, failure, and interruption
- preflight local origin state before an external repository is created
- keep read-only remote discovery structurally separate from mutation target resolution
- implement separate worktree close and discard actions over one teardown helper

Current thread deletion provides discard-like teardown but does not provide the required close action that retains the thread.

### Desktop And Connectivity

Decision: preserve fork desktop seams and rebuild selected release reliability outcomes

Current origin evidence:

- shared visible and technical identity lives in `packages/shared/src/productIdentity.ts:4`
- local theme source selection lives in `apps/desktop/src/fork/DesktopSystemThemeService.ts:21`
- direct screenshot capture lives in `apps/desktop/src/fork/OmarchyScreenshotCapture.ts:722`
- screenshot attachment preserves draft text in `apps/web/src/fork/composerScreenshot.ts:37`
- live Codex discovery lives in `apps/server/src/provider/Layers/CodexProvider.ts:266`
- durable access snapshots and pairing actions reach Connections settings through `apps/web/src/components/settings/ConnectionsSettings.tsx:1897`
- renderer recovery uses bounded backoff in `apps/desktop/src/window/DesktopWindow.ts:378`

Useful stable release outcomes to rebuild:

- updater-controlled relaunch through a distinct lifecycle latch
- newer macOS development launcher assembly
- channel-specific web brand assets
- Linux secure-storage launch selection
- appearance category and CSS repairs
- normal and compact composer control primitives
- relay credential validation against a live matching environment link
- generation-safe managed endpoint deprovision
- native HTTP gzip and WebSocket compression

The secure-storage failure is a three-factor defect:

- Linux Electron is running
- remote connection catalog persistence requires encrypted storage
- Electron selects a password store that does not expose usable encryption in the active session

The catalog correctly rejects plaintext fallback. The launcher currently forces `gnome-libsecret`, but that behavior needs a direct launcher test and a host matrix because the flag cannot create a missing Secret Service.

`F10` is still incomplete because neither tree provides detected supported Codex binary choices. Binary discovery is new fork work and must not weaken explicit path pinning.

The stable reference moves `relay:write` out of standard paired-client scopes. That conflicts with current `F13`. The implementation baseline preserves relay write as required by the active spec. A narrower setup grant requires a separate security review and an approved `F13` contract update.

### Web Product Assembly

Decision: rebuild stable UI primitives under fork-owned product adapters

Current origin evidence:

- composer draft ownership spans text, images, attachments, provider selections, runtime mode, and rich mode in `apps/web/src/composerDraftStore.ts:128`
- active plan progress is projected in `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts:2493`
- Sidebar V1 renders fractional progress before generic working state in `apps/web/src/components/Sidebar.logic.ts:398`
- rich document rendering is owned by `apps/web/src/components/DocumentMarkdownRenderer.tsx:20`
- virtual plan preview is route-driven through `apps/web/src/planPreviewRouteSearch.ts:1`
- project Git and Inference descriptors use concrete project identity in `apps/web/src/rightPanelStore.ts:17`
- inference keeps the latest usage row per turn in `apps/web/src/project-management/projectManagementInference.ts:132`

Useful stable release outcomes to rebuild:

- hydration-aware Sidebar V2 resolution
- Sidebar V2 settlement, pagination, grouping, and project actions
- shared composer control primitives
- global provider-agnostic prompt stash
- inline code file path links
- diff panel scroll stability
- deferred filesystem browse navigation
- context-window snapshot trimming

Stable Sidebar V2 intentionally collapses plan work into Ready. The fork must override its status presentation so approval and input remain higher priority while active fractional plan progress replaces generic Working.

The current command palette does not open the unified project launcher, which is existing `F14` drift. Sidebar V1, Sidebar V2, and command palette must call one shared project-launcher helper.

The stable prompt stash stores only text and images. Restore must write those fields into the current draft without changing provider instance or model selection.

## Protected Feature Direction

| Feature | Direction | Required release alignment |
| --- | --- | --- |
| `F1` | preserve and rebuild | keep fork desktop and release identity while evaluating packaging and updater fixes |
| `F2` | preserve | keep local desktop theme projection through current IPC and CSS variables |
| `F3` | preserve | keep direct screenshot attach distinct from browser preview capture |
| `F4` | preserve and rebuild | retain draft ownership while adding provider-safe prompt stash and UI fixes |
| `F5` | preserve and rebuild | keep Git surfaces draft-neutral while adopting bounded ref refresh outcomes |
| `F6` | override | all GitHub mutation targets remain explicitly bound to `origin` |
| `F7` | override and rebuild | retain origin-only promotion and teardown while adopting safe branch metadata fixes |
| `F8` | preserve and rebuild | add Sidebar V2 without losing fractional plan progress or plan cues |
| `F9` | preserve and rebuild | keep richer document rendering while adding inline code path navigation and file browsing improvements |
| `F10` | preserve and rebuild | retain live Codex discovery and binary pinning while adding launch arguments and provider fixes |
| `F11` | preserve and rebuild | keep provider-neutral discovery and publish with origin-only mutation policy |
| `F12` | preserve and rebuild | retain exact instance identity and add deterministic fallback plus provider capability improvements |
| `F13` | preserve and rebuild | retain access management and saved environments while adding Connect and relay fixes |
| `F14` | preserve and rebuild | keep unified project surfaces and environment-aware identity across Sidebar V2 |
| `F15` | preserve and rebuild | keep outbox, reconciliation, diagnostics, and renderer recovery while adding compression |

## Ordered Implementation Slices

### Slice 0 Origin Safety And Baseline

Write scope:

- mandatory clean isolated worktree on `product/v0.0.30-origin-rebuild`
- this design ledger
- new execution ledger
- `patch.md` and `fork/` only after Policy Proposal Flow confirmation
- no runtime files

Steps:

1. Complete and receive confirmation for the Policy Proposal Flow.
2. Replace stale upstream replay language in `patch.md` and all active feature specs.
3. Update `F13` owner modules and seams to current Environment HTTP plus durable RPC.
4. Extend `F4` for global prompt stash ownership and migration.
5. Extend `F8` for Sidebar V2, settled lifecycle, auto-settle, and explicit snooze defer.
6. Add `F15` for durable outbox, sequence reconciliation, diagnostics, renderer recovery, and transport efficiency.
7. Add `F15` to the feature index and origin rebuild order.
8. Verify `origin` is the only write target.
9. Record the selected origin base commit.
10. Preserve unrelated user changes outside the implementation worktree.
11. Record the stable reference tag and commit for read-only evidence.
12. Ban package-wide or subtree-wide replacement in the implementation packet.
13. Materialize a byte-identical copy of this guide in the isolated worktree.
14. Create the execution ledger before any source edit.

Exit criteria:

- origin base and target branch are explicit
- no implementation branch descends from or contains new upstream commits
- user work remains untouched
- all implementation commands run from `/home/jerkytreats/t3code-v030-rebuild`
- no active spec directs implementers to accept or replay upstream code
- `F13` names current production owners
- `F4`, `F8`, and `F15` describe every new protected behavior in this guide

### Slice 1 Shared Contracts And Persistence

Write scope:

- `packages/contracts`
- client settings decode and patch behavior
- runtime protocol additions required by later slices
- migration contract for origin-owned projection migration 39

Steps:

1. Add Sidebar V2 enabled, configured-by-user, and auto-settle settings with the exact value contract above.
2. Preserve all `F12` provider instance envelopes and exact identity fields.
3. Preserve auth access, source control, desktop IPC, and project identity contracts.
4. Add only the transport metadata needed for compression or settled lifecycle.
5. Define migrations for persisted browser settings before UI code reads new fields.
6. Reserve migration 39 for settled thread projection state.
7. Leave migration ids 33 through 38 untouched.

Exit criteria:

- old settings decode
- unknown provider instance data survives
- explicit Sidebar V2 choices round trip
- no contract method exists without a named server and client owner
- a schema-38 database has a defined upgrade path to migration 39

### Slice 2 Projection Lifecycle, Runtime Transport, And Connection Resilience

Write scope:

- `apps/server/src/http.ts`
- `apps/server/src/httpCompression`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `apps/server/src/orchestration`
- `apps/server/src/persistence`
- `packages/client-runtime/src/connection`
- `packages/client-runtime/src/rpc`
- `packages/client-runtime/src/state`
- `patches`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- root `package.json`
- `scripts/bench-connection-resilience.ts`

Steps:

1. Implement origin migration 39 for settled thread projection state.
2. Initialize new settlement columns to null for every existing row.
3. Add settled commands, events, projection, shell fields, and client-runtime policy.
4. Keep pending approval, pending input, live session, and queued-turn threads active.
5. Let explicit active state suppress automatic settlement until real activity clears a stale override.
6. Apply inactivity thresholds only after every active blocker is absent.
7. Add native HTTP gzip for eligible JSON responses with threshold and `Vary` handling.
8. Add origin-owned Effect platform beta 78 patches for WebSocket `permessage-deflate`.
9. Register the patches in `pnpm-workspace.yaml` and refresh only matching lockfile metadata.
10. Keep snapshot sequencing, bounded paging, payload hydration, and Unicode-safe chunking intact.
11. Make server activity projection the only owner of context-window row trimming.
12. Retain the latest resolvable context-window row per turn with provider totals intact.
13. Add release-aligned payload pruning without hiding data required by plan, inference, or diagnostics.
14. Preserve durable outbox and idempotent command receipt behavior.
15. Preserve connection diagnostics, sanitization, and flight recorder persistence.

Settled lifecycle contract:

- Persist `settledOverride` as null, `settled`, or `active`.
- Persist `settledAt` as an ISO timestamp or null.
- Add user settle and user unsettle commands.
- Emit idempotent settled and unsettled events.
- Repeated settle preserves the original accepted `settledAt`.
- User unsettle writes the `active` override and clears `settledAt`.
- Activity unsettle clears both override and timestamp.
- User message, live session transition, approval request, and user-input request count as waking activity.
- Pending approval, pending input, starting session, running session, and queued turn block settlement.
- Queued turn detection uses a two-minute grace and compares the latest user message with latest turn request, start, and completion timestamps.
- Explicit `settled` wins only after active blockers clear.
- Explicit `active` suppresses merged, closed, and inactivity auto-settlement.
- Merged or closed change request state settles only when no active blocker or explicit active override remains.
- Inactivity uses the latest valid user or turn timestamp.
- Invalid timestamps never hide a thread.
- Existing rows initialize both persisted fields to null.

Exit criteria:

- compressed and uncompressed clients receive equivalent snapshots
- dropped-event boundary tests pass
- reconnect never duplicates an accepted turn
- offline drafts and queued prompts survive restart
- diagnostics remain bounded and credential safe
- a schema-38 database upgrades to migration 39 without rewriting ids 33 through 38
- the settled policy resolver classifies merged or closed input immediately unless explicit active state wins
- pending approval, pending input, live session, and queued-turn threads never auto-settle
- explicit active state blocks inactivity settlement and real activity clears stale overrides
- inactivity thresholds classify rows only when no active blocker remains
- detail, shell, hydration, and inference consumers agree on the retained context-window row
- compressed responses reduce eligible leviathan snapshot bytes by at least 50 percent
- p95 compressed snapshot latency stays within 20 percent of the uncompressed baseline
- peak server RSS and Node client heap stay within 15 percent of the uncompressed baseline

Performance measurement protocol:

- add `scripts/bench-connection-resilience.ts`
- generate a deterministic local fixture with 100 active threads and 250 MiB of activity payloads
- use Node 24, release server build, loopback transport, and an isolated temporary data directory
- capture an uncompressed baseline and compressed candidate through an injectable compression layer
- run 10 warmup requests and 30 measured requests at concurrency 4
- run 10 forced reconnect cycles with one queued turn per cycle
- report wire bytes, p50 and p95 latency, server RSS, client heap, reconnect count, replay count, and duplicate receipt count
- fail the command when any numeric threshold or correctness invariant is exceeded
- expose the command as `pnpm bench:connection-resilience`

### Slice 3 Desktop, Identity, Theme, Screenshot, And Auth

Write scope:

- desktop launcher, app, settings, window, IPC, and fork services
- web desktop bridge consumers
- auth access adapters and Connections settings

Dependency:

- Slice 1
- Slice 2 transport contracts

Required outcomes:

- `F1`, `F2`, `F3`, `F13`, and the desktop launch bridge portion of `F10`
- updater-controlled relaunch
- secure-storage launch compatibility
- relay credential correctness for linked and unlinked environments

Steps:

1. Preserve the shared identity seam while rebuilding release and launcher outcomes.
2. Compose updater-controlled relaunch with guarded shutdown and renderer recovery.
3. Test Linux secure-storage selection directly in launcher arguments.
4. Restore theme contracts, source service, IPC bridge, and web projection after appearance tokens settle.
5. Clear prior projected colors when a replacement theme is invalid.
6. Widen the theme source contract beyond the current Omarchy-only discriminator.
7. Report screenshot capability from actual adapter availability rather than Linux alone.
8. Preserve adapter preference, delayed artifact wait, complete PNG validation, clipboard fallback, and cleanup.
9. Preserve preview-annotation conversion and attachment size limits.
10. Expose screenshot action in both normal and compact composer control lanes.
11. Preserve the configured Codex binary path through the desktop backend launch bridge.
12. Preserve access management over Environment HTTP and durable RPC.
13. Rebuild relay credential validation and deprovision race handling.
14. Preserve standard paired-client relay write per `F13`.

Exit criteria:

- packaged and development identity remains fork-owned
- local theme and direct screenshot attach remain capability gated
- explicit Codex binary paths remain pinned
- pairing, reconnect, disconnect, forget, and session revocation remain usable
- unconfigured development and production web branding remains `Alpha`
- release artifact and announcement names use fork identity
- invalid replacement themes clear prior projected variables
- the theme contract can represent a future non-Omarchy source
- screenshot capture proves preference order, delayed PNG completion, clipboard fallback, entity conversion, and size gates
- current-session revocation remains disabled in server behavior and UI
- browser and desktop transports report access capability accurately
- SSH and local-first fallback flows remain unchanged
- auth errors translate through shared contracts without leaking server-only errors
- updater relaunch bypasses guarded ordinary quit without weakening normal shutdown
- secure storage succeeds when Secret Service is available and still refuses plaintext fallback
- both normal and compact composer layouts expose screenshot capture

### Slice 4 Provider Runtime And Model Selection

Write scope:

- provider instance contracts and registries
- provider snapshots and status cache
- provider adapters and session directory
- web provider instance and model selection helpers
- composer command and skill menus
- provider settings

Dependency:

- Slice 1
- Slice 2
- Slice 3 desktop binary launch bridge

Steps:

1. Preserve exact instance-keyed registry and session routing.
2. Add deterministic provider and instance fallback without driver collapse.
3. Add a non-dispatchable no-provider UI state.
4. Rebuild useful provider capability, skill, model, and launch argument outcomes.
5. Preserve live Codex model and skill discovery plus explicit binary selection.
6. Preserve selected Codex CLI version in provider probe and session initialization.
7. Add bounded Codex binary discovery across configured path, PATH, hydrated desktop environment, and WSL environment.
8. Never scan the whole filesystem for binary candidates.
9. Verify prompt stash and durable outbox entries retain their selected instance.
10. Preserve custom-instance add, enable, disable, and delete controls.
11. Preserve legacy snapshot decode and unknown instance settings data.
12. Preserve raw `$skill` token text and slash-command draft insertion.
13. Prevent duplicate singleton adapter streams across custom instances.
14. Render recognized skill tokens as chips when active-instance metadata exists.

Exit criteria:

- two instances of one driver remain distinct
- fallback resets to the chosen instance default model
- no-provider state disables send
- custom model slugs survive
- commands and skills come from the active instance
- explicit binary path survives settings, desktop restart, probe, and runtime spawn
- provider initialization uses the resolved selected CLI version
- custom instance lifecycle controls work without collapsing driver identity
- legacy snapshots decode and unknown instance data survives
- skill and command insertion changes only the active draft text
- custom instances do not duplicate singleton adapter event streams
- recognized skill tokens render as chips while preserving raw prompt text

### Slice 5 Git, Source Control, Worktrees, And Right-Panel Git

Write scope:

- server Git and VCS services
- source control provider registry and repository services
- client runtime VCS state
- web source control actions and Git surface
- worktree lifecycle helpers

Dependency:

- Slice 1
- Slice 2 settled lifecycle

Required outcomes:

- `F5`, `F6`, `F7`, `F11`, and the Git portion of `F14`
- bounded ref invalidation
- immediate merged pull request settlement
- worktree metadata preservation
- project-scoped Git without draft ownership

Steps:

1. Add optional `refresh` without dropping `targetBranch` or `issueLink`.
2. Add generation-checked client invalidation and server snapshot coalescing.
3. Invalidate after every ref-affecting action settlement.
4. Route promotion through the shared VCS action manager with optional `targetBranch`.
5. Preserve origin-only target resolution in every action.
6. Preflight origin before external repository creation.
7. Keep terminal status refresh and action-state release.
8. Keep promotion backup and cleanup ordering.
9. Add distinct close and discard worktree actions over one teardown helper.
10. Preserve the existing project-scoped `GitPanelSurface` adapter without editing the right-panel union or launcher.
11. Integrate merged pull request settlement with explicit active-state precedence.
12. Preserve discovery readiness for GitHub, GitLab, Azure DevOps, and Bitbucket.
13. Preserve provider clone lookup over SSH plus raw Git URL bypass.
14. Preserve publish capability gating and empty repository `remote_added`.
15. Keep GitHub issue UI GitHub-only.
16. Route change requests through the origin provider and retain explicit GitHub fallback only where policy permits.
17. Preserve local-path add-project mode and register cloned projects at the cloned cwd.
18. Reject cross-repository pull-request worktree heads before materialization.

Exit criteria:

- every mutation targets `origin`
- non-origin tracking fails closed
- promotion backup and cleanup ordering remains intact
- failed actions release UI state
- Git ref refresh does not create a resource storm
- worktree close and discard leave no stale runtime state
- close retains its thread while discard removes its thread
- external repository creation cannot occur before local origin preflight
- GitHub, GitLab, Azure DevOps, and Bitbucket readiness remains visible
- provider clone uses SSH by default and raw Git URL clone bypasses provider lookup
- local-path mode remains available and both clone modes register the cloned cwd
- publish remains unavailable before authenticated capability is ready
- empty repositories return `remote_added`
- the chat header exposes the direct Git launcher
- commit, pull, promote, pull request, publish, refresh, workspace, sync, and changed-file actions remain visible
- selected checkout and current-ref indicators converge without branch flicker
- differing origin fetch and push URLs fail closed
- pull-request worktree preparation materializes only same-repository origin branches
- close retains the thread and releases it onto the primary checkout
- concurrent consumers across linked worktrees trigger at most one active server ref scan per Git common directory and refresh attempt
- one connection generation performs one initial refresh unless an explicit invalidation or failed retry requires another attempt
- ref streams release after 30 idle seconds and retry delay never exceeds 30 seconds
- stale generations never publish or persist ref results
- merged or closed change requests feed the settled resolver and settle immediately when no active blocker wins

### Slice 6 Composer, Sidebar V2, Plan Cues, And Navigation

Write scope:

- composer draft store and composer chrome
- Sidebar V1 and Sidebar V2 product adapters
- app sidebar layout and settings switch
- plan progress projection
- command palette and shared filesystem navigation

Dependency:

- Slice 1
- Slice 2
- Slice 4
- Slice 5 project and Git identity

Required outcomes:

- `F4`, `F5`, `F8`, and Sidebar V2 portions of `F14`
- provider-safe prompt stash
- deferred filesystem navigation
- Sidebar V2 switch with explicit choice tracking

Steps:

1. Add settings, hydration-aware resolver, Beta panel, and layout switch as one vertical.
2. Consume settled lifecycle from Slice 2 before mounting Sidebar V2.
3. Add `sidebarAutoSettleAfterDays` with explicit persisted behavior.
4. Keep one shared plan-progress derivation for Sidebar V1 and Sidebar V2.
5. Add environment capability gating, project scopes, bulk settle, unread state, delete, rename, and keyboard traversal.
6. Preserve concrete project copy-path, rename, removal, and project-path actions.
7. Add stable composer controls and a separate global prompt stash.
8. Migrate provider-scoped legacy stash data once into the global text and image queue, then delete it only after successful persistence.
9. Reattach screenshot, runtime access, rich mode, attachment warning, and Enter behavior around the active draft.
10. Add deferred filesystem navigation through the shared client-runtime coordinator.
11. Route Sidebar V1, Sidebar V2, and command palette project actions through one concrete project-launcher helper.

Exit criteria:

- provider, branch, sidebar, Git, and route interactions do not clear drafts
- Sidebar V1 and V2 show plan progress such as `1/4`
- plan-ready and plan-active cues remain visible in thread activity surfaces
- `PlanSidebar` remains reachable from the active thread
- project actions target concrete environment and project identities
- settled threads remain reachable
- settings switch survives restart
- prompt stash restore never changes the selected provider instance or model
- logical group ids never enter routes, project surfaces, or repository calls
- auto-settle settings survive restart and capability gating hides unsupported actions
- bulk settle, unread, delete, rename, and keyboard traversal work in Sidebar V2
- concrete project entries retain copy-path, rename, removal, and project-path actions

### Slice 7 Markdown, Files, Plan Preview, And Project Surfaces

Write scope:

- chat and document markdown renderers
- file preview panel
- markdown link resolution
- plan preview route state
- right-panel project context and inference surfaces

Dependency:

- Slice 5
- Slice 6

Required outcomes:

- `F9`
- remaining `F14`
- inline code file path links
- stable file and diff panel behavior

Steps:

1. Add conservative inline-code path classification to the current markdown pipeline.
2. Exclude fenced code and existing links before creating file link chips.
3. Preserve document renderer ownership for headings, Mermaid, images, outline, and source footer policy.
4. Apply file panel line-reveal and rendered-state improvements without defaulting documents back to source.
5. Apply diff virtualizer metrics before navigation verification.
6. Preserve the existing right-panel Git and Inference descriptors while reconciling stable host changes.
7. Clear or degrade stale project surfaces after project removal or bootstrap changes.
8. Consume Slice 2 context-window trimming while preserving provider-reported processed totals.
9. Fix command palette project launch drift through the shared helper from Slice 6.

Exit criteria:

- virtual plan preview remains in memory until explicit save
- Mermaid, images, local anchors, workspace links, and external links retain their protected behavior
- inference totals use the latest usage snapshot per turn
- project and thread links remain environment aware
- file and diff panels do not jump or lose navigation state
- inline code file links do not interfere with Mermaid or fenced code
- stale project surfaces return to a safe launcher or missing-project state
- plan copy, download, explicit save, close, and route return actions remain available
- wide tables and code blocks scroll in chat, plan, and document surfaces
- document code retains copy controls and syntax highlighting
- safe document HTML remains limited to the approved document tag set
- nested document links resolve from document cwd while retaining workspace-root metadata
- code files remain code previews and do not enter rendered-document mode
- virtual plans hide the source footer while real files retain source-open behavior
- project header retains name, workspace, repository, environment, new thread, latest thread, editor, and script actions
- project Git continues to work without an active server thread
- inference retains lifetime burn, recent burn, 30-day projection, input, cached input, output, tracked turns, and ranked threads
- cached input is not double counted and magnitude formatting covers `K` through `Q`

### Slice 8 Mobile, Relay, Release, And Workflow Reconciliation

Write scope:

- mobile compatibility adapters only where contracts changed
- relay compatibility
- fork release and packaging scripts
- retained origin workflows
- packaged Linux desktop smoke script
- root `package.json`

Dependency:

- Slices 1 through 7 integrated

Required outcomes:

- mobile remains compatible with shell, settled, auth, and provider contracts
- relay credential and tunnel lifecycle outcomes remain correct
- fork release identity remains visible
- upstream hosted deployment automation stays absent unless separately adopted

Steps:

1. Reconcile mobile decoders with settled, provider, auth, and shell contracts.
2. Verify saved environment restore and remote connection behavior.
3. Preserve relay credential validation and tunnel release on shutdown.
4. Reconcile desktop artifact metadata through the shared identity seam.
5. Keep release and hosted workflow targets origin-only.
6. Build one representative unsigned Linux desktop artifact on the current host.
7. Add `test:desktop-artifact-smoke` to extract the AppImage into a temporary directory and launch its packaged Electron entry with isolated user data.
8. Run the packaged probe under a bounded virtual display or equivalent headless display service.
9. Require backend-listening and renderer-ready markers, then terminate cleanly.

Exit criteria:

- mobile connection and thread flows pass
- release artifacts retain fork identity
- workflow scan finds no upstream write target
- release smoke validates version propagation and update manifests
- desktop smoke validates the built main bundle
- desktop artifact smoke validates the extracted AppImage entry and fails on nonzero child exit
- the representative Linux artifact contains the expected web assets, identity, and packaged layout

### Slice 9 Preservation Gate

Steps:

1. Run focused tests for every slice.
2. Run fresh domain reviews.
3. Run cross-domain boundary review.
4. Run the full repository gates.
5. Perform manual workflow checks for Sidebar V2, reconnect, Git, plan preview, project surfaces, and desktop pairing.
6. Record one `F1` through `F15` decision, owner seam, compatibility note, and evidence row for every protected feature.
7. Verify every runtime slice updated its affected feature spec in the same atomic change.
8. Reconcile any remaining `patch.md` or feature-spec drift before signoff.

Required gates:

```text
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:desktop
pnpm test:desktop-smoke
pnpm release:smoke
pnpm dist:desktop:linux
pnpm test:desktop-artifact-smoke
pnpm bench:connection-resilience
```

Also run:

```text
pnpm lint:mobile
```

when native mobile code changes.

Never run `bun test`.

## Dependency Graph

- Slice 1 precedes every runtime and UI slice because settings, identity, and protocol shapes are shared.
- Slice 2 precedes provider, Git, and UI assembly because reconnect, shell, and settled lifecycle semantics are foundational.
- Slice 3 and Slice 5 may proceed in parallel after Slice 2 because their write scopes are disjoint.
- Slice 4 depends on Slice 3 because the provider lane consumes the desktop binary launch bridge.
- Slice 6 depends on Slice 4 provider identity and Slice 5 project or Git identity.
- Slice 7 depends on the right-panel, navigation, and composer integration from Slice 6.
- Slice 8 follows full integration of Slices 1 through 7 so its artifact includes every product change.
- Slice 9 depends on every prior slice.

## Build Waves

| Wave | Slices | Parallelism |
| --- | --- | --- |
| Wave 0 | Slice 0 | central only |
| Wave 1 | Slice 1 | central only |
| Wave 2 | Slice 2 | central only |
| Wave 3 | Slice 3 and Slice 5 | parallel with isolated write scopes |
| Wave 4 | Slice 4 | provider integration central |
| Wave 5 | Slice 6 | composer and route integration central |
| Wave 6 | Slice 7 | route and project integration central |
| Wave 7 | Slice 8 | release reconciliation central |
| Wave 8 | Slice 9 | central signoff with fresh reviews |

## Cross-Domain Invariants

- Provider instance identity must survive draft persistence, prompt stash, outbox delivery, reconnect, and recovery.
- Concrete environment and project identity must survive Sidebar V2 grouping, right-panel surfaces, and document navigation.
- Plan progress data must survive payload pruning and settled lifecycle projection.
- Git mutation authority must remain bound to `origin` through UI, RPC, provider resolution, and CLI invocation.
- Compression must not alter sequencing, authorization, payload hydration, or diagnostics.
- Desktop browser preview screenshots must remain separate from direct composer screenshot attach.
- Project-scoped Git must never claim active composer draft ownership.
- Release and update work must preserve fork identity and stable storage identifiers.
- Every runtime slice updates affected feature specs in the same atomic change.

## Verification Matrix

| Area | Focused evidence |
| --- | --- |
| Contracts | settings decode, provider instance identity, auth access, source control, IPC, RPC |
| Transport | gzip, `Vary`, WebSocket negotiation, snapshot equivalence, dropped-event boundary |
| Resilience | durable outbox, idempotent receipt, reconnect, diagnostics, renderer recovery |
| Desktop | identity, updater relaunch, theme, screenshot, binary pinning, secure storage |
| Providers | instance registry, model fallback, skills, commands, custom models, recovery |
| Git | ref invalidation, origin-only target, promotion, publish, worktree teardown |
| Sidebar | switch persistence, V1 parity, V2 status, plan progress, grouping |
| Composer | prompt stash, draft survival, provider change, attachment survival |
| Markdown | inline file links, document links, Mermaid, images, outline, overflow |
| Projects | environment identity, Git surface, inference totals, scripts, routes |
| Mobile and relay | shell sync, auth, environment restore, relay credential lookup |
| Release | artifact identity, update flow, workflow target scan |

## Per-Feature Preservation Gate

Every row requires an origin implementation decision, final owner module, focused automated evidence, manual workflow evidence where visible, and compatibility notes.

| Feature | Required evidence |
| --- | --- |
| `F1` | desktop and web identity, unconfigured `Alpha`, artifact and announcement names, stable app id and storage |
| `F2` | source discovery, generic source contract, IPC, CSS and terminal projection, invalid-theme clear, safe fallback |
| `F3` | adapter preference, delayed complete PNG, clipboard fallback, active draft attach, preview entity conversion, size gate |
| `F4` | text, images, attachments, terminal chips, provider selection, rich mode, warning, chrome, stash restore, atomic legacy migration |
| `F5` | direct Git launcher, full visible action hierarchy, project-scoped Git, terminal failure recovery, draft isolation |
| `F6` | explicit origin repository for lookup, default branch, issue, pull request, and creation mutations |
| `F7` | backup before merge, origin-only target push, guarded cleanup, same-repo heads, branch convergence, primary release, close and discard |
| `F8` | shell plan projection, plan cues, `PlanSidebar`, display-only grouping, V2 persistence, settlement, auto-settle, bulk actions, unread, capability gates, keyboard traversal, snooze defer |
| `F9` | virtual plan actions and return, three-surface overflow, code copy, syntax, safe HTML, Mermaid, images, links, outline, footer |
| `F10` | live model and skill pages, custom merge, selected CLI initialize version, binary candidates, absolute pin, restart spawn |
| `F11` | four-provider readiness, local path, SSH clone, raw URL bypass, cloned cwd registration, publish gating, origin-only publish, empty repo, GitHub issue scope |
| `F12` | legacy decode, distinct same-driver instances, settings lifecycle, exact routing, recovery, commands, skill chips, raw tokens, stream uniqueness |
| `F13` | pairing and session actions, shared errors, transport gating, current-session protection, relay scopes, saved environment, SSH, local fallback |
| `F14` | concrete project identity, project header, new thread, editor and scripts, Git without thread, inference metrics, cache math, `K` through `Q`, links |
| `F15` | durable outbox, stable ids, receipt idempotency, sequence reconciliation, diagnostics, renderer recovery, compression, duress budgets |

## Static Scans

Implementation review should include:

```text
rg -n "upstream" apps packages scripts .github
rg -n "sidebarV2Enabled|sidebarV2ConfiguredByUser|sidebarAutoSettleAfterDays" apps packages
rg -n "providerInstanceId|instanceId" apps packages
rg -n "threadOutbox|ConnectionFlightRecorder|threadSyncDiagnostics" apps packages
rg -n "permessage-deflate|content-encoding|Accept-Encoding" apps packages patches
rg -n "captureScreenshot|getSystemTheme|onSystemTheme" apps
rg -n "origin|upstream" apps/server/src/git apps/server/src/sourceControl apps/server/src/vcs
rg -n "activePlanProgress|turn.plan.updated" apps packages
```

Every upstream hit in a mutation path needs an explicit read-only explanation or removal.

## Confirmed Current Gaps

- `F2` can leave stale projected colors active after an invalid replacement theme because validation exits without clearing the prior projection.
- `F2` describes multiple theme sources while the current IPC discriminator names only `omarchy`.
- `F3` exposes capture by platform rather than verified adapter capability.
- `F7` lacks distinct worktree close and discard actions.
- `F10` lacks detected supported Codex binary choices.
- `F14` command palette project actions do not open the unified project launcher.
- Current Git ref polling reproduces the resource-storm condition corrected by the stable release.
- Current Linux secure-storage selection lacks a direct launcher regression test.
- Sidebar V2 and all of its settings, lifecycle, and migration support are absent.

## Risks

- A broad runtime replacement would delete proven resilience behavior.
- Sidebar V2 can look complete while losing plan progress, project actions, or environment identity.
- Provider fallback can silently collapse custom instances to driver kind.
- Payload pruning can hide plan or inference data needed by fork surfaces.
- Source control writing settings can undermine origin-only policy if they permit arbitrary mutation targets.
- Release and updater changes can silently restore upstream identity.
- Package patch changes for WebSocket compression can couple behavior to one Effect platform version.
- The existing dirty worktree makes direct implementation in the current checkout unsafe.

## Decision Defaults

- Sidebar V2 is default off in the first fork release and remains explicitly selectable.
- Active plan progress replaces the Sidebar V2 Working label.
- Thread snoozing is deferred to a separate lifecycle feature.
- Configurable source-control write targets are omitted. Mutation policy remains exact origin.
- Read-only remote discovery preserves current preference behavior behind a renamed and typed read-only resolver.
- Ref invalidation is keyed by environment plus normalized Git common directory.
- Publish accepts an existing origin only when its normalized URL matches the requested repository.
- The Git panel exposes explicit close and discard. Thread-row removal calls the same discard workflow.
- Standard paired clients retain `relay:write` under current `F13`.
- Linux launch keeps unconditional `gnome-libsecret` selection and reports missing Secret Service as a capability error.
- Codex binary discovery is bounded to configured path, PATH, hydrated desktop environment, and WSL environment candidates.
- Provider-scoped legacy stash data migrates once into the global text and image queue.
- A stale project Git or Inference descriptor is cleared and the panel returns to the launcher.
- Remote server self-update is deferred.
- Fork versioning remains independently owned and is not derived from the stable reference tag.

## Deferred Product Proposals

- Replace broad standard-client relay write with a narrower setup grant after an approved `F13` change.
- Add thread snoozing with explicit command, event, persistence, wake scheduling, and reconnect semantics.
- Enable Sidebar V2 by default after all parity and performance gates pass.

## Buildout Handoff

Recommended implementation workflow:

- use phased program delivery because shared contracts and runtime transport gate several later domains
- keep Slice 1 and Slice 2 central
- use isolated worktrees for desktop, provider, and source control lanes
- integrate route, composer, and right-panel work centrally
- require a fresh findings-only review after each build wave
- keep this guide as the controlling design packet and add execution evidence in a separate program ledger

Execution evidence is recorded in `.plans/37-v0.0.30-origin-rebuild-execution.md`.
