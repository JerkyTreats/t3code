# Patch Guide

Date: 2026-04-17
Status: active

## Intent

`patch.md` is the authoritative fork delta guide for this repository.

It defines the current expected behavior of fork owned features and the reconciliation rules to use when reviewing upstream changes.

Use it together with [Upstream Merge Policy](governance/upstream_merge_policy.md).

## Required Use

- Review this file before upstream sync, merge, or divergence work.
- Update this file in the same change whenever fork owned behavior changes.
- Keep each feature entry current for intent, owner modules, required behavior, and verification.
- Classify upstream changes against the relevant feature entry as `adopt`, `adapt`, or `reject`.
- If code and this file drift, fix the drift before merge.
- Treat this file as a current state guide, not a release log.

## Authority

- User request wins over this file.
- Repository governance wins over routine upstream defaults.
- This file defines authoritative expected behavior for fork owned features.
- When upstream differs from this file, preserve this file until the fork intentionally changes direction.

## Feature Index

- `F1` branding and release identity
- `F2` Omarchy system theme projection
- `F3` Omarchy screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and markdown rendering behavior

## F1 Branding And Release Identity

### Intent

Fork builds identify as `T3 Code Omarchy` instead of generic upstream `T3 Code`.

### Required Behavior

- Desktop naming uses the Omarchy product identity across packaged and development surfaces.
- Web branding uses the same Omarchy base identity.
- Release identity keeps fork naming visible and must not silently fall back to upstream naming.

### Owner Modules

- `apps/desktop/package.json`
- `apps/desktop/src/main.ts`
- `apps/desktop/scripts/electron-launcher.mjs`
- `apps/web/src/branding.ts`

### Upstream Intake Rule

- Reject upstream naming changes that replace fork identity.
- Adapt release workflow or packaging changes so fork naming survives.

### Verification

- Desktop window title and packaged product name use the Omarchy identity.
- Web visible product name uses the Omarchy identity.

## F2 Omarchy System Theme Projection

### Intent

System theme behavior on desktop Linux follows Omarchy theme state instead of generic upstream theme detection.

### Required Behavior

- Theme discovery reads Omarchy state from `~/.config/omarchy/current`.
- Theme source is `omarchy` when Omarchy theme data is available.
- Web theme variables project Omarchy accent, foreground, background, selection, and terminal colors into the UI.
- Missing Omarchy state degrades safely without pretending a generic upstream theme source is authoritative.

### Owner Modules

- `apps/desktop/src/omarchyTheme.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/web/src/index.css`

### Upstream Intake Rule

- Adapt upstream theme infrastructure changes under the Omarchy source model.
- Reject upstream behavior that replaces Omarchy as the authoritative desktop theme source on Linux.

### Verification

- Changing Omarchy theme state updates desktop theme projection.
- Web colors and terminal palette follow Omarchy theme values when available.

## F3 Omarchy Screenshot Capture And Attach Flow

### Intent

Screenshot capture and attach flows are tuned for Omarchy tooling and Linux desktop capability checks.

### Required Behavior

- Desktop capture prefers `omarchy-cmd-screenshot` when available.
- Capture resolves the Omarchy screenshot output directory and handles Omarchy smart mode behavior.
- Capture waits for a complete PNG artifact before attaching it.
- Clipboard fallback remains available when Omarchy updates the clipboard instead of writing a file.
- Composer chrome exposes screenshot capture as a first class action and attaches the result into the active draft.

### Owner Modules

- `apps/desktop/src/screenshotCapture.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/web/src/components/chat/ComposerTopActions.tsx`
- `apps/web/src/components/ChatView.tsx`

### Upstream Intake Rule

- Adapt upstream screenshot or attachment changes under the Omarchy capture contract.
- Reject upstream flows that remove Omarchy specific capture probing or attach behavior.

### Verification

- Screenshot capture works through Omarchy tooling when available.
- Composer receives the captured image as a draft attachment.
- Failure paths keep clear user facing error handling.

## F4 Composer Draft Autonomy And Composer Chrome

### Intent

The composer owns its local draft state and preserves rich draft behavior under fork specific chrome and affordances.

### Required Behavior

- Draft text, images, screenshots, attachments, terminal context chips, and local thread draft state remain under composer ownership until explicit user action changes them.
- Runtime access control and screenshot actions stay in the floating top action chrome.
- Rich draft controls remain available and are not flattened into a generic upstream composer layout.
- Attachment previews and local persistence warnings remain visible when relevant.

### Owner Modules

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ComposerTopActions.tsx`
- `apps/web/src/components/chat/ComposerRichDraftToolbar.tsx`
- `apps/web/src/composerDraftStore.ts`

### Upstream Intake Rule

- Adapt upstream composer improvements into the fork layout and ownership model.
- Reject upstream composer simplifications that remove fork specific draft affordances or move ownership away from the active draft.

### Verification

- Draft text and attachments survive nearby UI interactions.
- Runtime access and screenshot controls remain in the fork chrome position.
- Rich draft controls remain present when enabled.

## F5 Git Panel Isolation From Draft Ownership

### Intent

Git panel flows must not take ownership of the active composer draft or silently reset it.

### Required Behavior

- Git panel actions operate on thread, branch, and worktree context without consuming draft text or attachments.
- Draft state remains intact while Git panel operations run.
- Git related thread routing keeps fork specific draft ownership semantics.
- Worktree discard completes active worktree thread teardown before primary workspace draft routing runs, so teardown does not race draft routing.
- Worktree discard never silently claims or clears unrelated composer content while switching back to the primary workspace.

### Owner Modules

- `apps/web/src/components/git-panel`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/ChatView.logic.ts`

### Upstream Intake Rule

- Adapt upstream Git UX or routing changes so composer draft ownership remains isolated.
- Reject upstream coupling that makes Git panel interactions mutate unrelated draft state.

### Verification

- Opening and using Git panel flows does not clear the active draft.
- Branch and worktree routing preserves the expected draft thread state.
- Discarding a dedicated worktree returns the user to a stable primary workspace draft without losing unrelated draft content.

## F6 Fork First GitHub Identity Resolution

### Intent

GitHub context resolves to the fork remote first so repo, issue, and panel actions follow fork ownership by default.

### Required Behavior

- User facing GitHub repository context resolves to the fork remote before upstream.
- Issue and pull request context preserve fork first identity.
- Cross repository head handling may add remotes for pull request heads without replacing fork first default identity.

### Owner Modules

- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`

### Upstream Intake Rule

- Adapt upstream GitHub integration changes at the fork identity seam.
- Reject upstream behavior that silently redirects user facing GitHub actions to upstream by default.

### Verification

- Repo context, issue flows, and GitHub panel actions target the fork repository by default.
- Pull request prep preserves fork first remote identity while still supporting cross repository heads.

## F7 Local Branch, Worktree, And Promotion Workflow

### Intent

Local Git workflow semantics favor fork safety and explicit promotion behavior over generic upstream shortcuts.

### Required Behavior

- Promotion creates a backup branch under `t3code/promote-backup` before destructive follow through.
- Promotion merges source into target, pushes the target branch, and cleans up the source branch when the flow succeeds and cleanup is safe.
- Worktree preparation preserves fork upstream tracking behavior and local branch safety checks.
- Worktree close and discard use a shared lifecycle substrate for runtime stop, terminal teardown, worktree removal, query invalidation, and thread state cleanup.
- Worktree close releases the thread back to the primary checkout without deleting the thread.
- Worktree discard fully tears down the dedicated workspace, including thread cleanup, so failed worktrees can be thrown away cleanly.
- Local workflow guidance stays explicit about promotion and merge behavior.

### Owner Modules

- `apps/server/src/git/Layers/GitManager.ts`
- `apps/web/src/components/git-panel`

### Upstream Intake Rule

- Adapt upstream Git workflow improvements under the fork promotion contract.
- Reject upstream simplifications that remove backup branch creation, safe cleanup, or fork specific worktree guarantees.

### Verification

- Promotion creates the backup branch and finishes with the expected target branch state.
- Source branch cleanup happens only after the guarded success path.
- Worktree flows preserve fork upstream tracking expectations.
- Closing and discarding a dedicated worktree leave no stale runtime or terminal state behind.

## F8 Plan Aware Sidebar And Activity Status Cues

### Intent

Thread and sidebar status cues reflect plan state directly instead of collapsing plan work into a generic running label.

### Required Behavior

- Sidebar and activity surfaces show explicit plan aware progress when plan data exists.
- Fractional plan progress such as `1/4` remains visible when a plan exposes step progress.
- Plan ready and active plan cues remain visible where the fork currently surfaces them.
- Plan sidebar affordances remain available from the active thread view.

### Owner Modules

- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`

### Upstream Intake Rule

- Adapt upstream activity and thread status changes so plan aware cues remain explicit.
- Reject upstream regressions that replace explicit plan progress with generic running labels.

### Verification

- Threads with active plan steps show fractional progress when the data exists.
- Plan ready and in progress cues render in sidebar and thread activity surfaces.
- Plan sidebar remains reachable from the thread view.

## F9 Plan Markdown Preview And Markdown Rendering Behavior

### Intent

Plan review and markdown presentation preserve fork specific preview flows and readability behavior instead of falling back to a narrower generic upstream markdown surface.

### Required Behavior

- Proposed plans can open into a fullscreen in memory markdown preview without requiring a workspace file write first.
- Plan preview keeps plan specific actions such as copy, download, and explicit save to workspace.
- Plan preview keeps route driven return behavior so the user can move back to chat cleanly.
- Markdown rendering preserves horizontal overflow handling for wide tables and code blocks in chat and document surfaces.
- Plan and markdown document links keep fork specific navigation behavior for workspace paths, local anchors, and external links.
- The document renderer can hide the source footer when the preview is virtual rather than backed by a real workspace file.

### Owner Modules

- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/DocumentMarkdownRenderer.tsx`
- `apps/web/src/components/PlanConversationDocument.tsx`
- `apps/web/src/components/chat/ProposedPlanCard.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/routes/_chat.$threadId.tsx`
- `apps/web/src/index.css`

### Upstream Intake Rule

- Adapt upstream markdown and document preview changes under the fork plan preview contract.
- Reject upstream changes that remove fullscreen in memory plan preview, regress plan specific navigation, or reintroduce clipped markdown content in the protected surfaces.

### Verification

- A proposed plan can open in fullscreen markdown preview from the timeline card and the plan sidebar.
- Returning from fullscreen plan preview restores the chat route without forcing a workspace write.
- Wide markdown tables and code blocks remain horizontally scrollable instead of stretching or clipping the layout.
- Workspace path links, local heading links, and external links keep the expected fork navigation behavior in plan preview and markdown document surfaces.

## Change Procedure

- Update the affected feature entry in the same change that modifies fork behavior.
- Add a new feature entry before merge if a new fork owned surface is introduced.
- Remove a feature entry only when the fork intentionally drops that behavior and the replacement is documented here in the same change.
