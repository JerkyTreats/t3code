# Upstream Reconciliation And Origin Publication Policy

Date: 2026-08-08
Status: active

## Intent

Keep this fork current through controlled reconciliation with upstream while making origin the exclusive publication target and product repository identity.

Upstream code is an authorized reconciliation substrate.

Active fork product outcomes are durable.

Fork implementation shape is disposable by default.

Nothing from this fork may be written, proposed, published, or otherwise sent to upstream.

The [Fork Isolation Policy](fork_isolation_policy.md) defines the decision ownership and preservation evidence required for protected fork behavior in upstream-sensitive domains.

## Core Model

- `upstream` is the read-only external source for release intake, comparison, merge, rebase, replay, rebuild, and selective port work.
- `origin` is the only remote that may receive fork branches, commits, tags, releases, pull requests, issue mutations, or workflow dispatches.
- `origin` is the repository identity used by product Git visualization, change-request discovery, default-branch context, comparison targets, and publish workflows.
- `patch.md` and its linked active fork specifications define product outcomes that reconciliation must preserve or intentionally change.

Reading or accepting code from upstream is distinct from writing to upstream. Upstream intake is allowed. Upstream publication is prohibited.

## Authority Order

- A user may explicitly request a governance amendment, but task-level instructions do not override this policy while it remains active.
- Repository governance controls reconciliation and publication procedure.
- Active fork product outcomes win over conflicting upstream product outcomes.
- Upstream implementation wins by default when no fork product contract requires a different outcome.

No tool default, generated command, workflow, credential, or delegated action may create an upstream publication exception.

## Allowed Upstream Reconciliation

The following local operations are allowed when they are part of a controlled reconciliation:

- inspect and fetch upstream refs, commits, tags, branches, and files
- create local branches or worktrees from an upstream tag or commit
- merge an upstream tag or commit into a local reconciliation branch
- rebase local fork work onto an upstream tag or commit
- replay fork product behavior on a fresh upstream base
- cherry-pick or manually port named upstream commits under a selective port exception
- compare upstream history and content against origin history and fork feature contracts
- accept reconciled upstream code into branches that are published only through origin

Local Git ancestry may include upstream commits. This does not authorize any upstream-side mutation.

## Prohibited Upstream Publication

Never perform any of the following against upstream:

- push or force push any ref
- create, update, or delete a branch or tag
- create or publish a release
- open, update, merge, close, approve, label, or comment on a pull request
- create, update, close, label, or comment on an issue
- dispatch, approve, cancel, or mutate a workflow
- upload an artifact or publish a package
- use upstream as the base or head repository for a fork pull request

Keep the upstream push URL disabled. Do not add credentials or automation that can write to upstream.

## Origin Product Identity

Product source-control behavior must resolve the exact origin repository.

- Git status and branch visualization compare against origin refs.
- Pull-request discovery and change-request state resolve against origin.
- Default-branch and repository links resolve from origin.
- Branch publication, promotion, release, and repository mutations target origin.
- Upstream must never be selected as a product visualization fallback.
- If exact origin identity is unavailable, product Git features fail closed with a diagnosable unavailable state.

Reconciliation tooling may inspect upstream refs. Product-facing Git features may not treat upstream as the fork repository.

## Reconciliation Workflows

Choose one workflow for each non-trivial upstream take.

### Merge And Repair

Use this when upstream ancestry can be merged without obscuring product intent.

1. Merge the target upstream tag or commit into an isolated local reconciliation branch.
2. Prefer upstream structure where it can carry fork outcomes.
3. Repair protected fork behavior through focused feature commits.
4. Complete the fork preservation gate.
5. Publish only to origin after separate push authorization.

### Base Rebuild And Replay

Use this when upstream architecture has moved enough that ordinary conflict resolution would preserve stale fork internals.

1. Start an isolated local branch or worktree at the target upstream tag or commit.
2. Replay fork product outcomes from `patch.md` and the linked feature specifications.
3. Prefer upstream contracts, stores, runtime models, and components.
4. Add fork seams only for product policy or adapter translation.
5. Complete the fork preservation gate before replacing any accepted origin branch.
6. Publish only to origin after separate push authorization.

### Selective Port Exception

Use selective cherry-pick or manual porting only for a named slice when merge and repair or base rebuild and replay is impractical.

Record:

- the upstream target the fork will later converge to
- why ancestry-based intake is not being used
- the upstream commits or behavior being selected
- protected fork outcomes touched
- the convergence trigger or follow-up

## Reconciliation Decisions

Use these behavior labels:

- `accept` means upstream behavior becomes fork behavior
- `replay` means fork behavior remains and is rebuilt on upstream primitives
- `override` means upstream behavior conflicts with a fork product contract and is changed through the smallest fork-owned policy seam

These labels describe product behavior, not Git ancestry.

## Reconciliation Architecture Rules

- Apply the [Fork Isolation Policy](fork_isolation_policy.md) to protected decisions selected by the reconciliation record.
- Start each replay slice from upstream code and current upstream primitives, not from old fork file shapes.
- Preserve documented product outcomes, workflow semantics, and compatibility guarantees rather than component structure, store design, adapter APIs, or helper implementations.
- Prefer deleting stale fork implementation when upstream now provides a suitable primitive.
- Apply the approved retirement lifecycle in the [Fork Isolation Policy](fork_isolation_policy.md) when a fork feature is intentionally dropped or wholly accepted from upstream.
- Do not copy whole upstream components into fork-owned directories unless the whole component is a documented fork product surface.
- Do not keep duplicate fork and upstream implementations without a recorded removal condition.
- Do not add a compatibility layer merely to freeze superseded fork architecture.
- Prefer upstream contracts, stores, runtime models, and component boundaries when they can carry the required fork outcome.
- Keep product decisions in small fork-owned modules and translate branch-shaped router, store, transport, provider, desktop, and source-control mechanics through adapters.
- Keep integration edits in broad upstream-owned hotspots thin and mechanical.
- Cover each fork seam with focused behavior tests that do not depend on the surrounding upstream component shape when practical.

## Fork Seam Standard

A fork seam is justified when it expresses product policy, owns durable fork state, or translates between upstream mechanics and a fork product contract.

A good fork seam is:

- small and product aware
- independent of one upstream branch shape
- explicit about inputs, outputs, and failure behavior
- close to the boundary where upstream behavior becomes fork behavior
- covered by focused tests or reconciliation evidence
- named as an owner or seam in the relevant fork specification

A fork seam is not justified when it only hides old implementation from upstream change.

## Required Reconciliation Record

Every non-trivial upstream take requires one controlling record under `.plans/` before broad implementation.

The record must include:

- exact upstream tag or commit
- current accepted origin base
- an immutable protected-decision baseline for the selected concern set under the [Fork Isolation Policy](fork_isolation_policy.md)
- target local reconciliation branch
- selected reconciliation workflow
- upstream product lanes being accepted
- affected active fork feature identifiers
- per-feature `accept`, `replay`, or `override` decision
- replay order and owner seams
- compatibility surfaces that require evidence
- verification commands and manual checks
- publication and rollback plan for origin

## Fork Preservation Gate

Before reconciled work is ready to replace or merge into an accepted origin branch:

- review `patch.md` and every affected active fork feature specification
- verify the immutable protected-decision baseline and decision-level reconciliation gate required by the [Fork Isolation Policy](fork_isolation_policy.md)
- verify each affected product outcome against current behavior
- identify the upstream primitive carrying every accepted or replayed behavior
- identify the smallest fork seam carrying every replayed or overridden behavior
- verify that stale fork implementation was not preserved only because it existed before reconciliation
- verify that protected behavior did not silently fall back to generic upstream behavior
- update owner modules, fork seams, rebuild notes, and verification evidence when architecture changed
- run `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`
- run `pnpm lint:mobile` when native mobile code changed
- preserve the pre-reconciliation origin tip before destructive local history replacement
- require separate user authorization before any push or force push to origin

Raw conflict count must remain visible as a diagnostic, but it does not replace the protected-decision gate. If the preservation gate or its decision-level checks are incomplete, the reconciliation is not ready.

## Source Control Safety

Before every remote mutation:

- resolve the exact remote and repository target
- verify that the target is origin
- verify that upstream has no writable push URL
- verify that generated commands, pull-request metadata, and release configuration name origin
- stop when fetch and push identity are ambiguous

Local reconciliation mutations may use upstream as a source. Remote mutations may target only origin.

## Enforcement

Any attempted write to upstream is a release-blocking governance incident.

- Stop before the mutation.
- Do not retry with another command or credential.
- Report the attempted target and whether external state changed.
- Require a direct user decision before any related remote work continues.

Upstream reconciliation performed without the required record or preservation gate is also release blocking, but it is not equivalent to an upstream write incident.
