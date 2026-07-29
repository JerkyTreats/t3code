# Implementation Ledger

Date:
Branch: product/v0.0.30-origin-rebuild
Commit Policy:
Objective: Reconcile v0.0.30 desktop relaunch, Connect, relay, identity, theme, screenshot, and secure-storage outcomes behind existing fork seams.
Status: planned

## Objective Baseline

- requested outcome: Reconcile v0.0.30 desktop relaunch, Connect, relay, identity, theme, screenshot, and secure-storage outcomes behind existing fork seams.
- acceptance evidence: Updater-controlled quit succeeds without weakening guarded ordinary shutdown, Linux Secret Service selection remains explicit, fork identity and desktop capabilities remain protected, relay credentials work for linked and unlinked environments, focused and full gates pass, fresh review passes, and accepted work is committed locally.
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
- upstream read-only evidence commit `e00781a66` for unlinked relay credentials
- upstream read-only evidence commit `60af905e7` for Connect availability

## Vertical Plan

1. Audit current origin outcomes against every F1, F2, F3, F10 desktop bridge, and F13 acceptance row.
2. Rebuild updater-controlled quit through the current guarded lifecycle and renderer recovery seams.
3. Preserve unconditional Linux `gnome-libsecret` launch selection and capability-error behavior.
4. Preserve fork identity, theme projection, screenshot capability, binary pinning, and saved environments.
5. Rebuild unlinked relay credential lookup and deprovision race handling behind current relay contracts.
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
| Updater-controlled relaunch | v0.0.30 and F1 | pending | pending | not selected | pending | planned |
| Linux Secret Service selection | F13 | current launcher and app seams | pending | not selected | F13 | planned |
| Fork identity and release naming | F1 | current shared identity seam | pending | not selected | F1 | planned |
| Theme and screenshot capability preservation | F2 and F3 | current desktop adapters | pending | not selected | F2 and F3 | planned |
| Explicit Codex binary bridge | F10 | current launcher and main bridge | pending | not selected | F10 | planned |
| Linked and unlinked relay credentials | v0.0.30 and F13 | pending | pending | not selected | pending | planned |
| Paired-client write access and revocation safety | F13 | current auth contracts | pending | not selected | F13 | planned |

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

- Current origin already selects `gnome-libsecret` in both the Electron launcher and desktop app startup.
- The stable updater change adds a dedicated `before-quit-for-update` capability to the Electron app service and must not replace ordinary guarded shutdown.
- The stable relay change spans credential lookup, managed endpoint allocation, tunnel limits, API behavior, and shutdown release.

## Closeout
