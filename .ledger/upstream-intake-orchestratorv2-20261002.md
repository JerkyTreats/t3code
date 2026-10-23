# Orchestrator v2 intake evidence

Date: 2026-10-02
Status: complete for local source intake
Branch: `reconcile/orchestratorv2-20261002`

## Accepted source boundary

The intake preserves active fork outcomes on upstream orchestration v2. Superseded v1 engines, deciders, projectors and provider adapters remain deleted. Current v2 contracts, thread items, runs, projections and provider lifecycle carry ordinary execution. Independent fork owners carry exact-origin identity, external Admin, Board, retained client presentation, desktop identity and Thread.

Source pins:

- Local fork source: `5a601380335abf2beb4cd86fec25d297e8489802`.
- Accepted remote origin: `f7b63a31802c30d7f70f833d64c8efffb1d429c6`.
- Previous upstream ancestor: `0fcd5f90611451cca842689faea53b5450c022da`.
- Accepted upstream target: `cc1e634bfa62edd56ff792eea666e436fdef788f`.
- V2 introduction within that target: `de34391427`.

The local workflow is merge and repair with upstream-first replay. No remote mutation, runtime deployment, client installation or live-state access occurred. No retired feature was reactivated. The factual patch-guide update received explicit user approval before editing; no governance rule changed.

Delivery follows the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md), with [upstream reconciliation](../governance/upstream_merge_policy.md), [fork isolation](../governance/fork_isolation_policy.md) and [commit policy](../governance/commit_policy.md) controlling acceptance.

## Preservation record

The controlling scratch record and immutable baseline were frozen before broad implementation. The baseline SHA256 is `1d7dc3a6d30d9ff624cf3d15d76a2bf5496aa96e6b9ed53bb515d9bd073fade8`. The pre-implementation additive attribution snapshot SHA256 is `5c5e359584deb44bec2a737e64109626c6d77f5609b6ef3d3da0c255ffb47211`.

The denominator contains 94 protected decisions across 17 active concerns, 209 selected source units and 186 overlaps. The raw intake diagnostic was 2097 incoming paths and 107 conflicted paths. Additive current-owner evidence retains every selected identity. Ambiguous reference-corpus basename matches receive zero fork ownership credit. Baselines were not rewritten to erase gaps.

Exact semantic source-unit review is divided into 74 client, 57 authority, 13 persistence, 40 runtime and 25 remaining units. All 209 units have accepted fresh review receipts with zero duplicates, frozen-hash mismatches, current-source hash mismatches or blocking units. All 94 direct decision outcomes passed separate owner and boundary review; all 186 overlap declarations match the frozen denominator. Source labels and passing aggregate tests do not by themselves establish mechanical conflict resolution.

## Current owners and integrated behavior

| Area               | Durable decision and current integration                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence        | `ForkMigrationPlan.ts` retains identities through 67 and appends upstream bodies at 68 and 69 plus Board index 70. Source validation precedes copied-database publication and journal creation. Historical events, receipts, fingerprints and referenced attachments remain available. |
| Exact origin       | Origin policy owners bind provider refinement and batched reads to the live repository. Created PR links validate native URL identity, exact ports and full Azure selectors. Publication and acquisition retain origin-only and registry-free rules.                                   |
| Admin              | Environment authority owners retain the six-route portal boundary, exact revocation, per-RPC admission and one-use tickets. Current HTTP and WebSocket adapters consume those owners.                                                                                                  |
| Board              | Independent SQL command/projection/query owners commit global application events and receipts atomically. Board subscriptions remain bounded and independent of thread lifecycle. Dedicated Board MCP remains separate from ordinary orchestration tools.                              |
| Provider admission | `TurnWritePolicy.ts`, `TurnWritePolicyV2.ts` and `EventSinkAdmission.ts` retain Plan denial through preparation, queueing, native work and ambiguous writes. Credential transitions reconcile authoritative persisted runs and in-flight proposals before restoring writes.            |
| Collective         | Current Codex native turn context carries root-submit instructions and restores them after compaction. Server credentials retain capability authority; prompt participation is advisory and not exactly-once execution.                                                                |
| Clients            | Retained context bytes survive v2 dispatch, queued edits and plan follow-ups. Theme, screenshot, Mermaid and preview owners use current upstream adapters. Board and Thread consume current shared client projections.                                                                 |
| Desktop and Thread | Managed profile selection precedes ordinary v2 profile fallback. Trusted creation surfaces persist and import without classifying old unmarked histories or inheriting parent classification. Current title formatting consumes latest-run state.                                      |
| Release            | Exact-source release identity and private server packaging remain. Minimal SSH runtime helpers support preinstalled runtimes without registry acquisition. Workflow scanners enforce publication boundaries.                                                                           |

## Compatibility boundary

WebSocket contracts and persisted runtime semantics change to v2. Update server and clients together. Desktop source and IPC typechecks are source evidence; no installed client interoperability is claimed. Browser state follows current upstream v2 hydration and projection behavior, without a promise that old transient execution state survives.

V2 initializes from a one-time snapshot. Stop V1 before starting V2 and keep only one writable runtime active. This is an operator precondition, not automatic concurrency enforcement. Copied authentication sessions, managed-device state and grants become independent after the snapshot. Before rollback, reconcile revocations and grant consumption; the older database does not contain subsequent v2 writes. Shared settings, workspaces and attachments are not fully covered by database rollback.

Supported legacy shell and message history is imported. Historical run, tool, approval, plan and checkpoint timelines are not converted into v2 items. Retained legacy storage supports recovery and must not be treated as a live second writer.

## Verification and review

The implementation used disjoint GPT-6.1 Sol worker scopes. Fresh review separately covered clients, exact-origin/release authority, Board/provider lifecycle, and persistence/Admin. Final source-unit review was completed separately from those broad correctness reviews.

Review corrections include concurrent Plan admission readiness, overlapping rejection, held Plan restart hydration, native Claude Board instructions, absent failed-proposal recovery, fail-closed persisted-run reads, exact-origin refinement, custom-port/Azure PR matching, minimal SSH runtime dispatch and authority-safe migration guidance. Imported ACP threads now preserve authenticated creation surfaces. Board panel selection, migration and exclusivity moved into a durable owner after exact source review. No blocking finding was waived.

| Check                      | Current evidence                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                 | `pnpm fmt` passed on the final source candidate.                                                                                                                                                                                                                                                                                                                                                     |
| Lint                       | `pnpm lint` passed on the final source candidate.                                                                                                                                                                                                                                                                                                                                                    |
| Typecheck                  | `pnpm typecheck` passed across all 16 workspaces on the final source candidate.                                                                                                                                                                                                                                                                                                                      |
| Tests                      | `pnpm test` passed all 15 workspaces: 20620 tests passed and 26 skipped across 1631 passing files. After the final web-only owner extraction, the complete web suite passed 6017 tests across 464 files, adding one regression. The unchanged final server suite passed 6377 tests. Every workspace was tested against its final source, with the last web change covered by the complete web rerun. |
| Native mobile static check | `pnpm lint:mobile` passed. SwiftLint, ktlint and detekt were unavailable and explicitly skipped.                                                                                                                                                                                                                                                                                                     |
| Build                      | `pnpm build` passed on the final source candidate. Optional X11 and CJS import-meta warnings remain build limitations.                                                                                                                                                                                                                                                                               |
| Release safety             | `pnpm test:release-safety` passed.                                                                                                                                                                                                                                                                                                                                                                   |
| Synthetic runtime          | The final built server reached command readiness on loopback with a fresh private home and served bundled HTML with HTTP 200. The owned process was stopped.                                                                                                                                                                                                                                         |

No browser, Electron window, native mobile client, installed artifact or production runtime acceptance is claimed. Focused tests use synthetic data. No additional dependencies were installed for unavailable native lint tools.

## Commit Effect

If applied, this commit runs the fork on orchestration v2 while preserving its repository authority, Board, Admin, desktop and client behaviors and defining the supported history migration boundary.

## Delivery state

The containing merge commit delivers the verified source intake. The pre-intake source is preserved on `baseline/pre-orchestratorv2-20261002`. Publication, installation and deployment require separate authorization.
