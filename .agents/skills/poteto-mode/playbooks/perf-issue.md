# Perf issue

One fix to measured slowness has a baseline and a matching post-change measurement.

1. Capture a realistic baseline and identify the metric, workload, correctness checks and likely limiter.
2. Ground the hot path from the actual trace and form a mechanism-level hypothesis.
3. Try eliminating unused work, reuse, less work, deferred work, background work, concurrency, then cheaper work, stopping when the goal is met.
4. Implement one justified change and run the same correctness gate and post-change measurement.
5. Vet the numbers for equal configurations, actual work inside the timed region, errors, noise and end-to-end relevance.
6. Report the baseline, result, units, repeated samples, limiter, artifact paths and uncertainty.

A trace parser, profiler or benchmark already in the project takes precedence over invented measurement. Use Hillclimb for sustained iteration, not a one-off fix. A wrong-surface or noisy result stays inconclusive.
