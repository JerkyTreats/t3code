# Implementation Ledger

Date: 2026-07-29
Branch: `product/v030-settlement`
Commit Policy: local conventional commit required
Objective: Implement the complete settled thread lifecycle atomically on the origin rebuild branch.
Status: fix review pending

## Objective Baseline

- requested outcome: Implement the complete settled thread lifecycle atomically on the origin rebuild branch.
- acceptance evidence: Migration 39 upgrades schema 38 without backfill, command and event literals are exact, settlement policy precedence is tested, projection and reducers remain exhaustive, waking activity clears persisted settlement, static scans prove snooze is absent, full repository gates and fresh review pass, and accepted work is committed locally.
- explicit non goals: No Sidebar V2 rendering, no snooze behavior, no compression, no upstream integration, no remote mutation, and no changes to migrations 33 through 38.
- applicable repository policies: AGENTS.md, patch.md, commit policy, compatibility policy, origin-only source control policy, F08, F15, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F08-plan-aware-sidebar-and-activity-status-cues.md`
- `fork/F15-connection-resilience-and-offline-send-durability.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- `.plans/37-v0.0.30-origin-rebuild-execution.md`
- `governance/commit_policy.md`
- `governance/upstream_merge_policy.md`

## Vertical Plan

1. Add exact settlement wire contracts and additive read-model fields.
2. Add migration 39 and projection repository ownership.
3. Add pure settlement policy with precedence and timestamp safety tests.
4. Add server decisions, atomic waking reset events, and both projections.
5. Add client commands and exhaustive reducer support.
6. Repair typed fixtures exposed by the additive fields.
7. Run focused tests, static scans, and full Node 24 gates.
8. Commit locally and run a fresh findings-only review.
9. Fix blocking findings, rerun affected gates, and close with a clean worktree.

## Parallel Work Slices

- Central implementation owns all code because the wire union, projector, persistence, and reducer activation must typecheck atomically.
- Fresh review is delegated only after the integrated commit and gate evidence are ready.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Atomic implementation | inherited frontier model | The contract union and persistence lifecycle cross several exhaustive boundaries | yes | conflicting storage or event semantics |
| Focused verification | inherited frontier model | Test failures require cross-package fixture reconciliation | yes | repeated unexplained gate failure |
| Fresh review | inherited frontier model with fresh context | Independent objective coverage is required | yes | disputed blocking finding |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Exact command and event literals | Contracts, runtime command builders, and server schemas | Contract and command builder tests | not selected | F8 owner list updated | passed |
| Migration 39 with null legacy state and no backfill | Migration 39 and projection thread services | Schema 38 upgrade and constraint tests | not selected | F8 owner list updated | passed |
| Original settle timestamp preservation | Server decider and projectors | Repeat settle decision tests | not selected | F8 | passed |
| User and waking activity unsettle semantics | Server decider, pipeline, projectors, and reducers | Decision, projection, pipeline, and reducer tests | not selected | F8 | passed |
| Settlement policy precedence and timestamp safety | `threadSettled.ts` | Pure policy boundary and precedence tests | not selected | F8 owner list updated | passed |
| Shell, detail, V2, and reducer field integration | Snapshot query, contracts, and reducer | Snapshot, contract compatibility, and reducer tests | not selected | F8 and F15 | passed |
| No snooze executable surface | Static scan across production source | no matches | not selected | F8 | passed |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P2 settlement | `/home/jerkytreats/t3code-v030-settlement` | `product/v030-settlement` | fix review pending | `522a55d86` | isolated from the dirty primary checkout |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| Origin remote | `git remote -v` | passed | 2026-07-29 | origin is the only writable remote |
| Upstream write guard | `git remote get-url --push --all upstream` | passed | 2026-07-29 | returned `DISABLED` |
| Node runtime | `node --version` with Node 24 path | passed | 2026-07-29 | returned `v24.13.1` |
| Dependency install | `pnpm install --frozen-lockfile` with Node 24 path | passed | 2026-07-29 | isolated install completed without lockfile mutation |
| Format | `pnpm fmt` with Node 24 path | passed | 2026-07-29 | 2171 files checked |
| Lint | `pnpm lint` with Node 24 path | passed | 2026-07-29 | existing warnings only |
| Typecheck | `pnpm typecheck` with Node 24 path | passed | 2026-07-29 | all 15 workspaces passed |
| Tests | `pnpm test` with Node 24 path | passed | 2026-07-29 | all workspace suites passed |
| Server tests | full repository test gate | passed | 2026-07-29 | 171 files and 1460 tests passed, with two files and seven tests skipped |
| Snooze exclusion | `rg -ni snooz` across production source | passed | 2026-07-29 | no matches |
| Diff integrity | `git diff --check` | passed | 2026-07-29 | no whitespace errors |
| Review fix focused server tests | server decider and engine tests | passed | 2026-07-29 | 2 files and 21 tests passed |
| Review fix focused policy tests | client settled policy tests | passed | 2026-07-29 | 1 file and 22 tests passed |
| Review fix format | `pnpm fmt` with Node 24 path | passed | 2026-07-29 | 2172 files checked |
| Review fix lint | `pnpm lint` with Node 24 path | passed | 2026-07-29 | existing warnings only |
| Review fix typecheck | `pnpm typecheck` with Node 24 path | passed | 2026-07-29 | all 15 workspaces passed |
| Review fix tests | `pnpm test` with Node 24 path | passed | 2026-07-29 | all workspace suites passed |
| Review fix server tests | full repository test gate | passed | 2026-07-29 | 171 files and 1461 tests passed, with two files and seven tests skipped |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| Settled thread lifecycle | `522a55d86` | passed gates, reviewed with findings | initial atomic implementation |
| Fresh review fixes | pending | passed gates | restart-safe blockers, server acceptance time, patch guide sync, and ninety-day boundary proof |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| Fresh committed-range review | `settlement_fresh_review` | fixes implemented | four blocking | same reviewer receives the fix packet |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SET-REV-001 | fresh review | high | server engine and decider | settlement blockers must be enforced after restart | fixed pending re-review | pending | persisted shell summary is read before settle, with engine and decider tests |
| SET-REV-002 | fresh review | high | server decider | accepted settlement and unsettle timestamps use server time | fixed pending re-review | pending | test clock proves command creation time is not persisted |
| SET-REV-003 | fresh review | medium | `patch.md` and F8 | authoritative fork guide must stay current | fixed pending re-review | pending | F8 index and behavior contract updated |
| SET-REV-004 | fresh review | low | settled policy tests | valid threshold range includes ninety | fixed pending re-review | pending | explicit ninety-day inactivity test |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- The orchestration engine persists every event returned by one command decision in one SQL transaction.
- Waking reset events can therefore land atomically with the business event without a new RPC method.
- Settlement activation remains central because partial union activation would break exhaustive runtime owners.
- The server reads the persisted shell summary before settle, preserving lightweight command bootstrap while enforcing blockers after restart.
- Shared settlement policy owns blocker and queued-turn logic for both the server decision and client presentation adapters.

## Closeout

Pending same-reviewer fix verification.
