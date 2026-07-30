# Implementation Ledger

Date: 2026-07-30
Branch: product/v030-p7
Commit Policy: `governance/commit_policy.md`
Objective: Reconcile v0.0.30 inline file links and diff stability while preserving fork document rendering, virtual plan preview, project surfaces, environment-aware navigation, and inference metrics.
Status: verified

## Objective Baseline

- requested outcome: Reconcile v0.0.30 inline file links and diff stability while preserving fork document rendering, virtual plan preview, project surfaces, environment-aware navigation, and inference metrics.
- acceptance evidence: Inline code paths link conservatively without touching fenced code or existing links, file and diff panels retain navigation state, document and virtual plan behavior remain protected, project Git stays usable without an active thread, stale project surfaces degrade safely, inference totals remain correct, focused and full gates pass, fresh review passes, and accepted work is locally committed.
- explicit non goals: No Sidebar architecture changes, no Git mutation policy changes, no provider runtime changes, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F09, F14, F15, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F09-rich-markdown-and-interactive-document-rendering.md`
- `fork/F14-project-management-and-inference-dashboard.md`
- `fork/F15-connection-resilience-and-offline-send-durability.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- upstream read-only evidence commit `55dd01612` for inline code file paths
- upstream read-only evidence commit `3c50a6488` for diff panel scroll stability
- integrated P6 shared navigation and Sidebar V2 at program commit `6dd90deba`
- read-only upstream evidence commit `5fcdefd05` for latest resolvable context-window projection rows

## Vertical Plan

1. Add conservative inline-code path classification to the current chat markdown pipeline.
2. Exclude fenced code, existing links, unsafe targets, and non-workspace paths.
3. Preserve document headings, Mermaid, images, outline, safe HTML, nested link resolution, code copy, highlighting, and footer policy.
4. Reconcile file panel line reveal and rendered state without defaulting documents to source.
5. Apply stable diff virtualizer metrics and verify navigation does not jump.
6. Preserve virtual plan copy, download, explicit save, close, route return, and hidden source footer.
7. Preserve project Git and Inference descriptors over concrete environment plus project identity.
8. Clear stale project surfaces and return to a safe launcher or missing-project state.
9. Verify context-window trimming retains the latest row and provider totals without double counting.
10. Run focused markdown, file, diff, plan, project, and inference tests.
11. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P7a owns chat markdown inline file paths and shared link classification tests.
- P7b owns file panel, diff virtualizer, plan preview, and document preservation tests.
- P7c owns project surface stale-state recovery and inference preservation.
- P7a and P7b may run in parallel after P6 navigation is integrated.
- P7c begins after P5 project Git identity and P6 launcher convergence are integrated.
- Shared markdown links, route state, right-panel descriptors, and feature docs are reconciled centrally.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Markdown links | inherited frontier model | Classification must avoid changing existing rich rendering | yes | fenced code or Mermaid becomes interactive |
| File and diff panels | inherited frontier model | Virtualization metrics and route state are sensitive to timing | yes | navigation scroll state jumps |
| Project and inference | frontier model with high reasoning | Environment identity and usage accounting cross several adapters | yes | project Git requires an active thread |
| Fresh review | frontier model with fresh context | Rendering safety and metric correctness need independent review | yes | safe HTML or usage total regression |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Conservative inline file links | v0.0.30 and F09 | `ChatMarkdown.tsx` and `markdown-links.ts` | focused Markdown tests and full web suite | path, parser, raw HTML, and containment cases | F09 and `patch.md` | verified |
| Rich document preservation | F09 | existing document renderer retained around additive link behavior | focused Markdown tests and full web suite | mixed Markdown blocks and raw HTML cases | F09 | verified |
| File and diff stability | v0.0.30 and F09 | file reveal ownership helpers and stable diff metrics | focused file, panel-store, and diff tests | reveal replay and navigation sequences | F09 and `patch.md` reconciled | verified |
| Virtual plan behavior | F09 | plan document action ordering and route return | focused plan document tests and full web suite | save, close, and hidden-footer cases | F09 and `patch.md` reconciled | verified |
| Concrete project identity | F14 | exact environment plus project surface descriptors | focused project route and store tests | environment and project mismatch cases | F14 and `patch.md` | verified |
| Safe stale project recovery | F14 | bootstrap reconciliation and synchronous render guards | focused project route and store tests | stale bootstrap and missing-project cases | F14 and `patch.md` | verified |
| Context-window latest row | F15 and P2 | bounded contiguous projection suffix | 12 focused server tests and full server suite | malformed, paged, null-turn, and byte-limit rows | F15 and `patch.md` | verified |
| Inference metric integrity | F14 | processed totals with cached input subset classification | focused inference tests and full web suite | cached and provider total magnitudes | F14 and `patch.md` | verified |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P7 integration | `/home/jerkytreats/t3code-v030-p7` | `product/v030-p7` | complete | current documentation closeout | central documentation reconciliation, final gates, and review |
| P7a Markdown links | `/home/jerkytreats/t3code-v030-p7-markdown` | `product/v030-p7-markdown` | complete | `64670eb32` through `9719718f1` | conservative inline path classification and rich-rendering preservation |
| P7b file and diff panels | `/home/jerkytreats/t3code-v030-p7-files` | `product/v030-p7-files` | complete | `bcb837031` through `85c239ec7` | diff metrics, file reveal, and virtual plan preservation |
| P7c project and inference | `/home/jerkytreats/t3code-v030-p7-projects` | `product/v030-p7-projects` | complete | `900b6facf` through `c9c5e854b` | stale surfaces, inference accounting, and context-row projection |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| Focused web | `pnpm --filter @t3tools/web exec vp test run --project unit ...` | pass, 7 files and 106 tests | 2026-07-30 | Markdown, plan, file, diff, store, project route, and inference integration |
| Focused server | `pnpm --filter t3 exec vp test run src/orchestration/Layers/ProjectionSnapshotQuery.test.ts` | pass, 1 file and 12 tests | 2026-07-30 | initial snapshot and paging retention |
| Web typecheck | `pnpm --filter @t3tools/web typecheck` | pass | 2026-07-30 | serial rerun after a dependency installation race |
| Server typecheck | `pnpm --filter t3 typecheck` | pass | 2026-07-30 | no diagnostics |
| Format | `pnpm fmt` | pass, 2220 files | 2026-07-30 | Node 24 |
| Lint | `pnpm lint` | pass with known warnings | 2026-07-30 | no errors |
| Typecheck | `pnpm typecheck` | pass, 15 workspaces | 2026-07-30 | no errors |
| Test | `pnpm test` | pass | 2026-07-30 | final run has web 1556 tests, server 1504 passed and 7 skipped |
| Visual browser | T3 collaborative preview | blocked by preview authentication | 2026-07-30 | preview status and open both returned auth required |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| P7 start | `ac3c65c80` | integrated | implementation ledger |
| File and diff lane | `bcb837031` through `85c239ec7` | integrated | stable previews, reveal ownership, and plan actions |
| Project and inference lane | `900b6facf` through `c9c5e854b` | integrated | surface reconciliation and snapshot retention |
| Markdown lane | `64670eb32` through `9719718f1` | integrated | contained inline code paths and parser alignment |
| Snapshot review fixes | `089a33425` | integrated | gap-free paging and finite context validation |
| Markdown reveal review fix | `bee7fd774` | integrated | line-qualified Markdown source reveal |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| Markdown helper closure | fresh helper reviewer | complete | none open | final review at helper commit `c7f46d831` |
| File and diff helper closure | fresh helper reviewer | complete | none open | final review at helper commit `c188e7ae6` |
| Project and inference helper closure | fresh helper reviewer | complete | none open | final review at helper commit `8ff6faab6` |
| Integrated P7 | fresh integration reviewer | complete | three closed | raw snapshot boundary, non-finite context, and Markdown line reveal |
| Fix review | fresh fix reviewer | complete | one closed | contiguous initial suffix after superseded context omission |
| Final review | fresh final reviewer | complete | none | 14 server tests, 57 web tests, both package typechecks, and clean diff |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P7-R1 | integrated review | high | `ProjectionSnapshotQuery.ts` | F15 gap-free before-cursor reconstruction | closed | `089a33425` | raw suffix boundary regression |
| P7-R2 | integrated review | medium | `ProjectionSnapshotQuery.ts` | F15 finite usable-context consistency | closed | `089a33425` | `1e999` SQLite regression |
| P7-R3 | integrated review | medium | `FilePreviewPanel.tsx` | F09 line-qualified file reveal | closed | `bee7fd774` | Markdown source reveal tests |
| P7-R4 | fix review | high | `ProjectionSnapshotQuery.ts` | F15 contiguous initial suffix | closed | `089a33425` | preceding plus initial equals full page |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- Inline code classification is additive to chat markdown and does not replace document rendering.
- Code files remain code previews and never enter rendered-document mode.
- Nested document links resolve from the document working directory while retaining workspace-root metadata.
- Project Git must remain usable with only environment and project identity.
- Cached input is counted once and magnitude formatting covers `K` through `Q`.
- Context-window trimming must be rebuilt at the current snapshot projection seam. The earlier ledger assumption that P2 already integrated it was disproved by direct code inspection.

## Closeout

- Runtime changes, focused tests, final full gates, and fresh review are complete.
- T3 collaborative preview could not authenticate, so visual transport evidence remains unavailable.
- The approved central closeout reconciles the matching `patch.md` contract and commits the documentation locally.
