# Upstream Intake `v0.0.15 -> v0.0.16`

## Goal

Define the file-level intake plan for integrating upstream `v0.0.16` into the fork while preserving the protected fork surfaces described in `patch.md`.

## Release Shape

This release is the first high-risk sync point after `v0.0.15`.

It mixes three kinds of change in the same release line:

- server reliability and architecture work that should mostly be adopted
- desktop startup and persistence changes that are valuable but overlap Omarchy behavior
- very large web refactors in `ChatView`, `Sidebar`, and `composerDraftStore` that overlap fork-owned product behavior

## Protected Surfaces Touched

- `F3` Omarchy screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues

## Intake Summary

### Adopt

These changes are high value and low conflict with fork-owned product behavior:

- server auth bootstrap and pairing infrastructure in `apps/server/src/auth`
- environment model and runtime registry work in `apps/web/src/environments`
- WebSocket reconnect and recovery hardening in `apps/server/src/ws.ts` and related client runtime code
- git status refresh and streaming infrastructure, provided fork repo identity and promotion policy stay intact
- server observability, persistence, and projection performance improvements
- project favicon and setup script services
- workspace save path fix in `cf2c628b`
- project rename support in `a2215429`
- multi-select pending user input support in `11d456f6`
- proposed plan copy action in `60f7ae86`
- desktop backend port selection and readiness probing, adapted only where Omarchy desktop behavior requires it
- persisted client settings and saved environment secret storage

### Adapt

These changes should be taken, but only through fork seams:

- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/chat/ProposedPlanCard.tsx`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/clientPersistence.ts`
- `apps/desktop/src/backendPort.ts`
- `apps/desktop/src/backendReadiness.ts`

### Reject

These behaviors should not be taken if they appear during merge resolution:

- any user-facing GitHub resolution that prefers upstream over the fork
- any git workflow simplification that weakens backup branch creation, guarded promotion, or safe worktree cleanup
- any composer rewrite that moves draft ownership away from the composer
- any layout change that removes the fork floating access control and screenshot actions
- any thread or sidebar status logic that collapses explicit plan progress into a generic running label

## File-Level Intake

### Server Auth And Environment Stack

Status:

- `adopt`

Primary upstream work:

- `b7559c46`
- `b96308fc`
- `5b3b31b6`
- `cf9f236c`
- `e32077ce`

Files:

- `apps/server/src/auth`
- `apps/server/src/http.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/environments`

Why:

- this introduces the auth control plane, pairing flow, saved environment persistence, and the new environment runtime substrate
- the fork does not appear to own these product semantics today
- these changes reduce later merge cost because later releases build on this model

Merge notes:

- preserve any fork local desktop defaults
- preserve existing thread and draft routing expectations while adopting the new environment plumbing

### Server Runtime And Projection Reliability

Status:

- `adopt`

Primary upstream work:

- `528bb2a1`
- `f2cd53f2`
- `9bedd714`
- `823d69f6`
- `4963fccb`
- `dd89d5ce`
- `740d7a32`
- `752f96e9`

Files:

- `apps/server/src/ws.ts`
- `apps/server/src/orchestration`
- `apps/server/src/provider`
- `apps/server/src/codexAppServerManager.ts`

Why:

- these changes are reliability and performance work
- they directly support the fork priority order of performance, reliability, and predictable behavior under reconnect and restart

Merge notes:

- keep fork-owned workflow semantics out of this layer
- avoid mixing UI conflict resolution into this server adoption pass

### Git Identity And Workflow Seam

Status:

- `adapt`

Primary upstream work:

- `801dfe5b`
- `9ea443d7`
- `915a0548`
- `8515f027`
- `53a552e8`

Files:

- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`

Why:

- upstream adds richer PR metadata, branch and search behavior, worktree bootstrap changes, and streamed git status updates
- these files are already fork-owned seams for `F6` and `F7`

Required fork behavior to preserve:

- fork first repo identity for repo, issue, and PR context
- promotion semantics with backup branch creation and guarded cleanup
- worktree lifecycle guarantees
- no silent redirect of user-facing actions to upstream remotes

Recommended merge method:

1. adopt internal parsing and status infrastructure improvements
2. reapply fork repo identity resolution at the final decision points
3. reapply fork promotion semantics in `GitManager`
4. verify Git panel actions still leave composer draft ownership untouched

### Composer And Draft Ownership Seam

Status:

- `adapt`

Primary upstream work:

- `1ec346c2`
- `869789b4`
- `386eb18a`
- `11d456f6`
- `7372184d`
- `7b3cdc6a`

Files:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/composerDraftStore.ts`

Why:

- this release contains the largest shared-file churn in the fork-owned composer area
- upstream is extracting composer concerns and changing store boundaries, which is valuable for maintainability
- the fork already owns draft autonomy, floating action chrome, screenshot attach flow, and rich draft controls

Required fork behavior to preserve:

- draft text, images, screenshots, attachments, and local thread draft state remain composer-owned
- screenshot action remains first class in composer chrome
- runtime access control remains in the fork top action area
- nearby UI actions do not consume or reset the active draft

Recommended merge method:

1. port store and structure improvements first
2. port correctness fixes such as persisted image hydration and permission mapping
3. reapply fork chrome and draft ownership decisions last
4. verify image retry, screenshot attach, and rich draft controls before closing the release line

### Sidebar And Plan Status Seam

Status:

- `adapt`

Primary upstream work:

- `ae6f9715`
- `a2215429`
- `915a0548`
- `ae3ea398`
- `64d6938c`
- `60f7ae86`

Files:

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/chat/ProposedPlanCard.tsx`

Why:

- upstream improves thread normalization, branch pagination, project rename, plan handling, and proposed plan actions
- these files overlap `F8`

Required fork behavior to preserve:

- explicit plan-aware status cues
- fractional plan progress such as `1/4`
- plan ready and plan active visibility
- plan surfaces remain reachable from thread view

Recommended merge method:

1. adopt data normalization and pagination work
2. port plan copy action and related usability improvements
3. reapply fork-specific progress presentation after the upstream state changes land

### Desktop Startup And Local Persistence Seam

Status:

- `adapt`

Primary upstream work:

- `0a88719a`
- `e82b9873`
- `e32077ce`
- `d9ded65d`
- `5d9eb183`

Files:

- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/backendPort.ts`
- `apps/desktop/src/backendReadiness.ts`
- `apps/desktop/src/clientPersistence.ts`

Why:

- upstream adds predictable backend port selection, readiness polling, client settings persistence, saved environment secret storage, and desktop link improvements
- these changes overlap desktop initialization, where the fork also carries Omarchy theme and screenshot behavior

Required fork behavior to preserve:

- Omarchy theme projection remains authoritative where available
- Omarchy screenshot attach behavior remains intact
- desktop naming stays on fork identity

Recommended merge method:

1. adopt the new backend port and readiness helpers
2. adopt client persistence infrastructure
3. reconcile `main.ts` carefully so Omarchy theme and screenshot setup remain intact

## Suggested Commit Sequence

1. server auth, environment, and reconnect substrate
2. server projection and provider reliability changes
3. git seam reconciliation
4. composer and draft seam reconciliation
5. sidebar and plan status reconciliation
6. desktop startup and persistence reconciliation

This sequence keeps the heaviest fork conflicts late, after the shared runtime substrate is already updated.

## Verification For This Release Line

- draft text survives Git panel interactions
- screenshot capture still attaches into the active draft
- runtime access control and screenshot actions stay in fork composer chrome
- GitHub repo context resolves to the fork first
- promotion semantics still create a backup branch and guarded cleanup
- worktree bootstrap and cleanup preserve fork safety expectations
- sidebar still shows plan-aware progress cues
- project rename, environment persistence, and auth pairing work end to end

## Open Watch Items For Later Releases

- `v0.0.19` starts overlapping markdown and plan preview surfaces
- `v0.0.21` brings another large `ChatView`, `Sidebar`, and model picker refactor

That means the `v0.0.16` merge should prefer seam extraction over local patching when a conflict seems likely to repeat.
