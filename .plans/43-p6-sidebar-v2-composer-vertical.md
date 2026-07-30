# Implementation Ledger

Date: 2026-07-30
Branch: product/v030-sidebar-v2
Commit Policy: `governance/commit_policy.md`
Objective: Mount an optional Sidebar V2 behind a hydration-safe persisted switch while preserving plan progress, concrete project identity, provider-safe drafts, prompt stash behavior, and deferred filesystem navigation.
Status: verified

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
| Default-off hydration-safe switch | F8 | `apps/web/src/sidebarV2Settings.ts`, `apps/web/src/hooks/useSettings.ts`, and `apps/web/src/components/AppSidebarLayout.tsx` | resolver, route policy, bounds, persistence, and navigation tests pass | hydration order covered by resolver cases | F8 and patch guide updated | completed |
| V1 rollback and settings shell | F8 | route policy keeps settings on V1 and switch remains reversible | settings route and layout tests pass | not selected | F8 and patch guide updated | completed |
| Shared fractional plan progress | F8 | shared plan resolver consumed by both sidebars | progress and priority regression tests pass | fractional and terminal status cases covered | F8 updated | completed |
| Settled lifecycle and capability gates | F8 and P2 | Sidebar V2 paging, settlement, grouping, and exact server capability | Sidebar lifecycle tests pass | activity and paging sequences covered | F8 updated | completed |
| Concrete project identity and actions | F05 and F14 | environment plus project scoped launcher and concrete grouped actions | launcher collision and project action tests pass | exact environment collisions covered | F05 reviewed and compatibility verified, F14 and patch guide updated | completed |
| Provider-safe prompt stash | F04 | provider-agnostic durable store with atomic legacy migration | migration, budget, image loss, and restore tests pass | interrupted and over-budget cases covered | F04 and patch guide updated | completed |
| Stable composer controls | F04 | stash controls retain provider, model, attachments, and focus ownership | composer menu keyboard and focus tests pass | close path and whitespace cases covered | F04 updated | completed |
| Deferred filesystem navigation | v0.0.30 and F14 | generation-aware shared navigation coordinator | stale result, clone preload, and overlap tests pass | superseded completion ordering covered | F14 and F15 updated | completed |
| Keyboard traversal and bulk actions | F8 | row traversal, modifier toggle, range selection, and bulk settle | keyboard and selection lifecycle tests pass | deletion and paging sequences covered | F8 updated | completed |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P6 integration | `/home/jerkytreats/t3code-v030-sidebar-v2` | `product/v030-sidebar-v2` | verified | through `e9b38d16c` | central reconciliation, final full gates, and clean closure review |
| P6a switch and layout | `/home/jerkytreats/t3code-v030-p6-switch` | `product/v030-p6-switch` | integrated | `816aa29d8` | helper `0521c5599` |
| P6b Sidebar V2 | `/home/jerkytreats/t3code-v030-p6-sidebar` | `product/v030-p6-sidebar` | integrated and verified | `9aefe0eb6` through `e9b38d16c` | helper series retained for review evidence |
| P6c composer and navigation | `/home/jerkytreats/t3code-v030-p6-composer-nav` | `product/v030-p6-composer-nav` | integrated and verified | `83c0a836d`, `8eb98fd4e`, `17b45aed8`, and `f5a8b2148` | helper series retained for review evidence |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| P6a focused web tests | `pnpm --filter @t3tools/web test -- src/sidebarV2Settings.test.ts src/components/settings/SettingsSidebarNav.test.ts src/hooks/useSettings.test.ts` | passed with 169 files and 1456 tests | 2026-07-30 | Workspace runner selected the full web unit project |
| P6a format | `pnpm fmt` | passed on 2194 files | 2026-07-30 | Node 24.13.1 |
| P6a lint | `pnpm lint` | passed with known repository warnings | 2026-07-30 | No new warning in P6a files |
| P6a full test | `pnpm test` | passed | 2026-07-30 | All workspace test tasks exited zero |
| P6a typecheck | `pnpm --filter @t3tools/web typecheck` | dependency resolved during P6b integration | 2026-07-30 | Final combined typecheck supersedes the early waiting state |
| P6 combined format | `pnpm fmt` | passed on 2215 files | 2026-07-30 | Node 24.13.1 at `17b45aed8` |
| P6 combined lint | `pnpm lint` | passed with known repository warnings | 2026-07-30 | No error and no new unused import |
| P6 combined typecheck | `pnpm typecheck` | passed across 15 workspaces | 2026-07-30 | Node 24.13.1 |
| P6 combined test | `pnpm test` | passed | 2026-07-30 | Contracts 208, client runtime 343, web 1500, server 1500 passed with 7 skipped |
| P6 integrated review tests | focused web and client runtime tests plus `git diff --check` | passed | 2026-07-30 | Fresh reviewer confirmed 177 web files and 1500 web tests before final fix loop |
| P6 isolated runtime | `pnpm dev --port 13873 --home-dir temporary-directory --no-browser` | passed startup | 2026-07-30 | All migrations passed and server listened on port 13873 |
| P6 collaborative preview | T3 preview open, status, resize, and snapshot | transport blocked | 2026-07-30 | Page open and resize worked, but semantic snapshots failed on both the local app and Example Domain |
| P6 final format | `pnpm fmt` | passed on 2216 files | 2026-07-30 | Node 24.13.1 at `e9b38d16c` |
| P6 final lint | `pnpm lint` | passed with known repository warnings | 2026-07-30 | No errors |
| P6 final typecheck | `pnpm typecheck` | passed across 15 workspaces | 2026-07-30 | Includes web, client runtime, server, desktop, mobile, relay, and shared packages |
| P6 final test | `pnpm test` | passed | 2026-07-30 | Contracts 208, client runtime 344, web 1513, server 1500 passed with 7 skipped |
| P6 final diff check | `git diff --check` | passed | 2026-07-30 | Fresh closure reviewer evidence |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| P6 phase start | `21435e145` | integrated | Ledger and objective baseline |
| P6a switch and layout | `816aa29d8` | integrated | Local helper commit `0521c5599` with no remote mutation |
| P6b Sidebar V2 | `9aefe0eb6` through `e9b38d16c` | integrated | Lifecycle, exact actions, paging, stale state, plan priority, keyboard behavior, and project removal safety |
| P6c composer and navigation | `83c0a836d`, `8eb98fd4e`, `17b45aed8`, and `f5a8b2148` | integrated | Durable stash, deferred navigation, failure outcomes, generation safety, and exact thread identity |
| Shared project launcher | `ca64f3b9a` | integrated | V1, V2, and command palette share exact project resolution |
| Project deletion cleanup seam | `bfe326162` | integrated | Clears composer, project draft, terminal, right panel, diff panel, and selection state |
| Project deletion consent and membership | `a17975795`, `d56fa8f6f`, `9a9dc9c26`, and `e9b38d16c` | integrated | Exact active plus archived membership, race union, informed consent, readiness guards, and exact refresh |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| P6a switch review | fresh isolated reviewer | completed | two ledger bookkeeping gaps and no runtime findings | bookkeeping reconciled centrally |
| P6b Sidebar review | fresh isolated reviewer with two re-reviews | completed | ten runtime findings fixed | final re-review returned no findings before integrated review |
| P6c composer review | fresh isolated reviewer with re-review | completed | eight runtime findings fixed | image loss, listbox ownership, focus, preload, and stale generation behavior corrected |
| P6 integrated review | fresh isolated reviewer with closure re-reviews | completed | all findings fixed | final review at `e9b38d16c` returned no material findings |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P6-R01 | Sidebar review | high | `SidebarV2.tsx` | PR state must cover exact visible probe keys without oscillation | fixed | `59f8a568a` and `05af36d66` | final Sidebar re-review |
| P6-R02 | Sidebar review | high | `SidebarV2.tsx` | double click rename must cancel navigation | fixed | `59f8a568a` and `9b0cefcb7` | native timing regression |
| P6-R03 | Sidebar review | high | `SidebarV2.tsx` | grouped actions and project removal must preserve concrete identity, informed consent, exact membership, and complete local cleanup | fixed | `59f8a568a`, `bfe326162`, `a17975795`, `d56fa8f6f`, `9a9dc9c26`, and `e9b38d16c` | final closure review and active plus archived race regressions |
| P6-R04 | Sidebar review | medium | `SidebarV2.tsx` | routed settled rows, deleted selection, and project draft cleanup | fixed | `59f8a568a` | focused lifecycle tests |
| P6-R05 | Integrated review | medium | `Sidebar.logic.ts` and `SidebarV2.tsx` | fractional progress outranks Working and keyboard users can bulk select | fixed | `cec2415a2` and `d0d766f12` | focused resolver and keyboard tests |
| P6-R06 | Composer review | high | stash modules | durable save outcomes must disclose every image loss and preserve exact prompt text | fixed | `8eb98fd4e` and `17b45aed8` | stash finalization and budget tests |
| P6-R07 | Composer review | medium | composer menu modules | one keyboard owner and deterministic focus restoration | fixed | `8eb98fd4e` and `17b45aed8` | listbox and focus tests |
| P6-R08 | Integrated review | high | `CommandPalette.tsx` | clone and browse transitions must preload before commit and reject stale generations silently | fixed | `17b45aed8` | overlap and stale generation tests |
| P6-R09 | Integrated review | high | `CommandPalette.logic.ts` | exact environment plus project and thread identity | fixed | `17b45aed8` and `f5a8b2148` | collision regressions and closure review |
| P6-R10 | Final integrated review | low | `SidebarV2.tsx` | aggregate status must exclude archived work and react to visit state | fixed | `bfe326162` | reactive active-only aggregate tests and closure review |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- P6a audited the P1a schema, browser and desktop persistence, settings hydration, V1 settings shell, root layout, route tree, F8, F14, and read-only stable reference before implementation.
- P6a resolves Sidebar V2 through one pure product helper and holds V1 until hydration completes.
- P6a keeps every settings route on V1 and adds the Beta route, navigation entry, explicit-choice switch, and bounded auto-settle editor.
- The fork intentionally does not adopt the stable nightly or development default-on rule. V2 defaults off for the first fork release in every channel.
- A legacy stored `sidebarV2Enabled: true` remains an opt-in even when the configured-by-user bit is absent.
- During hydration every consumer reads V1 so the tree cannot mount V2 and then swap.
- Settings routes keep the V1 settings navigation shell even when V2 is enabled.
- Logical group labels are display-only and never become route, repository, project, or workspace identifiers.
- Snooze remains absent from schema, commands, events, timers, and user interface.
- The isolated runtime passed every migration and listened successfully with a fresh data directory.
- Collaborative preview page creation and resize succeeded, but semantic automation failed independently on the local app and a public static page. This is recorded as a preview transport limitation rather than product evidence.
- Project removal consent is invalidated when exact target-environment archive readiness or scoped membership changes while confirmation is open.
- An unhealthy unrelated environment does not block project removal in a healthy environment.

## Closeout

- P6 combined implementation, documentation, formatting, lint, typecheck, focused tests, and full workspace tests pass at `e9b38d16c`.
- Fresh closure review returned no material findings.
- Sidebar V2 remains default off, V1 remains the rollback and settings shell, and no remote mutation occurred.
- Phase is verified and ready for program integration.
