# Autopilot-stack

Build a coupled queue as a verified dependency chain for the operator to land.

1. Freeze the queue, dependency order, acceptance predicates, budgets, operator review gates and authorized publication scope.
2. Assign isolated implementation owners with exact paths and intended parent branches; build prerequisites before dependent units.
3. Let one topology owner maintain the chain while implementation owners write only their scoped branches or files.
4. Verify every code-ready base-to-head patch independently and consolidate findings into bounded fix rounds.
5. Append only verified units in dependency order, using exact parent tips and fresh verification whenever a moved patch changes behavior.
6. Refresh the lowest unmerged frontier through parent-owned T3 watches when waiting, preserving the chain and operator gates.
7. Deliver the root-to-tip chain with per-link verdicts, evidence, pending gaps and the operator's landing boundary.

This playbook never merges or arms auto-merge. Branch creation, push, rebase and base retarget must be authorized by the session and repository rules. Without publication authority, deliver the same dependency structure as local reviewable changes instead of opening surprise PRs. The distinction from Autopilot-full is who lands and whether items are coupled.
