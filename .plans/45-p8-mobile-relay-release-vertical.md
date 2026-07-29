# Implementation Ledger

Date:
Branch: product/v0.0.30-origin-rebuild
Commit Policy:
Objective: Reconcile mobile, relay, fork release, workflow, and packaged Linux desktop behavior after all runtime slices integrate.
Status: planned

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
| Mobile contract compatibility | P1 through P7 | pending integrated runtime | pending | selected for legacy decode | pending | blocked |
| Mobile remote flows | F13 and F15 | current adapters | pending | selected for reconnect order | F13 and F15 | planned |
| Relay credential and tunnel lifecycle | F13 and P3 | pending P3 | pending | selected for generation races | F13 | blocked |
| Fork release identity | F01 | current shared identity | pending | not selected | F01 | planned |
| Origin-only workflows | repository policy | current workflows | pending static scan | selected for target variants | policy docs | planned |
| Release metadata and manifests | F01 | current release scripts | pending | selected for version inputs | F01 | planned |
| Unsigned Linux artifact | product map | pending | pending build | not selected | pending | planned |
| Extracted AppImage smoke | product map | pending | pending | selected for process event order | pending | planned |

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

- This wave does not publish a release or mutate any remote.
- Upstream hosted deployment automation remains absent unless separately adopted.
- The artifact smoke uses an isolated temporary user data directory and bounded display service.
- The representative artifact must contain final web assets, fork identity, packaged server entry, and registered patches.
- Remote self-update remains deferred while local updater behavior stays in scope.

## Closeout
