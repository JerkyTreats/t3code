# F5 Git Surface Isolation From Draft Ownership

Date: 2026-07-10
Status: active

## Intent

Git flows must not take ownership of the active composer draft or silently reset it.

The primary Git management UI belongs in the unified right panel as a selectable surface.

## Required Behavior

- Git Panel is opened from `Open a surface` in the unified right panel.
- Git actions operate on thread, project, branch, and worktree context without consuming draft text or attachments.
- Draft state remains intact while Git panel operations run.
- Git related thread routing keeps fork specific draft ownership semantics.
- A terminal Git action failure releases the Git action state and triggers a status refresh, so recovery actions remain available.
- Worktree discard completes active worktree thread teardown before primary workspace draft routing runs, so teardown does not race draft routing.
- Worktree discard never silently claims or clears unrelated composer content while switching back to the primary workspace.
- Project scoped Git is repository scoped unless a thread scoped action is explicit.

## Owner Modules

- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/GitActionsControl.logic.ts`
- `apps/web/src/components/git-panel/GitPanelSurface.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatHeader.tsx`
- `apps/web/src/components/RightPanelTabs.tsx`
- `apps/web/src/rightPanelStore.ts`
- `apps/web/src/lib/sourceControlActions.ts`
- `apps/web/src/state/vcs.ts`
- `packages/client-runtime/src/state/vcsAction.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/state/sourceControl.ts`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/lib/threadDeletionWorkflow.ts`

## Fork Seams

- Git surface descriptor and launcher
- Git action logic
- VCS runtime state adapters
- composer draft store
- thread deletion workflow
- worktree lifecycle helpers

## One Shot Rebuild Notes

- Rebuild draft isolation tests before porting broad Git surface UI.
- Add the Git surface to the unified right panel launcher before removing legacy route assumptions.
- Keep Git routing and composer draft routing as separate concerns.
- Run worktree discard teardown before fallback navigation.
- Treat project scoped Git actions as repository operations unless a thread scoped action is explicit.

## Upstream Replay Rule

- Replay upstream Git UX or routing changes so composer draft ownership remains isolated.
- Override upstream coupling that makes Git interactions mutate unrelated draft state.
- Prefer unified right panel integration over standalone Git panel routes.

## Verification

- Opening and using the Git surface does not clear the active draft.
- `Open a surface` exposes Git Panel without forcing project management navigation.
- The chat header exposes a direct Git button that opens the unified Git surface instead of an inline commit and push control.
- Git surface provides the prior visible commit, pull, promote, pull request, publish, refresh, workspace, sync, and changed file workflow hierarchy over current source control primitives.
- Failed push and pull request actions return the Git surface to an actionable state after their terminal failure event.
- Branch and worktree routing preserves the expected draft thread state.
- Changing the Git base branch preserves prompt text, images, terminal context chips, and rich draft mode on the active draft.
- Worktree removal completes before fallback navigation when deleting the only thread linked to a dedicated worktree.
- Discarding a dedicated worktree returns the user to a stable primary workspace draft without losing unrelated draft content.

## Compatibility Checks

- Worktree cleanup leaves no stale runtime, terminal, query cache, or thread state.
- Project scoped Git surface usage does not require a fake active thread.
