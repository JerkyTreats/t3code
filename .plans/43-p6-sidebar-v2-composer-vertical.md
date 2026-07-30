# Implementation Ledger

Date: 2026-07-30
Branch: product/v030-sidebar-v2
Commit Policy: `governance/commit_policy.md`
Objective: Mount an optional Sidebar V2 behind a hydration-safe persisted switch while preserving plan progress, concrete project identity, provider-safe drafts, prompt stash behavior, and deferred filesystem navigation.
Status: in progress

## Objective Baseline

- requested outcome: Mount an optional Sidebar V2 behind a hydration-safe persisted switch while preserving plan progress, concrete project identity, provider-safe drafts, prompt stash behavior, and deferred filesystem navigation.
- acceptance evidence: Sidebar V2 defaults off, explicit choices survive restart, V1 remains available, settings hydration never remounts the shell, both sidebars share fractional plan progress and status priority, settled and active actions are capability gated, project and thread identities remain concrete, prompt stash restore never changes provider or model, filesystem navigation is deferred through shared runtime coordination, focused and full gates pass, fresh review passes, and accepted work is locally committed.
- explicit non goals: No snooze, no logical group ids in routes or repository calls, no remote self-update, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F04, F05, F08, F14, F15, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F04-composer-draft-autonomy-and-composer-chrome.md`
- `fork/F05-git-panel-isolation-from-draft-ownership.md`
- `fork/F08-plan-aware-sidebar-and-activity-status-cues.md`
- `fork/F14-project-management-and-inference-dashboard.md`
- `fork/F15-connection-resilience-and-offline-send-durability.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- upstream read-only `SidebarV2.tsx`, `AppSidebarLayout.tsx`, and `BetaSettingsPanel.tsx`
- upstream read-only evidence commit `f2d2fb2f2` for provider-safe prompt stash
- upstream read-only evidence commits `936593c25` and `1ba3d01bc` for deferred filesystem navigation

## Vertical Plan

1. Add a fork-owned hydration resolver that holds V1 until client settings load and always defaults V2 off.
2. Add the Beta settings route, navigation entry, switch, explicit choice tracking, and bounded auto-settle controls.
3. Mount V2 only outside settings routes and retain V1 as the settings navigation shell.
4. Build Sidebar V2 from current origin adapters for shell-first paging, settlement, grouping, unread, rename, delete, bulk actions, project actions, and keyboard traversal.
5. Share one plan progress and status-priority resolver across V1 and V2.
6. Route both sidebars and command palette through one concrete project launcher.
7. Add a provider-agnostic prompt stash with atomic legacy migration and provider plus model preservation.
8. Preserve stable composer controls, attachments, screenshot, warnings, rich mode, runtime access, and Enter behavior.
9. Add shared deferred filesystem navigation for web and mobile callers.
10. Run focused settings, sidebar, composer, stash, navigation, and route tests.
11. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P6a owns hydration-safe switch resolution, Beta settings, route navigation, and AppSidebarLayout.
- P6b owns Sidebar V2 state, rendering, pagination, grouping, settlement, project actions, and keyboard traversal.
- P6c owns prompt stash migration, composer controls, and provider plus model preservation.
- P6d owns shared deferred filesystem navigation and command palette project launcher convergence.
- P6a begins after P4 settings contracts. P6b begins after P5 project and Git identity. P6c begins after P4 provider identity. P6d begins after P5 launcher identity.
- Shared Sidebar, ChatComposer, settings, route, and feature-spec files are reconciled centrally.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Switch and layout | inherited frontier model | Hydration must never remount the application shell | yes | persisted choice flickers or resets |
| Sidebar V2 | frontier model with high reasoning | Paging, identity, settlement, and keyboard behavior cross many adapters | yes | logical groups enter concrete routes |
| Composer stash | inherited frontier model | Migration and restore must preserve provider and model intent | yes | stash changes active dispatch identity |
| Navigation | inherited frontier model | Deferred browse results must retain environment and project identity | yes | stale browse opens a route |
| Fresh review | frontier model with fresh context | Visible navigation and draft safety need independent review | yes | V1 and V2 policy divergence |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Default-off hydration-safe switch | F8 | P1a settings ready | pending | selected for hydration order | F8 | planned |
| V1 rollback and settings shell | F8 | pending | pending | not selected | pending | planned |
| Shared fractional plan progress | F8 | current plan resolver | pending | selected for status precedence | F8 | planned |
| Settled lifecycle and capability gates | F8 and P2 | integrated foundation | pending | selected for activity sequences | F8 | planned |
| Concrete project identity and actions | F05 and F14 | P5 integrated | pending | selected for grouped identity | F05 and F14 | in progress |
| Provider-safe prompt stash | F04 | P4 integrated | pending | selected for migration ordering | F04 | in progress |
| Stable composer controls | F04 | current composer seams | pending | not selected | F04 | in progress |
| Deferred filesystem navigation | v0.0.30 and F14 | pending | pending | selected for stale result order | pending | planned |
| Keyboard traversal and bulk actions | F8 | pending | pending | selected for row state sequences | F8 | planned |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P6 integration | `/home/jerkytreats/t3code-v030-sidebar-v2` | `product/v030-sidebar-v2` | in progress | pending | central reconciliation and full gates |
| P6a switch and layout | `/home/jerkytreats/t3code-v030-p6-switch` | `product/v030-p6-switch` | in progress | pending | hydration, settings, and shell ownership |
| P6b Sidebar V2 | `/home/jerkytreats/t3code-v030-p6-sidebar` | `product/v030-p6-sidebar` | in progress | pending | sidebar state and interaction ownership |
| P6c composer and navigation | `/home/jerkytreats/t3code-v030-p6-composer-nav` | `product/v030-p6-composer-nav` | in progress | pending | stash, composer, deferred browse, and launcher ownership |

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

- The fork intentionally does not adopt the stable nightly or development default-on rule. V2 defaults off for the first fork release in every channel.
- A legacy stored `sidebarV2Enabled: true` remains an opt-in even when the configured-by-user bit is absent.
- During hydration every consumer reads V1 so the tree cannot mount V2 and then swap.
- Settings routes keep the V1 settings navigation shell even when V2 is enabled.
- Logical group labels are display-only and never become route, repository, project, or workspace identifiers.
- Snooze remains absent from schema, commands, events, timers, and user interface.

## Closeout
