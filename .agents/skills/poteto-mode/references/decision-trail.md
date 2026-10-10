# Decision trail

Keep long or unattended work auditable through a task-owned file outside the repository, unless the user and repository explicitly require a committed record. Choose one writer for the trail. Each completed unit immediately records its decision and outcome rather than reconstructing a narrative at the end.

Use the existing project format when it fits. A minimal TSV has these columns:

```text
time	unit	phase	decision	reason	evidence	result	predicate
```

Evidence is an actual path, task ID, command log or source revision. Results distinguish kept, discarded, failed, blocked and unverified. For measurements, add the frozen protocol version, metric, workload, before/after values and regression gate. For independent reviews, bind the verdict to exact base and head and the artifact exercised.

At pickup, read the goal and constraints, trail, resume note and real workspace state before advancing. Retain valid evidence and revalidate only what changed state or missing proof makes uncertain. For a program, keep unit and verification ledgers separately and derive status from them. A transcript, ledger row or prior agent claim is context; the actual artifact supports the completion claim.

Write only task-relevant decisions. Keep credentials, unrelated chat history, production fixtures and private diagnostics out of reports and publication. A resume note includes intent, grants, current branch/worktree, completed checks, pending task IDs, owned schedules or watches, remaining units and the first next action.
