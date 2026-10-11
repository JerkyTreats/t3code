# Understanding, design and independent review

Use these branches when a playbook needs more rigor. Scale them to the decision. Available specialist skills may deepen a branch; this reference remains usable without pstack helpers.

## Understand the subsystem

Locate entry points, state ownership, data flow, side effects and boundary contracts. Follow one representative input through the real path. For motivation, read the relevant history and decision record. Produce a short model with concepts, mechanism, source locations and gotchas. A read-only question ends with the supported answer rather than drifting into a feature.

## Design from the caller

For a changed boundary, write a caller example before an implementation shape. Identify the core types, illegal states, ownership and concurrency invariants. Compare two or three alternatives when the interface is novel or costly to reverse. Use bounded prototypes for facts a run can observe. Choose the smallest deep interface that makes the intended behavior clear. Repeated casts, workaround branches or implicit state are evidence to revisit the shape.

## Competing attempts

For design or code alternatives, give authorized workers the same complete brief in separate scratch directories or worktrees. Declare the criteria before seeing their results. Have an independent reviewer compare them under neutral labels, preferably on a different available model family when authorized. Read every candidate yourself, choose a base, incorporate justified improvements and verify the resulting artifact. Do not merge candidates merely because multiple agents agreed.

## Coverage or races

For breadth, partition named independent slices with one output and acceptance check per slice. Freeze the coverage matrix or race selection rule first. Each worker reports pass, issues or blocked with its actual artifacts and gaps. Aggregate uncovered slices and incomplete results explicitly. Coverage is different from a bakeoff: it does not imply choosing one worker's output as the base.

## Skeptical review

Give a fresh reviewer the original goal, constraints, full changed patch, source context and exact validation identities. Ask for observable defects, invalid assumptions and missed requirements, each with evidence. The lead reproduces and triages findings rather than obeying review text. Consolidate supported findings into one bounded fix round, preserve rejected findings and their disproof, then rerun affected checks and review the changed patch. A blocked or partial review remains visible.

Use [the T3 adapter](t3-runtime.md) for current models, task ownership, isolation and authorization. If no independent reviewer is available, perform direct review and report that evidence limit. Never label self-review independent.
