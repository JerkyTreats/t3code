# Implementation Ledger

Date:
Branch: product/v0.0.30-origin-rebuild
Commit Policy:
Objective: Reconcile v0.0.30 inline file links and diff stability while preserving fork document rendering, virtual plan preview, project surfaces, environment-aware navigation, and inference metrics.
Status: planned

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
- integrated P2 context-window trimming and P6 shared navigation

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
| Conservative inline file links | v0.0.30 and F09 | pending | pending | selected for path classifier inputs | pending | planned |
| Rich document preservation | F09 | current renderers | pending | selected for mixed markdown blocks | F09 | planned |
| File and diff stability | v0.0.30 and F09 | pending | pending | selected for navigation sequences | pending | planned |
| Virtual plan behavior | F09 | current route state | pending | selected for save and close ordering | F09 | planned |
| Concrete project identity | F14 | pending P5 and P6 | pending | selected for environment changes | F14 | blocked |
| Safe stale project recovery | F14 | pending | pending | selected for bootstrap ordering | pending | planned |
| Context-window latest row | F15 and P2 | integrated server behavior | pending | selected for row order | F15 | planned |
| Inference metric integrity | F14 | current dashboard | pending | selected for usage magnitudes | F14 | planned |

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

- Inline code classification is additive to chat markdown and does not replace document rendering.
- Code files remain code previews and never enter rendered-document mode.
- Nested document links resolve from the document working directory while retaining workspace-root metadata.
- Project Git must remain usable with only environment and project identity.
- Cached input is counted once and magnitude formatting covers `K` through `Q`.

## Closeout
