# F5 Git Surface Isolation From Draft Ownership

Date: 2026-06-02
Status: active

## Intent

Git flows must not take ownership of the active composer draft or silently reset it.

The primary Git management UI belongs in the unified right panel as a selectable surface.

## Required Behavior

- Git Panel is opened from `Open a surface` in the unified right panel.
- Git actions operate on thread, project, branch, and worktree context without consuming draft text or attachments.
- Draft state remains intact while Git panel operations run.
- Git related thread routing keeps fork specific draft ownership semantics.
- Worktree discard completes active worktree thread teardown before primary workspace draft routing runs, so teardown does not race draft routing.
- Worktree discard never silently claims or clears unrelated composer content while switching back to the primary workspace.
- Project scoped Git is repository scoped unless a thread scoped action is explicit.

## Owner Modules

- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/GitActionsControl.logic.ts`
- `apps/web/src/components/git-panel/GitPanel.tsx`
- `apps/web/src/components/RightPanelTabs.tsx`
- `apps/web/src/rightPanelStore.ts`
- `apps/web/src/lib/vcsStatusState.ts`
- `apps/web/src/lib/vcsRefState.ts`
- `apps/web/src/lib/gitStatusState.ts`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/ChatView.browser.tsx`
- `apps/web/src/lib/threadDeletionWorkflow.ts`
- `packages/client-runtime/src/vcsStatusState.ts`
- `packages/client-runtime/src/vcsRefState.ts`

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
- Branch and worktree routing preserves the expected draft thread state.
- Changing the Git base branch preserves prompt text, images, terminal context chips, and rich draft mode on the active draft.
- Worktree removal completes before fallback navigation when deleting the only thread linked to a dedicated worktree.
- Discarding a dedicated worktree returns the user to a stable primary workspace draft without losing unrelated draft content.

## Compatibility Checks

- Worktree cleanup leaves no stale runtime, terminal, query cache, or thread state.
- Project scoped Git surface usage does not require a fake active thread.
