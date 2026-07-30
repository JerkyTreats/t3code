# Preservation And Final Reconciliation Ledger

Date: 2026-07-30
Branch: `product/v030-p9`
Program branch: `product/v0.0.30-origin-rebuild`
Objective: Prove every protected fork feature survives the origin-only v0.0.30 product rebuild and produce a clean final local handoff.
Status: in progress

## Objective Baseline

- Requested outcome: build the fork product feature set on the latest origin release while preserving every active `F1` through `F15` contract.
- Acceptance evidence: focused feature evidence is complete, every required build and release gate passes, visible workflows are checked where local transport permits, fresh domain and cross-domain reviews are clean, documentation is reconciled, all accepted work is committed locally, and no remote state changes.
- Explicit non goals: no upstream integration, no upstream mutation, no origin push, no pull request, no remote release, no remote self-update, and no configurable write target.
- Completion point: every preservation row is verified, final gates pass, review has no open material finding, governance documentation is complete, and the program branch is clean.

## Source Requirements

- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- `.plans/37-v0.0.30-origin-rebuild-execution.md`
- `patch.md`
- `fork/F01` through `fork/F15`
- P1 through P8 implementation and evidence
- `governance/commit_policy.md`
- `governance/compatibility_policy.md`
- `governance/policy_proposal_flow.md`
- `governance/upstream_merge_policy.md`

## Preservation Matrix

| Feature | Decision | Final Owner Seam | Compatibility Note | Automated Evidence | Manual Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | preserve and rebuild | shared identity, desktop builder, release workflows, artifact supervisor | stable app id and storage with fork release identity | pending | pending | ready |
| F2 | preserve | desktop theme adapter and renderer projection | generic source contract with safe fallback | pending | pending | ready |
| F3 | preserve | desktop screenshot adapter and composer attachment flow | delayed complete PNG and clipboard fallback | pending | pending | ready |
| F4 | preserve and rebuild | composer state, global prompt stash, attachment queue | atomic legacy migration and provider-neutral drafts | pending | pending | ready |
| F5 | preserve and rebuild | Git launcher and project-scoped Git surface | draft ownership remains isolated | pending | pending | ready |
| F6 | preserve | origin-only GitHub target resolver | every mutation remains exact origin | pending | pending | ready |
| F7 | preserve and rebuild | local worktree, promotion, teardown, close and discard | origin-only push with guarded cleanup | pending | pending | ready |
| F8 | preserve and rebuild | shell plan projection, Sidebar V2, settlement policy | default-off switch with V1 rollback and snooze deferred | pending | pending | ready |
| F9 | preserve and rebuild | plan preview, document renderer, file reveal, diff panel | rendered Markdown and stable source reveal coexist | pending | pending | ready |
| F10 | preserve and rebuild | model catalog, binary discovery, launch configuration | exact selected binary and provider model identity | pending | pending | ready |
| F11 | preserve and rebuild | source control provider lane and publish workflow | provider-neutral discovery with origin-only publish | pending | pending | ready |
| F12 | preserve and rebuild | provider instance registry and routing | exact same-driver instance identity survives recovery | pending | pending | ready |
| F13 | preserve and rebuild | access management, secure catalog, saved environments, relay | legacy bearer and relay data remain compatible | pending | pending | ready |
| F14 | preserve and rebuild | project context, right panel, inference dashboard | concrete environment and project identity remains stable | pending | pending | ready |
| F15 | preserve and rebuild | outbox, reconciliation, diagnostics, recovery, compression | restart and reconnect semantics remain durable | pending | pending | ready |

## Required Gate Set

1. Run focused preservation suites for every feature row.
2. Run static origin-only and feature-owner scans.
3. Run `pnpm fmt`.
4. Run `pnpm lint`.
5. Run `pnpm typecheck`.
6. Run `pnpm lint:mobile`.
7. Run `pnpm test`.
8. Run `pnpm build`.
9. Run `pnpm build:desktop`.
10. Run `pnpm test:desktop-smoke`.
11. Run `pnpm release:smoke`.
12. Run `pnpm dist:desktop:linux`.
13. Run `pnpm test:desktop-artifact-smoke`.
14. Run `pnpm bench:connection-resilience`.
15. Run visible workflow checks for Sidebar V2, reconnect, Git, plan preview, project surfaces, and desktop pairing where the collaborative preview transport permits.
16. Run fresh domain reviews and one cross-domain boundary review.
17. Reconcile documentation and commit evidence.

## Manual Workflow Matrix

| Workflow | Environment | Evidence | Limitation | Status |
| --- | --- | --- | --- | --- |
| Sidebar V2 switch and V1 rollback | local web | pending | none recorded | ready |
| Reconnect and durable send | local server and web | pending | none recorded | ready |
| Git project surface | isolated local repository | pending | no remote mutation | ready |
| Virtual plan preview and source return | local web | pending | none recorded | ready |
| Project header and right-panel surfaces | local web | pending | none recorded | ready |
| Desktop pairing and secure storage capability | packaged desktop | pending | host Secret Service may constrain storage | ready |

## Review Lanes

| Lane | Scope | Reviewer | Status | Findings |
| --- | --- | --- | --- | --- |
| Contracts and resilience | F4, F8, F12, F15 | fresh reviewer | pending | pending |
| Desktop, auth, relay, and release | F1, F2, F3, F10, F13 | fresh reviewer | pending | pending |
| Git and source control | F5, F6, F7, F11 | fresh reviewer | pending | pending |
| Markdown and projects | F9, F14 | fresh reviewer | pending | pending |
| Cross-domain closure | all invariants and evidence | fresh reviewer | pending | pending |

## Gate Evidence

| Gate | Result | Evidence Date | Notes |
| --- | --- | --- | --- |

## Review Findings

| Id | Severity | Domain | Finding | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- |

## Deferred Findings

| Id | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| D1 | product map | snooze workflow | explicitly deferred | future product work | not required for Sidebar V2 |
| D2 | product map | remote self-update | explicitly deferred | future release work | local update behavior remains in scope |

## Governance Blocker

- P7 and P8 feature specs are reconciled in their isolated worktrees.
- The matching `patch.md` changes require explicit Policy Proposal Flow confirmation before edit and commit.
- P9 may run every non-governance gate while that confirmation is pending.

## Closeout

Pending.
