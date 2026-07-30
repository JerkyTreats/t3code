# Implementation Ledger

Date: 2026-07-29
Branch: product/v030-provider-runtime
Commit Policy: conventional commits under `governance/commit_policy.md`
Objective: Reconcile v0.0.30 provider instance routing, fallback, model, capability, skill, command, binary, and launch argument outcomes while preserving exact fork instance identity.
Status: complete

## Objective Baseline

- requested outcome: Reconcile v0.0.30 provider instance routing, fallback, model, capability, skill, command, binary, and launch argument outcomes while preserving exact fork instance identity.
- acceptance evidence: Two instances of one driver remain distinct, fallback is deterministic and instance local, no-provider disables dispatch, custom slugs survive, active-instance models and skills drive the composer, selected CLI and binary reach probe and runtime spawn, custom instance lifecycle and legacy snapshots remain compatible, singleton streams do not duplicate, focused and full gates pass, fresh review passes, and accepted work is locally committed.
- explicit non goals: No Sidebar V2 rendering, no prompt stash implementation beyond preservation seams, no Git workflow, no remote self-update, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F04, F10, F12, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F04-composer-draft-autonomy-and-composer-chrome.md`
- `fork/F10-codex-model-and-binary-selection.md`
- `fork/F12-provider-instance-identity-seam.md`
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
| Exact instance-keyed routing | F12 | registry, session directory, service, composer | provider service and model selection suites | covered by custom instance sequences | F12 | implemented |
| Deterministic fallback and no-provider state | F12 and v0.0.30 | providerInstances, modelSelection, ChatComposer | providerInstances and modelSelection suites | not selected | patch and F12 | implemented |
| Custom models and live capabilities | F10 and F12 | exact instance model options and live snapshots | modelSelection and provider registry suites | covered by unknown slug preservation | F10 and F12 | implemented |
| Selected CLI, binary, and launch arguments | F10 | Codex provider, adapter, session, text generation | codexLaunchArgs suite | not selected | patch and F10 | implemented |
| Bounded binary discovery | F10 | CodexBinaryDiscovery and settings suggestions | CodexBinaryDiscovery suite | candidate ordering and bound covered | patch and F10 | implemented |
| Custom instance lifecycle and legacy settings | F12 | current contracts and settings cards | existing settings suites | unknown field round trips retained | F12 | implemented |
| Skill and command draft safety | F04 and F12 | active instance snapshots and ClaudeSkills | ClaudeSkills and existing composer suites | not selected | F04 and F12 | implemented |
| Durable instance and model intent | F04 and F15 | selection hydration and thread outbox | modelSelection and threadOutbox suites | disconnect and retry sequence covered | F04 | implemented |
| Singleton adapter stream de-duplication | F12 | adapter identity groups in ProviderService | ProviderService shared adapter suite | shared instance sequence covered | patch and F12 | implemented |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P4 provider runtime | `/home/jerkytreats/t3code-v030-provider-runtime` | `product/v030-provider-runtime` | accepted | `c830fbb07` | isolated worktree from `05a234bf3` |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| Dependency install | Node 24 `pnpm install --frozen-lockfile=false` | pass | 2026-07-29 | reused catalog `yaml` and updated server importer plus lockfile |
| Focused shared tests | `pnpm --filter @t3tools/shared exec vp test run src/cliArgs.test.ts` | pass | 2026-07-29 | 22 tests |
| Focused web tests | provider instances, model selection, and thread outbox | pass | 2026-07-29 | 32 tests |
| Focused server tests | launch arguments, binary discovery, Claude skills, and ProviderService | pass | 2026-07-29 | 38 tests |
| Second review focused server tests | launch arguments, binary discovery, and ProviderRegistry | pass | 2026-07-29 | 46 tests |
| Final review focused web tests | model selection, provider instances, outbox, and draft store | pass | 2026-07-29 | 118 tests |
| Final review focused server tests | Claude skills, binary discovery, launch arguments, and ProviderRegistry | pass | 2026-07-29 | 51 tests |
| Post-fix focused web tests | draft store, provider instances, model selection, and outbox | pass | 2026-07-29 | 120 tests |
| Post-fix focused server tests | binary discovery, bounded stream collection, and ProviderRegistry | pass | 2026-07-29 | 43 tests |
| Closeout focused web tests | draft store, model selection, and provider instances | pass | 2026-07-30 | 114 tests |
| Closeout focused server tests | ProviderService, text generation, and binary discovery | pass | 2026-07-30 | 39 tests |
| Closeout ProviderRegistry test | `ProviderRegistry.test.ts` | pass | 2026-07-30 | 36 tests |
| Exact identity focused web tests | draft store and model selection | pass | 2026-07-30 | 98 tests |
| Exact identity focused server tests | ProviderService and text generation | pass | 2026-07-30 | 35 tests |
| Adapter result focused server tests | `ProviderService.test.ts` | pass | 2026-07-30 | 34 tests |
| Typecheck | Node 24 `pnpm typecheck` | pass | 2026-07-30 | all workspaces |
| Format | Node 24 `pnpm fmt` | pass | 2026-07-30 | 2189 files |
| Lint | Node 24 `pnpm lint` | pass | 2026-07-30 | only pre-existing warnings outside P4 |
| Full tests | Node 24 `pnpm test` | pass | 2026-07-30 | 176 files passed, 2 skipped, 1500 tests passed, 7 skipped |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| Provider runtime, exact instance UX, binary discovery, and compatibility | `c830fbb07` | accepted | full gates and fresh reviews passed |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| Fresh findings review | fresh frontier reviewer | fixed | one high, four medium, one low | all six findings fixed and gates rerun |
| Second fresh findings review | fresh frontier reviewer | fixed | two medium | both findings fixed with focused regressions |
| Final fresh findings review | fresh frontier reviewer | fixed | one high and three medium | all four findings fixed with focused regressions |
| Post-fix final findings review | fresh frontier reviewer | fixed | one high and two medium | all three findings fixed with focused regressions |
| Final closeout findings review | fresh frontier reviewer | fixed | one high and one medium | both findings fixed with focused regressions |
| Final fix findings review | fresh frontier reviewer | fixed | two high | both findings fixed with focused regressions |
| Exact identity findings review | fresh frontier reviewer | fixed | one high | finding fixed with start and recovery regressions |
| Adapter result findings review | fresh frontier reviewer | passed | none | ordinary and resumed start identities verified |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P4-R1 | fresh review | high | web provider selection | preserve built-in intent before hydration | fixed | pending | focused web and full gates |
| P4-R2 | fresh review | medium | web provider selection | reject known unavailable instances | fixed | pending | focused web and full gates |
| P4-R3 | fresh review | medium | Claude skill discovery | exact instance HOME and server workspace | fixed | pending | focused server and full gates |
| P4-R4 | fresh review | medium | Codex binary discovery | expose recovery choices after failed or disabled probe | fixed | pending | provider registry and full gates |
| P4-R5 | fresh review | medium | provider shutdown | legacy untagged shared sessions cannot block stopAll | fixed | pending | ProviderService and full gates |
| P4-R6 | fresh review | low | local no-provider state | valid custom ids cannot collide with presentation state | fixed | pending | focused web and full gates |
| P4-R7 | second fresh review | medium | Codex launch argument composition | global options must precede the selected subcommand | fixed | pending | focused launch argument suite and full gates |
| P4-R8 | second fresh review | medium | Windows Codex binary discovery | npm command shims must use the shared spawn seam | fixed | pending | focused binary discovery suite and full gates |
| P4-R9 | final fresh review | high | composer model resolution | explicit model must survive until exact ready catalog | fixed | pending | focused model selection and outbox suites |
| P4-R10 | final fresh review | medium | composer provider semantics | final routed instance owns driver capabilities and controls | fixed | pending | focused provider instance suite |
| P4-R11 | final fresh review | medium | Windows Codex binary discovery | quoted PATH entries must normalize before candidate join | fixed | pending | focused binary discovery suite |
| P4-R12 | final fresh review | medium | Claude skill discovery | directory and file bounds must apply before full allocation | fixed | pending | focused Claude skill suite |
| P4-R13 | post-fix fresh review | high | composer model resolution | model candidates must match final routed instance ownership | fixed | pending | focused draft, model, and outbox suites |
| P4-R14 | post-fix fresh review | medium | composer interaction controls | controls must read the exact final instance snapshot | fixed | pending | focused provider instance suite |
| P4-R15 | post-fix fresh review | medium | Codex binary discovery | probe output capture must remain bounded while draining | fixed | pending | focused binary discovery and stream collector suites |
| P4-R16 | closeout fresh review | high | composer and text generation model dispatch | ready exact instances without a usable model must be non-dispatchable | fixed | pending | focused draft store and text generation suites plus full gates |
| P4-R17 | closeout fresh review | medium | shared adapter session listing | matching persisted bindings recover legacy untagged sessions | fixed | pending | focused ProviderService suite plus full gates |
| P4-R18 | final fix fresh review | high | shared adapter routing and recovery | explicit active session tags must match the persisted exact instance | fixed | pending | focused ProviderService suite plus full gates |
| P4-R19 | final fix fresh review | high | exact model dispatch | stale selected slugs in non-empty ready catalogs must remain non-dispatchable | fixed | pending | focused draft store, model selection, and text generation suites plus full gates |
| P4-R20 | exact identity fresh review | high | adapter start and recovery results | explicit returned instance ids must match the request or binding | fixed | pending | focused ProviderService suite plus full gates |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- P3 integrated the desktop binary launch bridge at base commit `05a234bf3`.
- Audit confirmed exact instance routing, recovery, settings lifecycle, live model and skill discovery, custom model isolation, draft token safety, and durable model selection are already present.
- Audit found deterministic fallback, the non-dispatchable no-provider state, Codex launch arguments, bounded binary choices, and adapter identity stream de-duplication remain incomplete.
- Existing selected Codex CLI version propagation is stronger than the read-only release evidence and must remain unchanged.
- Provider fallback must select an instance first and only then select that instance default model.
- Unknown instance settings and custom model slugs are compatibility data, not validation errors.
- No binary discovery step may scan the whole filesystem.
- The server reuses the workspace catalog `yaml` dependency for safe Claude skill frontmatter parsing.
- Exact Node 24 dependency install updated the server importer and lockfile successfully.
- Fresh review fixes preserve legacy built-in targets before hydration and reject known unavailable custom snapshots.
- Claude skill roots now use the exact instance environment HOME and configured server workspace.
- Binary discovery runs for disabled and failed configured providers so settings can recover to a valid candidate.
- Shared adapter shutdown skips ambiguous legacy session enrichment but still calls stopAll once.
- No-provider presentation uses an explicit local state bit, so a valid custom id cannot collide with it.
- Global Codex launch arguments precede both app-server and exec subcommands.
- Windows binary discovery includes bounded executable and npm command shim candidates and probes them
  through the shared spawn-command seam.
- Explicit model intent remains unchanged until the exact selected instance reports a ready catalog.
- Composer capabilities and controls derive from the final routed instance after fallback.
- Windows binary discovery strips wrapping PATH quotes before joining bounded candidates.
- Claude skill discovery caps directory iteration and file reads before allocating or parsing content.
- Composer model candidates are accepted only when their owner matches the final routed instance.
- Interaction controls read the final exact instance snapshot.
- Codex binary probes bound captured output and continue draining both child streams.
- Ready exact instances without a usable model disable composer sends and background text generation.
- Shared adapters recover legacy untagged sessions only from matching persisted exact-instance bindings.
- Plain configured Codex command names remain first-class bounded discovery candidates.
- Shared adapter routing and recovery reject explicit active-session tags owned by another instance.
- Ready catalogs reject stale exact model slugs without silently switching to a default.
- Ordinary and resumed adapter results reject conflicting concrete instance ids and enrich only omitted legacy ids.

## Closeout

- Objective acceptance evidence passed.
- Required Node 24 gates passed on the final source state.
- All review findings are fixed in `c830fbb07`.
- Final fresh review reported no findings.
- Origin was verified as the only writable remote target before both local commits.
- No remote state changed.
