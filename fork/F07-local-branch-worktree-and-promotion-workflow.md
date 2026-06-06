# F7 Local Branch Worktree And Promotion Workflow

Date: 2026-06-02
Status: active

## Intent

Local Git workflow semantics favor fork safety and explicit promotion behavior over generic upstream shortcuts.

## Required Behavior

- Promotion creates a backup branch under `t3code/promote-backup` before destructive follow through.
- Promotion merges source into target, pushes the target branch, and cleans up the source branch when the flow succeeds and cleanup is safe.
- Worktree preparation preserves fork upstream tracking behavior and local branch safety checks.
- Worktree close and discard use a shared lifecycle substrate for runtime stop, terminal teardown, worktree removal, query invalidation, and thread state cleanup.
- Worktree close releases the thread back to the primary checkout without deleting the thread.
- Worktree discard fully tears down the dedicated workspace, including thread cleanup, so failed worktrees can be thrown away cleanly.
- Local workflow guidance stays explicit about promotion and merge behavior.

## Owner Modules

- `apps/server/src/git/Layers/GitManager.ts`
- `apps/web/src/components/GitActionsControl.tsx`

## Fork Seams

- Git promotion policy
- Git manager promotion flow
- web Git action controls
- worktree lifecycle helpers

## One Shot Rebuild Notes

- Restore promotion policy before wiring the panel action.
- Keep backup creation before merge and push.
- Keep source cleanup behind the guarded success path.
- Rebuild close and discard flows as separate actions because they intentionally differ on thread deletion.
- Preserve local workflow text and labels that explain promotion behavior.

## Upstream Replay Rule

- Replay upstream Git workflow improvements under the fork promotion contract.
- Override upstream simplifications that remove backup branch creation, safe cleanup, or fork specific worktree guarantees.

## Verification

- Promotion creates the backup branch and finishes with the expected target branch state.
- Source branch cleanup happens only after the guarded success path.
- Worktree flows preserve fork upstream tracking expectations.
- Closing and discarding a dedicated worktree leave no stale runtime or terminal state behind.

## Compatibility Checks

- Promotion does not alter protected default branch behavior.
- Worktree teardown keeps server state, browser state, and terminal state coherent.
