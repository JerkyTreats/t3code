# F5 Git Panel Isolation From Draft Ownership

Date: 2026-06-02
Status: active

## Intent

Git panel flows must not take ownership of the active composer draft or silently reset it.

## Required Behavior

- Git panel actions operate on thread, branch, and worktree context without consuming draft text or attachments.
- Draft state remains intact while Git panel operations run.
- Git related thread routing keeps fork specific draft ownership semantics.
- Worktree discard completes active worktree thread teardown before primary workspace draft routing runs, so teardown does not race draft routing.
- Worktree discard never silently claims or clears unrelated composer content while switching back to the primary workspace.

## Owner Modules

- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/GitActionsControl.logic.ts`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/ChatView.browser.tsx`
- `apps/web/src/lib/threadDeletionWorkflow.ts`

## Fork Seams

- Git action logic
- composer draft store
- thread deletion workflow
- worktree lifecycle helpers

## One Shot Rebuild Notes

- Rebuild draft isolation tests before porting broad Git panel UI.
- Keep Git routing and composer draft routing as separate concerns.
- Run worktree discard teardown before fallback navigation.
- Treat project scoped Git actions as repository operations unless a thread scoped action is explicit.

## Upstream Intake Rule

- Adapt upstream Git UX or routing changes so composer draft ownership remains isolated.
- Reject upstream coupling that makes Git panel interactions mutate unrelated draft state.

## Verification

- Opening and using Git panel flows does not clear the active draft.
- Branch and worktree routing preserves the expected draft thread state.
- Changing the Git base branch preserves prompt text, images, terminal context chips, and rich draft mode on the active draft.
- Worktree removal completes before fallback navigation when deleting the only thread linked to a dedicated worktree.
- Discarding a dedicated worktree returns the user to a stable primary workspace draft without losing unrelated draft content.

## Compatibility Checks

- Worktree cleanup leaves no stale runtime, terminal, query cache, or thread state.
- Project scoped Git panel usage does not require a fake active thread.
