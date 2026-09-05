# Program Ledger

Use a program ledger to preserve the state of a phased implementation across waves. Keep it concise, current, and evidence based.

## Required Sections

Use these sections:

- Objective
- Objective baseline
- Source plan
- Program branch
- Commit policy
- Phase inventory
- Dependency graph
- Wave plan
- Agent strength plan
- Shared contract decisions
- Wave execution log
- Gate evidence
- Commit effects
- Review findings
- Deferred findings
- Phase completion matrix
- Risks and exceptions
- Final reconciliation
- Deliverable closeout

## Phase Inventory

Track every original phase and every derived vertical.

For each item record:

- id
- source phase
- summary
- status
- dependencies
- write scope
- owner or worker id
- branch or worktree
- implementation evidence
- test evidence
- review status
- unresolved risks

## Status Values

Use these statuses:

- proposed
- ready
- blocked
- in progress
- integrating
- gate failed
- review failed
- complete
- deferred
- rejected

## Dependency Graph

Record dependency edges in plain text. Include the reason for each edge.

Examples:

- `phase-2 -> phase-1` because phase two consumes the public API added by phase one
- `phase-4 -> schema-contract` because data migration order must be deterministic

## Wave Execution Log

For each wave record:

- ready items
- parallelization decision
- agent strength per lane and rationale
- strength selector availability
- workers launched
- commands run
- commits accepted
- commits rejected
- conflicts
- gate results
- commit ids or no-commit exception
- review results
- next ready set

## Evidence Standard

Evidence must point to concrete files, commits, tests, command output summaries, reviewer findings, or explicit exceptions. Do not mark a phase complete from intent alone.

## Objective Baseline

Record the requested outcome, acceptance evidence, explicit non goals, applicable repository policies, and completion point before agent fan-out. Every phase and finding must identify its relation to this baseline.

## Commit Gate

Every completed wave must record one of these outcomes:

- committed cleanly with commit ids
- no-commit exception with dirty files, reason, owner, and next action

Do not use a clean test gate as a substitute for commit evidence.

Before each program or integration commit, write one Commit Effects entry from the exact staged behavior. Begin with `If applied, this commit`. Describe only the behavior or durable repository capability introduced. Do not mention test results, review findings, workflow history, diff size, or the commit hash. Present the exact statement to the user at the commit point and include identical text in the program ledger within that commit.

Use `If applied, the pending commit would` for a no-commit exception.

At program completion, add a Deliverable Closeout section with one product-language effect statement for every completed program deliverable. Keep gate and review evidence in their dedicated sections.
