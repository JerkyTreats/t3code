# Pause safely

Only an explicit pause or stop triggers this route. Going to bed while asking to continue remains an active run.

1. Stop starting new units, stop owned schedules or watches, and cancel task-owned children that could keep mutating after the pause.
2. Reach a safe boundary for the current atomic step or back out only that step without disturbing unrelated work.
3. Preserve the on-disk changes and write a resume note outside the repository with intent, actual state, evidence, pending work, grants and the first next action.
4. Commit a checkpoint only when existing session and repository authorization permits it; otherwise leave a precise diff and worktree handoff.
5. Report the durable paths, what remains unfinished and the first action for a cold-start agent.

A pause never grants permission to push, publish a PR, rewrite history or delete a worktree. Automatic context compaction preserves the active task and does not mean the user asked to pause.
