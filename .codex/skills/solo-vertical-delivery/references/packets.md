# Packet Templates

Use these packets with subagents. Keep packets specific and self contained.

## Worker Packet

```text
Objective:

Acceptance evidence:

Explicit non goals:

Applicable policies:

Worktree:

Write scope:

Read scope:

Requirement sources:

Selected agent strength:

Strength rationale:

Tasks:

Required tests when selected:

Required fuzz when selected:

Required comments when selected:

Required examples or docs when selected:

Commit expectation:

Proposed commit effect:

Forbidden changes:

You are not alone in the codebase. Do not revert edits made by others. Stay inside the write scope unless blocked. If blocked, stop and report the blocker.

Final response must include:
- summary
- proposed commit effect beginning with `If applied, this commit`
- changed files
- commit ids or no-commit exception
- commands run
- tests added or changed
- comments or docs added
- risks
```

## Explorer Packet

```text
Question:

Repository path:

Relevant files:

Output required:

Selected agent strength:

Strength rationale:

Do not edit files. Return evidence with file paths and line references where useful.
```

## Reviewer Packet

```text
Review lane:

Objective:

Acceptance evidence:

Explicit non goals:

Applicable policies:

Repository path:

Commit range or diff source:

Changed files:

Requirement sources:

Gate evidence:

Commit evidence:

Selected agent strength:

Strength rationale:

Review rules:
- do not edit files
- return findings only
- order findings by severity
- include file and line references where useful
- state when no issues are found
- mark a finding as blocking only when it prevents acceptance evidence or identifies an applicable policy violation
- mark every other observation as deferred

Focus questions:
```

## Negotiation Packet

```text
Finding id:

Original finding:

Evidence to consider:

Question:
Confirm, narrow, or withdraw the finding. Do not introduce unrelated findings.
```

## Fix Packet

```text
Finding ids:

Objective baseline item or policy basis:

Worktree:

Write scope:

Required fix:

Required regression tests:

Required gate reruns:

Selected agent strength:

Strength rationale:

Commit expectation:

Proposed commit effect:

Forbidden changes:

Final response must include the proposed commit effect beginning with `If applied, this commit`, changed files, commit ids or no-commit exception, commands run, and remaining risk.
```

## Fresh Thread Review Packet

Use this packet when a human starts a separate top level thread.

```text
You are reviewing an implementation. Return findings only.

Repository:

Branch:

Commit range:

Plan ledger:

Objective:

Acceptance evidence:

Explicit non goals:

Applicable policies:

Requirement sources:

Changed files:

Gate evidence:

Commit evidence:

Review lanes requested:

Do not edit files. Return blocking findings only when they prevent acceptance evidence or identify an applicable policy violation. Mark every other observation as deferred.
```
