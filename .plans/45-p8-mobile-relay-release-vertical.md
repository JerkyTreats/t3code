# Implementation Ledger

Date: 2026-07-30
Branch: product/v030-p8
Commit Policy: `governance/commit_policy.md`
Objective: Reconcile mobile, relay, fork release, workflow, and packaged Linux desktop behavior after all runtime slices integrate.
Status: verified

## Objective Baseline

- requested outcome: Reconcile mobile, relay, fork release, workflow, and packaged Linux desktop behavior after all runtime slices integrate.
- acceptance evidence: Mobile decoders and flows remain compatible, relay credentials and tunnels release correctly, fork identity is present in release artifacts, workflow scans find no upstream write target, release and update manifests pass, an unsigned Linux desktop artifact builds, the extracted AppImage entry passes a bounded headless smoke with backend and renderer markers, focused and full gates pass, fresh review passes, and accepted work is locally committed.
- explicit non goals: No remote release, no remote self-update, no upstream hosted deployment adoption, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F01, F10, F13, F15, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F01-branding-and-release-identity.md`
- `fork/F10-codex-model-and-binary-selection.md`
- `fork/F13-auth-access-management.md`
- `fork/F15-connection-resilience-and-offline-send-durability.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- integrated P1 through P7 contracts and runtime behavior
- retained origin workflows, release scripts, and desktop artifact builder

## Vertical Plan

1. Reconcile mobile decoders with settings, settled, shell, provider, auth, Git, and project contracts.
2. Verify saved environment restore, remote connection, thread selection, and deferred navigation.
3. Verify relay credential validation, managed limits, endpoint generation, tunnel allocation, and shutdown release.
4. Preserve fork identity through desktop package metadata, artifact names, update manifests, and announcements.
5. Scan retained workflows and scripts for upstream write targets and hosted deployment drift.
6. Build one representative unsigned Linux desktop artifact on the current host.
7. Add a root `test:desktop-artifact-smoke` command that extracts the AppImage into a temporary directory.
8. Launch the packaged Electron entry with isolated user data and a bounded virtual display.
9. Require backend-listening and renderer-ready markers, then terminate cleanly and fail on nonzero exit.
10. Run release metadata, packaged layout, mobile, relay, desktop, and workflow tests.
11. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P8a owns mobile compatibility and remote environment flow tests.
- P8b owns relay reconciliation and lifecycle verification after P3.
- P8c owns fork release metadata, workflow scans, artifact build, and extracted AppImage smoke.
- P8a and P8b may run in parallel after P7 contracts settle.
- P8c begins after all runtime slices are integrated so the representative artifact contains the final web and server assets.
- Root package commands, release docs, patch guide, and feature specs are reconciled centrally.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Mobile compatibility | inherited frontier model | Shared schema changes must not drift native state adapters | yes | mobile decode or route failure |
| Relay verification | frontier model with high reasoning | Credential and tunnel lifecycle crosses durable remote state | yes | allocation leak or stale generation |
| Release and artifact | inherited frontier model | Packaged identity and startup need end-to-end host evidence | yes | artifact layout or renderer marker failure |
| Fresh review | frontier model with fresh context | Workflow safety and packaged identity require independent review | yes | any upstream write target |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Mobile contract compatibility | P1 through P7 | additive shared decoders plus extracted exact thread-selection adapter | full mobile suite and compatibility fixtures | legacy catalog, bearer, relay, config, shell, provider, and Git cases | F13 and F15 | verified |
| Mobile remote flows | F13 and F15 | preload-before-navigation coordinator on folder and clone transitions | focused mobile and full repository suites | stale navigation and disconnected environment cases | F13 and F15 | verified |
| Relay credential and tunnel lifecycle | F13 and P3 | integrated P3 runtime with added lifecycle proofs | focused relay and server tests plus full suite | orphan cleanup, active link, paired client, and publish-only cases | F13 | verified |
| Fork release identity | F01 | shared identity with exact origin repository and machine markers | builder, shared identity, and release smoke tests | not selected | F01 | verified |
| Origin-only workflows | repository policy | exact repository guards and least-privilege workflow permissions | workflow safety scan | upstream, GHCR, workflow-set, and permission variants | F01 and repository policy | verified |
| Release metadata and manifests | F01 | tag-derived version with manual override and exact update repository | `pnpm release:smoke` and builder tests | version and repository inputs | F01 | verified |
| Unsigned Linux artifact | product map | representative `0.0.30` x64 AppImage | successful local build | not selected | P8 ledger | verified |
| Extracted AppImage smoke | product map | isolated extraction and launch with ordered markers and descendant identity cleanup | 19 focused tests and real artifact smoke | hostile environment, reversed marker, spoof, nonzero exit, detached descendant, and reused process identity | F01 | verified |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P8 integration | `/home/jerkytreats/t3code-v030-p8` | `product/v030-p8` | complete | current documentation closeout | central reconciliation, combined gates, artifact proof, and review |
| P8a mobile | `/home/jerkytreats/t3code-v030-p8-mobile` | `product/v030-p8-mobile` | complete | `b0bc5ed25`, `7bddccf26`, `67c770d6b`, `aa7934f35`, `6df43e9c9` | mobile contract proof and complete synchronous project navigation ownership |
| P8b relay | `/home/jerkytreats/t3code-v030-p8-relay` | `product/v030-p8-relay` | complete | `972ad590d` | relay production behavior retained with lifecycle compatibility proofs |
| P8c release | `/home/jerkytreats/t3code-v030-p8-release` | `product/v030-p8-release` | complete | `138967b21`, `539570b72`, `b9de0685a`, `70c7ef630` | identity, workflow scan, exact hosted mutation guards, Linux artifact, and identity-safe supervised AppImage smoke |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| P8b relay focused | relay Api and server cloud HTTP tests | pass, 25 tests | 2026-07-30 | orphan allocation, active link, publish-only, and paired-client shutdown |
| P8b relay full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | pass | 2026-07-30 | 15 typecheck workspaces and all suites green |
| P8a mobile focused | mobile typecheck and mobile tests | pass, 80 files and 471 tests | 2026-07-30 | catalog, migration, shell, provider, Git, settlement, and route compatibility |
| P8a native static | `pnpm lint:mobile` | pass with host-tool warnings | 2026-07-30 | optional SwiftLint, ktlint, and detekt tools unavailable |
| P8a mobile full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | pass | 2026-07-30 | 15 typecheck workspaces and all suites green |
| P8c focused release | artifact smoke, builder, workflow safety, and identity tests | pass, 40 tests before hardening and 10 final smoke tests | 2026-07-30 | fresh review regressions included |
| P8c release smoke | `pnpm release:smoke` | pass | 2026-07-30 | version propagation, manifests, workspace fixtures, and workflow scan |
| P8c artifact build | Linux AppImage build for `0.0.30` | pass, 260264222 bytes | 2026-07-30 | `T3-Code-0.0.30-x86_64.AppImage` |
| P8c real artifact smoke | `pnpm test:desktop-artifact-smoke` | pass | 2026-07-30 | backend and renderer markers, clean exit, no surviving packaged process |
| P8c release full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | pass | 2026-07-30 | 2224 files, 15 typecheck workspaces, all suites green |
| P8c hosted mutation follow-up | focused scripts typecheck and release tests | pass, 13 tests | 2026-07-30 | structural workflow rules and exact Discord release URL |
| P8c follow-up release smoke | `pnpm release:smoke` | pass | 2026-07-30 | exact triggers, jobs, permissions, guards, repository, and release tag |
| P8c follow-up full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | pass | 2026-07-30 | scripts 113, web 1556, server 1504 passed and 7 skipped |
| P8a ownership follow-up | mobile typecheck, mobile tests, and `pnpm lint:mobile` | pass, 480 tests | 2026-07-30 | complete destination and folder transition ownership |
| P8a follow-up full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | pass | 2026-07-30 | 2226 files, 15 workspaces, and all suites green |
| P8c cleanup follow-up | artifact smoke tests and real AppImage smoke | pass, 19 tests | 2026-07-30 | pidfd cleanup, private attestation, and no surviving process |
| P8c cleanup full | `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm release:smoke` | pass | 2026-07-30 | scripts 122, web 1556, server 1504 passed and 7 skipped |
| Integrated format | `pnpm fmt` | pass, 2230 files | 2026-07-30 | repeated final Node 24 gate |
| Integrated lint | `pnpm lint` | pass with known warnings | 2026-07-30 | no errors |
| Integrated typecheck | `pnpm typecheck` | pass, 15 workspaces | 2026-07-30 | no errors |
| Integrated native static | `pnpm lint:mobile` | pass with host-tool warnings | 2026-07-30 | generated native projects skipped |
| Integrated test | `pnpm test` | pass | 2026-07-30 | mobile 482, relay 201, web 1556, scripts 122, server 1505 passed and 7 skipped |
| Integrated release smoke | `pnpm release:smoke` | pass | 2026-07-30 | final workflow safety and release metadata verified |
| Integrated real artifact smoke | `pnpm test:desktop-artifact-smoke` | pass twice | 2026-07-30 | exact integrated code, ordered markers, and immediate in-shell process scan clean |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| Relay lifecycle proof | `972ad590d` | integrated | no production change required after P3 audit |
| Mobile compatibility | `b0bc5ed25` | integrated | deferred folder and clone navigation with compatibility fixtures |
| Mobile stale-route fix | `7bddccf26` | integrated | explicit missing environment routes fail closed |
| Release and artifact hardening | `138967b21` | integrated | exact origin, workflow safety, tag version, and extracted AppImage smoke |
| Mobile transition ownership fix | `67c770d6b` | integrated | route context invalidates in-flight destination transitions |
| Hosted mutation hardening | `539570b72` | integrated | structured workflow invariants and exact fork Discord release URLs |
| Mobile browse ownership fix | `aa7934f35` | integrated | complete synchronous transition assumption invalidation |
| Packaged cleanup supervision | `b9de0685a` | integrated | subreaper cleanup with private positive attestation |
| Mobile repository query ownership | `6df43e9c9` | integrated | visible repository edits invalidate lookup and preload publication |
| Packaged process identity safety | `70c7ef630` | integrated | pidfd cleanup removes process-group reuse mutation risk |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| Relay self-review | P8b worker | complete | none | exact origin writable and upstream disabled |
| Mobile self-review | P8a worker | complete | one fixed before commit | route-ref memo stability corrected |
| Mobile and relay fresh review | fresh reviewer | complete | one mobile finding closed | stale explicit environment route fixed in `7bddccf26`; no relay findings |
| Release fresh review | P8c fresh reviewer | complete | four findings closed | environment allowlist, descendant cleanup, ordered markers, and extraction isolation |
| Release follow-up review | P8c fresh reviewer | complete | three findings closed | exact origin guards, fork release URL, and structured workflow scan |
| Integrated P8 review | fresh reviewer | complete | seventeen findings closed | final cross-lane and feature-spec reconciliation is clean |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P8-R1 | mobile and relay review | high | `AddProjectScreen.tsx` | exact environment route identity | closed | `7bddccf26` | 3 regression tests and 474 mobile tests |
| P8-R2 | release review | high | `desktop-artifact-smoke.ts` | packaged smoke credential isolation | closed | `138967b21` | hostile environment and tracing regression |
| P8-R3 | release review | high | `desktop-artifact-smoke.ts` | complete packaged process cleanup | closed | `138967b21` | independent `setsid` descendant regression and real process scan |
| P8-R4 | release review | medium | desktop and web readiness markers | reliable ordered packaged readiness | closed | `138967b21` | spoofed and reversed marker regressions |
| P8-R5 | release fix review | medium | `desktop-artifact-smoke.ts` | extraction credential isolation | closed | `138967b21` | extraction-phase token regression |
| P8-R6 | integrated review | high | `AddProjectScreen.tsx` | stale in-flight environment ownership | closed | `67c770d6b` | environment and source transition invalidation tests |
| P8-R7 | integrated review | high | server image and mobile production workflows | origin-only hosted mutation policy | closed | `539570b72` | exact job guards and workflow permission tests |
| P8-R8 | integrated review | medium | `notify-discord-release.ts` | fork-only release announcements | closed | `539570b72` | repository, URL shape, and tag binding regressions |
| P8-R9 | release fix review | medium | `release-workflow-safety.ts` | scanner bypass resistance | closed | `539570b72` | permissive guard, workflow write, extra job, and alternate trigger regressions |
| P8-R10 | final integrated review | medium | `AddProjectScreen.tsx` | complete mobile transition ownership | closed | `aa7934f35` | 480 mobile tests cover reconnect, base-directory, path, and environment changes |
| P8-R11 | final integrated review | medium | `desktop-artifact-smoke.ts` | complete packaged process cleanup | closed | `b9de0685a` | fast parent exit and confirmed group disappearance regressions |
| P8-R12 | release cleanup review | high | process supervisor | adopted child exhaustion | closed | `b9de0685a` | continuous detached-session race with kernel `ECHILD` proof |
| P8-R13 | release cleanup review | high | artifact smoke failure propagation | retain failure evidence | closed | `b9de0685a` | cleanup failure retains exact temporary evidence path |
| P8-R14 | release cleanup fix review | high | supervisor proof protocol | positive cleanup proof | closed | `b9de0685a` | private fd 3 attestation, unmarked crash, and output overflow regressions |
| P8-R15 | release cleanup fix review | medium | `forceTerminate` timer | prompt smoke shutdown | closed | `b9de0685a` | CLI exits below 3 seconds against a 5 second cleanup bound |
| P8-R16 | closure review | medium | repository destination ownership | visible repository input identity | closed | `6df43e9c9` | 482 mobile tests cover input changes during lookup and preload |
| P8-R17 | closure review | medium | packaged process group identity | avoid reused group mutation | closed | `70c7ef630` | pidfd capture and revalidation plus deterministic Node and Python regressions |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- P8 started from verified P7 runtime commit `173a20957` on the program history.
- This wave does not publish a release or mutate any remote.
- Upstream hosted deployment automation remains absent unless separately adopted.
- The artifact smoke uses an isolated temporary user data directory and bounded display service.
- The representative artifact must contain final web assets, fork identity, packaged server entry, and registered patches.
- Representative artifact: `/home/jerkytreats/t3code-v030-p8-release/release/p8c-linux-x64/T3-Code-0.0.30-x86_64.AppImage`.
- Remote self-update remains deferred while local updater behavior stays in scope.

## Closeout

- Runtime implementation, focused evidence, full gates, release smoke, real AppImage smoke, and fresh closure review are verified.
- Origin remains the only writable remote and upstream push remains disabled.
- No remote publication, release, issue, pull request, or source-control mutation occurred.
- The approved central closeout reconciles the matching `patch.md` preservation contract and commits the documentation locally.
