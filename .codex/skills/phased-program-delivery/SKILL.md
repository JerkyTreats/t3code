---
name: phased-program-delivery
description: Orchestrate end to end implementation of multi-phase plans, roadmaps, epics, migrations, staged refactors, or requirement documents. Use when Codex must assess phase dependencies, build delivery waves, run solo vertical deliveries per phase, parallelize independent phases with subagents and worktrees, integrate committed results, run cross-phase gates including commit cleanliness, perform fresh reviews, fix findings, and continue until the full phased plan is complete.
---

# Phased Program Delivery

## Purpose

Use this skill to turn a multi-phase implementation request into a complete program delivery loop. The program orchestrator owns phase assessment, dependency graphing, wave planning, cross-phase integration, global gates, review negotiation, and final reconciliation.

This skill is for implementation work across more than one phase. It is not a planning only workflow and it must not stop after the first phase unless the user explicitly asks for only that phase.

Use `solo-vertical-delivery` as the execution workflow for each phase or phase group that is ready to implement.

## Authorization

A user request that invokes or clearly triggers this skill is an explicit request for subagents, delegation, and parallel agent work. Treat that request as authorization to use subagents, git worktrees, parallel exploration, parallel phase verticals, parallel reviewer lanes, fix workers, and repeated use of `solo-vertical-delivery` without asking for separate permission.

This authorization covers workflow mechanics only. Still follow higher-priority runtime policy and seek approval for destructive operations, paid API calls, external credentials, production changes, or work outside the requested program.

## Load References

Read `references/program-ledger.md` when creating or updating the program ledger.

Read `references/phase-packets.md` when creating phase vertical packets, wave review packets, or fix packets.

Read the `solo-vertical-delivery` skill before launching the first phase vertical, then follow it for every phase vertical.

## Required Tools

Use these tools when available:

- `collaboration.spawn_agent` for explorers, phase vertical workers, reviewers, and fix workers
- `collaboration.wait_agent` to collect ready results
- `collaboration.send_message` for in-turn review negotiation and blocker clarification
- `collaboration.followup_task` to reuse an idle agent for a new bounded turn
- `collaboration.interrupt_agent` only when running work must be stopped
- `exec_command` for git, worktrees, test gates, scans, and cleanup
- `apply_patch` for ledgers and small deterministic edits

## Core Loop

Run these routines in order. Return to an earlier routine whenever a dependency change, gate failure, or review finding invalidates the current wave plan.

1. `program_start`
2. `plan_intake`
3. `phase_graph`
4. `wave_plan`
5. `shared_contract_prework`
6. `spawn_wave_verticals`
7. `collect_wave_verticals`
8. `reconcile_wave`
9. `run_wave_gates`
10. `spawn_wave_review`
11. `fix_wave_findings`
12. `advance_next_wave`
13. `program_review`
14. `finalize_program`

## Routine Details

### `program_start`

Create or load the program ledger. Create a program feature branch unless the user explicitly asks not to. Record the source plan and one objective baseline with requested outcome, acceptance evidence, explicit non goals, applicable repository policies, and completion point.

Do not launch a phase vertical until the objective baseline is complete. The baseline controls delegated scope, review disposition, and program completion.

### `plan_intake`

Parse the entire phased plan before implementation. Extract every phase, milestone, deliverable, acceptance criterion, test expectation, migration note, risk note, and stated dependency. Classify work that does not advance the objective baseline as deferred unless it is required by an applicable policy.

If a phase is too broad for one vertical, split it into smaller verticals and record the split. If phases are too tightly coupled to run separately, merge them into one vertical and record the reason.

### `phase_graph`

Build a dependency graph for all phases and derived verticals. Classify each item as blocked, ready, parallel-safe, sequential, or central-only.

Treat shared public contracts, database migrations, generated schemas, protocol changes, security boundaries, and deployment ordering as dependency edges unless the codebase proves otherwise.

### `wave_plan`

Group ready items into delivery waves. A wave can contain multiple phase verticals only when their write scopes, runtime behavior, data migrations, and tests are disjoint enough to integrate safely.

Prefer smaller waves when integration risk is high. Prefer parallel waves only when the independence is explicit and testable.

For every delegated lane, select the lowest agent strength that can reliably complete the packet. Use smaller or standard agents for bounded searches, mechanical edits, focused tests, and narrow reviews. Reserve maximum strength for ambiguous architecture, cross-domain synthesis, difficult debugging, and final boundary review. Do not assign maximum strength uniformly.

Record the selected strength and rationale in the program ledger when the orchestration surface exposes strength selection. When it does not, record that limitation and keep the packet narrow enough for dependable execution.

### `shared_contract_prework`

Implement shared contracts centrally before fan-out when later phases depend on them. Run focused gates before launching workers that consume those contracts.

Do not allow parallel phase workers to invent incompatible versions of shared contracts.

### `spawn_wave_verticals`

For each ready phase vertical in the wave, use the Phase Vertical Packet template without omitting fields, then run `solo-vertical-delivery` in an isolated worktree when edits may overlap with other work. Each packet must include the objective baseline and name the baseline items it advances. Each phase vertical must own a bounded write scope and must report changed files, commits, gates, review findings, unresolved risks, and any dependency changes.

Do meaningful orchestrator work while phase verticals run, such as preparing next-wave packets, updating the ledger, or running non-overlapping gates.

### `collect_wave_verticals`

Wait for phase verticals that are needed for the next integration step. Inspect each result for scope compliance, done criteria, tests, review closure, and dependency changes.

Reject out-of-scope edits or return them for correction before integration.

### `reconcile_wave`

Merge or cherry-pick accepted phase vertical work into the program branch. Resolve conflicts centrally. Run focused compile or static checks after each integration step.

Update the graph if reconciliation reveals new dependencies or invalidates parallel assumptions.

### `run_wave_gates`

Run gates after each integrated wave. Use the codebase native commands and record exact commands and results.

Run the acceptance evidence and the gates required by the objective baseline or applicable policies. Select formatting, static scans, compile checks, focused tests, integration tests, docs checks, fuzz checks, and property checks only when the changed surface or applicable policies require them. Run the commit gate after selected verification passes.

The commit gate means all accepted wave changes are committed on the program branch after verification. If the user explicitly requested no commit, or repository policy blocks committing, record a no-commit exception with dirty files, reason, owner, and next action instead.

Immediately before each program or integration commit, inspect the exact staged behavior and write a Commit Effect entry from the perspective `If applied, this commit ...`. Describe the user-visible, operator-visible, or durable repository behavior introduced by the commit. Keep it human readable and concise. Exclude test results, review findings, workflow narration, diff statistics, and commit hashes. Present the exact statement to the user at the commit point and include identical text in the program ledger within that commit.

When a no-commit exception applies, record the proposed effect as `If applied, the pending commit would ...` and keep it with the exception.

Do not mark a wave complete when verified changes remain uncommitted without an explicit no-commit exception.

### `spawn_wave_review`

Spawn fresh-context reviewers after each nontrivial wave. Use the Wave Review Packet template without omitting fields. Reviewers must not edit files. They return findings only.

Wave review always includes objective coverage. Add these lanes only when the objective baseline or an applicable policy requires them:

- cross-phase integration correctness
- tests and verification
- migration and rollback risk
- docs, examples, and comments
- architecture boundaries

### `fix_wave_findings`

Normalize review findings into the ledger. A finding is blocking only when it prevents acceptance evidence or identifies an applicable policy violation. Record every other finding as deferred and do not send it into a fix loop. Fix blocking findings directly or spawn fix workers for disjoint fix scopes. Re-run affected gates. If a fix changes public contracts or phase dependencies, return to `phase_graph`.

Do not ignore a finding without an evidence note.

### `advance_next_wave`

Mark integrated phases complete only after gates pass, blocking findings are closed, and deferred findings are recorded. Promote newly unblocked phases into the next ready set. Repeat wave planning and wave delivery until every phase required by the objective baseline has been resolved.

### `program_review`

After all required waves are integrated, run a final fresh-context program review against the full diff and the objective baseline.

The final review always includes objective coverage. Add these lanes only when the objective baseline or an applicable policy requires them:

- cross-phase regression risk
- end to end test evidence
- documentation and example consistency
- operational readiness
- architecture consistency

### `finalize_program`

Run final gates at the selected tier. Clean up merged worktrees. Enforce the final commit gate. Confirm every program delivery commit has a Commit Effect entry. Close every completed program deliverable with one product-language statement of the behavior now provided. Report final program status, completed phases, gate evidence, commit ids or no-commit exception, review closure, unresolved risks, dirty worktree status, and any follow-up verticals.

If reconciliation is not clean, stop and report exact files, branches, worktrees, and conflicts.

## Parallelization Rules

Parallelize phases only when all of these are true:

- the phase requirements are independently understandable
- write scopes are disjoint or isolated by worktree and reconciled centrally
- no shared contract must be designed independently by multiple workers
- migrations and persistent data changes have deterministic ordering
- tests can prove the integration boundary after merge

Keep phase graph ownership, wave planning, shared contracts, integration, conflict resolution, gate evidence, and final reconciliation in the program orchestrator.

Agent strength and concurrency are separate decisions. A lane being parallel-safe does not justify a stronger agent. Reassess strength only when evidence shows the current tier cannot resolve the task.

## Closeout Rule

A phased program is complete only when all of these are true:

- every phase has implementation evidence
- every phase has test evidence or a recorded exception
- every dependency edge is satisfied or explicitly deferred
- every wave passed required gates
- accepted changes are committed, or a no-commit exception is explicit
- every program delivery commit has a human-readable Commit Effect entry included with that commit
- every completed program deliverable has a product-language closeout statement
- final fresh-context program review passed
- blocking findings are closed and deferred findings are recorded
- required docs, examples, comments, and operational notes are consistent with the completed objective
- final worktree status is clean, or reconciliation and no-commit notes are explicit
