# Staging Thread desktop acceptance

Date: 2026-09-06
Branch: `staging/thread-desktop-acceptance-20260906`
Status: in progress

## Objective

Promote the accepted upstream intake to the live staging environment and provide a repeatable agent-driven desktop harness for T3 Thread as the default ephemeral coding entry point. Preserve production and unrelated project code.

## Objective baseline

- R1: Back up the accepted intake branch on exact origin before staging changes.
- R2: Serve the accepted source through staging HTTPS, working authentication, primary WebSocket and Vite HMR. Preserve production process, launcher and bundle identities.
- R3: Install an independent staging Thread client and exercise fresh home-scoped launch, crash-notification prefill and explicit project-scoped launch through real components.
- R4: Prove multiple Thread windows, usable composer, exact draft staging without automatic sends, independent close and crash, and no disruption to core Code or server.
- R5: Measure launch-to-window and launch-to-usable timing separately, including repeated launches, and report failure diagnostics with explicit evidence limits.
- R6: Deliver a reusable repository-owned harness, operator instructions, focused regressions, required repository gates, fresh review and committed changes.

Acceptance requires observed runtime behavior. A launcher ACK does not prove authenticated transport or a correctly scoped usable draft. Synthetic crash input proves the entry contract without deliberately crashing unrelated applications. No production deployment, unrelated project fixes, host-wide resets, or automatic provider submissions are included.

Applicable policies: `AGENTS.md`, commit policy, privacy and publication policy, fork isolation policy, compatibility policy, patch guide and upstream publication policy. Private host configuration, credentials and raw desktop evidence remain outside tracked files.

## Source plan

User-directed staging promotion and desktop acceptance follow accepted intake evidence commit `15ead1151af3b21eb84b617f39c3750fdb91d8f8` and tested runtime source `246e8bcd95020ba582cd269ce3fb538f6a8eef21`.

## Program branch

Use the dedicated staging development branch. Preserve the existing staging checkout with its uncommitted document change. Staging remains live source with HMR.

## Commit policy

Commit accepted implementation after required gates and review. Each delivery commit carries one exact Commit Effect in this ledger. Remote writes target exact origin only.

## Phase inventory

| Phase | Scope                                   | Dependencies           | Owner                    | Status      |
| ----- | --------------------------------------- | ---------------------- | ------------------------ | ----------- |
| P1    | Recovery push and staging promotion     | Accepted intake        | Root                     | in progress |
| P2    | Desktop entry and activation scope      | Contract inventory     | Root and bounded worker  | proposed    |
| P3    | Reusable desktop usage harness          | P2 activation contract | Bounded worker           | proposed    |
| P4    | Installed staging acceptance and fixes  | P1, P2, P3             | Root                     | proposed    |
| P5    | Gates, independent reviews and closeout | P4                     | Root and fresh reviewers | proposed    |

## Dependency graph

P2 must freeze project-scope admission before the harness depends on it. P1 operational changes remain central and separate from source work. P4 uses final source and artifact identities. P5 requires real runtime acceptance and committed implementation.

## Wave plan

Inspect desktop entry chains and reusable harness evidence in parallel while root establishes recovery and staging. Implement disjoint source owners after contract agreement. Join them before runtime execution and fresh review.

## Agent strength plan

Standard high explorers handle bounded installed-entry and harness inventories. Strong high workers or reviewers handle coupled activation, authority and lifecycle boundaries. Standard high workers handle settled harness mechanics. Root owns integration, environment changes and final evidence.

## Shared contract decisions

V1 gains optional bounded absolute POSIX `workingDirectory`. Fresh external launch defaults to home; explicit payload scope wins over `T3_THREAD_WORKING_DIRECTORY`. Legacy internal unscoped activation remains accepted. The primary hosted project owner selects the exact scope or creates its record through the existing upstream command without creating directories. Thread never autosends. Code readiness uses the same channel-specific directory as its launcher.

The user reserves compositor workspace 4 for staging Code and Thread, workspace 5 for wallpaper-specific checks, and workspace 1 for active use. Staging window rules are narrow by client class. Native input restores prior focus and never targets unrelated windows.

## Wave execution log

R1 passed: exact origin recovery branch resolves to the accepted evidence commit. Upstream push remains disabled. Production identity baseline and prior staging configuration were recorded privately before staging mutation.

Staging state was backed up after stopping only its service. Promoted live source serves HTTPS, the auth route and actual Vite HMR. Production process, launcher and bundle identities remained unchanged. The staging Code artifact was installed separately. A runtime-directory mismatch exposed a missing real staging readiness record despite the legacy manager accepting a mapped window; the source correction is covered by both channel lifecycle tests and awaits rebuilt installed proof.

Read-only desktop inventory found a missing server target on the bare installed Thread hotkey path and Code routing on current crash and wallpaper entry paths. Existing wallpaper entry scope differs from the source project requested here. These findings do not establish an installed Thread crash. Staging uses explicit client and adapter namespaces without editing packaged Omarchy or unrelated project code.

The first source delivery is committed and backed up on exact origin. Rebuilt staging Code passes actual channel readiness, authenticated desktop composer, HTTPS and HMR checks on workspace 4. The first harness launches found numeric readiness ticks were incorrectly treated as strings and that Thread needs an explicit Linux desktop name for native Wayland staging identity. The harness stopped and cleaned up its owned processes, preserving Code and both servers. These installed findings are being corrected before rerunning acceptance.

## Gate evidence

Final product source gates passed after all review corrections: `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test --maxWorkers=4` with 13,919 passing tests and the ten inherited server skips. Both product review lanes are closed. These results establish source acceptance, not installed staging behavior. The harness and explicit Thread desktop identity also passed all four gates with 13,936 passing tests. The final browser-history observation correction passed its focused runtime tests and lint. Fresh source review is clear; installed acceptance remains pending the corrected Thread rebuild.

## Commit effects

If applied, this commit preserves directory scope and independent readiness for staging desktop clients.

If applied, this commit adds a real desktop harness and explicit staging identity for T3 Thread.

## Review findings

The fresh directory and readiness review found double normalization could alter a directory ending in a space. Creation now dispatches the original path and uses normalization only for comparison. The regression passed and the reviewer closed the finding. The staging entry review found overly broad state admission and rejection of prompt values that equal recognized flags. The adapter now requires a dedicated staging namespace outside production roots, completes immutable admission before creating state, and consumes prompt values by context. The reviewer closed both findings after all 16 focused tests passed.

## Deferred findings

Unrelated repository defects and production changes are outside this delivery.

## Phase completion matrix

R1 complete. R2 through R6 in progress.

## Risks and exceptions

Existing staging state needs a pre-migration backup. Production hosts the current agent, so no operation may stop or signal its service. Desktop evidence must identify only harness-owned windows and processes before any close or crash action. Authentication material must never appear in reports.

## Final reconciliation

Pending.

## Deliverable closeout

Pending.
