# Implementation Ledger

Date: 2026-07-29
Branch: product/v030-git-refresh
Commit Policy: Local conventional commits after exact origin-only remote preflight
Objective: Reconcile v0.0.30 bounded Git ref refresh and immediate merged change-request settlement while preserving origin-only mutation and fork worktree semantics.
Status: accepted for local commit

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
| Generation-checked invalidation | v0.0.30 and F5 | `vcsRefInvalidation.ts` plus generation checked commit in `vcs.ts` | stale revision, stale connection, and mid-save generation sequence tests | event-order sequences cover invalidation before save and connection change during save | `patch.md`, F5, and F11 | verified |
| Shared server ref coalescing | v0.0.30 and F7 | common directory generation cache in `GitVcsDriverCore.ts` | linked worktree concurrency and in-flight invalidation tests | not selected | `patch.md` and F7 | verified |
| Origin-only mutation | F6 and F11 | existing exact origin checks remain unchanged while mutation wrappers only invalidate refs | full server suite plus protected file diff check | existing provider URL and origin policy sequences | F6 and F11 | verified |
| Close and discard distinction | F7 | shared teardown helper plus explicit close and discard commands in `useThreadActions.ts` | close, close failure, discard, and deletion ordering tests | not selected | `patch.md`, F5, and F7 | verified |
| Project Git without draft ownership | F5 and F14 | repository scoped VCS invalidation with thread scoped cleanup only | full web and client runtime suites | not selected | F5 and F14 | verified |
| Merged change settlement | v0.0.30 and F8 | VCS status adapter in `threadSettled.ts` | merged, closed, blocker, and explicit active precedence tests | not selected | `patch.md` and F8 | verified |
| Provider-neutral discovery and publish | F11 | shared action manager retains provider-neutral transport and preserves optional payload fields | full source control suites and payload builder test | not selected | F11 | verified |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P5 | `/home/jerkytreats/t3code-v030-git-refresh` | `product/v030-git-refresh` | accepted for local commit | pending | isolated helper worktree from `cf59691ba` |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| Format | `pnpm fmt` | passed | 2026-07-29 | Node 24 |
| Lint | `pnpm lint` | passed | 2026-07-29 | baseline warnings only |
| Typecheck | `pnpm typecheck` | passed | 2026-07-29 | all 15 package tasks passed |
| Test | `pnpm test` | passed | 2026-07-29 | all repository package suites passed |
| Focused client runtime | `pnpm --dir packages/client-runtime test` | passed | 2026-07-29 | 41 files and 331 tests after final additions |
| Focused web | `pnpm --dir apps/web test` | passed | 2026-07-29 | 167 files and 1416 tests |
| Focused mobile | `pnpm --dir apps/mobile test` | passed | 2026-07-29 | 79 files and 465 tests after final additions |
| Focused server | `pnpm --dir apps/server test` | passed | 2026-07-29 | 173 files and 1473 tests plus expected skips |
| Protected policy check | `git diff -- apps/server/src/fork/originOnlySourceControlPolicy.ts apps/server/src/fork/originOnlySourceControlPolicy.test.ts` | passed | 2026-07-29 | no diff |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| P5 implementation | pending | pending | local commit after fresh review |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| P5 fresh findings only review | fresh context reviewer | fixes complete | eight blocking findings | all findings entered the mandatory fix loop |
| P5 first fix rereview | fresh context reviewer | fixes complete | four deeper blocking findings | all findings entered the mandatory fix loop |
| P5 second fix rereview | new fresh context reviewer | fixes complete | two blocking findings | discovery race and branch matching entered the mandatory fix loop |
| P5 third fix rereview | new fresh context reviewer | fixes complete | one blocking finding | repeated persisted cache read entered the mandatory fix loop |
| P5 final clean review | new fresh context reviewer | passed | no blockers | every fix and full objective boundary verified |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P5-R1 | fresh review | blocking | settlement consumer | merged and closed settlement | closed | pending | live Sidebar and status indicator consumption |
| P5-R2 | fresh review | blocking | ref invalidation identity | common directory scoping | closed | pending | alias-scoped invalidation sequence |
| P5-R3 | fresh review | blocking | stale persistence cleanup | stale data safety | closed | pending | failed cleanup disables reads |
| P5-R4 | fresh review | blocking | pull request preparation | action invalidation completeness | closed | pending | settled invalidation hook |
| P5-R5 | fresh review | blocking | status remote fetch | server generation safety | closed | pending | status fetch advances generation |
| P5-R6 | fresh review | blocking | worktree product actions | close and discard visibility | closed | pending | Sidebar context actions |
| P5-R7 | fresh review | blocking | worktree close failure paths | lifecycle coherence | closed | pending | result checks, sharing, and rollback |
| P5-R8 | fresh review | blocking | publish preflight | origin-only mutation | closed | pending | conflict rejection before create or ensure |
| P5-R9 | first fix rereview | blocking | merge and promotion branch delete | action invalidation completeness | closed | pending | wrapped driver methods invalidate generations |
| P5-R10 | first fix rereview | blocking | settlement time source | live settlement accuracy | closed | pending | one shared advancing external store clock |
| P5-R11 | first fix rereview | blocking | ref identity aliases | active consumer coherence | closed | pending | no unsafe eviction and reassignment detaches old identity |
| P5-R12 | first fix rereview | blocking | persisted ref reads | persistence serialization | closed | pending | reads, saves, removals, and cleanup share one environment lock |
| P5-R13 | second fix rereview | blocking | first linked-worktree discovery | invalidation serialization | closed | pending | repository invalidation sequence rejects stale first discovery |
| P5-R14 | second fix rereview | blocking | merged change settlement | branch identity correctness | closed | pending | status ref must equal the thread branch |
| P5-R15 | third fix rereview | blocking | stale first-discovery persistence | remount cache safety | closed | pending | stale row removal and persistence freshness survive idle remount |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| P5-D1 | scope audit | Sidebar V2 rendering is not part of this vertical | explicit non goal | P6 | adapter and settlement inputs are ready for presentation integration |

## Phase Notes

- Current origin has a refresh stream but no dedicated `vcsRefInvalidation.ts` owner.
- The stable ref-storm fix crosses contracts, runtime persistence, server Git, web queries, and mobile cache state.
- Package-wide replacement is forbidden because every server Git owner also contains fork-only origin policy and worktree behavior.
- Merged change-request state remains a pure settlement input until P5 wires the source control adapter.

## Closeout

- Bounded generation-checked Git ref refresh now coalesces by Git common directory and preserves repository-scoped invalidation across linked worktrees.
- Persistence loads, saves, cleanup, first identity discovery, and atom remounts reject stale ref snapshots under one serialized environment lane.
- Every ref-affecting path invalidates, including pull request preparation, status remote fetch, merge, local branch deletion, worktree actions, and promotion.
- Close and discard remain distinct visible product actions with shared-worktree protection and rollback-safe failure ordering.
- Merged or closed change requests settle only the matching thread branch, use one advancing clock, and preserve active blocker precedence.
- Publish rejects conflicting existing origin configuration before external or local mutation while equivalent transport forms share canonical identity.
- All Node 24 gates passed and the final new fresh review reported no blockers.
- Local implementation commit evidence remains to be recorded.
