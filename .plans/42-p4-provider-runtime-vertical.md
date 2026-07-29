# Implementation Ledger

Date:
Branch: product/v0.0.30-origin-rebuild
Commit Policy:
Objective: Reconcile v0.0.30 provider instance routing, fallback, model, capability, skill, command, binary, and launch argument outcomes while preserving exact fork instance identity.
Status: planned

## Objective Baseline

- requested outcome: Reconcile v0.0.30 provider instance routing, fallback, model, capability, skill, command, binary, and launch argument outcomes while preserving exact fork instance identity.
- acceptance evidence: Two instances of one driver remain distinct, fallback is deterministic and instance local, no-provider disables dispatch, custom slugs survive, active-instance models and skills drive the composer, selected CLI and binary reach probe and runtime spawn, custom instance lifecycle and legacy snapshots remain compatible, singleton streams do not duplicate, focused and full gates pass, fresh review passes, and accepted work is locally committed.
- explicit non goals: No Sidebar V2 rendering, no prompt stash implementation beyond preservation seams, no Git workflow, no remote self-update, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F04, F10, F12, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F04-provider-preserving-composer-draft-ownership.md`
- `fork/F10-codex-model-and-binary-selection.md`
- `fork/F12-provider-instance-identity-and-runtime-routing.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- upstream read-only evidence commit `b6e1b3933` for no-Codex provider fallback
- upstream read-only evidence commit `4e09cddb4` for stale model reset
- upstream read-only evidence commit `6b9a5987f` for Claude skill discovery
- upstream read-only evidence commit `fa69f05b6` for custom model slugs
- upstream read-only evidence commit `40c0ab088` for Codex launch arguments

## Vertical Plan

1. Audit current contracts, registries, snapshots, provider layers, settings, and composer menus against F10 and F12.
2. Add deterministic provider and exact instance fallback without collapsing driver identity.
3. Add a non-dispatchable no-provider state and preserve provider-local default model reset.
4. Preserve live model and skill discovery, custom slugs, CLI selection, configured binary path, and launch arguments.
5. Add bounded Codex binary discovery across configured path, process path, hydrated desktop environment, and WSL environment.
6. Preserve add, enable, disable, delete, legacy snapshot decode, and unknown instance settings.
7. Keep skill and command insertion draft-only and prevent duplicate singleton adapter streams.
8. Verify prompt stash and durable outbox entries retain provider instance and model intent.
9. Run focused provider, contracts, web, and desktop tests.
10. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P4a owns contracts, provider registry, fallback, snapshot, model, skill, command, and session routing.
- P4b owns Codex binary discovery, CLI version, launch arguments, probe, desktop bridge, and runtime spawn.
- P4c owns web provider selection, no-provider presentation, skill chips, command insertion, and preservation tests.
- P4a and P4b may run in parallel after the P3 desktop binary bridge is integrated.
- P4c begins after P4a finalizes exact instance fallback and capability contracts.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Registry and routing | frontier model with high reasoning | Exact instance identity crosses contracts, sessions, snapshots, and fallback | yes | driver identity collapses across instances |
| Binary and launch | inherited frontier model | Discovery must remain bounded across desktop and WSL | yes | filesystem-wide scan or path drift |
| Web provider UX | inherited frontier model | Active instance state must remain draft and outbox safe | yes | fallback changes provider or model intent |
| Fresh review | frontier model with fresh context | Provider identity and runtime launch need independent boundary review | yes | duplicate streams or unknown settings loss |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Exact instance-keyed routing | F12 | pending | pending | selected for multi-instance sequences | pending | planned |
| Deterministic fallback and no-provider state | F12 and v0.0.30 | pending | pending | not selected | pending | planned |
| Custom models and live capabilities | F10 and F12 | pending | pending | selected for unknown slug preservation | pending | planned |
| Selected CLI, binary, and launch arguments | F10 | pending P3 bridge | pending | not selected | pending | planned |
| Bounded binary discovery | F10 | pending | pending | selected for candidate ordering | pending | planned |
| Custom instance lifecycle and legacy settings | F12 | current contracts | pending | selected for unknown field round trips | F12 | planned |
| Skill and command draft safety | F04 and F12 | current draft seam | pending | not selected | F04 and F12 | planned |
| Durable instance and model intent | F04 and F15 | current outbox seams | pending | selected for retry sequences | F04 and F15 | planned |
| Singleton adapter stream de-duplication | F12 | pending | pending | selected for multi-instance streams | pending | planned |

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

- P4 remains blocked until P3 confirms the desktop binary launch bridge.
- Provider fallback must select an instance first and only then select that instance default model.
- Unknown instance settings and custom model slugs are compatibility data, not validation errors.
- No binary discovery step may scan the whole filesystem.

## Closeout
