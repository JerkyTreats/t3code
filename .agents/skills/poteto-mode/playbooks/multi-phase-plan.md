# Multi-phase plan

The plan is the deliverable. Execution begins only on the user's go.

1. State the target behavior, constraints, protected decisions and what would count as completion.
2. Ground current architecture and use bounded prototypes to settle observable unknowns before committing to a sequence.
3. Decompose into small dependency-ordered units with exact owners, paths, inputs, outputs and acceptance predicates.
4. Give each unit the appropriate required checks and proof on its actual surface, with measured performance gates only where performance matters.
5. Separate operator decisions and publication or landing gates from reversible implementation steps, and record real blockers and assumptions.
6. Review the plan for missing dependencies, untestable predicates, duplicated writers and any unsupported claims about runtime evidence.
7. Deliver the plan outside the worktree, its evidence and the execution playbook to use after approval.

Scale verification lanes to the change rather than demanding ten agents for every unit. A test suite can be a meaningful gate, but cannot establish an unexercised UI flow or a performance claim. Do not commit temporary plans under the fork's scratch policy or run Cursor's check-plan script. Use the repository's real contract format when it applies.
