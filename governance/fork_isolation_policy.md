# Fork Isolation Policy

Date: 2026-08-15
Status: active

## Intent

Reduce the cost and risk of replaying fork product outcomes across upstream architectural change.

This policy protects fork decisions rather than historical file shape. It establishes durable ownership, thin integration boundaries, immutable reconciliation baselines, and decision-level preservation evidence.

This policy does not authorize publication to upstream. The [Upstream Reconciliation And Origin Publication Policy](upstream_merge_policy.md) remains authoritative for remote identity, reconciliation, and publication safety.

## Scope

This policy applies when either condition is true:

- a new or materially changed fork decision belongs to an upstream-sensitive domain
- a non-trivial upstream reconciliation record selects an existing fork decision for preservation

An upstream-sensitive domain is a product area implemented through files, contracts, stores, components, or runtime boundaries that upstream also changes or owns.

Routine maintenance outside those conditions does not require retrospective conversion. This policy does not require exhaustive isolation of the whole fork, a universal feature framework, or relocation of every fork-owned file.

## Active Contract Lifecycle

Active patch guidance, fork specifications, verification catalogs, test registries, workflows, and maintained operator documentation describe current implemented fork-owned behavior only.

Historical plans, completed ledgers, Git history, immutable historical baselines, and the retired-feature record create no current feature replay, compatibility, verification, or product-behavior preservation obligation.

An explicitly approved retirement removes the behavior and every active contract, registration, preservation claim, and operator instruction for it in one atomic change. No replacement is required unless replacement behavior was separately approved.

Remove feature-specific implementation, integration, settings, flags, routes, commands, schemas, persistence, tests, fixtures, catalogs, and compatibility scaffolding. Retain generic or upstream-compatible substrate only when a surviving active feature or accepted upstream behavior requires it, and document that substrate under the surviving owner when it carries a protected decision.

Historical reconciliation baselines remain immutable evidence of the work they originally governed. Approved retirement ends their active applicability without rewriting them. Retired decisions must not remain inputs to current reconciliation or release gates.

Feature identifiers are not renumbered after retirement.

## Isolation Roles

Every protected decision selected under this policy must identify the paths serving these module roles. These roles describe code authority and do not describe people, access, or contributor identity.

### Durable Fork Owner

A durable fork owner contains the semantic product decision that must survive upstream host replacement. It owns the relevant policy, state transition, identity rule, failure rule, or user-visible outcome.

A durable owner must:

- expose explicit inputs, outputs, and failure behavior
- avoid dependence on one incidental upstream component or branch shape where practical
- have focused evidence for the protected decision
- be named in the controlling fork specification or reconciliation record

### Mechanical Upstream-Facing Adapter

A mechanical upstream-facing adapter connects upstream-shaped hosts to a durable fork owner. It may map data, route commands, perform effects, subscribe to state, or render an owner-produced model.

An adapter must not independently restate or select the protected fork decision. Integration edits in broad upstream-owned hotspots must remain thin and mechanical where practical.

### Upstream Substrate

An upstream substrate provides accepted mechanics, contracts, storage, rendering, lifecycle authority, or other primitives without owning a distinct fork decision.

Upstream substrate receives no fork isolation credit. A fork decision may consume it through a durable owner or adapter, but ordinary upstream behavior must not be relabeled as fork ownership.

## Decision Documentation

Each protected fork decision in scope must record:

- stable concern and decision identifiers
- the product outcome that must survive
- its durable fork owner
- its upstream-sensitive adapters
- its upstream substrate where relevant
- explicit non-ownership and non-integration boundaries
- focused behavior evidence
- host-replacement evidence when the decision crosses an upstream-sensitive host
- dependencies and compatibility surfaces relevant to replay

The record may live in a feature specification, a repository-owned isolation catalog, or the controlling reconciliation record. Machine-readable catalogs are encouraged when they materially improve repeatability, but they are not universally required.

## Architecture Standard

- Preserve semantic product outcomes rather than historical component, store, or helper shape.
- Prefer current upstream primitives when they can carry the protected outcome.
- Keep durable fork policy and state transitions out of broad upstream-sensitive hosts where practical.
- Keep host adapters limited to translation, routing, effects, composition, and rendering.
- Do not create a generic plugin or feature runtime solely to satisfy this policy.
- Do not preserve stale fork implementation solely because it predates an upstream change.
- Do not claim isolation through code relocation, renamed imports, catalog labels, comments, markers, or a new path alone.
- A new path absent from upstream receives no isolation credit without semantic ownership and matching behavior evidence.

## Evidence Standard

Evidence must directly execute or inspect the protected decision at its declared owner boundary.

When a protected decision crosses an upstream-sensitive host, host-replacement evidence must show that replacing or bypassing the historical host does not discard the product outcome. The evidence must exercise the declared behavior rather than merely locate a file or marker. It does not require deleting or rewriting the current host.

Mechanical conflict evidence is valid only when it proves at the exact decision boundary that a surviving conflict hunk performs translation, routing, effects, composition, rendering, or accepted substrate work and does not select the protected decision.

Evidence labels, fingerprints, and markers may support traceability. They are never sufficient without matching executable or reviewable behavior evidence.

## Immutable Reconciliation Baseline

Before broad implementation begins for a significant upstream reconciliation, freeze an immutable protected-decision baseline in the controlling record or a referenced repository artifact. A significant reconciliation is any non-trivial upstream take under the [Upstream Reconciliation And Origin Publication Policy](upstream_merge_policy.md).

The baseline must include:

- the exact accepted origin revision
- the exact upstream revision
- stable concern and protected decision identifiers
- the fork and upstream object identity for each selected decision-bearing host where available
- fingerprints for selected decision-bearing conflict hunks
- the decisions implemented by each selected hunk
- current authoritative evidence and known evidence gaps
- the initial classification of each selected path as durable owner, mechanical adapter, or upstream substrate

Later path moves, metadata edits, or role relabeling must not change the denominator. A classification change is valid only when code evidence shows the decision left the old host, the declared durable owner implements it, required host-replacement evidence passes, and fresh review confirms any remaining host logic is mechanical or accepted substrate.

## Reconciliation Gate

Before reconciled work may replace or merge into an accepted origin branch, every selected protected decision must pass the following gate:

- the product outcome survives or has an explicitly approved behavior change
- a declared durable owner implements each fork-owned decision
- focused decision evidence passes
- required host-replacement evidence passes
- no selected product decision remains implemented in a conflicted upstream-sensitive host
- every surviving selected conflict is declared and evidenced as mechanical adapter work or accepted upstream substrate
- zero decision-bearing conflict hunks remain blocking
- no selected overlap remains undeclared

Raw conflict count remains a required planning and comparison diagnostic. It is not by itself a preservation gate because a thin adapter may still conflict textually without carrying a product decision.

Failure of protected decision survival, evidence, ownership, or blocking-conflict checks makes reconciliation release blocking.

Shared upstream outcomes and unsupported assertions receive no fork isolation credit. They remain visible in the baseline when needed to preserve an honest decision denominator.

## Bounded Adoption And Exceptions

Adopt this standard incrementally for decisions selected by the scope rules. Existing fork behavior outside the selected concern set may remain unchanged until it is materially changed or enters a non-trivial reconciliation.

Before a concern enters the immutable baseline, the controlling record may exclude it through an explicit non-integration boundary. When an architecture requirement cannot be applied without disproportionate complexity, a recorded exception must include:

- the affected decision and domain
- the unmet requirement
- why the ordinary owner and adapter model is impractical
- the temporary preservation evidence
- the risk owner
- the removal trigger or review condition

An exception may vary an architecture requirement when the protected outcome still has direct preservation evidence. Once a decision enters the immutable baseline, an exception may not waive decision survival, required behavior evidence, host-replacement evidence, declared overlap, or the zero blocking-hunk gate.

No exception may authorize an upstream write, change product repository identity away from exact origin, waive an explicitly documented fork outcome without approval, or treat missing evidence as passing evidence.

## Repository Identity And Publication Safety

- Upstream remains a read-only reconciliation source.
- Origin remains the exclusive product repository identity and publication target.
- Never push, publish, open or mutate a pull request, create a release, or otherwise mutate repository state against upstream.
- Product Git visualization, change-request discovery, comparison identity, and publication workflows must resolve exact origin and fail closed rather than fall back to upstream.
- Isolation, replay, rebase, rebuild, merge, or selective port work creates no upstream publication exception.

## Enforcement

The controlling fork specification or reconciliation record must name the protected decisions to which this policy applies and the evidence used to close them.

For applicable fork behavior changes, reviewers must reject code-relocation-only, marker-only, or metadata-only isolation claims.

For significant upstream reconciliation, the fork preservation gate in the [Upstream Reconciliation And Origin Publication Policy](upstream_merge_policy.md) must include the immutable baseline and decision-level gate defined here.

## Proposal Trace

- Proposal evaluation completed on 2026-08-15.
- Strengths, weaknesses, tradeoffs, project fit, and a recommendation were provided before editing.
- Explicit user approval on 2026-08-15 authorized this targeted governance change.
- Runtime code, tests, fork specifications, the patch guide, and the program ledger remain outside this policy change.
- A separate proposal evaluation and explicit user approval on 2026-08-15 authorized the current-state-only contract lifecycle and blanket feature retirement rule.
