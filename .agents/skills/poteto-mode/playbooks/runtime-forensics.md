# Runtime forensics

Diagnose the running system. The deliverable is evidence and a mechanism, not a source fix.

1. Capture the relevant live signal with an authorized driver, such as a CPU profile, heap snapshot or scheduling trace.
2. Reduce the capture to the hot path, retainer chain or repeating operation, preserving links to the original samples.
3. Run a discriminating observation or bounded instrumentation probe that can confirm or refute the proposed mechanism.
4. Map the result to the source location and name unresolved symbols or confounds.
5. Report the signal, reduced finding, confirming evidence, source and artifact paths.

The throughput checkpoint is `n/a: diagnosis`. Live instrumentation may itself mutate runtime state; use only the task-authorized process and restore temporary instrumentation. Sensitive process captures stay local. A fix requires a separate scope grant and reroutes to Bug fix or Perf issue.
