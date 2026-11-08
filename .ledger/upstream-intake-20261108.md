# Upstream intake 2026-11-08

Date: 2026-11-08
Branch: `intake/upstream-20261108`
Status: verified source; origin publication, staging and production activation are separate decisions
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. Lane packets, the frozen conflict baseline, dispositions and review scratch stay untracked and create no product requirements.

## Objective baseline

Take upstream main through the pinned target onto the working branch and preserve every protected fork outcome plus the canvas demo. Acceptance requires decision-level preservation evidence and the full repository gates. Upstream remains read-only and origin is the only publication target. No publication, staging or production activation is part of this record.

## Source requirements

| Source boundary                          | Exact revision                             |
| ---------------------------------------- | ------------------------------------------ |
| Working branch (`demo/excalidraw-board`) | `ba01af77808fed617dfdc314c15c39ee7dc325d5` |
| Accepted origin main                     | `c642f945d5a1360f700b9d59e50e8798559c2633` |
| Upstream target                          | `ade473018d32003658b7d38693e083ee2e314bd8` |
| Merge base                               | `a21d788752695764028e6d26ba924f3963e05806` |

The working branch carries the canvas demo over origin main, including the canvas presentation fixes taken from the hill-climb branch on 2026-11-08. [The patch guide](../patch.md) has no entry for the canvas demo; this intake treated its outcomes as protected: the `canvas_read`, `canvas_update` and `canvas_preview` MCP tools, the diagram layout engine, canvas orchestration guidance, html cards and the web board.

The 334-commit range merged with 79 conflicted paths: 62 content and 17 modify/delete units, holding 110 text hunks. The frozen baseline was recorded before resolution; every unit received a recorded accept, replay or override disposition.

## Integration decisions

The selected workflow is merge and repair. Four disjoint lanes resolved source control, server authority and runtime, web and clients, and desktop. Root owned the migration registry, dependency graph, context budget, docs, canvas guidance and the retained deletions.

Root decisions:

- Upstream migration 80 continues at fork identity 104 after fork 103. `Migrations.ts` stays the fork wrapper; upstream's renumbered list, preview-migration reconciliation and V2 skip assertion are not adopted.
- Fork-deleted service, update, uninstall, boot service, launcher and release-workflow modules stay deleted. Upstream's `__service-launcher` entry in `bin.ts`, its compile-cache test and its CLI archive smoke step are removed with them; `binMain.ts` carries the fork's fast paths plus upstream's speech worker.
- `npmReleaseLookup` stays out of the server environment, and the marketing `llms.txt` page names no public npm acquisition.
- The client-runtime access state stays deleted under F17. Upstream's per-environment picker on the connections page is accepted for reachability, relay and read-only permissions; pairing lists, authorized clients and revoke stay absent.
- Canvas guidance keeps the fork's canvas section and thread-read and message lines alongside upstream's worktree-base and html-path wording. The agent context budget is set to the measured 8129, 9857 and 56680 bytes; the working branch's budget was already stale after the hill-climb guidance.
- Upstream's Effect rule set now rejects native `Error` subclasses and inline `Schema.is`. Fork `DiagramError`, `OmarchyScreenshotTerminationError` and `ServerImageSmokeInterruptedError` are tagged schema errors with hoisted guards.
- The CI dependency action's reviewed digest follows upstream's read-only store-save gating, and the moved production web boot check is allowlisted as a single read-only command.
- Upstream docs for Linux packages, `t3 up` and the release workflow are not adopted; voice docs accept upstream environment and cloud transcription behind an explicit grant.

## Preservation gate and repairs

Three fresh reviewers checked server authority, persistence and source control; client and desktop outcomes; and the canvas demo against the staged candidate. Repairs closed each blocking finding:

| Finding                                                                     | Resolution                                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Upstream GitLab source-branch deletion deleted a branch in a fork's project | Deletion and its offer require the source project to be the origin project, and a foreign project is refused before any read |
| `html_render` dropped `displayWidth` after upstream's file-path input       | The handler passes `displayWidth` again, so wide canvas cards widen                                                          |

Lane repairs inside conflict resolution: upstream's new GitLab label, reference and author search methods and CLI helpers bind the origin host; GitHub SSO media rendering runs only for the exact origin repository; Azure default-branch lookup keeps explicit targets, with upstream's `@`-file guard moved into the Azure target owner.

Deferred findings, not regressions of this intake:

- The new speech WebSocket authenticates once at upgrade and is not torn down when a portal device is revoked, as the existing media sockets behave.
- Sidebar row times on web and mobile now count run activity while the order follows conversation activity, so a row can show a newer time than the row above it.
- The thread pin shortcut can pin a nested thread; menus refuse it.
- The canvas `html` field description does not say that a file path is not accepted there.
- After `/clear` or a fresh-session scheduled task, the canvas mark watermark carries over, so a new agent hears only about marks made since.
- GitLab change-request stats still rely on the batched origin-selected caller.
- Link request cards and linked environment settings still direct users to revoke in Connections, which the fork does not show.

## Gate evidence

`pnpm fmt`, `pnpm lint` and `pnpm typecheck` pass on the integrated source. Tests ran with `NODE_ENV` and every `T3CODE_*` variable unset, one workspace at a time. The first full pass found the hard-coded migration list in the project settings upgrade test, a missing atom in the theme test mock, and the marketing and CI safety findings above; each was repaired and its suite rerun. Thirty-two workspaces pass on the first pass, including mobile 3,345, client-runtime 1,838 and desktop 1,127; after repairs the server passes 7,114 tests, scripts 563, GitLab 272 and web 6,120 of 6,121. The web exception is the existing 12-hour reset test, which fails only under this host's `en_CA` locale; the relay telemetry runtime test failed once under full-suite load and passes in isolation and in the rerun. Upstream changed native Swift and Kotlin sources that the fork does not modify; `pnpm lint:mobile` could not run because SwiftLint, ktlint and detekt are not installed on this host. No staging or production runtime was touched, and no client received visual acceptance.

## Commit Effects

If applied, this commit lands upstream T3 Code through ade473018d on the canvas working branch, including environment and cloud voice transcription, scheduled tasks that continue in one thread, PR comments and reference completion, GitLab reviews and maintainer edits, html tools that take a file path and a 400 by 360 minimum desktop window, while keeping exact-origin identity, fork persistence lineage, external Admin authority, T3 Thread and the canvas tools.

Production activation requires a stopped-service backup of the active database because migration 104 advances the journal. Origin publication, staging and installed-client updates are separate decisions.
