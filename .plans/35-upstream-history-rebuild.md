# Upstream History Rebuild

Date: 2026-07-12
Status: in progress

## Objective

Rebuild the fork so current fork-owned behavior sits on current upstream Git history without retaining the synthetic `v0.0.28` snapshot import in the accepted ancestry.

## Source Plan

- Fork contract index: `patch.md`
- Feature contracts: `fork/F01` through `fork/F14`
- Prior intake evidence: `.plans/33-upstream-intake-v0.0.28.md`

## Program Branch

- Branch: `rebuild/upstream-main-20260712`
- Worktree: `/home/jerkytreats/t3code-upstream-rebuild`
- Upstream base: `c1ec1915fc16f3dc1ec5d47d9a97f6210a574526`
- Preserved origin tip: `4116afba4d1500d16812f978c374bf26a5d71764`
- Local archive: `archive/pre-upstream-rebuild-20260712`
- Synthetic delta: `834f881a3015793ec699fa4f6565fa35a6341e10`

## Commit Policy

- Use focused conventional commits.
- Keep upstream read only.
- The user directly authorized rebuilding fork behavior on upstream history for this operation.
- Do not push or replace `origin/main` without a separate explicit push decision.

## Phase Inventory

| Id | Summary | Status | Dependencies | Evidence |
| --- | --- | --- | --- | --- |
| P0 | Preserve and verify BranchToolbar work | complete | none | `4116afba4`, focused web suite passed |
| P1 | Replay complete fork tree delta from `v0.0.28` onto current upstream | in progress | P0 | dry run retained 366 fork changed files with 22 conflicts |
| P2 | Resolve upstream overlap conflicts | ready | P1 | conflict list captured by `git merge-tree` |
| P3 | Validate `F1` through `F14` behavior and update stale contracts | blocked | P2 | all feature contracts reviewed |
| P4 | Run repository gates | blocked | P3 | required gates recorded below |
| P5 | Run fresh program review and close findings | blocked | P4 | review packets pending |
| P6 | Prepare local main replacement | blocked | P5 | push remains outside current authorization |

## Dependency Graph

- `P2 -> P1` because conflicts exist only after replay starts.
- `P3 -> P2` because feature evidence must inspect the resolved tree.
- `P4 -> P3` because full gates validate the accepted feature surface.
- `P5 -> P4` because reviewers need final gate evidence.
- `P6 -> P5` because accepted history must pass all reviews first.

## Wave Plan

- Wave 1: preserve the fork delta and resolve the 22 overlapping paths.
- Wave 2: verify feature groups `F1` through `F7` and `F8` through `F14` against the resolved tree.
- Wave 3: run all repository gates, fresh reviews, and fixes.
- Wave 4: move local `main` only after reconciliation is clean.

## Agent Strength Plan

| Lane | Strength | Rationale | Selector |
| --- | --- | --- | --- |
| History topology | maximum | ambiguous destructive history reconstruction | unavailable |
| Feature map `F1` through `F7` | standard | bounded contract and file mapping | unavailable |
| Feature map `F8` through `F14` | standard | bounded contract and file mapping | unavailable |
| Conflict implementation | maximum | cross-domain merge resolution | unavailable |
| Fresh review | standard | bounded findings-only review lanes | unavailable |

## Shared Contract Decisions

- Treat `v0.0.28` as the content merge base because the prior replay targeted that tag.
- Treat current upstream `c1ec1915f` as the accepted ancestry base.
- Apply the final fork tree delta as a three-way replay instead of replaying the old 115-commit graph.
- Preserve fork behavior from `patch.md` and `F1` through `F14` while accepting later upstream changes outside those contracts.

## Wave Execution Log

- Verified `origin` as `JerkyTreats/t3code` and kept `upstream` read only.
- Preserved the old fork tip on `archive/pre-upstream-rebuild-20260712`.
- Created synthetic delta `834f881a` with `v0.0.28` as its parent and the current fork tree as its content.
- Created the isolated reconstruction worktree at current upstream commit `c1ec1915f`.
- Dry-run three-way replay reported 22 conflicts and a resolved candidate delta of 366 files.

## Gate Evidence

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| BranchToolbar focused test | `pnpm --filter @t3tools/web test -- BranchToolbar.logic.test.ts` | passed | 167 files and 1397 tests |
| Format | `pnpm fmt` | pending | required final gate |
| Lint | `pnpm lint` | pending | required final gate |
| Typecheck | `pnpm typecheck` | pending | required final gate |
| Test | `pnpm test` | pending | required final gate |
| Mobile lint | `pnpm lint:mobile` | pending | required because native mobile differs |

## Review Findings

No findings yet.

## Phase Completion Matrix

| Feature group | Implementation | Tests | Review | Status |
| --- | --- | --- | --- | --- |
| `F1` through `F7` | pending | pending | pending | in progress |
| `F8` through `F14` | pending | pending | pending | in progress |
| Later upstream changes | accepted as base | pending | pending | in progress |

## Risks And Exceptions

- The old fork tree differs from `v0.0.28` across hundreds of paths. Automated replay must not silently revert later upstream behavior.
- The current upstream tip includes large Android and connectivity changes after `v0.0.28`.
- Replacing remote `origin/main` will require a destructive force push and is not yet authorized.

## Final Reconciliation

Pending replay, gates, fresh review, and local main preparation.
