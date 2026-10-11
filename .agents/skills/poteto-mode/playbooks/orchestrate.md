# Orchestrate

A standing coordinator owns the program, briefs, evidence and frontier. Workers own bounded changes.

1. Establish the program predicate, dependencies, protected decisions, standing constraints, resource budget and actual grants.
2. Create a local program store outside the repository with numbered standing orders, a unit ledger, verification ledger, decision trail and derived status.
3. Decompose into the fewest independent tracks that have clear outputs and isolated writer scopes; add sub-coordinators only when one coordinator cannot manage the frontier.
4. Dispatch bounded T3-owned workers with the full brief, applicable standing orders, accepted prior findings and explicit workspace paths.
5. Consume terminal results and inspect their actual artifacts; independent verifiers bind verdicts to current base, head and behavior evidence.
6. Recompute the frontier from persisted facts after each completion or wakeup, retry bounded failures with fresh consolidated briefs, and reject stale late results until reconciled.
7. Advance only verified authorized units, handle the lowest blocked dependency first, and log every decision or unresolved gate without expanding scope.
8. On the completion predicate, explicit stop, resource limit or documented program dead end, cancel owned pending work and stop owned schedules or watches, then provide a resumable handoff.

Each store file has one writer. Use task IDs for delegated liveness and results; a returned child thread ID is storage, not a new review dispatch target. T3 delegation inherits the current checkout unless explicitly isolated in the brief, so it is not a cloud VM guarantee. Publication and merge scope come from the user and fork rules, not from the word orchestrate. For one large task, use a bespoke run instead.
