# Upstream intake 2026-11-22

Date: 2026-11-22 (verified and committed 2026-11-24)
Branch: `intake/upstream-20261122-opus`, a two-parent merge of upstream `v0.1.11` onto the Step 1 promoted base
Status: verified source; origin publication of the intake branch is authorized for this intake; staging activation follows this commit; production stays on `1fff32521c` and is a separate decision
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. The controlling reconciliation record is `.plans/upstream-intake-20261122.md` from the first parent; it creates no product requirements.

## Objective baseline

Take upstream main through `v0.1.11` onto the Step 1 promoted base, preserve every protected fork outcome, the thread canvas (F32) and page state (F33), and keep fork persistence lineage authoritative. Acceptance requires the full repository gates on the final tree. Upstream remains read-only and origin is the only publication target.

## Source requirements

| Source boundary                                             | Exact revision                             |
| ----------------------------------------------------------- | ------------------------------------------ |
| First parent (Step 1 base plus reconciliation plan)         | `9aafc6a19a1551d1f72e2554919beccc2ca2d17a` |
| Step 1 promoted base, live in production                    | `1fff32521c2560d5fbaedd1e8f4f6c4ab79bee38` |
| Upstream target (`upstream/main`, `v0.1.11`), second parent | `dd19bce823d833b5612fd74851d50047e65347fa` |
| Merge base (`v0.1.8`)                                       | `3e4d44930893422bba0f402aeefe9eb0b44692a6` |

The 3,209-commit upstream range merged with 310 conflicted paths: 246 content, 63 modify/delete and 1 add/add, holding 589 text hunks. All 310 were resolved with no conflict markers left.

## Integration decisions

The selected workflow is merge and repair.

- Upstream migrations `081`-`108` append in source order at fork IDs `105`-`132` through `ForkMigrationPlan.ts`, which stays the sole lineage authority. `Migrations.ts` adopts upstream's per-migration transaction loop and its start, progress and finish log signals, without upstream's V2 preview reconciliation. `ForkMigrationUpstream81To108.test.ts` proves continuation from a fork-104 database.
- `Words` static Markdown islands (`0fb6ac6e65`) replace remark in `apps/web`. `canvasStateChips` is rebuilt as a HAST transform, and Mermaid fence routing keeps F22.
- `SideThreadPane.tsx` (`7c6e889ddb`) replaces `SideChatPane.tsx` and carries F32's `ownSideChat` guard.
- Antigravity MCP pre-approval (`7966f202ef`) covers all four fork MCP namespaces: `t3-code`, `t3-code-preview`, `t3-code-device` and `t3-code-pull-requests`.
- The 30-second unconfirmed admission grace window from `5549706896` is kept in the client connection registry.
- Agent feedback (`fe9c98c98f`) keeps migration `132_AgentFeedback` for schema parity, but reporting stays off (`FeedbackOffError`), and nothing is sent to upstream.
- F06 exact-origin authority applies to the new issue, PR and CI tools and to tracked-folder projects. Upstream-repository issue discovery (`c79f618bf8`) is blocked. Cursor Origin stays deleted, and TanStack Source is left out of the server's built-in driver list and the shared definitions registry, so neither can resolve an origin by hostname alone.
- Fork-deleted service, update, uninstall, boot service, pinned runtime, npm launcher, install-script and release-workflow modules stay deleted. Upstream's three new workflows and `GitHubStarPrompt` are not adopted.
- SSH launch keeps the fork's preinstalled `t3` model (`T3_CLI_HELPER_MODE`, no runtime download) on upstream's launcher. Upstream's new `home_owned` wait treats a home as owned while a server holds `userdata/server-owner.sqlite` or a boot service holds `runtime/service-serving.lock`. The fork's `__ssh-helper home-owned` had been resolved to check only the server lock, so the two launch modes disagreed. It now checks both locks through `isSqliteLockHeld`, matching the host-Node path; the fork itself runs no boot service.

## Fork invariants verified on the final tree

1. Upstream migrations `081`-`108` run at fork IDs `105`-`132`.
2. Antigravity MCP pre-approval covers all four fork MCP endpoints.
3. `Words` HAST `canvasStateChips` renders canvas state chips.
4. `SideThreadPane` keeps the `ownSideChat` guard.
5. The 30-second admission-stall grace window is intact.
6. `FeedbackOffError` keeps agent feedback off, and F06 keeps Cursor Origin and TanStack Source out of the registered source-control drivers.

## Gate repairs

Source repairs found by the gates:

- Provider compatibility ranges are written against upstream release numbers, but this fork reports its own `0.1.3`. Antigravity's split policy (`<0.1.10` keeps 1.4.x, `>=0.1.10` requires 1.5) therefore selected the old policy: 1.4.x read as supported while the merged driver refuses it, and 1.5.12 read as unknown. Because the runtime manifest is fetched from upstream, editing the bundled copy cannot fix this. `apps/server/src/fork/incorporatedUpstreamRelease.ts` now names the upstream release this build incorporates (`0.1.11`), and `resolveProviderCompatibility` evaluates `t3CodeRange` against it. Each intake updates that constant. The `patch.md` entry for this decision awaits the user's confirmation under the policy proposal flow.
- ChatView kept every thread projection it had replaced, which upstream's new retention test caught. The fork's canvas note sender closed over only stable values, so React Compiler memoized it in ChatView's render scope and chained each render to the one before it, the same leak upstream fixed with `useComposerFocus`. `apps/web/src/fork/useCanvasNoteSender.ts` holds it outside ChatView.
- The reusable dev token session now carries `AuthAdministrativeClientScopes`, as upstream and the desktop bootstrap grant do; the merge had kept the pre-`relay:configure` standard set. The desktop bootstrap test expects the administrative set the docs describe.
- `T3_CLI_COMMANDS` no longer lists upstream's `service`, `install`, `update`, `uninstall`, `up`, `status` and `auth connect-device` commands, which this CLI does not register.
- Product git skips the same-name upstream ref lookups when there is no literal origin (`resolveOriginSameNameUpstream`).
- The pre-commit knip gate found code orphaned by fork exclusions, and it is removed or narrowed:
  - `persistence/AuthConnectDevices.ts`, upstream's connect-device trust store, is deleted. F17 resolves `EnvironmentAuth` and `PairingGrantStore` without it, and migration 114 still creates its table.
  - The unused `@t3tools/source-control-tanstack-source` dependencies of the server and the shared definitions are dropped, and the lockfile is updated offline. The unregistered package stays as a knip entry.
  - Exports whose only callers sit in excluded upstream modules are deleted or made local: `isNoCopyOnWrite`, `DesktopUpdateMarker.publish`, the access-settings duration labels, the fork's superseded `originRemoteUrlConfigKey`, and four file-local constants.
- The canvas and page state MCP tools carry `McpSchema.EnabledWhen` for thread-bound callers, as upstream's routed-tool guard now requires.

Test repairs, behavior unchanged:

- F06 exact origin: upstream cases that select non-origin remotes are removed or rewritten with an F06 note. These cover the `gh-resolved` OWNER/REPO parent identity, sole-remote thread tip recovery, triangular push, pushRemote and pushDefault redirects, separate push URLs, local and differently named upstreams, and cross-project PR summary routing. The registry, review guide, Forgejo HTTP host and Azure fixtures now use a literal origin; an HTTP origin already names its port, so that Forgejo host is not refined.
- F17: `t3 auth session revoke` writes the database even while a server runs, and admission rechecks contain the session. Upstream's routing-through-server cases are replaced by the fork's three local cases.
- Persistence: proofs that retain pre-114 auth rows expect the connect columns that fork migrations 114 and 115 add (`persistence/testkit/connectAuthColumns.ts`). The settings upgrade journal lists 105-132, and `DatabaseMaintenance.ts` is a declared legacy-table reader.
- The JSON thread-output test seeds a fresh database whose migration logs must stay out of stdout. The fork refuses an unknown future migration rather than warning.
- MCP route mocks answer `getThreadShell`, the forge endpoint lists the issue tools, and the default session capabilities include `issues`.
- Upstream fixtures gained fork-required members: `assertClientAdmission` in the WebSocket compression mock, `waitForFunction` in the snapshot fake page and `readLocalStatusRefSnapshot` in the auto-pull workflow mock. Two Antigravity installation fixtures set their mode with `chmod`, so this host's `077` umask no longer clips it.
- Web: the right panel store migrates to version 16; the system theme test mocks theme backgrounds, which now read environment state; and the composer screenshot test follows upstream's held send, where ChatView holds a message until its image is prepared while compaction still waits in the composer. The composer send, headless update guidance and Thread model picker tests became browser tests, because GT localization and external stores no longer render through Node static markup. `fork/chat-and-draft-presentation.md` names the moved file.
- F06 publication binds to the provider's authenticated endpoint, so upstream's new-project publish toggle and IME publish-path fixtures (`CommandPalette.composition`, `GitActionsControl.composition`) name the GitHub host they authenticated to.
- F16 launcher admission: a pasted image that is still preparing no longer disables send, because ChatView holds that send (upstream). The launcher test now expects a disabled send only during a native capture; the launcher itself still waits on submission readiness, which counts preparing images.
- Upstream's `/clear` compaction test runs without the app stylesheet. There, the document outgrows the viewport and the fork's board turn surface lays the timeline's composer inset over the fresh-session notice. With the stylesheet the notice is on top, so the test presses "Keep the current session" through the DOM instead of hit-testing a point.
- Environment: Playwright Chromium build 1248, which `playwright-core` 1.64.1 needs, was installed for the preview tests.
- `packages/ssh/src/tunnel.test.ts` "waits for a boot service between two servers (preinstalled: true)" failed because the preinstalled helper ignored `service-serving.lock`. The helper fix described above makes it pass.
- `apps/desktop/src/app/DesktopCliShim.test.ts` "keeps the AppImage mounted until the server exits after SIGHUP to the process group" failed once under the full root run. It passes in isolation and in the desktop workspace run. It is upstream's signal-ordering test; the fork changes only its temporary-directory plumbing.

## Gate evidence

Every gate ran with `NODE_ENV`, `ELECTRON_RUN_AS_NODE` and every `T3CODE_*` variable unset and `TMPDIR=/tmp`. An inherited `TMPDIR` under a `.t3` path breaks the Windows sidecar ASAR tests in `scripts/build-desktop-artifact.test.ts`.

Final gate results on the committed tree:

| Gate                             | Result                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm fmt:check`                 | pass, 8,252 files                                                                    |
| `pnpm test:release-safety`       | pass (release and server image workflow safety)                                      |
| `pnpm lint`                      | exit 0, 17 pre-existing warnings, none in files this intake repaired                 |
| `pnpm typecheck`                 | exit 0, 43/43 tasks                                                                  |
| `pnpm test`                      | exit 0, 40/40 workspace tasks, 2,465 test files, 33,083 passed, 31 skipped, 0 failed |
| `vp run knip:check` (pre-commit) | exit 0                                                                               |

Within `pnpm test`, the server ran 583 files with 9,721 passed and 26 skipped, and web ran 703 files with 7,845 passed. Mobile had 3,748 passed and desktop 1,353. The SSH tunnel suite passed 53 of 53.

An earlier root run failed 2 cases in `apps/web/src/components/Sidebar.browser.test.tsx`. Unsent drafts that upstream's `ChatView.browser.test.tsx` writes leaked into the Sidebar file through shared browser storage. Both files match upstream. The Sidebar file passes alone (10 of 10) and in the standalone web run, and the rerun above passed. This is recorded as an upstream test-isolation finding.

Deferred: `vp run i18n:check`, which CI runs, reports 246 catalog differences. Upstream's localization lands in this intake, and the fork's own strings were never extracted or translated. Most are fork strings missing from `en.json`, plus 25 in mobile and desktop. Passing it needs `vp run i18n:generate` and translations in every locale catalog. Those translations are a separate decision and were not invented here. The pre-commit hook does not run this check.

`pnpm lint:mobile` passed because the merge brings upstream native mobile changes: ktlint and detekt are clean on 63 Kotlin files. This Linux host has no SwiftLint, so the check skipped 36 Swift files. No production runtime was touched.

## Commit Effects

If applied, this commit lands upstream T3 Code through `v0.1.11` (`dd19bce823`) on the promoted fork base, including the SQLite index and migration wave, `Words` Markdown, full app localization, unified side threads, the issue and PR tools, tracked-folder projects and the provider runtime wave, while keeping exact-origin identity, fork persistence lineage, external Admin authority, the thread canvas and page state, disabled agent feedback and registry-free SSH launch.
