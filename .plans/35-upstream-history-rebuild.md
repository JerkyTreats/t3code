# Upstream History Rebuild

Date: 2026-07-12
Status: review in progress

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
| P1 | Replay complete fork tree delta from `v0.0.28` onto current upstream | complete | P0 | resolved fork delta staged on upstream base |
| P2 | Resolve upstream overlap conflicts | complete | P1 | all 22 overlap paths resolved with no unmerged entries |
| P3 | Validate `F1` through `F14` behavior and update stale contracts | complete | P2 | contracts mapped to rebuilt owner modules below |
| P4 | Run repository gates | complete | P3 | all required gates passed |
| P5 | Run fresh program review and close findings | in progress | P4 | first review packet repaired, central closeout pending |
| P6 | Prepare local main replacement | pending | P5 | final commit and local main decision remain pending |

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
- Applied the resolved fork delta to the reconstruction worktree with no remaining unmerged entries.
- Kept upstream hosted relay deployment, mobile preview deployment, and upstream release automation absent.
- Retained fork-owned desktop artifact, server image, client package CI, and manual mobile production workflows.
- Aligned retained pnpm workflow setup with the repository package manager version `11.10.0`.

## Gate Evidence

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| BranchToolbar focused test | `pnpm --filter @t3tools/web test -- BranchToolbar.logic.test.ts` | passed | 167 files and 1397 tests |
| Format | `pnpm fmt` | passed | full reconstructed tree |
| Lint | `pnpm lint` | passed | full reconstructed tree |
| Typecheck | `pnpm typecheck` | passed | full reconstructed tree |
| Test | `pnpm test` | passed | full reconstructed tree |
| Mobile lint | `pnpm lint:mobile` | passed | required because native mobile differs |

## Feature Reconciliation Evidence

| Feature | Origin implementation decision | Rebuilt owner seam | Verification evidence | Compatibility evidence |
| --- | --- | --- | --- | --- |
| `F1` | override visible desktop and release identity | `packages/shared/src/productIdentity.ts` plus desktop and artifact adapters | product identity, branding, launcher, and artifact tests passed through `pnpm test` | app id and storage identifiers remain stable |
| `F2` | replay local theme projection onto current desktop IPC | desktop theme services plus `apps/web/src/hooks/useTheme.ts` | Omarchy theme source, desktop theme service, and web theme tests passed | additive IPC channels and stable CSS variables retained |
| `F3` | replay direct screenshot attachment on current composer ownership | desktop screenshot service plus composer screenshot helper | screenshot capture, delayed artifact, clipboard fallback, and composer tests passed | desktop capability gate and attachment size checks retained |
| `F4` | override generic composer simplification | composer draft store, rich draft helper, and client runtime path search state | composer draft, editor, rich draft, and attachment tests passed | persisted draft keys and provider selection behavior retained |
| `F5` | replay Git UI through unified right panel without draft ownership | Git panel surface, source control actions, and thread deletion workflow | Git action, branch toolbar, draft preservation, and deletion workflow tests passed | project and thread action boundaries remain distinct |
| `F6` | override provider fallback with origin-only GitHub resolution | source control context policy and GitHub CLI adapter | origin-only policy and GitHub source control tests passed | explicit origin repository target remains required |
| `F7` | override Git mutation semantics with origin-only promotion | Git manager, VCS driver, and promotion policy | promotion policy, Git manager, VCS driver, and branch tests passed | backup, target push, cleanup, close, and discard ordering retained |
| `F8` | replay plan cues on current projection and shell state | projection snapshot query, plan progress helper, and sidebar logic | plan progress, projection snapshot, sidebar, and session logic tests passed | group labels remain presentation-only identifiers |
| `F9` | replay richer document rendering on consolidated preview modules | document renderer, file preview panel, plan document, and route search helper | document markdown, link routing, plan preview, and timeline tests passed | route search degrades safely and external links stay behind supported boundaries |
| `F10` | replay live Codex discovery in current provider layers | Codex provider, Codex session runtime, provider snapshot, and desktop launcher | provider discovery, app server initialization, settings, and launcher tests passed | custom models and explicit binary paths remain preserved |
| `F11` | replay provider-neutral source control on consolidated runtime state | source control registry, repository service, runtime source control state, and web actions | provider registry, repository service, publish, clone, RPC, and web action tests passed | additive RPC and IPC methods retain explicit origin mutation targets |
| `F12` | replay instance identity through provider registry architecture | provider instance registry, provider service, provider snapshots, and web instance helpers | registry, routing, status cache, settings, command, and skill tests passed | legacy provider fallback and unknown instance data remain supported |
| `F13` | replay access management through current RPC and environment clients | auth contracts, server auth handlers, runtime RPC client, and Connections settings | auth store, HTTP, RPC, environment bootstrap, and Connections settings tests passed | current session protection and saved environment flows remain intact |
| `F14` | replay project management as unified right panel surfaces | project management helpers, project status adapter, Git panel, and environment-aware routes | project route, overview, inference, script, sidebar, and right panel tests passed | concrete environment and project identity remain explicit |

## Review Findings

- `DOC-1` repaired release and CI documentation to describe only retained fork automation.
- `DOC-2` replaced stale feature owner paths with current rebuilt modules.
- `DOC-3` updated phase, gate, feature, workflow, and risk evidence in this ledger.
- `DOC-4` remains deferred because `AGENTS.md` architecture guidance requires policy confirmation before editing.
- `DOC-5` replaced Bun operator commands with pnpm and aligned retained workflows to pnpm `11.10.0`.
- Fresh review closeout remains pending.

## Phase Completion Matrix

| Feature group | Implementation | Tests | Review | Status |
| --- | --- | --- | --- | --- |
| `F1` through `F7` | complete | passed | pending central closeout | review in progress |
| `F8` through `F14` | complete | passed | pending central closeout | review in progress |
| Later upstream changes | accepted as base | passed | pending central closeout | review in progress |

## Risks And Exceptions

- The old fork tree differs from `v0.0.28` across hundreds of paths. Automated replay must not silently revert later upstream behavior.
- The current upstream tip includes large Android and connectivity changes after `v0.0.28`.
- Replacing remote `origin/main` will require a destructive force push and is not yet authorized.
- Retained desktop release automation is intentionally limited to unsigned macOS and Linux artifacts. Windows, scheduled nightly, CLI publication, hosted web deployment, relay deployment, and announcements remain absent.
- The server image workflow is retained but a local Docker image build is not part of the recorded repository gate evidence.
- `AGENTS.md` still names pre-rebuild Codex and WebSocket owner modules. Editing it is deferred until the policy proposal flow receives explicit confirmation.

## Final Reconciliation

Replay, feature reconciliation, and required gates are complete. Fresh review closeout, the final reconstruction commit, and local main preparation remain pending.
