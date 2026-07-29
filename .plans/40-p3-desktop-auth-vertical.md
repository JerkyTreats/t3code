# Implementation Ledger

Date: 2026-07-29
Branch: product/v030-desktop-auth
Commit Policy: conventional local commit after full gates and fresh review
Objective: Reconcile v0.0.30 desktop relaunch, Connect, relay, identity, theme, screenshot, and secure-storage outcomes behind existing fork seams.
Status: complete

## Objective Baseline

- requested outcome: Reconcile v0.0.30 desktop relaunch, Connect, relay, identity, theme, screenshot, and secure-storage outcomes behind existing fork seams.
- acceptance evidence: Updater-controlled quit succeeds without weakening guarded ordinary shutdown, Linux Secret Service selection remains explicit, fork identity and desktop capabilities remain protected, relay credentials require an active matching link, orphaned credentials do not authenticate, focused and full gates pass, fresh review passes, and accepted work is committed locally.
- explicit non goals: No provider model runtime, no Git workflow, no Sidebar V2 rendering, no upstream integration, and no remote mutation.
- applicable repository policies: AGENTS.md, patch.md, F01, F02, F03, F10, F13, commit policy, compatibility policy, origin-only source control policy, and the controlling product map.
- completion point: acceptance evidence passes with applicable policy checks

## Source Requirements

- `AGENTS.md`
- `patch.md`
- `fork/F01-branding-and-release-identity.md`
- `fork/F02-local-desktop-theme-projection.md`
- `fork/F03-desktop-screenshot-capture-and-attach-flow.md`
- `fork/F10-codex-model-and-binary-selection.md`
- `fork/F13-auth-access-management.md`
- `.plans/36-upstream-v0.0.30-product-feature-map.md`
- upstream read-only evidence commit `9ccfd9dfe` for updater-controlled relaunch
- upstream read-only evidence commit `e00781a66` for orphaned relay credential rejection and generation-safe unlink
- upstream read-only evidence commit `60af905e7` for Connect availability
- upstream read-only evidence commit `a78f245df` for managed tunnel limits
- upstream read-only evidence commit `96398e377` for shutdown tunnel release

## Vertical Plan

1. Audit current origin outcomes against every F1, F2, F3, F10 desktop bridge, and F13 acceptance row.
2. Rebuild updater-controlled quit through the current guarded lifecycle and renderer recovery seams.
3. Preserve unconditional Linux `gnome-libsecret` launch selection and capability-error behavior.
4. Preserve fork identity, theme projection, screenshot capability, binary pinning, and saved environments.
5. Rebuild orphaned relay credential rejection and deprovision race handling behind current relay contracts.
6. Reconcile Connect access surfaces without restoring waitlist behavior or weakening standard paired-client write access.
7. Run focused desktop, web access, relay, and launcher tests.
8. Run full Node 24 gates, fresh review, fix loop, and local commits.

## Parallel Work Slices

- P3a owns desktop lifecycle, Electron app events, identity, launcher, secure storage, theme, screenshot, and binary bridge verification.
- P3b owns relay credential lookup, endpoint allocation, shutdown release, and web access reconciliation.
- P3a and P3b are disjoint after the P2 transport contract is integrated.
- Shared F13 and patch guide updates are reconciled centrally after both slices.

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| --- | --- | --- | --- | --- |
| Desktop lifecycle | inherited frontier model | Updater events must compose with guarded shutdown and renderer recovery | yes | quit path can bypass normal shutdown |
| Relay and access | inherited frontier model | Credential and deprovision races cross durable remote boundaries | yes | linked and unlinked identity conflict |
| Fresh review | frontier model with fresh context | Fork identity and secure storage need independent preservation review | yes | disputed capability or plaintext fallback finding |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Updater-controlled relaunch | v0.0.30 and F1 | dedicated updater quit latch in `DesktopLifecycle` and scoped Electron event adapter | 6 lifecycle cases across macOS, Windows, and Linux | not selected | F1 and patch guide updated | implemented |
| Linux Secret Service selection | F13 | explicit launcher argument and app startup switch | launcher and app startup platform tests pass | not selected | F13 and patch guide updated | implemented |
| Fork identity and release naming | F1 | current shared identity and release seams preserved | focused desktop identity and menu tests pass | not selected | F1 remains authoritative | verified |
| Theme and screenshot capability preservation | F2 and F3 | current desktop projection and capture adapters preserved | existing full suite selected | not selected | F2 and F3 remain authoritative | verified by audit |
| Explicit Codex binary bridge | F10 | current launcher environment bridge and provider binary settings preserved | existing full suite selected | not selected | F10 remains authoritative | verified by audit |
| Active-link relay credentials | v0.0.30 and F13 | credential lookup requires active link with matching public key | relay credential SQL test passes | not selected | F13 and patch guide updated | implemented |
| Generation-safe relay lifecycle | v0.0.30 and F13 | serialized link, unlink, and shutdown release, transactional revocation, integer generation claims, database endpoint locks, tunnel limits, and shutdown release | 48 focused relay tests and 12 server cloud HTTP tests pass | not selected | F13 and patch guide updated | implemented |
| Connect availability | v0.0.30 and F13 | web and mobile signed-out prompts route to sign-in while legacy deep link remains compatible | static waitlist flow scan and full UI suite selected | not selected | Clerk and relay docs updated | implemented |
| Paired-client write access and revocation safety | F13 | current auth scope contracts and current-session guards preserved | existing full suite selected | not selected | F13 remains authoritative | verified by audit |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| P3 | `/home/jerkytreats/t3code-v030-desktop-auth` | `product/v030-desktop-auth` | complete | `97a550102` | independent rebuild from read-only outcome evidence |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| --- | --- | --- | --- | --- |
| Focused desktop | desktop Vitest selection | passed, 21 tests | 2026-07-29 | lifecycle, identity, menu, launcher, and startup switches |
| Focused relay | relay race and lifecycle selection | passed, 48 tests | 2026-07-29 | credentials, links, allocation CAS, endpoint locking, provider, limits, and API |
| Focused server | server cloud HTTP Vitest selection | passed, 12 tests | 2026-07-29 | shutdown release and existing cloud behavior |
| Focused mobile | account label Vitest selection | passed, 1 test | 2026-07-29 | general sign-in copy |
| Focused type checks | relay, server, desktop, client-runtime, and contracts package type checks | passed | 2026-07-29 | Node 24 |
| Full format | `pnpm fmt` | passed | 2026-07-29 | Node 24 |
| Full lint | `pnpm lint` | passed | 2026-07-29 | pre-existing warnings only |
| Mobile lint | `pnpm lint:mobile` | passed | 2026-07-29 | native tools unavailable and static gate passed |
| Full type check | `pnpm typecheck` | passed | 2026-07-29 | Node 24 |
| Full tests | `pnpm test` | passed | 2026-07-29 | server 173 files and 1473 tests passed with expected skips |

## Commit Evidence

| Scope | Commit | Status | Notes |
| --- | --- | --- | --- |
| P3 desktop and Connect vertical | `97a550102` | committed | local origin branch only |

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| --- | --- | --- | --- | --- |
| Fresh findings-only review | fresh frontier reviewers | passed | no findings after fix loops | final exact-tree review was read only |

## Blocking Findings

| ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P3-S1 | self review | blocking | `infra/relay/src/http/Api.ts` | deprovision failure must retain the upstream unavailable response | fixed | `97a550102` | relay type check and 37 affected tests pass |
| P3-R1 | fresh review | blocking | managed allocation lifecycle | timestamp generations, unlink key identity, capacity race, shutdown ownership, and stale copy | fixed | `97a550102` | 47 relay, 12 server, and 1 mobile focused tests pass |
| P3-R2 | fix rereview | blocking | managed allocation cleanup | cleanup must retain remote ids after failed deletion and serialize later reuse | fixed | `97a550102` | allocation CAS and provider tests pass |
| P3-R3 | final rereview | blocking | environment link lifecycle | same-key relink finalization and unlink must not interleave | fixed | `97a550102` | shared advisory lock key and 47 affected relay tests pass |
| P3-R4 | final fix rereview | blocking | unlink commit boundary | link and credential revocation must commit before remote endpoint deletion | fixed | `97a550102` | post-effect commit-failure regression and 47 affected relay tests pass |
| P3-R5 | final fix rereview | blocking | shutdown release lifecycle | release must not advance allocation generation between unlink capture and cleanup | fixed | `97a550102` | forced release-first interleaving regression passes |

## Deferred Findings

| ID | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | --- | --- | --- | --- |

## Phase Notes

- Current origin already selects `gnome-libsecret` in both the Electron launcher and desktop app startup.
- The stable updater change adds a dedicated `before-quit-for-update` capability to the Electron app service and must not replace ordinary guarded shutdown.
- The stable relay change spans credential lookup, managed endpoint allocation, tunnel limits, API behavior, and shutdown release.
- Unlink releases its link transaction lock only after durable revocation commits. Any concurrent relink is then protected from later cleanup by the endpoint generation claim.
- No upstream code was integrated. Upstream was used only as read-only outcome evidence.
- The mobile `waitlist` deep link remains solely as a sign-in compatibility alias.

## Closeout

Review, full gates, local implementation commit, and clean worktree proof are complete. No remote mutation occurred.
