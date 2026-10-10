# T3 runtime adapter

Use the active tool catalog and repository rules as the source of truth. A tool absent from a provider is a capability gap, not a reason to invent Cursor commands. This adapter governs every playbook; it grants no new action permissions.

## Model roles and delegated work

Call `orchestrator_capabilities` before selecting T3 provider instances or models. Use exact live IDs, configured custom models and supported options. Roles are implementation, research, design, review and test, not hard-coded model names. Honor explicit role preferences and budgets; otherwise inherit the parent or choose among available configured options proportionately. Do not replace the model without a grant or an applicable instruction that permits choosing it.

Use native subagents for same-provider work only when they support the chosen model. Use `delegate_task` for a model absent from the native list, cross-provider work, or a T3-owned child task. Prefer async work. Every brief includes goal, exact writable and forbidden paths, data shape, success criteria, verification, resource bound, standing constraints, report format and this skill's actual path when the child must follow it. Pass only necessary task context and prior findings; T3 children do not inherit the parent conversation automatically.

Retain `taskId`, branch and workspace. A new review round is a fresh delegate_task call with the original brief, later directives, prior findings and unresolved objections. Use a distinct clientRequestId per round, stable across retries. A childThreadId is backing storage, not the target for sending the next review assignment. Completion delivery wakes the parent; read task_status when its result is needed during an active turn rather than running a polling loop. Judge status, actual artifacts and owned pending work together; a terminal turn can still have later child work.

The current environment's delegation policy applies. A denied or unavailable delegation step remains visible with its reason. Keep independent review separate from implementation where supported. The lead reviews actual diffs and artifacts even after a passing child verdict.

## Workspace identity and collisions

Delegation is not a cloud VM or an automatic private worktree. Eliminate shared writers before parallelizing. Give each writer disjoint paths or an explicitly isolated branch/worktree and state the exact boundary in its brief. Treat build output, ports and mutable state as shared resources too.

Use ordinary local worktree commands only within repository authorization. App-owned t3_worktree_handoff moves the calling thread and ends its current session; it is not a silent directory change. Use t3_thread_launch with an explicit workspaceStrategy only when the user asked for a separate top-level conversation. create_threads also creates ordinary conversations and does not give a batch separate workspaces. It is not the substitute for a requested subagent.

Preserve unrelated dirty work. Read the fork's patch and isolation policy before changing fork-owned behavior. Source must target the exact origin fork. On this T3 fork, upstream pushes are forbidden, publication needs the current grant, live userdata is protected, and temporary research or plans stay outside the worktree. Read the current repository files for exact commands and exceptions rather than copying them here.

## Wakeups and long runs

Within an active turn, keep working against the fixed predicate. A delegated completion supplies its own parent wakeup. For requested PR monitoring, register watch_pull_request and end the turn; unwatch_pull_request when returning control. Link every task PR and reconcile the thread's registered PR list before finishing.

Persistent scheduled work requires an applicable explicit grant covering recurrence and future runs. Pass schedule_task a structured schedule object, the granted cadence, a bounded prompt and a stable clientRequestId. The prompt points at task-owned durable state, checks whether the run remains active before acting, and deduplicates existing in-flight units. Retain scheduledTaskId and nextRunAt; report the actual cadence and next run time. On completion or explicit hold, use update_scheduled_task with enabled=false for that exact owned ID. Keep other schedules intact.

Scheduler runs return to the current thread by default. Use that for a coordinator that needs existing context. Do not create recurring work merely because a single task is long, and do not silently infer future provider spend from "keep going". Webhooks, secret handling and external notifications follow their tool contracts and the user's specific task authorization.

On an explicit pause, cancel task-owned children with task_cancel and stop owned watches and schedules. Retain partial evidence and actual workspace state for pickup. Compaction and a user status question preserve the active goal.

## Actual-surface verification

Use the project's available verification skill and driver. In this fork, test-t3-app handles the web/desktop Browser panel and isolated dev state; test-t3-mobile handles native mobile. Read those skills when the verification is applicable. Browser and computer use still need the explicit authorization required by the current AGENTS.md. Complete other reviewable work before asking for that gate.

Preserve the user's focus and use task-owned background surfaces. Use synthetic task fixtures rather than production data. A failed driver is an unverified step, not a pass or permission to install another automation system. CLI, storage and trace tasks use their actual artifacts and existing local tooling.

## Missing pstack skills

Discover skills from the actual catalog. Use diagnosing-bugs for a hard diagnosis, codebase-design for types and boundaries, frontend-design for a production interface, tdd for an explicitly appropriate test-first loop, code-review for substantive diff review, research for a sourced investigation, and skill-creator plus writing-for-agents for skill edits when those entries are available and fit the request.

If a catalog entry is absent, use the self-contained playbook and its references. Do not pretend that /how, /architect, /arena, /swarm, /interrogate, /deslop, /create-skill, /loop or a named poteto-agent exists. [Design and review](design-and-review.md) supplies the portable equivalents of understanding, competing attempts, coverage and independent scrutiny.
