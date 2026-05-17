# Upstream Intake `v0.0.21 -> v0.0.22`

## Goal

Define the intake plan for integrating upstream `v0.0.21 -> v0.0.22` into the fork while preserving the protected fork surfaces described in `patch.md`.

## Release Shape

This release line is very large and crosses multiple fork-owned seams at once.

It mixes:

- multi-provider shell and provider-instance flows
- hosted frontend plus remote connectivity substrate
- Tailscale and SSH environment support
- pluggable VCS and multi-host source control providers
- large shell and mobile UI churn
- diff UX expansion and markdown stability work
- startup and memory reduction work

That makes `v0.0.21 -> v0.0.22` the largest remaining stable-parity release line after the earlier `.19` branch base.

## Protected Surfaces Touched

- `F1` branding and release identity
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan-aware sidebar and activity status cues
- `F9` plan markdown preview and markdown rendering behavior

## Intake Summary

### Adopt

These changes are high value and low conflict with fork-owned behavior:

- startup and memory reduction work
- provider runtime hardening and instance-registry hydration
- server exposure and remote endpoint safety fixes
- markdown highlight stability
- focused mobile correctness fixes
- stale WebSocket lifecycle filtering
- diff focus-ring and dialog clipping fixes

### Adapt

These changes should be taken, but only through fork seams:

- multi-provider shell and provider-instance settings flows
- source control provider discovery and repository service
- VCS driver foundation and status broadcaster
- hosted frontend, Tailscale, and SSH shell integration
- `ChatView`, `Sidebar`, `ChatMarkdown`, and route-shell changes
- collapsible file diffs and whitespace toggle behavior
- source control presentation across GitHub, GitLab, Bitbucket, and Azure DevOps

### Reject

No major theme in this release line should be rejected wholesale.

Still reject during merge resolution:

- any source control selection logic that stops preferring the fork repository context for user-facing GitHub flows
- any VCS abstraction that weakens fork promotion semantics or worktree guarantees
- any shell change that breaks draft autonomy, screenshot flows, or protected markdown preview behavior
- any branding or hosted-flow change that removes Omarchy identity

## File-Level Intake

### Startup And Runtime Efficiency

Status:

- `adopt`
- current branch status: `complete`

Primary upstream work:

- `aca0fa4e`
- `dbebc387`
- `35822884`

Files:

- `apps/server/src/provider`
- `apps/server/src/ws.ts`
- `apps/desktop/src/main.ts`

Why:

- these changes align directly with repository priorities for performance, reliability, and predictable behavior under reconnect
- they do not require product-semantic changes by themselves

### Source Control And VCS Foundation

Status:

- `adapt`
- current branch status: `complete`

Primary upstream work:

- `6d7fe2ee`
- `0ce7e56e`
- `91a03e07`
- `d7969264`

Files:

- `apps/server/src/sourceControl`
- `apps/server/src/vcs`
- `packages/contracts/src/sourceControl.ts`
- `packages/contracts/src/vcs.ts`
- `apps/web/src/sourceControlPresentation.ts`
- `apps/web/src/routes/settings.source-control.tsx`

Why:

- the new foundation is valuable and will likely reduce future drift
- it overlaps directly with `F6` and `F7`
- the fork must preserve GitHub-first user context and guarded Git workflow behavior while adopting the broader substrate

Required fork behavior to preserve:

- fork-first GitHub identity for user-facing repo and issue context
- guarded promotion, backup branch, and safe cleanup semantics
- no coupling between source control settings actions and active draft state

Recommended merge method:

1. Adopt contracts and server substrate first.
2. Reconcile GitHub identity decisions at the final repository-selection seam.
3. Reconcile UI presentation after server source-control discovery is stable.

Current branch outcome:

- contracts, server substrate, and web settings exposure landed in `168beb8f`
- GitHub provider registration landed in `be08033f`
- default branch resolution moved to the registry in `fe8f2145`
- fork clone URL lookup moved to the registry in `e0c35a8f`
- PR resolve and local checkout moved to the registry in `19647490`
- open PR lookup, duplicate detection, and PR creation moved to the registry in `c6667bcc`
- provider capability presentation landed in `6f7e8c77`

### Multi-Provider Shell And Settings

Status:

- `adapt`
- current branch status: `complete`

Primary upstream work:

- `08e6d4cf`
- `460d9c3e`

Files:

- `apps/web/src/components/settings`
- `apps/web/src/providerInstances.ts`
- `apps/web/src/lib/providerReactQuery.ts`
- `apps/web/src/components/chat/ModelPickerSidebar.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/routes/settings.tsx`

Why:

- this is the user-visible control plane for the new provider stack
- it sits directly on top of fork-owned shell, settings, and sidebar behavior

Required fork behavior to preserve:

- shell layout stays fork-owned
- composer autonomy remains intact
- plan cues and preview access remain visible
- provider UI does not flatten fork-specific workflow affordances

Current branch outcome:

- canonical provider-instance projection landed in `d9adce2b`
- settings cards now consume provider-instance state in `d4617491`
- composer picker gating and labels now consume provider-instance state in `7406295e`
- sidebar shell audit found no further provider-state coupling to reconcile on this branch

### Remote Connectivity And Hosted Frontend

Status:

- `adapt`
- current branch status: `complete`

Primary upstream work:

- `3772fa12`

Files:

- `apps/desktop/src/serverExposure.ts`
- `apps/desktop/src/sshEnvironment.ts`
- `apps/desktop/src/tailscaleEndpointProvider.ts`
- `apps/web/src/routes/pair.tsx`
- `packages/tailscale`
- `packages/ssh`

Why:

- the remote substrate is useful, but it changes how the product connects and advertises endpoints
- that has product and desktop implications beyond routine server hardening

Required fork behavior to preserve:

- Omarchy identity across desktop and hosted surfaces
- safe local-first behavior for existing desktop usage
- no regression in local auth, screenshots, or route assumptions

Current branch outcome:

- substrate checkpoint landed in `168beb8f`
- friendly invalid pairing token handling landed in `74fdf3f7`
- environment metadata helpers landed in `ca39a036`
- saved environment persistence and remote actions landed in `adc59cc9`
- discovered SSH host connect flow landed in `c673470f`
- hosted pairing route flow landed in `a9120e15`
- forget, reconnect, and manual pairing-link flows landed in `e096f207`, `97824542`, `47bc4e94`, and `00d29214`
- active saved-remote boot, connect, disconnect, and hosted activation landed in `96131a7e`

Remote and hosted completion criteria now satisfied on branch:

- desktop SSH discovery can create and reconnect saved environments
- manual pairing links can save and activate remote environments
- hosted pairing can save and activate a backend, then open the app against that backend
- active remote environments can boot the app through saved bearer credentials and refreshed WebSocket tokens
- disconnect returns the app to the local primary backend on reload
- local-first desktop fallback remains intact when active remote bootstrap fails

### Shell, Diff, And Markdown Presentation

Status:

- `adapt`
- current branch status: `partial`

Primary upstream work:

- `f4c9418d`
- `f7748a0d`
- `623e471a`
- `92e340d8`
- `f54f4385`

Files:

- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/AppSidebarLayout.tsx`
- route files under `apps/web/src/routes`

Why:

- this release line changes diff behavior, mobile shell defaults, and markdown rendering in the same protected surfaces already owned by the fork
- these are high-value UX changes, but they must be integrated under existing fork shell and preview contracts

Required fork behavior to preserve:

- fullscreen in-memory plan preview behavior
- readable wide markdown surfaces
- fork-owned diff and panel access behavior
- composer ownership and screenshot controls

## Execution Ledger

Completed upstream slices on this branch:

- runtime and reconnect hardening
  - upstream coverage: `aca0fa4e`, `dbebc387`, `35822884`
  - local checkpoints: `168beb8f`

- source control and VCS completion
  - upstream coverage: `6d7fe2ee`, `0ce7e56e`, `91a03e07`, `d7969264`
  - local checkpoints: `168beb8f`, `be08033f`, `fe8f2145`, `e0c35a8f`, `19647490`, `c6667bcc`, `6f7e8c77`

- remote and hosted completion
  - upstream coverage: `3772fa12`, `8f50ca8e`
  - local checkpoints: `168beb8f`, `74fdf3f7`, `ca39a036`, `adc59cc9`, `c673470f`, `a9120e15`, `e096f207`, `97824542`, `47bc4e94`, `00d29214`, `96131a7e`

- multi-provider shell and settings completion
  - upstream coverage: `08e6d4cf`, `460d9c3e`
  - local checkpoints: `d9adce2b`, `d4617491`, `7406295e`

Still open in `0.22`:

- broader shell, diff, markdown, and mobile intake for `f4c9418d`, `f7748a0d`, `623e471a`, `92e340d8`, and `f54f4385`
- final release-line reconciliation after those UI slices land

## Implementation Order

1. complete startup and runtime efficiency work
2. complete source control and VCS substrate
3. complete remote connectivity and hosted flows
4. finish diff, mobile shell, and markdown presentation changes

## Verification Focus

- startup time and reconnect behavior improve without breaking local workflow
- source control discovery preserves fork GitHub identity and promotion semantics
- provider-instance settings do not regress shell or composer ownership
- hosted and remote features do not disturb local-first desktop behavior
- diff, markdown, and mobile shell changes preserve protected plan and preview flows

## Bottom Line

`v0.0.21 -> v0.0.22` should be integrated in staged slices with explicit seam ownership.

The source control, remote-hosted, and multi-provider shell lanes are now complete on branch.

The remaining high-risk seam is the protected shell and presentation lane.
