# Preservation And Final Reconciliation Ledger

Date: 2026-07-30
Branch: `product/v030-p9`
Program branch: `product/v0.0.30-origin-rebuild`
Objective: Prove every protected fork feature survives the origin-only v0.0.30 product rebuild and produce a clean final local handoff.
Status: runtime verified, governance confirmation pending

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
| F1 | preserve and rebuild | shared identity, desktop builder, release workflows, artifact supervisor | stable app id and storage with fork release identity | identity, lifecycle, workflow safety, release, and 19 artifact-smoke tests plus final real AppImage smoke | preview unavailable before tab access | verified, documentation pending |
| F2 | preserve | desktop theme adapter and renderer projection | generic source contract with safe fallback | theme parsing, CSS projection, and bridge subscription suites pass | live watcher check unavailable with preview auth failure | verified with watcher coverage debt |
| F3 | preserve | desktop screenshot adapter and composer attachment flow | delayed complete PNG and clipboard fallback | capture, delayed PNG, clipboard, draft, byte limit, action, and supported plus unsupported host capability suites pass | preview unavailable before tab access | verified |
| F4 | preserve and rebuild | provider-aware composer state, provider-neutral global prompt stash, attachment queue | atomic legacy migration preserves exact draft provider identity while stash restores into the active draft | stash, draft, keyboard, migration, and attachment suites pass in a 242 test focused run | preview unavailable before tab access | verified with end-to-end coverage debt |
| F5 | preserve and rebuild | Git launcher and project-scoped Git surface | draft ownership remains isolated | draft promotion, action failure, teardown ordering, and invalidation suites pass | preview unavailable before tab access | verified with integration coverage debt |
| F6 | preserve | origin-only GitHub target resolver | every mutation remains exact origin | missing origin, push mismatch, cross-repository, and issue-target rejection suites pass | local repository checks only | verified |
| F7 | preserve and rebuild | local worktree, promotion, teardown, close and discard | origin-only push with guarded cleanup | direct server tests prove backup, merge, target push, local cleanup, and conflict retention across 61 GitManager tests | no remote mutation | verified |
| F8 | preserve and rebuild | shell plan projection, Sidebar V2, settlement policy, durable outbox projection | default-off switch with V1 rollback and snooze deferred | settings, migration, settlement, pagination, selection, plan-progress, exact outbox identity, hydration, and reconciliation suites pass | preview unavailable before tab access | verified |
| F9 | preserve and rebuild | plan preview, document renderer, file reveal, diff panel | rendered Markdown and stable source reveal coexist | plan copy, download, save, return, headings, links, containment, ranges, and reveal ownership suites pass | preview unavailable before tab access | verified with renderer coverage debt and documentation pending |
| F10 | preserve and rebuild | model catalog, bounded binary discovery and version probing, launch configuration | exact selected binary and provider model identity | model, discovery, launch, text generation, isolation, and flooded probe drain suites pass; full repository gates pass | preview unavailable before tab access | verified |
| F11 | preserve and rebuild | source control provider lane and publish workflow | provider-neutral discovery with origin-only publish | GitHub, GitLab, Azure DevOps, Bitbucket, clone, lookup, publish, conflict, and origin authority suites pass | preview unavailable before tab access | verified with UI integration coverage debt |
| F12 | preserve and rebuild | provider instance registry and routing | exact same-driver instance identity survives recovery | registry, model isolation, status cache, adapter, and provider service suites pass across 201 focused tests | preview unavailable before tab access | verified |
| F13 | preserve and rebuild | access management, secure catalog, saved environments, relay | legacy bearer, boolean catalog IPC, and relay data remain compatible | auth, durable snapshot, encrypted catalog, typed capability mapping, remediation, migration, launcher, unlink, generation, limit, and shutdown suites pass | preview unavailable before tab access | verified |
| F14 | preserve and rebuild | project context, right panel, inference dashboard | concrete environment and project identity remains stable | exact route identity, malformed cleanup, command palette, inference totals, and stale ownership suites pass | preview unavailable before tab access | verified with component integration debt |
| F15 | preserve and rebuild | outbox, reconciliation, diagnostics, recovery, compression | restart and reconnect semantics remain durable | outbox hydration and settlement projection, synchronization, supervisor, diagnostics, compression, browse, and full acceptance benchmark pass | preview unavailable before tab access | verified, mobile documentation pending |

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
| Sidebar V2 switch and V1 rollback | local web | settings, hydration, route selection, and V1 fallback suites pass | collaborative preview returned `Auth required` before tab access | automated only |
| Reconnect and durable send | local server and web | full acceptance benchmark completed 10 reconnects, 30 contiguous replay events, 10 accepted queued turns, and zero duplicate receipts | collaborative preview returned `Auth required` before tab access | benchmark verified |
| Git project surface | isolated local repository | focused Git and source-control suites pass against local repositories | no remote mutation and collaborative preview returned `Auth required` | automated only |
| Virtual plan preview and source return | local web | plan route, virtual document, save, copy, download, and source-return suites pass | collaborative preview returned `Auth required` before tab access | automated only |
| Project header and right-panel surfaces | local web | exact project identity, stale ownership, Git panel, and inference suites pass | collaborative preview returned `Auth required` before tab access | automated only |
| Desktop pairing and secure storage capability | packaged desktop | desktop launch, encrypted catalog, capability failure, release, and packaged AppImage smoke pass | collaborative preview returned `Auth required`; host Secret Service may constrain positive storage use | automated only |

## Review Lanes

| Lane | Scope | Reviewer | Status | Findings |
| --- | --- | --- | --- | --- |
| Contracts and resilience | F4, F8, F12, F15 | fresh reviewer | complete | one outbox settlement boundary defect fixed |
| Desktop, auth, relay, and release | F1, F2, F3, F10, F13 | fresh reviewer | complete | screenshot capability, bounded probe, and secure-storage presentation defects fixed |
| Git and source control | F5, F6, F7, F11 | fresh reviewer | complete | promotion lifecycle coverage closed; no authority defect |
| Markdown and projects | F9, F14 | fresh reviewer | complete | no runtime defect; integration debt recorded |
| Cross-domain closure | all invariants and evidence | fresh reviewer | complete | no material runtime finding |

## Gate Evidence

| Gate | Result | Evidence Date | Notes |
| --- | --- | --- | --- |
| Frozen install | passed | 2026-07-30 | all 16 workspaces installed from the committed lockfile under Node 24 |
| Format | passed | 2026-07-30 | definitive `pnpm fmt` completed on 2235 files |
| Lint | passed | 2026-07-30 | `pnpm lint` completed with only the known warning set |
| Type check | passed | 2026-07-30 | all 15 workspace type checks passed |
| Native mobile static check | passed | 2026-07-30 | source checks passed; unavailable host SwiftLint, ktlint, and detekt were reported as skips |
| Full tests | passed | 2026-07-30 | mobile 482, scripts 122, relay 201, desktop 365, web 1561, and server 1508 with 7 expected skips |
| Production build | passed | 2026-07-30 | web, marketing, server, and desktop production inputs built successfully |
| Desktop build | passed | 2026-07-30 | web, server, and Electron main and preload bundles built successfully |
| Desktop launch smoke | passed | 2026-07-30 | local Electron smoke reached the expected launch boundary |
| Release smoke | passed | 2026-07-30 | isolated frozen install and release safety checks passed |
| Linux desktop distribution | passed | 2026-07-30 | final integrated local unsigned `0.0.30` x64 AppImage built successfully |
| Packaged artifact smoke | passed | 2026-07-30 | final `260268475` byte executable AppImage reached ordered readiness, attested cleanup, left no packaged process, and has SHA-256 `f03e6c0d1324f6f70169b75d53d83a29828534cc2cf80835e2e19f2c32aa6b61` |
| Connection resilience benchmark | passed | 2026-07-30 | final gzip wire bytes `55854990` versus identity `8037704160`; p95 `2640 ms` versus `3461 ms`; replay contiguous and receipts unique |
| Isolated runtime startup | passed | 2026-07-30 | all migrations completed, server listened on port `14773`, and web served on port `8734` from a fresh data directory |
| Origin write authority | passed | 2026-07-30 | exact origin is the only writable remote and upstream push is `DISABLED` |
| Hosted workflow authority | passed | 2026-07-30 | desktop, server image, and mobile mutation jobs require exact `JerkyTreats/t3code` identity |
| Collaborative preview | environment limited | 2026-07-30 | both status and open calls returned `Auth required` before a browser tab was available |

## Review Findings

| Id | Severity | Domain | Finding | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | high | Codex provider | initialize version probe retained unbounded stdout and stderr | fixed | `e7ab498b1` | bounded 16 KiB prefixes, full stream drain regression, full gates |
| R2 | medium | desktop screenshot | Linux preload exposed capture without a supported adapter | fixed | `b6986936e` | supported and unsupported host capability tests, full gates |
| R3 | medium | secure storage | catalog registration failure lacked typed actionable Secret Service presentation | fixed | `b6986936e` | legacy boolean IPC retained, typed mapping and remediation tests, full gates |
| R4 | medium | sidebar settlement | durable local user intent did not prevent visual settlement while offline | fixed | `583afbf68` | exact identity, hydration fail closed, acknowledgement reconciliation, both sidebar paths, full gates |
| R5 | coverage | Git promotion | complete backup, merge, target push, cleanup, and conflict sequence lacked direct server coverage | fixed | `36160d5e3` | 61 GitManager tests and full server suite |

## Deferred Findings

| Id | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| D1 | product map | snooze workflow | explicitly deferred | future product work | not required for Sidebar V2 |
| D2 | product map | remote self-update | explicitly deferred | future release work | local update behavior remains in scope |
| D3 | P9 desktop audit | live theme watcher change and recovery lacks a direct regression | runtime source and renderer projection suites pass | desktop follow-up | manual host switching is blocked by preview authentication |
| D4 | P9 Markdown audit | Mermaid, safe HTML, image lightbox, external shell navigation, outline interaction, and overflow lack one direct renderer integration suite | lower-level parsing, routing, containment, range, and reveal contracts pass | web follow-up | no runtime defect found |
| D5 | P9 source-control audit | provider clone and publish dialogs lack a complete rendered interaction suite | provider, repository service, origin authority, and command identity suites pass | web follow-up | no authority defect found |
| D6 | P9 project audit | Sidebar V1, Sidebar V2, and command palette lack one shared launcher convergence component test | exact environment and project identity helpers and stale ownership suites pass | web follow-up | no runtime defect found |
| D7 | P9 composer audit | stash restore through offline enqueue, restart, and reconnect lacks one end-to-end browser test | stash, draft, outbox, restart, reconnect, and acceptance benchmark suites pass independently | web follow-up | provider identity boundaries are preserved |

## Governance Blocker

- P7 and P8 feature specs are reconciled in their isolated worktrees.
- The matching `patch.md` changes require explicit Policy Proposal Flow confirmation before edit and commit.
- P9 may run every non-governance gate while that confirmation is pending.

## Closeout

- Runtime preservation is verified across F1 through F15.
- All required source, build, desktop, release, artifact, benchmark, isolated startup, and origin-authority gates pass.
- Fresh feature and cross-domain reviews have no open material runtime finding.
- The final local AppImage is at `release/p9-final-linux-x64/T3-Code-0.0.30-x86_64.AppImage`.
- Program documentation closeout remains blocked only on explicit Policy Proposal Flow confirmation for the required matching `patch.md` reconciliation.
