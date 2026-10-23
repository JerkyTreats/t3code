# Feature

The lead owns the design, acceptance predicate and review. Implementation has a bounded owner.

1. Ground the affected subsystem and state the changed behavior and checkable finish condition.
2. Name the core data shape, types and ownership. Read [design and review](../references/design-and-review.md) when interfaces or a costly design decision change.
3. Add four throughput items to the plan: blocking first steps, independent workstreams, shared mutable state, and smallest safe decomposition. Keep every item with evidence or a specific n/a reason.
4. Delegate the bounded implementation when authorized and supported, using [the T3 adapter](../references/t3-runtime.md). Otherwise implement directly and record the review separation still needed.
5. Review the complete diff and verify the changed behavior on the matching surface, with the repository's required checks.
6. Resolve contested design or material findings before reporting completion. Recheck the behavior affected by each fix.
7. Deliver the reviewable result and its evidence. Continue to Opening a PR only under an existing publication grant.

Parallel writers need disjoint files or separate worktrees. A small local change can have one implementation owner; the checkpoint explains the choice rather than manufacturing a fanout.
