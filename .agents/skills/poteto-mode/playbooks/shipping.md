# Shipping

Only explicitly authorized landing crosses from reviewable work to the destination branch.

1. Confirm the authorized repository, destination, ordered PR list and landing scope without re-asking for a grant already established.
2. Obtain independent behavior verification for each selected PR at an exact base and head, with real surface evidence and required checks.
3. Identify the contiguous passing run from the bottom and stop the landing ceiling at the first unverified or failed dependency.
4. Before each landing, refresh base, head, patch identity, checks and mergeability; a changed behavior patch invalidates the old verdict.
5. Land one authorized PR at a time through the fork's approved forge path and confirm the merged result before advancing.
6. Recompute the next frontier after every merge and report what landed, the verification identities and the first remaining gap.

The writer's self-proof and CI green are not independent verification. Preserve every repository approval gate and remote constraint. Retargeting, rewritten history and auto-merge require their own applicable authorization; a playbook is not a grant. Never arm descendants while an unverified lower dependency can be pulled in. Use parent-owned T3 PR watches for event wakeups.
