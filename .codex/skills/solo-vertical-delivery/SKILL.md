---
name: solo-vertical-delivery
description: Run autonomous solo implementation verticals with one orchestrator thread, parallel subagent workers, fresh-context reviewer subagents, optional git worktrees, objective-scoped review and fix loops, selected quality gates, mandatory commit gate, and final reconciliation. Use when a user asks Codex to implement a large scoped change end to end with high quality and minimal human intervention.
---

# Solo Vertical Delivery

## Purpose

Use this skill to turn one user request into an orchestrated vertical delivery loop. The orchestrator thread owns context, plan, integration, gates, review negotiation, and final reconciliation. Workers and reviewers run in subagents with narrow packets.

This skill is for implementation work. It is not a planning only workflow.

## Authorization

A user request that invokes or clearly triggers this skill is an explicit request for subagents, delegation, and parallel agent work. Treat that request as authorization to use subagents, git worktrees, parallel exploration, parallel implementation workers, parallel reviewer lanes, and fix workers without asking for separate permission.

This authorization covers workflow mechanics only. Still follow higher-priority runtime policy and seek approval for destructive operations, paid API calls, external credentials, production changes, or actions outside the requested vertical.

## Required Tools

Use these tools when available:

- `collaboration.spawn_agent` for explorers, workers, reviewers, and fix workers
- `collaboration.wait_agent` to collect agents
- `collaboration.send_message` for in-turn reviewer negotiation
- `collaboration.followup_task` to reuse an idle agent for a new bounded turn
- `collaboration.interrupt_agent` only when running work must be stopped
- `exec_command` for git, worktrees, test gates, fuzz gates, and scans
- `apply_patch` for ledger and small deterministic edits

Fresh review means spawning a reviewer with `fork_turns: "none"` and a complete review packet. Do not rely on the implementation thread history as review context.

## Load References

Read [packets.md](references/packets.md) when creating worker, reviewer, fix, or fresh review packets.

Read [ledger.md](references/ledger.md) when creating or updating the implementation ledger.

Use [solo_vertical.py](scripts/solo_vertical.py) for deterministic ledger and packet scaffolding.

Generate worker and reviewer packets with [solo_vertical.py](scripts/solo_vertical.py). Pass the generated packet without removing or renaming fields. Use the corresponding template for fix and fresh review packets. Fill every objective baseline field in every packet.

## Core Loop

Run these routines in order unless a gate failure requires returning to an earlier routine.

1. `vertical_start`
2. `context_gather`
3. `objective_lock`
4. `vertical_plan`
5. `work_split`
6. `worktree_create`
7. `spawn_implementors`
8. `collect_implementors`
9. `reconcile_worktrees`
10. `run_gates`
11. `spawn_fresh_review`
12. `negotiate_review`
13. `fix_findings`
14. `quality_review_passes`
15. `finalize_vertical`

## Routine Details

### `vertical_start`

Create or load the implementation ledger. Create the main feature branch unless the user explicitly asks not to. Record the source requirement docs, target vertical, gate tiers, commit policy, and review lanes.

Suggested command:

```sh
python3 ~/.codex/skills/solo-vertical-delivery/scripts/solo_vertical.py init-ledger --path design/plan/integration/runtime_implementation_PLAN.md --objective "Implement runtime assembly" --acceptance-evidence "cargo test runtime_assembly_proof" --non-goals "Reliability work outside the vertical" --policies "Repository policies that apply to the changed surface" --branch runtime-implementation
```

### `context_gather`

Spawn explorer agents in parallel for independent questions. Use `fork_turns: "none"` when the explorer only needs raw paths and instructions. Use `fork_turns: "all"` only when thread-local context is materially needed.

Useful explorer lanes:

- requirement map
- implementation seams
- test and fuzz gaps
- comment and example gaps
- worktree split risks

Merge findings into the ledger before planning.

### `objective_lock`

Before implementation work or fan-out, record an objective baseline with requested outcome, concrete acceptance evidence, explicit non goals, applicable repository policies, and completion point.

Do not proceed when acceptance evidence is absent or the scope remains ambiguous. New improvements discovered during delivery are deferred unless they prevent the acceptance evidence or violate an applicable policy.

### `vertical_plan`

Build a concrete vertical plan from the objective baseline and explorer findings. Define implementation slices, dependencies, gate commands, and review lanes that the baseline or applicable policies require. Do not add fuzz, comments, docs, or operational work solely because it is generally useful.

The plan must identify which work can run in parallel and which work must be integrated centrally.

Assign the lowest agent strength that can reliably complete each delegated lane. Use smaller or standard agents for bounded searches, mechanical edits, focused test runs, and narrow reviews. Reserve maximum strength for ambiguous architecture, cross-domain synthesis, difficult debugging, and final boundary review. Do not assign maximum strength uniformly.

Record the selected strength and rationale in the ledger when the orchestration surface exposes strength selection. When it does not, record that limitation and narrow the packet rather than implying strength was tuned.

### `work_split`

Create worker packets only for disjoint write scopes. Do not parallelize overlapping ownership. If a slice touches shared contracts, either make it a central orchestrator edit or make it a dedicated first slice that other workers consume later.

### `worktree_create`

Use git worktrees when workers need file isolation. Keep branch names stable and domain scoped.

Example:

```sh
git worktree add ../meld-runtime-events runtime-events
git worktree add ../meld-runtime-supervisor runtime-supervisor
```

Record every worktree path and branch in the ledger.

### `spawn_implementors`

Spawn one worker per work packet. Generate the packet with `solo_vertical.py worker-packet` and provide requested outcome, acceptance evidence, explicit non goals, and applicable policies. Worker prompts must say the worker is not alone in the codebase, must not revert others, must stay in scope, must edit files directly in its worktree, and must report changed files plus commands run.

Do meaningful orchestrator work while workers run.

### `collect_implementors`

Wait for workers. Inspect each final report for scope compliance. Reject out of scope edits. Close completed agents after results are integrated or rejected.

### `reconcile_worktrees`

Merge or cherry-pick accepted work into the main feature branch. Resolve conflicts centrally. Run focused compile checks after each reconciliation step. Update the ledger with accepted commits, rejected work, and conflict notes.

### `run_gates`

Run gates selected by the objective baseline and applicable policies. Run the acceptance evidence and any required focused checks before the commit gate. Add formatting, static scans, compile checks, integration tests, doc tests, fuzz checks, and clippy only when the changed surface or an applicable policy requires them.

Milestone gates add longer fuzz runs and broader workspace checks. Record exact commands and results in the ledger.

The commit gate means verified changes are committed on the vertical branch. If the user explicitly requested no commit, or repository policy blocks committing, record a no-commit exception with dirty files, reason, owner, and next action.

Immediately before each delivery commit, inspect the exact staged behavior and write a Commit Effect entry from the perspective `If applied, this commit ...`. Describe the user-visible, operator-visible, or durable repository behavior introduced by the commit. Keep it human readable and concise. Exclude test results, review findings, workflow narration, diff statistics, and commit hashes. Present the exact statement to the user at the commit point and include identical text in the ledger within that commit.

When a no-commit exception applies, record the proposed effect as `If applied, the pending commit would ...` and keep it with the exception.

Do not mark the vertical gate set complete when verified changes remain uncommitted without an explicit no-commit exception.

### `spawn_fresh_review`

Spawn reviewer agents with `fork_turns: "none"`. Generate the packet with `solo_vertical.py review-packet` and provide requested outcome, acceptance evidence, explicit non goals, and applicable policies. Reviewers must not edit files. They return findings only.

Every review includes objective coverage. Add these lanes only when the objective baseline or an applicable policy requires them:

- implementation correctness
- fuzz and verification
- comments and examples
- docs consistency
- architecture boundaries

Run lanes in parallel after the integrated diff is ready.

### `negotiate_review`

Normalize findings into the ledger. A finding is blocking only when it prevents acceptance evidence or identifies an applicable policy violation. Record every other observation as deferred and do not send it into a fix loop. If a blocking finding is unclear or appears wrong, send the reviewer a narrow evidence packet with `collaboration.send_message`. Ask the reviewer to confirm, narrow, or withdraw. Record the final state.

Do not ignore a finding without an evidence note.

### `fix_findings`

Fix blocking findings directly or spawn fix workers for disjoint fix scopes. Use the Fix Packet template and fill its objective baseline item or policy basis. Re-run affected gates. For nontrivial fixes, run a fresh reviewer pass for the affected lane.

### `quality_review_passes`

The vertical cannot close until objective coverage passes, required review lanes pass, blocking findings are closed, and deferred findings are recorded.

Comment review follows the repository comment policy when one exists. Require public Rustdoc and inline comments only when the changed surface or policy requires them.

Fuzz review applies only when the objective baseline or an applicable policy calls for it. When it applies, verify fuzz manifests compile before claiming a fuzz result.

### `finalize_vertical`

Run final gates. Enforce the commit gate. Confirm every delivery commit has a Commit Effect entry. Close the deliverable with one product-language summary of the behavior now provided. Clean up merged worktrees. Report dirty worktree status, commit ids or no-commit exception, final evidence, closed findings, unresolved risks, and next vertical.

If reconciliation is not clean, stop and report exact files, branches, and conflicts.

## Parallelization Rules

Maximize parallelism only when write scopes are disjoint. Parallelize explorers, implementation workers, review lanes, and independent fix workers. Keep plan ownership, integration, conflict resolution, gate evidence, and final reconciliation in the orchestrator.

Use worktrees for long running or risky parallel implementation. Use ordinary subagents in the main worktree for read-only exploration and reviews.

Agent strength and concurrency are separate decisions. Parallel-safe work does not automatically require a stronger agent. Escalate strength only when task evidence justifies it.

## Closeout Rule

A vertical is complete only when all of these are true:

- every requirement row has implementation evidence
- every requirement row has test evidence or a recorded exception
- objective coverage and required fresh-context review lanes passed
- blocking findings are closed and deferred findings are recorded
- acceptance evidence and selected gates pass
- accepted changes are committed, or a no-commit exception is explicit
- every delivery commit has a human-readable Commit Effect entry included with that commit
- the deliverable closeout states what behavior the completed vertical provides
- comment and example consistency pass
- final worktree status is clean, or reconciliation and no-commit notes are explicit
