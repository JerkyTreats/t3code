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

Upstream comparison:

- upstream `v0.0.22` includes product RPCs for source control repository lookup, clone, and publish
- upstream `v0.0.22` wires those RPCs through Command Palette and Git actions
- upstream `v0.0.22` includes real GitLab, Azure DevOps, and Bitbucket source control providers
- this branch now carries source control discovery, repository lookup, clone, and publish as product actions
- this branch now carries GitLab, Azure DevOps, and Bitbucket provider workflow support

Completion target:

- restore source control repository lookup, clone, and publish RPCs. Done.
- restore Command Palette clone flow. Done.
- restore Git actions publish flow. Done.
- restore GitLab provider workflow support. Done.
- restore Azure DevOps provider workflow support. Done.
- restore Bitbucket provider workflow support. Done.
- keep GitHub fork identity, protected promotion, and worktree guardrails authoritative. Done.

Implementation order for this completed lane:

1. Import upstream source control repository service and RPC contracts. Done.
2. Wire server handlers for lookup, clone, and publish. Done.
3. Reconcile GitHub provider behavior with fork-first repository identity. Done.
4. Add GitLab, Azure DevOps, and Bitbucket providers behind the source control registry. Done.
5. Restore web source control APIs and React Query hooks. Done.
6. Restore product entry points in Command Palette and Git actions. Done.
7. Verify provider-specific behavior without weakening fork Git workflow semantics. Done.

### Multi-Provider Shell And Settings

Status:

- `adapt`
- current branch status: `complete`

Primary upstream work:

- `08e6d4cf`
- `460d9c3e`

Files:

- `packages/contracts/src/providerInstance.ts`
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/providerRuntime.ts`
- `packages/contracts/src/settings.ts`
- `apps/server/src/provider`
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
- provider instance identity seam landed in `c6b1f23e`
- custom provider instances now materialize in provider registry snapshots without singleton service collisions
- provider adapter routing, provider sessions, runtime events, recovery, and stop flows now carry `providerInstanceId`
- composer and persisted model selection now preserve instance ids with legacy provider fallback
- provider settings now expose add, enable, disable, and delete controls for custom instances in the fork settings layout

Upstream comparison:

- upstream `08e6d4cf` adds open provider instance contracts, provider instance settings, dynamic provider instance registry, per-instance adapter routing, provider session instance ids, model selection by instance id, and instance-aware web provider UI
- upstream `460d9c3e` refactors provider settings forms onto declarative provider metadata after the instance substrate exists
- this branch previously kept `ProviderInstanceId` and `ProviderDriverKind` as aliases for `ProviderKind`
- this branch now has the additive contract, settings envelope, provider snapshot identity, cache identity, and web projection substrate from `08e6d4cf`
- this branch now routes live provider adapters and provider sessions by provider instance id with legacy provider fallback
- this branch now stores composer model selections with optional instance ids
- this branch now exposes custom instance add, enable, disable, and delete settings controls
- this branch adapts declarative settings work through the existing fork settings layout instead of taking the upstream settings route shape

Completion target:

- completed with fork-shaped instance-aware routing, settings, runtime events, session persistence, model selection, and registry materialization
- preserved `F4`, `F10`, and existing provider runtime stability while replacing the compatibility shim

Implementation order for this completed lane:

1. Complete upstream `08e6d4cf` contract and persistence compatibility. Done.
2. Port provider session and runtime event instance ids. Done.
3. Introduce the fork-shaped provider instance registry and adapter routing seam. Done.
4. Route model selection and text generation through instance ids. Done.
5. Adapt upstream instance settings UI and declarative provider settings forms. Done.
6. Verify composer draft ownership, Codex binary selection, provider runtime recovery, and instance UI behavior. Done.

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
- current branch status: `complete`

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

Current branch outcome:

- file-collapse behavior landed earlier in the branch and remained intact through the shell intake
- whitespace-aware checkpoint diff filtering landed in `31a27fdb`
- markdown highlight render stability landed in `4e6dd1a5`
- mobile composer default collapse and narrower diff panel sizing landed in `968307a9`
- existing plan preview, screenshot attach, and shell ownership behavior were preserved through the adaptation

## Execution Ledger

Completed upstream slices on this branch:

- runtime and reconnect hardening
  - upstream coverage: `aca0fa4e`, `dbebc387`, `35822884`
  - local checkpoints: `168beb8f`

- source control and VCS completion
  - upstream coverage: `6d7fe2ee`, `0ce7e56e`, `91a03e07`, `d7969264`
  - local checkpoints: `168beb8f`, `be08033f`, `fe8f2145`, `e0c35a8f`, `19647490`, `c6667bcc`, `6f7e8c77`, `060c8a0f`
  - status revision: closed after repository lookup, clone, publish, GitLab, Azure DevOps, and Bitbucket product workflows landed

- remote and hosted completion
  - upstream coverage: `3772fa12`, `8f50ca8e`
  - local checkpoints: `168beb8f`, `74fdf3f7`, `ca39a036`, `adc59cc9`, `c673470f`, `a9120e15`, `e096f207`, `97824542`, `47bc4e94`, `00d29214`, `96131a7e`

- multi-provider shell and settings completion
  - upstream coverage: `08e6d4cf`, `460d9c3e`
  - local checkpoints: `d9adce2b`, `d4617491`, `7406295e`

- shell, diff, markdown, and mobile completion
  - upstream coverage: `f4c9418d`, `f7748a0d`, `623e471a`, `92e340d8`, `f54f4385`
  - local checkpoints: `31a27fdb`, `4e6dd1a5`, `968307a9`

Current `0.22` state:

- runtime, remote, multi-provider shell, diff, markdown, and mobile presentation lanes are complete on branch
- source control and VCS provider workflow parity is complete on branch
- provider skills and slash commands are complete on branch
- auth access management UI and transport are complete on branch
- final parity closeout is complete on branch

## Parity Gap Checklist

Completion checklist:

- plan sidebar auto-open setting parity with upstream `00b5c3e1`. Done in `4be64aed`.
- Claude `claude_code` system prompt preset parity with upstream `cb8015a3`. Done in `dfad440c`.
- terminal dimension validation parity with upstream `02903f2d`. Done in `11387864`.
- install and desktop package parity with upstream `02dd47ea`, `c07ac592`, and `f4c9418d`. Done in `a32894ff`.
- small-fix sweep for remaining upstream `v0.0.22` commits not covered by a local equivalent. Done in `89047571`.

Adapted equivalents already present:

- source control lookup, clone, publish, GitLab, Azure DevOps, and Bitbucket workflow support
- hosted frontend, Tailscale, SSH, and saved remote environment support
- provider instance routing, status cache, settings, and composer model selection support
- Codex skill discovery, Claude slash command discovery, and composer command integration
- auth access snapshot, pairing link, and client session management
- reconnect and runtime lifecycle hardening with fork-specific canonical turn handling
- mobile sidebar dismissal, iOS safe areas, touch scrolling, and iOS input zoom fixes
- stale default-branch PR filtering, AskUserQuestion answer keying, and server timestamp visit marking
- README provider parity for Codex, Claude, and OpenCode

Intentionally preserved fork behavior:

- fork-owned GitHub identity and promotion workflow
- Omarchy desktop and shell identity
- rich draft composer ownership and screenshot attach behavior
- fullscreen plan preview access

Audited upstream release and repository-maintenance items:

- release workflow and Discord announcement updates are not product runtime features for this fork line
- `VOUCHED.td` updates are upstream repository administration data and do not affect fork runtime parity
- upstream `AnimatedHeight` focus-ring clipping has no local target file after fork shell adaptation
- Bitbucket default branch and invalid pairing token fixes are already present on branch

## Remaining Fork Concerns

### Provider Skills And Slash Commands

Truth:

- upstream discovers Codex skills and Claude slash commands, then exposes them through provider status for composer use
- this branch now carries Claude slash commands through provider snapshot construction
- this branch now shows provider slash commands in the composer slash command menu for the selected provider instance
- this branch now discovers Codex skills from app-server capability discovery
- this branch now renders composer skill chips and supports skill menu filtering
- cache fallback plumbing exists for commands and skills

Closeout plan:

1. Add provider capability discovery for Claude slash commands. Done.
2. Preserve provider instance identity when rendering slash command metadata. Done.
3. Expose discovered commands through server provider snapshots without breaking existing empty-array clients. Done.
4. Add composer command search and insertion flow that consumes the selected provider snapshot. Done.
5. Add Codex skill discovery and composer skill chip rendering. Done.
6. Cover skill discovery, cache fallback, provider refresh, composer filtering, and command dispatch with targeted tests. Done.

Current branch outcome:

- `buildServerProvider` accepts slash command metadata while preserving empty-array defaults
- Claude capability discovery returns slash commands from SDK initialization metadata
- Codex capability discovery returns skill metadata from `skills/list`
- composer slash command search includes built-in commands and provider commands from the active provider instance
- selecting a provider slash command inserts the provider command into the active draft
- composer skill search includes enabled skills from the active provider instance
- selecting a provider skill inserts the `$skill` token into the active draft and renders it as a chip when metadata is available

Acceptance:

- provider snapshots contain real skills and slash commands when the backing provider exposes them
- composer command UI appears only when commands or skills are available
- Codex and Claude metadata remain provider-instance aware
- existing sessions without commands or skills behave exactly as today

### Auth Access Management

Truth:

- backend auth control-plane services can create, list, and revoke pairing links and sessions
- current web settings still preserve pasting a pairing link and managing saved environments
- create and revoke pairing-link actions are now exposed through RPC and NativeApi for the settings UI
- connected session management is now surfaced as a complete user workflow

Closeout plan:

1. Add additive auth access RPC and NativeApi methods for pairing link creation, pairing link revocation, session listing, and session revocation. Done.
2. Wire web clients and React Query mutations for those methods. Done.
3. Expand Connections settings with active access state, generated pairing links, revoke actions, and connected session controls. Done.
4. Keep existing paste pairing-link and saved environment workflows unchanged. Done.
5. Ensure hosted and desktop modes hide actions when the active transport lacks access-management capability. Done.
6. Cover RPC contracts, native adapters, settings UI state, create flow, revoke flow, and saved environment regression with targeted tests. Done.

Current branch outcome:

- WebSocket RPC exposes auth access snapshot, pairing credential creation, pairing link revocation, session revocation, and other-session revocation
- NativeApi exposes the auth access surface through the RPC-backed adapter
- Connections settings can create pairing links, revoke pairing links, list client sessions, revoke client sessions, and revoke other client sessions
- existing paste pairing-link, saved environment reconnect, disconnect, and forget workflows remain unchanged

Acceptance:

- Connections settings can create a pairing link without manual CLI work
- Connections settings can revoke active pairing links
- Connections settings can list and revoke connected sessions where supported
- saved environment pairing and reconnect flows continue to work unchanged

## Implementation Order

1. complete provider skills and slash commands. Done.
2. complete auth access management UI and transport. Done.
3. add remaining `.22` product parity settings and provider behavior. Done.
4. align install, desktop package, and terminal validation metadata. Done.
5. complete final small-fix sweep and verification. Done.
6. record final parity outcome in this intake note. Done.

## Verification Focus

- startup time and reconnect behavior improve without breaking local workflow
- source control discovery preserves fork GitHub identity and promotion semantics
- provider-instance settings do not regress shell or composer ownership
- provider skills and slash commands preserve provider instance routing
- auth access management preserves local-first desktop pairing and saved environment behavior
- hosted and remote features do not disturb local-first desktop behavior
- diff, markdown, and mobile shell changes preserve protected plan and preview flows

## Bottom Line

`v0.0.21 -> v0.0.22` should be integrated in staged slices with explicit seam ownership.

The remote-hosted, multi-provider shell, source control, provider metadata, auth access, settings, install metadata, terminal validation, provider behavior, and small UX parity lanes are complete on branch.

`v0.0.21 -> v0.0.22` product parity is complete on branch.
