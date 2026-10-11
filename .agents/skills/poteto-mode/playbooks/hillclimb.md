# Hillclimb

One hypothesis, one measurement, keep or discard. Correctness and simplicity constrain the metric.

1. Define a realistic workload, one metric, direction of improvement, target, stop predicate and authorized attempt or resource budget.
2. Build a repeatable measurement harness, prove its sensitivity with contrasting workloads, freeze it, and record the baseline with a passing regression gate.
3. Open a decision trail with one row per hypothesis and the exact measured artifact identity.
4. Choose a mechanism-level hypothesis from the architecture or trace and implement it in isolation.
5. Alternate comparable before and after runs, check noise and actual work, and run the frozen regression gate.
6. Keep the change only when the metric clears noise and correctness remains intact; otherwise discard that attempt without touching unrelated work. Log either verdict.
7. Pivot at a plateau while cheap supported hypotheses and the budget remain. Stop at the fixed predicate, an explicit stop, the stated resource limit or a documented dead end.
8. Report the baseline-to-final result, retained and rejected attempts, evidence and next useful hypothesis.

The target and harness stay fixed while attempts change. Revise a protocol prospectively and label the new version when evidence shows the measurement itself was invalid. Commit or publish retained wins only within the session's grant.
