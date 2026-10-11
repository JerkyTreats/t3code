# Trace forensics

Treat the supplied capture as a fixed dataset, without silently replacing it with a fresh run.

1. Identify the artifact format and load it through the project's existing parser or supported tooling.
2. Reduce bulky samples, frames or nodes into a queryable representation while retaining their source identity.
3. Follow the hot path, retainer chain or blocked thread and isolate the strongest mechanism the capture supports.
4. Resolve symbols to source locations, recording missing mappings instead of inventing attribution.
5. Compare a supplied paired capture when available and distinguish confirmed change from an unpaired hypothesis.
6. Deliver a cited diagnosis, artifact pointers and uncertainty without changing product code.

The throughput checkpoint is `n/a: captured-artifact diagnosis`. Read only the supplied or explicitly relevant artifacts. Delegate bulk parsing when authorized; a source self-report is not a trace observation.
