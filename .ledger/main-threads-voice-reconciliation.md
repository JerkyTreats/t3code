# Main, Threads, And Voice Reconciliation Ledger

Date: 2026-09-13
Program branch: `main`
Commit policy: Conventional commits under `governance/commit_policy.md`
Status: source sealed for operational alignment

## Objective

Make `main` the single canonical branch containing the accepted T3 Threads and voice activation work, retain meld integration as a separate branch rebased onto that canonical main, align staging and production with the resulting exact main commit, and publish only `main` to the exact `origin` remote.

## Objective Baseline

- Requested outcome: canonize T3 Threads and voice activation on `main`, keep meld separate on top of final main, align staging and production with final main, and push final main to `origin`
- Acceptance evidence: exact ancestry and tree checks for each accepted feature lane, a clean final main worktree, repository gates `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`, native mobile lint for voice, staging HTTPS plus HMR verification, immutable production build and smoke verification, exact `origin/main` equality, and production HTTPS bundle equality
- Explicit non goals: intake of the newly fetched upstream main, deletion of unrelated branches or worktrees, mutation of upstream, cleanup of unrelated dirty worktrees, and retirement of historical checkpoints
- Applicable policies: `AGENTS.md`, `governance/commit_policy.md`, `governance/upstream_merge_policy.md`, `governance/fork_isolation_policy.md`, `governance/privacy_and_publication_policy.md`, `patch.md`, and the deployment skill safety rules
- Completion point: local `main`, `origin/main`, staging source, and the production immutable deployment resolve to one verified commit while meld remains separate and based on that commit

## Source Plan

The user request on 2026-09-13 is the controlling source.

## Program Branch

The existing local `main` worktree is the central integration lane. A temporary reconciliation worktree provides independent review and verification.

## Commit Policy

Preserve existing atomic feature commits where practical. New reconciliation commits use conventional commit subjects and carry their exact commit effects in this ledger.

## Phase Inventory

| Id  | Summary                                                     | Status   | Dependencies | Write Scope                                 |
| --- | ----------------------------------------------------------- | -------- | ------------ | ------------------------------------------- |
| P1  | Establish canonical main baseline and accepted feature tips | complete | none         | Git graph and ledger                        |
| P2A | Canonize the completed T3 Threads work                      | complete | P1           | Local main worktree                         |
| P2B | Rebase and integrate complete voice activation              | complete | P2A          | Voice and reconciliation worktrees          |
| P3  | Rebase meld integration onto final main                     | ready    | P2B          | Meld branch and worktree                    |
| P4  | Run repository and preservation gates                       | complete | P2B          | Verification only                           |
| P5  | Publish exact origin main                                   | ready    | P4           | Exact origin main                           |
| P6  | Align and verify staging                                    | ready    | P5           | Canonical staging source and service        |
| P7  | Build, activate, and verify production                      | ready    | P5           | Immutable deployment and production service |

## Dependency Graph

- `P2A -> P1` because the exact completed Thread change set had to be recovered before committing it
- `P2B -> P2A` because voice overlaps the composer and patch guide and must be replayed after Thread presentation
- `P3 -> P2B` because meld must be based on final main
- `P4 -> P2B` because gates must exercise the integrated tree
- `P5 -> P4` because only a verified tree may be published
- `P6 -> P5` because staging must run the exact final main commit
- `P7 -> P5` because production must be built from the exact final main commit

## Wave Plan

- Wave one: parallel read-only audits for main, T3 Threads, voice activation, and meld
- Wave two: commit the completed Thread slice and replay voice on top
- Wave three: repository gates plus fresh objective and integration reviews
- Wave four: origin publication, staging alignment, and immutable production deployment

## Agent Strength Plan

- Read-only branch audits use bounded explorer agents with inherited strength because selector tuning is not needed for narrow Git evidence
- Integration, conflict resolution, promotion, and deployment remain central
- Final objective and operational reviews use fresh-context reviewer agents

## Shared Contract Decisions

- Current local main `aabd8c3866` already contains the accepted T3 Thread rebuild and is one Mermaid performance commit beyond `origin/main`
- The historical `feature/t3-thread` and worker refs are evidence, not merge inputs, because current main carries the rebuilt accepted architecture
- The full voice candidate is `b77730508b`, ten commits beyond `origin/main` and three commits beyond the currently published voice branch
- The meld branch has no commits beyond local main and its dirty tree is byte-for-byte equal to the recovered T3 Threads change set

## Wave Execution Log

- Wave one established exact origin and disabled upstream publication
- The live T3 journal tied the requested Thread lane to the main promotion worktree
- The main promotion and meld worktrees produced the same stable binary patch and identical untracked file contents
- Voice has a clean worktree and a conflict-free Git merge preview against the pre-Thread main baseline
- The recovered Thread work was committed as `e921b9b898`
- The complete voice tip `b77730508b` merged without textual conflicts
- Semantic inspection confirmed that the combined composer retains Thread presentation, `threadClient`, voice lifecycle control, and `voiceControls`

## Gate Evidence

- Recovered Thread slice: `pnpm fmt`, `pnpm lint`, and `pnpm typecheck` passed
- Recovered Thread slice: `env -u NODE_ENV pnpm test` passed after excluding the production service environment inherited by this turn
- Integrated Thread and voice tree: focused web, mobile, server, and script tests passed
- Integrated Thread and voice tree: `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm lint:mobile`, and `env -u NODE_ENV pnpm test` passed
- Mobile native lint reported the existing host-tool caveat that SwiftLint, ktlint, and detekt are unavailable

## Commit Effects

### T3 Threads

If applied, this commit makes T3 Thread launches reuse verified pre-expanded release code while keeping each client process and writable state independent, adds startup measurement and integrity tooling, and keeps compact Thread controls beside the shared composer.

### Voice Activation

If applied, this commit canonizes opt-in device-local voice input and spoken replies across supported clients while preserving the T3 Thread composer presentation and independent startup behavior.

## Review Findings

- Fresh integration review approved the staged tree with no findings. It verified exact preservation of non-overlap blobs and both feature contracts in `ChatView.tsx`, `ChatComposer.tsx`, and `patch.md`.
- Fresh operational review approved the origin and fast-forward topology while requiring a conventional merge subject, recoverable Meld and staging snapshots, and atomic production symlink activation with automatic rollback.
- Those operational requirements are incorporated into the final execution plan.

## Deferred Findings

Unrelated dirty worktrees and newly available upstream revisions are outside this reconciliation.

## Phase Completion Matrix

- P1 complete with Git graph, worktree, live journal, patch identity, and remote identity evidence
- P2A complete with commit `e921b9b898`
- P2B is complete with semantic inspection, fresh approval, and all selected gates passing
- P4 is complete with the full repository and mobile gates passing
- P3, P5, P6, and P7 are ready and must target the sealed merge commit exactly

## Risks And Exceptions

- The current agent runs inside `t3code-host.service`, so production activation must be scheduled out of band and will terminate this turn.
- Several unrelated worktrees contain user changes and will not be cleaned or rewritten.

## Final Reconciliation

The source reconciliation is sealed by the conventional voice merge commit that follows this ledger update. Mutable environment evidence is intentionally recorded in the activation logs and final operator handoff so no post-publication documentation commit can change the canonical release SHA.

## Deliverable Closeout

Source implementation and review are complete. The remaining operations are constrained to recoverable ref alignment, exact origin publication, staging verification, and immutable production activation of the sealed commit.
