---
name: poteto-mode
description: Route a requested Poteto Mode goal through evidence-backed playbooks using T3 Code. Use when the user invokes $poteto-mode, asks for poteto-mode, or asks to continue an active Poteto Mode task.
---

# Poteto Mode for T3 Code

Take the user's arbitrary goal, choose the workflow, and own the result. This is a T3 adaptation of pstack's guide, not a Cursor plugin.

## Enter, steer, and exit

Read [principles](references/principles.md) and [the T3 adapter](references/t3-runtime.md) at task entry. Read only the matched playbook next. Resolve file links relative to this skill directory, not the project working directory.

Restate a noisy or ambiguous goal in one sentence before implementation. Carry the goal, checkable finish condition, requested proof, known facts and real constraints into the workflow. Infer routine reversible choices from evidence; ask for a material missing preference while continuing independent work.

A short follow-up such as "continue" keeps the active goal and playbook. A correction changes the active brief; compare the correction with the current interpretation before building further. "New task" discards the prior routing choice and matches again. Casual questions need an ordinary answer. A request to exit this mode ends its application. Invocation establishes a workflow for this task, not a product-level persistent composer setting.

Choose the most specific authorized outcome below. A constraint such as "don't change code" or "plan only" wins over a suggested implementation. A request to state a plan is not permission to execute it. "Going to bed, keep going" means continue; explicit "pause" means stop safely.

## Match the goal

| Outcome | Read |
| --- | --- |
| Cited answer or recommendation, no edits | [Investigation](playbooks/investigation.md) |
| Reproduce and fix a defect | [Bug fix](playbooks/bug-fix.md) |
| Fix measured slowness | [Perf issue](playbooks/perf-issue.md) |
| Improve one metric over repeated attempts | [Hillclimb](playbooks/hillclimb.md) |
| Diagnose a running process, no fix | [Runtime forensics](playbooks/runtime-forensics.md) |
| Diagnose an existing capture, no fix | [Trace forensics](playbooks/trace-forensics.md) |
| Add or change behavior | [Feature](playbooks/feature.md) |
| Change structure while preserving behavior | [Refactoring](playbooks/refactoring.md) |
| Cheap experiment to settle a decision | [Prototype](playbooks/prototype.md) |
| Match a frozen visual reference | [Visual parity](playbooks/visual-parity.md) |
| Create or modify a skill | [Authoring a skill](playbooks/authoring-a-skill.md) |
| Compare agent behavior under skill or prompt variants | [Eval](playbooks/eval.md) |
| Check or drive a PR to merge-ready | [Babysit](playbooks/babysit.md) |
| Explicitly land a verified PR or stack | [Shipping](playbooks/shipping.md) |
| Drive one long task to a finish predicate | [Autonomous run](playbooks/autonomous-run.md) |
| Coordinate a program that outlives one task | [Orchestrate](playbooks/orchestrate.md) |
| Independent queue with explicit landing authority | [Autopilot-full](playbooks/autopilot-full.md) |
| Deliver a coupled queue for the operator to land | [Autopilot-stack](playbooks/autopilot-stack.md) |
| Inherit prior work and find the resume point | [Session pickup](playbooks/session-pickup.md) |
| Explicit request to stop and checkpoint | [Pause safely](playbooks/pause-safely.md) |
| Plan phases or PRs without implementing | [Multi-phase plan](playbooks/multi-phase-plan.md) |
| Audit or reclaim worktree storage | [Worktree cleanup](playbooks/worktree-cleanup.md) |
| Explicitly publish a reviewable change as a PR | [Opening a PR](playbooks/opening-a-pr.md) |

A large cross-cutting task, a task left for later review, or a goal with no matching playbook needs [a bespoke run](playbooks/bespoke-run.md). Program-scale coordination uses Orchestrate instead. Planning and diagnosis remain read-only unless the user asks to change that scope.

## Execute visibly

Open the matched playbook in full. Copy its numbered steps verbatim into the available plan or todo tool before adding task-specific work. Keep a skipped step visible as `skip: <reason>`. Use `n/a: <reason>` for a throughput dimension that does not apply. State the chosen route briefly so the user can correct a misread early.

For nontrivial implementation, settle types and ownership before logic. Compare designs where the decision is costly to reverse; a prototype settles an observable question better than a preference poll. Delegate within the task's grant through the T3 adapter. The lead owns the acceptance predicate, reviews each diff, and synthesizes evidence instead of forwarding a child's conclusion.

Verify the actual artifact on the surface the user cares about. Compilation, a passing suite, child self-report and CI green support a claim; none substitutes for the relevant behavioral proof. A missing or blocked check stays visibly unverified. For measured claims, identify the limiter and check workload, correctness, noise and end-to-end impact.

For long work, maintain [a decision trail](references/decision-trail.md). Finish each unit with a check before advancing. Preserve the goal through compaction and wakeups; stop on the user's completion predicate, explicit stop, exhausted stated budget or a documented dead end. Neither the finish predicate nor a failed check is relaxed to declare success.

Read [Opening a PR](playbooks/opening-a-pr.md) only when publication is authorized. Completing another playbook does not grant permission to commit, push, create a PR, merge, deploy, send messages, delete data or install dependencies. Existing session grants and repository rules determine those actions.

## Report the result

Lead with the outcome and relevant behavior. Explain the choice that mattered, evidence actually obtained, and material uncertainty. Link real artifacts. Distinguish observation from inference. Scale detail to the work; write in the user's conversational style. Name a principle only when its full leaf was read and it changed a specific decision. Claims about completion include the check that supports them.
