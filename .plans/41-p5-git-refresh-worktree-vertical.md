# Implementation Ledger

Date:
Branch: product/v0.0.30-origin-rebuild
Commit Policy:
Objective: Reconcile v0.0.30 bounded Git ref refresh and immediate merged change-request settlement while preserving origin-only mutation and fork worktree semantics.
Status: planned

## Objective Baseline

- requested outcome: Reconcile v0.0.30 bounded Git ref refresh and immediate merged change-request settlement while preserving origin-only mutation and fork worktree semantics.
- acceptance evidence: Generation-checked invalidation and coalescing prevent refresh storms, ref-affecting actions invalidate predictably, origin-only resolution remains fail-closed, close and discard semantics stay distinct, merged or closed state feeds settlement with active precedence, focused and full gates pass, fresh review passes, and accepted work is committed locally.
- explicit non goals: No draft ownership, no source-control provider redesign, no non-origin write target, no Sidebar V2 rendering, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F05, F06, F07, F08, F11, F14, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F05-git-panel-isolation-from-draft-ownership.md`
- `fork/F06-fork-first-github-identity-resolution.md`
- `fork/F07-local-branch-worktree-and-promotion-workflow.md`
- `fork/F08-plan-aware-sidebar-and-activity-status-cues.md`
- `fork/F11-source-control-provider-lane-and-publish-workflow.md`
- `fork/F14-project-management-and-inference-dashboard.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- upstream read-only evidence commit `38a6e3ce6` for bounded ref refresh
- upstream read-only evidence commit `9cf9fc9c5` for merged change settlement

## Vertical Plan

1. Audit current Git, source control, worktree, right-panel, and project Git contracts.
2. Add generation-checked client invalidation and a bounded shared server refresh cache.
3. Preserve optional `targetBranch`, `issueLink`, and exact normalized origin resolution.
4. Invalidate after every ref-affecting action settles while releasing stale streams after 30 idle seconds.
5. Preserve close and discard as distinct actions over one teardown helper.
6. Feed merged or closed change-request state into the P2 settlement resolver with active blockers and explicit active state taking precedence.
7. Preserve provider-neutral discovery, SSH clone defaults, raw Git URL bypass, publish gating, and empty repository behavior.
8. Run focused Git, runtime, source control, worktree, and settlement adapter tests.
9. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P5a owns client ref generation, invalidation, persistence, and connection-lifetime behavior.
- P5b owns server Git scan coalescing, refresh cache, and action invalidation hooks.
- P5c owns worktree close and discard preservation plus merged change-request settlement wiring.
- P5a and P5b may run in parallel after P2. P5c begins after the P2 settled resolver is integrated.
- Shared contracts, lockfiles, patch guide updates, and source control presentation are reconciled centrally.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Client invalidation | inherited frontier model | Connection generations and stale persistence require precise concurrency control | yes | stale generation publishes refs |
| Server coalescing | inherited frontier model | Linked worktrees must share one bounded scan per Git common directory | yes | scan cache loses repository identity |
| Worktree and settlement | frontier model with high reasoning | Origin-only mutation and destructive teardown must remain fail-closed | yes | close and discard semantics converge |
| Fresh review | frontier model with fresh context | Source control safety and concurrency need independent boundary review | yes | any non-origin mutation path |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Generation-checked invalidation | v0.0.30 and F5 | pending | pending | selected for event-order sequences | pending | planned |
| Shared server ref coalescing | v0.0.30 and F7 | pending | pending | not selected | pending | planned |
| Origin-only mutation | F6 and F11 | current policy seams | pending | selected for remote URL normalization | F6 and F11 | planned |
| Close and discard distinction | F7 | current teardown seam | pending | not selected | F7 | planned |
| Project Git without draft ownership | F5 and F14 | current right-panel adapter | pending | not selected | F5 and F14 | planned |
| Merged change settlement | v0.0.30 and F8 | pending P2 adapter | pending | not selected | pending | planned |
| Provider-neutral discovery and publish | F11 | current provider registry | pending | not selected | F11 | planned |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- Current origin has a refresh stream but no dedicated `vcsRefInvalidation.ts` owner.
- The stable ref-storm fix crosses contracts, runtime persistence, server Git, web queries, and mobile cache state.
- Package-wide replacement is forbidden because every server Git owner also contains fork-only origin policy and worktree behavior.
- Merged change-request state remains a pure settlement input until P5 wires the source control adapter.

## Closeout
