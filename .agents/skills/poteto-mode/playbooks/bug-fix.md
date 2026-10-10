# Bug fix

A fix follows an observed mechanism. Changes motivated by a refuted hypothesis leave the patch.

1. Reproduce the reported defect on its actual surface within the task's authorization. Save the failing input and observable result.
2. Ground the subsystem and regression history, form competing explanations, and run discriminating probes until evidence isolates the mechanism.
3. Name the fix's data shape and boundary. Settle a changed interface through design review before a bounded implementation.
4. Implement the smallest fix justified by the mechanism, using a delegated owner when the grant and tools allow it.
5. Rerun the original reproduction and required regression checks. A cheap behavioral test goes red before the fix and green after it.
6. Review every changed line against the evidence and deliver the root cause, fix and failing-then-passing proof.

Read available diagnosing-bugs and tdd skills when their workflows fit. If a surface cannot be exercised, name the specific access or tooling gap and continue useful diagnosis; source reasoning alone does not prove bug absence. Opening a PR is conditional on publication authorization.
