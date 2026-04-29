# Upstream Release Line Sync 0.0.15 To 0.0.21

## Objective

Move the fork from upstream `v0.0.15` to upstream `v0.0.21` in release-sized increments while preserving fork-owned product areas.

Start with a full walk of the upstream delta so later fixes can inform earlier integration choices.

## Current Fork Reality

The fork already carries local product work beyond upstream `v0.0.15` in these protected areas:

- `F3` Omarchy screenshot attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- pending governance delta from `main` for `F9` plan markdown preview and markdown rendering behavior

That `F9` delta already exists in product code on `main`, but the governed docs for it are still uncommitted in the `main` worktree at the time of writing.

## Why The Full Walk First

Later upstream releases touch the same surfaces that are already fork-sensitive in earlier releases.

Examples:

- `v0.0.16` heavily rewrites `ChatView`, `Sidebar`, `composerDraftStore`, `GitManager`, and desktop startup flow
- `v0.0.19` touches `ChatMarkdown`, `PlanSidebar`, `ChatView`, `DiffPanel`, markdown link handling, and responsive composer layout
- `v0.0.21` again changes `ChatView`, `PlanSidebar`, `Sidebar`, `ChatMarkdown`, `composerDraftStore`, `ProposedPlanCard`, and provider model picker flows

Because of that overlap, the safe path is to classify the whole release range first, then integrate one release at a time.

## Release Map

### `v0.0.15 -> v0.0.16`

Scope:

- very large upstream release
- auth bootstrap and pairing
- reconnect recovery and runtime resilience
- worktree bootstrap on the server
- git status streaming and GitHub fixes
- large `ChatView`, `Sidebar`, `composerDraftStore`, and desktop refactors

Protected surfaces touched:

- `F4`
- `F6`
- `F7`
- `F8`
- likely `F3` around desktop startup and preload flow

Default intake:

- `adopt` server reliability, auth bootstrap, reconnect recovery, observability, workspace saves, project rename, multi-select input, proposed plan copy, and provider runtime fixes
- `adapt` `ChatView`, `Sidebar`, `composerDraftStore`, `GitHubCli`, `GitManager`, desktop startup changes, and any worktree routing changes
- `reject` nothing by default unless an upstream hunk routes GitHub user actions toward upstream remotes or weakens promotion semantics

Required seam owners:

- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/desktop/src/main.ts`

Integration plan:

1. Diff upstream `v0.0.16` against the fork and port non-UX server fixes first.
2. Reconcile `GitHubCli` and `GitManager` under fork-first repo identity and fork promotion semantics.
3. Reconcile `ChatView`, `Sidebar`, and `composerDraftStore` under local draft ownership and fork composer chrome.
4. Verify worktree flows, Git panel isolation, screenshot attach, and plan status cues before accepting the release line.

Primary risk:

- this release introduces the widest shared-file churn in the same files the fork already owns

### `v0.0.16 -> v0.0.17`

Scope:

- small release
- secret store hardening
- changed-files expansion persistence
- smaller `ChatView` and timeline changes

Protected surfaces touched:

- `F4`

Default intake:

- `adopt` nearly all server, dependency, and persistence changes
- `adapt` the `ChatView` and message timeline updates if they move or flatten fork composer behavior
- `reject` nothing expected

Required seam owners:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`

Integration plan:

1. Treat this as a fast follow after `v0.0.16`.
2. Port server and dependency changes first.
3. Reapply fork composer chrome and draft ownership assumptions over the small web delta.

Primary risk:

- low implementation risk, but easy to accidentally regress the fork composer if the prior `v0.0.16` seam work is incomplete

### `v0.0.17 -> v0.0.19`

Notes:

- there is no `v0.0.18` tag
- this range contains the first major markdown, sidebar, command palette, project grouping, and provider-session overlap with current fork work

Scope:

- markdown file link UX
- responsive composer and plan sidebar fixes
- command palette and filesystem browse
- project grouping
- draft and worktree fixes
- desktop shell and readiness changes

Protected surfaces touched:

- `F4`
- `F5`
- `F8`
- `F9`

Default intake:

- `adopt` worktree draft fixes, shell snapshot queries, timeline autoscroll fixes, command palette infrastructure, and general desktop readiness fixes
- `adapt` markdown rendering, markdown navigation, responsive composer layout, `PlanSidebar`, `ChatView`, `Sidebar`, and draft routing
- `reject` nothing by default

Required seam owners:

- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/composerDraftStore.ts`

Integration plan:

1. Before taking this range, isolate plan markdown preview behavior behind the document renderer and preview route seams.
2. Port markdown link and renderer improvements without losing fullscreen in-memory preview behavior.
3. Port responsive layout fixes without surrendering fork composer chrome or plan progress cues.

Primary risk:

- this is the first range where markdown preview and diff-panel-adjacent work becomes an expected merge hotspot

### `v0.0.19 -> v0.0.20`

Scope:

- tiny release
- release workflow changes
- project grouping settings guard

Protected surfaces touched:

- minor `F8` sidebar grouping overlap

Default intake:

- `adopt` almost everything
- `adapt` only if grouping state collides with fork sidebar status presentation
- `reject` nothing expected

Integration plan:

1. Take this only after `v0.0.17 -> v0.0.19` lands cleanly.
2. Keep it as a minimal commit so it stays easy to revert if grouping logic collides with local sidebar state.

### `v0.0.20 -> v0.0.21`

Scope:

- large release
- provider expansion with ACP and OpenCode
- redesigned model picker
- more sidebar and command palette work
- more markdown and preview related UI changes
- more composer and draft-state churn

Protected surfaces touched:

- `F4`
- `F5`
- `F8`
- `F9`
- possibly `F1` for product identity checks on desktop naming

Default intake:

- `adopt` provider runtime fixes, startup fixes, path expansion fixes, project deletion fixes, thread status improvements, and terminal shortcut fixes
- `adapt` model picker redesign, `ChatView`, `Sidebar`, `PlanSidebar`, `ChatMarkdown`, `composerDraftStore`, `ProposedPlanCard`, and right panel layout
- `reject` nothing yet, though any generic preview behavior that displaces fullscreen in-memory plan preview should be rejected

Required seam owners:

- `apps/web/src/components/chat/ProviderModelPicker.tsx`
- `apps/web/src/components/chat/composerProviderState.tsx`
- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/composerDraftStore.ts`

Integration plan:

1. Do not start this range until the markdown preview seam is explicit and stable.
2. Take provider runtime and startup fixes before the model picker redesign.
3. Reconcile sidebar and preview changes last, with focused verification on `F8` and `F9`.

Primary risk:

- this range lands after the fork already introduced document explorer, markdown preview, and fullscreen plan preview work, so shared-file conflicts are expected rather than exceptional

## Recommended Execution Order

1. Pull the pending governed deltas from `main` after explicit user confirmation, so `F9` is documented before sync work starts.
2. Create a release note for `v0.0.16` with concrete `adopt`, `adapt`, and `reject` decisions at file level.
3. Integrate `v0.0.16`.
4. Integrate `v0.0.17`.
5. Stop and reassess whether `F9` needs more seam extraction before taking `v0.0.17 -> v0.0.19`.
6. Continue through `v0.0.19`, `v0.0.20`, and `v0.0.21` one release line at a time.

## Fork Preservation Gate Per Release

For each release line:

- review the relevant `patch.md` entries
- record touched protected surfaces
- classify meaningful upstream changes as `adopt`, `adapt`, or `reject`
- name the fork seam that resolves each conflict
- verify draft text, attachments, screenshots, Git context, sidebar plan cues, and markdown preview behavior
- run `bun fmt`
- run `bun lint`
- run `bun typecheck`

## Immediate Next Step

Bring over the pending governed `main` delta for `F9`, then write the detailed file-level intake note for `v0.0.15 -> v0.0.16`.
