# F7 Local Branch Worktree And Promotion Workflow

Date: 2026-06-02
Status: active

## Intent

Local Git workflow semantics require explicit origin-only publication and promotion behavior.

## Required Behavior

- Promotion creates a backup branch under `t3code/promote-backup` before destructive follow through and publishes that backup only to `origin`.
- Promotion merges source into target, pushes the target branch only to `origin`, and cleans up the source branch when the flow succeeds and cleanup is safe.
- Pull and pull request actions accept remote changes only from `origin`.
- Worktree and local pull request preparation materialize only same-repository origin branches while preserving local branch safety checks.
- Worktree close and discard use a shared lifecycle substrate for runtime stop, terminal teardown, worktree removal, query invalidation, and thread state cleanup.
- Worktree close releases the thread back to the primary checkout without deleting the thread.
- Worktree discard fully tears down the dedicated workspace, including thread cleanup, so failed worktrees can be thrown away cleanly.
- Local workflow guidance stays explicit about promotion and merge behavior.

## Owner Modules

- `apps/server/src/git/GitManager.ts`
- `apps/server/src/vcs/GitVcsDriverCore.ts`
- `apps/web/src/lib/sourceControlActions.ts`
- `apps/web/src/components/GitActionsControl.tsx`

## Fork Seams

- Origin-only Git promotion policy
- Git manager promotion flow
- web Git action controls
- worktree lifecycle helpers

## One Shot Rebuild Notes

- Restore origin-only promotion policy before wiring the panel action.
- Keep backup creation before merge and push.
- Keep source cleanup behind the guarded success path.
- Rebuild close and discard flows as separate actions because they intentionally differ on thread deletion.
- Fail closed when origin is missing, its push URL differs from its fetch URL, or a branch tracks a non-origin target.

## Origin Rebuild Rule

- Rebuild Git workflow changes only from origin owned changes.
- Reject behavior that pushes, pulls, merges, rebases, or otherwise accepts upstream code.

## Verification

- Promotion creates the backup branch and publishes only to origin before finishing with the expected target branch state.
- Source branch cleanup happens only after the guarded success path.
- Origin-only pull, publish, checkout, and worktree paths reject non-origin tracking targets and cross-repository heads.
- Closing and discarding a dedicated worktree leave no stale runtime or terminal state behind.

## Compatibility Checks

- Promotion cannot select upstream or a configured push default as its write target.
- Worktree teardown keeps server state, browser state, and terminal state coherent.
