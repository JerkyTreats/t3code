# Upstream Intake Plan And Reconciliation Record (2026-11-22)

Date: 2026-11-22
Status: controlling reconciliation record (pre-implementation baseline frozen)
Planning branch: `plan/upstream-intake-20261122`
Target local reconciliation branch: `intake/upstream-20261122`
Governing policies:
- [Upstream Reconciliation And Origin Publication Policy](../governance/upstream_merge_policy.md)
- [Fork Isolation Policy](../governance/fork_isolation_policy.md)
- [Commit Policy](../governance/commit_policy.md)
- [Fork Persistence Compatibility](../fork/persistence-compatibility.md)

## 1. Revision Boundaries And Scope

| Boundary | Exact revision / ref | Notes |
| --- | --- | --- |
| Upstream target (`upstream/main`, v0.1.11) | `dd19bce823d833b5612fd74851d50047e65347fa` | Read-only external reconciliation source |
| Step 1 promoted origin base (`promote/staging-canvas-20261122`) | `1fff32521c2560d5fbaedd1e8f4f6c4ab79bee38` | `2dbeae9bea` + cherry-picked `5549706896` |
| Canvas working branch tip (pre-cherry-pick) | `2dbeae9bea09918bc92d5dc8ccd24e0144e91ea8` | `origin/spike/canvas-surface-cards` (F32 + F33, fork migration head 104) |
| Production `main` admission-stall fix | `5549706896c98f1773bd3c9bdcc33191674433ee` | `ClientConnectionRegistry.ts` 30s unconfirmed admission grace; zero upstream conflicts in `3e4d449308..dd19bce823` |
| Current upstream merge base (v0.1.8) | `3e4d44930893422bba0f402aeefe9eb0b44692a6` | Last intake landed via `.ledger/upstream-intake-20261109.md` |
| Upstream commit range | `3e4d449308..dd19bce823` | **3,209** upstream commits (v0.1.8 -> v0.1.11) |
| Dry-run merge tree (`git merge-tree --write-tree 1fff32521c dd19bce823`) | `b5b4884cf607c0cbfb9273c390bcc0687ca4dfc7` | Identical conflict set to `2dbeae9bea` vs `dd19bce823`: **310** conflicted paths (**246** content, **63** modify/delete, **1** add/add) and **589** text conflict hunks |

Active fork contract authority is `patch.md` and the 19 active specifications under `fork/`. Retired features listed in `fork/retired-features.md` (F05, F07-F15, F21, F24-F26, F28-F31, Fleet continuation) create zero replay, preservation, compatibility, or verification obligations.

## 2. Selected Reconciliation Workflow

**Selected workflow:** **Merge And Repair** (`git merge --no-commit dd19bce823` on local branch `intake/upstream-20261122` created from `1fff32521c`).

**Rationale:**
- All active fork owners (PERSIST, F01, F02, F03, F04, F06, F16, F17, F20, F22, F23, F27, F32, F33) were already isolated onto v0.1.8 upstream hosts during the October/November 2026 intakes.
- Merging upstream ancestry keeps every fork diff, migration continuation, and decision boundary inspectable without throwing away F32/F33 or the exact-origin provider bindings.
- Where upstream replaced an underlying host primitive (most notably `0fb6ac6e65` replacing `remark` with `Words` static Markdown islands in `apps/web`, and `7c6e889ddb` replacing `SideChatPane.tsx` with `SideThreadPane.tsx`), we explicitly **replay** the fork seam onto the new upstream primitive rather than preserving superseded fork internals.

## 3. Upstream Product Lanes Being Accepted (And Explicit Exclusions / Overrides)

### Accepted upstream product lanes (`3e4d449308..dd19bce823`)
1. **Performance & SQLite query/index wave (migrations 081-108 -> fork 105-132):** per-migration transaction execution & desktop readiness log signals, FTS search text & triggers, turn-item/thread-item count triggers, active shell & command read indexes, background recovery & turn-start indexes, deferred slash command index, task folders, worktree path key index.
2. **`Words` static Markdown islands (`0fb6ac6e65`):** `@pierre/words` + HAST island serializer + `SharedTooltipProvider` replacing `remark`/`react-markdown` in `apps/web`.
3. **Full app i18n (`gt-react` across web/desktop/mobile, `055b44919e` et al.):** localized UI strings across 10 languages.
4. **Unified linked threads / side threads / subagents (`7c6e889ddb`):** `SideThreadPane.tsx` replacing `SideChatPane.tsx`, unified inspector/linked-thread viewing, read-only linked-environment threads, multi-environment linking (`8e8ff9b243`, `6f644f6e91`), and preview loopback port tunneling (`cbae97f620`, `0226239a41`, `420d1b5900`).
5. **Issue tracking & PR MCP tools (`20501a0221`, `adffb3623f`, `0597b9edcd`, `86863beede`, `5d05902ddd`, `f7041fabc8`, `37f8a5325c`, `e19193db45`):** accepted **strictly under F06 exact-origin override** (see exclusions below).
6. **Multi-repository / tracked-folder projects (`60863edc41`, migration `104` -> fork `128`):** accepted **strictly with F06 exact-origin verification** per tracked repository.
7. **Provider runtime wave (Antigravity 1.5 / Gemini 4 / ACP / Codex / Claude / OpenCode / Pi / Fx / Cursor):** native Antigravity goals & Auto review, Gemini 4 Carbon & Orchestrator pricing/quota, ACP reconnect/session-load/subagent/steer fixes, native stopped-thread resume (`9e19b7f7e1`), Edit from here (`a99faf5a62`, `ccae953c46`), custom agent themes (`42057b82d0`), screen-reader live updates & titles (`40c3682543`, `1d218d1525`), keep-awake (`587deab7d3`), optional terminal close confirmation (`48a64a8b68`), custom interactive shell (`9795f45f23`).

### Explicit exclusions and governance overrides
| Upstream item / commit | Governance / fork basis | Required disposition |
| --- | --- | --- |
| `c79f618bf8` (`feat(issues): a fork lists its upstream's issues and its own (#39159)`) | **F06 + Upstream Merge Policy** (no upstream fallback in product Git/issue views) | **Override:** block upstream-repository issue discovery/listing/mutation; resolve issues strictly from exact `origin` and fail closed otherwise. |
| `fe9c98c98f` (`feat: agents can report T3 Code problems when you turn feedback on (#35871)`) | **Upstream Merge Policy** (nothing from this fork may be sent to upstream) | **Override:** append migration `132_AgentFeedback` for schema parity (`PERSIST.D3`), but force `agentFeedback` capability/reporting disabled (`off` / never transmitting to upstream T3 telemetry). |
| `a2edd281df`, `dd0737d3e2`, `9a0d02723c` (`T3 Connect` approval on `app.t3.codes`, `auth_connect_devices`) & `dd512d86c5` (DPoP renewal) | **F17 External Admin Portal Device Authority** | **Override / Reconcile:** append migrations `114_AuthConnectDevices` & `115_AuthConnectDeniedRequests` (`PERSIST.D3`), keep external Admin portal as sole enrollment/revocation authority; prevent unmediated `app.t3.codes` or in-app standard-client device enrollment/revocation UI; audit DPoP renewal against F17 admission/revocation checks. |
| `5d05902ddd`, `f7041fabc8`, `37f8a5325c`, `0597b9edcd` (new PR/CI/issue MCP tools) | **F06 + F17** (exact-origin mutations + 4-endpoint MCP admission) | **Override:** every PR/CI/issue read or mutation must validate exact `origin` and keep PR tools on `/mcp/pull-requests` (`t3-code-pull-requests`) with separate admission. |
| `packages/source-control-cursor-origin` | **F06** (hostname-only resolution, fixed API host) | **Exclude:** keep deleted (already excluded in `.ledger/upstream-intake-20261109.md`). |
| `t3 install`, `t3 up`, `t3 service`, `t3 uninstall`, `t3 update`, `serviceLauncher`, `bootService`, `pinnedRuntime`, `InstallT3Commands.tsx`, `UpdateTrackSwitchDialog.tsx`, `npmRelease.ts`, `scripts/install.*`, `scripts/npm-launcher/*` | **F01 / F16 / F20** (registry-free, operator-managed updates, no public npm/upstream install scripts) | **Exclude:** keep all 34 fork-deleted files deleted. |
| `apps/web/src/components/GitHubStarPrompt.tsx` | **Upstream Merge Policy** (no user actions targeting `pingdotgg/t3code`) | **Exclude:** keep deleted. |
| `apps/server/src/persistence/Migrations.test.ts` & `reconcileV2PreviewMigration.*` | **PERSIST.D1** (fork lineage owner replaces upstream preview reconciliation) | **Exclude:** keep deleted. |
| `.github/workflows/*` (22 fork-deleted workflows + 3 newly added upstream workflows: `issue-vouch.yml`, `mobile-dev-client.yml`, `pr-limits.yml`) | **F01 / F20 / Upstream Merge Policy** | **Exclude:** keep the 22 fork-deleted workflows deleted and delete the 3 newly added upstream workflows. |

## 4. Affected Active Fork Features And Per-Feature Dispositions

| Feature / Contract | Decision | Summary of treatment on `dd19bce823` |
| --- | --- | --- |
| `PERSIST` (`fork/persistence-compatibility.md`) | `override` | Keep `ForkMigrationPlan.ts` as sole lineage authority; append upstream migrations `081`-`108` at fork IDs `105`-`132`; adopt per-migration transaction execution + desktop readiness log signals in `Migrations.ts` without preview reconciliation or upstream V2 skip guard; preserve `state.sqlite` in `doctor.ts` and legacy V1 retention in `DatabaseMaintenance.ts` / `storageCleanup.ts`. |
| `F01` (`fork/F01-exact-origin-desktop-release.md`) | `override` | Preserve exact-origin update metadata, verified Linux descriptors, shared source-commit release version, registry-free SSH runtime acquisition, and exclusion of npm launcher / update-track switch / `InstallT3Commands`. |
| `F02` (`fork/F02-omarchy-system-theme.md`) | `replay` | Preserve Omarchy local theme observation and transient palette precedence alongside upstream's custom agent theme CSS (`42057b82d0`) across Code and Thread shells. |
| `F03` (`fork/F03-desktop-screenshot-capture.md`) | `replay` | Preserve optional top-level desktop screenshot capture and composer attachment reservation across `ChatComposer.tsx`, `useComposerAttachmentIntake.ts`, and `DesktopIpcHandlers.ts`. |
| `F04` (`fork/F04-composer-context-whitespace.md`) | `replay` | Preserve authored whitespace on terminal/element/preview context attachment across `useComposerSend.ts`, `useMultipleModelSend.ts`, `TimelineUserMessageRow.tsx`, and `ChatComposer.tsx`. |
| `F06` (`fork/F06-exact-origin-repository-identity.md`) | `override` | Preserve exact-origin binding across Git, VCS, PRs, review guides, triage, and all 6 retained source-control providers; extend exact-origin enforcement to new Issues (`c79f618bf8` blocked), PR/CI/issue MCP tools, and multi-repo tracked folders (`60863edc41`); keep Cursor Origin and `GitHubStarPrompt` excluded. |
| `F16` (`fork/F16-official-linux-desktop-launcher.md`) | `replay` | Preserve isolated standalone Code identity, channel-specific handoff directory, Wayland desktop name, managed URL handler preservation, and pre-ready Clerk/profile acquisition in `DesktopApp.ts`, `DesktopPreReadyPlatform.ts`, `DesktopBackendPool.ts`, `DesktopWindow.ts`, `main.ts`. |
| `F17` (`fork/F17-settings-admin.md`) | `override` | Preserve external Admin portal authority, 6-route HTTP boundary, explicit enrollment, 30s unconfirmed admission grace (`5549706896`), 4 separate MCP endpoints + session DELETE isolation, multi-endpoint `mcpOverAcpBridge.ts`, and Antigravity 4-endpoint pre-approval (`7966f202ef` override); gate `T3 Connect` / `app.t3.codes` and reconcile DPoP renewal (`dd512d86c5`). |
| `F18` / `F19` (onboarding/ledgers/commit policy) | `accept` + `replay` | Keep fork `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `.ledger/` workflow, and Commit Effects rules. |
| `F20` (`fork/F20-origin-server-image.md`) | `override` | Keep private server image policy, Skopeo verification, excluded `service`/`up`/`update`/`pinnedRuntime` commands, and operator-managed headless update UX (`ServerUpdateAction.tsx`, `updateEverything.logic.ts`, `selfUpdate.ts`). |
| `F22` (`fork/F22-serialized-mermaid-rendering.md`) | `replay` | Keep `isMermaidFenceLanguage` routing in `ChatMarkdown.tsx` (and check `makeInert` in `wordsHast.ts`) and `MermaidVisibleDiagram` wrapper in `MarkdownMermaidCodeBlock.tsx` with `gt-react` i18n. |
| `F23` (`fork/F23-preview-browser-controls.md`) | `replay` | Keep focused new/confirmed close/reopen and 10-entry close history across `useRightPanelActions.ts`, `useRightPanelSurfaceClose.ts`, `closePreviewSession.ts`, `PreviewView.tsx`, and `apps/desktop/src/preview/Manager.ts`. |
| `F27` (`fork/F27-t3-thread.md`) | `replay` | Keep one-use WSS ticket admission (`SessionStore.ts`), `creationSurface` persistence/projection (`ThreadLaunchService.ts`, `Sidebar.tsx`), compact headerless Thread presentation, and bounded native window title reconciled with upstream's screen-reader title format (`1d218d1525`). |
| `F32` (`fork/F32-thread-canvas.md`) | `replay` | Rebuild `canvasStateChips.ts` as a HAST transform for `Words` (`0fb6ac6e65`), move sanitizer span admission to `packages/shared/src/markdownHast.ts`, replay `ownSideChat` guard from deleted `SideChatPane.tsx` onto `SideThreadPane.tsx`, preserve canvas RPCs/MCP tools/context budget, and reconcile `ChatView.tsx`, `MessagesTimeline.tsx`, `RightPanelTabs.tsx`, `RightPanelSurfaceContent.tsx`, `MarkdownFileLink.tsx`, `AssistantCitationChip.tsx`, `ThreadPullRequestsPanel.tsx`, and `surface.ts`. |
| `F33` (`fork/F33-page-state.md`) | `replay` | Preserve `PageStateStore`, `page_state` MCP tool, `t3.state` bootstrap in `packages/shared/src/htmlRender.ts`, `BrowserDocumentFrame.tsx` / `HtmlRenderDialog.tsx` / `GuestHtmlRender.tsx` adapters, RPC scope enforcement, and Visuals guidance budget. |
| `sidebar-project-activity` & `thread-conversation-order` | `replay` | Preserve prompt/published-response ordering in `packages/client-runtime/src/state/threadSort.ts`, `operations/projects.ts`, `Sidebar.tsx`, and `apps/mobile/src/features/threads/threadListV2.ts`. |
| `chat-and-draft-presentation` | `replay` | Preserve floating permission control, full-width checkout strip, composer geometry, and centered draft on upstream's single design across `ChatComposer.tsx`, `ComposerControlsBar.tsx`, `ComposerFooterControls.tsx`, `ProviderModelPicker.tsx`. |

## 5. Immutable Protected-Decision Baseline

Frozen prior to implementation against:
- **Fork base:** `1fff32521c2560d5fbaedd1e8f4f6c4ab79bee38` (`promote/staging-canvas-20261122`)
- **Upstream target:** `dd19bce823d833b5612fd74851d50047e65347fa` (`upstream/main`, v0.1.11)
- **Dry-run merge tree:** `b5b4884cf607c0cbfb9273c390bcc0687ca4dfc7`

| Concern / Decision IDs | Selected Host Path | Initial Role | Fork Blob OID | Upstream Blob OID | Hunks | Hunk SHA-256 Fingerprints (first 4) | Authoritative Evidence & Known Gaps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PERSIST.D1-D7` | `apps/server/src/persistence/Migrations.ts` | Mechanical adapter (owner: `ForkMigrationPlan.ts`) | `c280919c77` | `66e0085232` | 2 | `6492eca64c`, `919675fb93` | `ForkMigrationPlan.test.ts`, `ForkMigrationUpgrade.test.ts`; **gap:** new continuation suite needed for 104->132 + per-migration rollback proof |
| `PERSIST.D6` | `apps/server/src/persistence/initializeV2Database.ts` | Durable owner | `717170eaed` | `1a9f4bac55` | 1 | `51bc546418` | `initializeV2Database.test.ts` |
| `PERSIST.D5, D7` | `apps/server/src/persistence/DatabaseMaintenance.ts` | Mechanical adapter | `2695595e24` | `bdb1c459f6` | 3 | `bda49bfb8a`, `76963e2034`, `a378a1d347` | `DatabaseMaintenance.test.ts`; must preserve FTS rebuild + keep V1 events/receipts |
| `PERSIST.D7` | `apps/server/src/cli/doctor.ts` | Mechanical adapter | `9b8d69bfb1` | `60af29ac41` | 6 | `e6024e7789`, `4f2738cbb6`, `d532b32b1d`, `44e831ef4f`... | `doctor.test.ts`; must never delete `state.sqlite` |
| `F06.D1-D7` | `apps/server/src/vcs/GitVcsDriverCore.ts` | Mechanical adapter (owner: `ExactOrigin*`) | `ef8feb43ba` | `f863f01bdb` | 18 | `69d1066525`, `9d68e82b72`, `213161a6f3`, `f9894596c5`... | `GitVcsDriverCore.test.ts`; **gap:** verify multi-repo tracked folders (`60863edc41`) |
| `F06.D2` | `apps/server/src/git/GitManager.ts` | Mechanical adapter | `d5e8ede1c2` | `dedf2d19f5` | 6 | `72380f5a46`, `6698f27c64`, `3e38b5cae8`, `77b9744244`... | `GitManager.test.ts` |
| `F06.D3, D4` | `apps/server/src/pullRequest/PullRequestService.ts` | Mechanical adapter | `4b85a331cf` | `59ece02921` | 2 | `51825403df`, `58611e3fc7` | `PullRequestService.test.ts`; **gap:** new PR write/merge/check-rerun MCP tools |
| `F06.D3, D5` | `apps/server/src/mcp/toolkits/pullRequests/handlers.ts` | Mechanical adapter | `ae5c05ca6b` | `ddb3f2a025` | 2 | `282f7c325b`, `a7c1b03c2e` | `handlers.test.ts`; **gap:** verify new PR mutation & CI re-run handlers fail closed outside origin |
| `F06.D1, D3` | `packages/source-control-core/src/shared/definition.ts` | Mechanical adapter | `5d931b5f99` | `bca514d947` | 1 | `ccfaa8fb09` | `sourceControlClients.test.ts`; **gap:** must strip/override `c79f618bf8` upstream-issues discovery |
| `F17` / `F27` | `apps/server/src/auth/SessionStore.ts` | Mechanical adapter (owner: `WebSocketTicketAdmission.ts`, external Admin) | `330584a523` | `4057cbdb45` | 10 | `4e857374b9`, `40db146027`, `628b1bce27`, `35803b1855`... | `SessionStore.test.ts`; **gap:** DPoP renewal (`dd512d86c5`) + `auth_connect_devices` admission checks |
| `F17` | `apps/server/src/auth/EnvironmentAuth.ts` | Mechanical adapter | `56a5a0895d` | `977840617d` | 5 | `0be5955e43`, `2cb9b8b387`, `7ec32c4d23`, `7774f14d1d`... | `EnvironmentAuth.test.ts` |
| `F17` | `apps/server/src/auth/PairingGrantStore.ts` | Mechanical adapter | `4e15fd7e84` | `800486ce86` | 5 | `3c2df6cbf5`, `57dff2ec5d`, `144118f521`, `3ec75aac64`... | `PairingGrantStore.test.ts`; must preserve `enrollment_class` and F17 containment |
| `F17` / `F32` / `F33` | `apps/server/src/mcp/McpHttpServer.ts` | Mechanical adapter (owner: `McpEndpointAdmission.ts`) | `31d735e43a` | `fa04f45d39` | 4 | `8c7dad74ba`, `5a66a644df`, `d1d771dc6b`, `d8b98f3967` | `McpHttpServer.test.ts`, `McpCanvasToolkit.test.ts`; 4 endpoints + `canvas_*` + `page_state` |
| `F17` (ACP) | `packages/provider-acp/src/server/mcpOverAcpBridge.ts` | Mechanical adapter | `1fc4e18deb` | `779076a622` | 4 | `6d8a31fd9f`, `e4754f0394`, `e084e7b7b8`, `3684ca7153` | `mcpOverAcpBridge.test.ts`; **gap:** reconcile retryable/timed-out disconnect (`015eba4083`, `b46edac5c1`) with multi-server `replaceServers` |
| `F17` / `F32` / `F33` | `apps/server/src/ws.ts` | Mechanical adapter | `86dacd0e29` | `051f81c08f` | 9 | `53b68645aa`, `43c78dd917`, `e4257a4c0e`, `2f24038aab`... | `ws.test.ts` |
| `F01` / `F16` / `F27` | `apps/desktop/src/app/DesktopApp.ts` | Mechanical adapter | `1b5bfd4a8b` | `ba09871ee1` | 2 | `8a5982fab9`, `8fef3194ea` | `DesktopApp.test.ts` |
| `F16` / `F27` | `apps/desktop/src/app/DesktopPreReadyPlatform.ts` | Mechanical adapter | `38a42d9b55` | `8ac4654636` | 1 | `a6486633e5` | `DesktopPreReadyPlatform.test.ts` |
| `F16` / `F27` | `apps/desktop/src/window/DesktopWindow.ts` | Mechanical adapter | `58443b8ebd` | `880b9dfef4` | 1 | `b73029d7f3` | `DesktopWindow.test.ts` |
| `F01` / `F20` | `apps/server/src/cloud/selfUpdate.ts` | Mechanical adapter | `d2d4db44c7` | `1d1263b2eb` | 3 | `521b78147c`, `9677b1fd5d`, `7ea98454af` | `selfUpdate.test.ts` |
| `F01` / `F20` | `apps/server/src/binCli.ts` | Mechanical adapter | `ff556fdcb2` | `677336175d` | 1 | `9db04df364` | `binCli.test.ts` (note: `add/add` conflict) |
| `F27` | `apps/server/src/orchestration-v2/ThreadLaunchService.ts` | Mechanical adapter | `1a5b98b3d0` | `0382415179` | 1 | `412759ea85` | `creationSurface` provenance tests |
| `F32.D1, D7` | `apps/web/src/components/ChatView.tsx` | Mechanical adapter (owner: `ExcalidrawBoard.tsx`) | `8d40895f93` | `229ac99e3a` | 7 | `040ede6a9b`, `cef6acef2f`, `ff183558dc`, `73116bd572`... | `CanvasSurfaceCardView.browser.test.tsx`; **gap:** visual/staging check after `SideThreadPane` migration |
| `F32.D1, D4` | `apps/web/src/components/chat/MessagesTimeline.tsx` | Mechanical adapter | `bfe4a683ec` | `fe60471993` | 2 | `b65071f220`, `1bae19cf68` | `ServerDrawing.browser.test.tsx` |
| `F32.D7` | `apps/web/src/components/chat/SideChatPane.tsx` | Retired host (replaced by `SideThreadPane.tsx`) | `d35eb983c3` | `ABSENT` | mod/del | N/A (deleted upstream in `7c6e889ddb`) | **gap:** replay `ownSideChat` guard onto `SideThreadPane.tsx` with browser test |
| `F32.D7` | `apps/web/src/components/chat/MarkdownFileLink.tsx` | Mechanical adapter | `9c19942d15` | `eebeccc720` | 4 | `5875e48fb8`, `0b5052ebf0`, `a3221d8614`, `db76a5274b` | `CanvasSurfaceCardView.browser.test.tsx`; reconcile with `useSharedTooltip` & `gt-react` |
| `F33.D3` | `apps/web/src/components/files/BrowserDocumentFrame.tsx` | Mechanical adapter (owner: `pageStateBridge.tsx`) | `28235ca4ad` | `3270556fb0` | 1 | `80a61c65e2` | `pageStateBridge.browser.test.tsx` |
| `F33.D3` | `packages/shared/src/htmlRender.ts` | Mechanical adapter | `7b2ffaf33d` | `6b28ee648d` | 1 | `d304ed65fe` | `pageStateBridge.browser.test.tsx` |
| `F32.D5` | `packages/shared/src/markdownPipeline.ts` -> `markdownHast.ts` | Seam migration (owner: `canvasStateChips.ts`) | `0888ab624c` | `6bb022f532` | 1 | `6b433611c4` | **gap:** move chip span schema to `markdownHast.ts`, rewrite `canvasStateChips.ts` to HAST, update `ExcalidrawBoard.tsx` |
| `F32.D6`, `F33.D4` | `packages/provider-core/src/server/orchestrationInstructions.ts` | Mechanical adapter | `9af43af37c` | `3f97035bda` | 1 | `1c228cc34d` | `AgentContextBudget.test.ts`, `runtimeInstructions.test.ts` |
| `F03` / `F04` / `F32.D4` / Pres | `apps/web/src/components/chat/ChatComposer.tsx` | Mechanical adapter | `16bf3492db` | `5b540f48c4` | 10 | `7460987748`, `b2db5a48ac`, `8371b685d5`, `6f69006d78`... | Composer + screenshot + unseen-marks send tests |
| `F04` | `apps/web/src/components/chat/useComposerSend.ts` | Mechanical adapter | `14262082a4` | `18a9a54715` | 7 | `6a9519b785`, `d7071082da`, `62ea6085fd`, `847847e88a`... | `formatOutgoingPrompt` & whitespace preservation tests |
| `F22` | `apps/web/src/components/chat/MarkdownMermaidCodeBlock.tsx` | Mechanical adapter (owner: `MermaidVisibleDiagram.tsx`) | `63f02d24e0` | `2a7093003a` | 1 | `5236a99e19` | `MarkdownMermaidCodeBlock.browser.test.tsx`, `ChatMarkdown.browser.test.tsx` |
| `F23` | `apps/desktop/src/preview/Manager.ts` | Mechanical adapter | `2c9ca5fdcc` | `531e269a07` | 1 | `06d8f49f7a` | `Manager.test.ts` |
| `F23` | `apps/web/src/hooks/useRightPanelSurfaceClose.ts` | Mechanical adapter | `8f65639158` | `978090d3ee` | 2 | `183eb67eae`, `5375d710c7` | `useRightPanelSurfaceClose.browser.test.tsx`, `ReopenClosedViewShortcut.browser.test.tsx` |
| `thread-conversation-order` | `packages/client-runtime/src/state/threadSort.ts` | Durable owner | `870bef7b6e` | `3d0ebe16d7` | 2 | `441dab3620`, `05c9760cf3` | `threadSort.test.ts` + mobile `threadListV2.ts` |
| `sidebar-project-activity` / `F27` | `apps/web/src/components/Sidebar.tsx` | Mechanical adapter | `06c1504764` | `e9d45a5c1f` | 6 | `a10d6a29d3`, `b18129cd0d`, `7f0d834519`, `45ad94e438`... | Sidebar activity ordering + T3 Threads separation tests |
| `F02` | `apps/web/src/routes/__root.tsx` | Mechanical adapter | `290cc83953` | `3cbef77306` | 1 | `459aafd516` | Omarchy system theme projection & precedence tests |

## 6. Exact Conflict Inventory By Ownership Lane (310 Files, 589 Hunks)

| Ownership Lane | Files | Content | Mod/Del | Add/Add | Text Hunks | Key Risk / Focus |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **L1: Persistence & Migrations (`PERSIST`)** | 16 | 13 | 3 | 0 | 35 | Append upstream `081`-`108` as fork `105`-`132`; adopt per-migration loop & startup logs in `Migrations.ts`; keep `state.sqlite` in `doctor.ts` |
| **L2: Exact-Origin & Source Control (`F06`)** | 48 | 46 | 2 | 0 | 118 | `GitVcsDriverCore.ts` (18h), Azure/GitLab/GitHub providers, PR MCP handlers; block `c79f618bf8` upstream issues; verify multi-repo tracked folders |
| **L3: Release, Desktop, CLI, Packaging & Hosted Thread (`F01`/`F16`/`F20`/`F27`)** | 86 | 51 | 34 | 1 | 90 | Keep 34 excluded install/service/npm-launcher files deleted; resolve `binCli.test.ts` (`add/add`); preserve Electron Wayland/profile/window-title seams |
| **L4: External Admin, Auth, MCP & Provider Adapters (`F17` / ACP)** | 53 | 52 | 1 | 0 | 140 | `SessionStore.ts` (10h), `ws.ts` (9h), `ConnectionsSettings.tsx` (7h), `AuthPairingLinks.ts` (6h), `McpHttpServer.ts` (4h), `mcpOverAcpBridge.ts` (4h); gate T3 Connect; reconcile DPoP renewal |
| **L5: Thread Canvas, Page State & Words Markdown (`F32`/`F33`/`0fb6ac6e65`)** | 27 | 26 | 1 | 0 | 66 | `SideChatPane.tsx` deleted -> replay onto `SideThreadPane.tsx`; `ChatView.tsx` (7h), `ThreadPullRequestsPanel.tsx` (7h), `ProviderTurnStartService.ts` (6h); `Words` Markdown seam migration |
| **L6: Presentation, Preview, Ordering, Theme, Capture & Mermaid (`F02`/`F03`/`F04`/`F22`/`F23`)** | 33 | 33 | 0 | 0 | 67 | `ChatComposer.tsx` (10h), `useComposerSend.ts` (7h), `Sidebar.tsx` (6h), `SettingsPanels.tsx` (6h), `MarkdownMermaidCodeBlock.tsx` (1h) |
| **L7: Root Governance, CI Workflows, Docs & Manifests** | 47 | 25 | 22 | 0 | 73 | Keep 22 fork-deleted workflows + delete 3 new upstream workflows; `pnpm-lock.yaml` (19h); fork docs (`remote-access.md` 8h, `CONTRIBUTING.md` 6h, `AGENTS.md` 5h) |
| **Total** | **310** | **246** | **63** | **1** | **589** | Verified on `git merge-tree --write-tree 1fff32521c dd19bce823` |

### Complete per-lane file lists

<details>
<summary>L1: Persistence &amp; Migrations — 16 files (13 content, 3 mod/del; 35 hunks)</summary>

- `apps/server/scripts/migrate-dev-db.test.ts` [4h]
- `apps/server/src/cli/doctor.test.ts` [4h]
- `apps/server/src/cli/doctor.ts` [6h]
- `apps/server/src/orchestration-v2/FoundationPersistence.test.ts` [2h]
- `apps/server/src/orchestration-v2/legacy/LegacyV1Cutover.integration.test.ts` [3h]
- `apps/server/src/persistence/DatabaseMaintenance.test.ts` [2h]
- `apps/server/src/persistence/DatabaseMaintenance.ts` [3h]
- `apps/server/src/persistence/Migrations.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/persistence/Migrations.ts` [2h]
- `apps/server/src/persistence/Migrations/064_CanonicalizeThreadPullRequestLinks.test.ts` [1h]
- `apps/server/src/persistence/Sqlite.test.ts` [3h]
- `apps/server/src/persistence/Sqlite.ts` [3h]
- `apps/server/src/persistence/initializeV2Database.ts` [1h]
- `apps/server/src/persistence/reconcileV2PreviewMigration.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/persistence/reconcileV2PreviewMigration.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/storageCleanup.ts` [1h]

</details>

<details>
<summary>L2: Exact-Origin &amp; Source Control (F06) — 48 files (46 content, 2 mod/del; 118 hunks)</summary>

- `apps/server/src/git/GitManager.test.ts` [10h]
- `apps/server/src/git/GitManager.ts` [6h]
- `apps/server/src/git/linkCreatedPullRequest.test.ts` [1h]
- `apps/server/src/git/linkCreatedPullRequest.ts` [2h]
- `apps/server/src/mcp/toolkits/pullRequests/handlers.test.ts` [1h]
- `apps/server/src/mcp/toolkits/pullRequests/handlers.ts` [2h]
- `apps/server/src/orchestration-v2/PullRequestSyncReactor.test.ts` [3h]
- `apps/server/src/project/RepositoryIdentityResolver.ts` [1h]
- `apps/server/src/pullRequest/PullRequestReviewGuideService.test.ts` [2h]
- `apps/server/src/pullRequest/PullRequestReviewGuideService.ts` [2h]
- `apps/server/src/pullRequest/PullRequestService.test.ts` [1h]
- `apps/server/src/pullRequest/PullRequestService.ts` [2h]
- `apps/server/src/serverRuntimeStartup.autoPull.test.ts` [3h]
- `apps/server/src/sourceControl/SourceControlProviderRegistry.test.ts` [2h]
- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts` [1h]
- `apps/server/src/sourceControl/SourceControlRepositoryService.test.ts` [1h]
- `apps/server/src/triage/triagePrompt.ts` [1h]
- `apps/server/src/vcs/GitVcsDriverCore.test.ts` [3h]
- `apps/server/src/vcs/GitVcsDriverCore.ts` [18h]
- `apps/web/src/components/GitActionsControl.tsx` [1h]
- `apps/web/src/components/GitHubStarPrompt.tsx` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/components/pullRequest/pullRequestDetail.logic.ts` [1h]
- `packages/client-runtime/src/sourceControlClients.test.ts` [2h]
- `packages/shared/src/git.ts` [1h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsCli.test.ts` [1h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsCli.ts` [3h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsPullRequestCli.ts` [2h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsPullRequestProvider.test.ts` [1h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsPullRequestProvider.ts` [9h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsSourceControlProvider.test.ts` [1h]
- `packages/source-control-azure-devops/src/server/AzureDevOpsSourceControlProvider.ts` [7h]
- `packages/source-control-azure-devops/src/shared/definition.ts` [1h]
- `packages/source-control-bitbucket/src/shared/definition.ts` [2h]
- `packages/source-control-core/src/shared/definition.ts` [1h]
- `packages/source-control-cursor-origin/src/server/OriginSourceControlProvider.ts` [fork-deleted / upstream-modified -> keep deleted]
- `packages/source-control-definitions/src/registry.ts` [2h]
- `packages/source-control-forgejo/src/server/ForgejoSourceControlProvider.test.ts` [1h]
- `packages/source-control-forgejo/src/shared/definition.ts` [2h]
- `packages/source-control-gitcafe/src/shared/definition.ts` [1h]
- `packages/source-control-github/src/server/GitHubSourceControlProvider.test.ts` [3h]
- `packages/source-control-github/src/server/GitHubSourceControlProvider.ts` [3h]
- `packages/source-control-gitlab/src/server/GitLabCli.test.ts` [1h]
- `packages/source-control-gitlab/src/server/GitLabCli.ts` [3h]
- `packages/source-control-gitlab/src/server/GitLabPullRequestCli.test.ts` [3h]
- `packages/source-control-gitlab/src/server/GitLabPullRequestCli.ts` [1h]
- `packages/source-control-gitlab/src/server/GitLabPullRequestProvider.ts` [1h]
- `packages/source-control-gitlab/src/server/GitLabSourceControlProvider.ts` [1h]
- `packages/source-control-gitlab/src/shared/definition.ts` [1h]

</details>

<details>
<summary>L3: Release, Desktop, CLI, Packaging &amp; Hosted Thread (F01/F16/F20/F27) — 86 files (51 content, 34 mod/del, 1 add/add; 90 hunks)</summary>

- `apps/desktop/src/app/DesktopApp.test.ts` [1h]
- `apps/desktop/src/app/DesktopApp.ts` [2h]
- `apps/desktop/src/app/DesktopCliShim.test.ts` [1h]
- `apps/desktop/src/app/DesktopPreReadyPlatform.test.ts` [1h]
- `apps/desktop/src/app/DesktopPreReadyPlatform.ts` [1h]
- `apps/desktop/src/app/DesktopStartupRecovery.ts` [1h]
- `apps/desktop/src/backend/DesktopBackendPool.test.ts` [3h]
- `apps/desktop/src/backend/DesktopBackendPool.ts` [3h]
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts` [3h]
- `apps/desktop/src/main.ts` [1h]
- `apps/desktop/src/window/DesktopWindow.test.ts` [1h]
- `apps/desktop/src/window/DesktopWindow.ts` [1h]
- `apps/server/src/bin.ts` [1h]
- `apps/server/src/binCli.test.ts` [add/add, 1h]
- `apps/server/src/binCli.ts` [1h]
- `apps/server/src/cli/install.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/install.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/invocation.test.ts` [2h]
- `apps/server/src/cli/invocation.ts` [2h]
- `apps/server/src/cli/service.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/service.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/serviceLauncher.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/uninstall.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/uninstall.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/up.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/up.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/update.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cli/update.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cliCompileCache.test.ts` [1h]
- `apps/server/src/cloud/bootService.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/bootService.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/http.test.ts` [1h]
- `apps/server/src/cloud/pinnedRuntime.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/pinnedRuntime.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/selfUpdate.test.ts` [7h]
- `apps/server/src/cloud/selfUpdate.ts` [3h]
- `apps/server/src/cloud/serviceLauncherClient.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/serviceLauncherClient.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/servicePreflight.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/servicePreflight.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/serviceProtection.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/serviceProtection.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/cloud/serviceProtocol.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/orchestration-v2/ProjectionControlReads.test.ts` [1h]
- `apps/server/src/orchestration-v2/ProviderTurnControlService.test.ts` [1h]
- `apps/server/src/orchestration-v2/ProviderTurnControlService.ts` [5h]
- `apps/server/src/orchestration-v2/RestartBackgroundNote.ts` [2h]
- `apps/server/src/orchestration-v2/ThreadLaunchService.ts` [1h]
- `apps/server/src/orchestration-v2/ThreadManagementService.ts` [1h]
- `apps/server/src/orchestration-v2/ThreadMessageIntake.test.ts` [2h]
- `apps/server/src/orchestration-v2/ThreadMessageIntake.ts` [1h]
- `apps/server/src/orchestration-v2/testkit/ProviderReplayHarness.ts` [3h]
- `apps/server/src/provider/userInputAttachments.test.ts` [1h]
- `apps/server/src/serverOwnership.ts` [2h]
- `apps/server/src/serverRuntimeStartup.test.ts` [1h]
- `apps/server/src/serverRuntimeStartup.ts` [2h]
- `apps/server/src/serverRuntimeState.ts` [1h]
- `apps/server/src/serviceLauncher.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/src/serviceLauncher.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/server/vite.config.ts` [1h]
- `apps/web/src/components/HostedEmptyState.tsx` [2h]
- `apps/web/src/components/InstallT3Commands.tsx` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/components/ServerUpdateAction.tsx` [3h]
- `apps/web/src/components/desktopUpdate.logic.ts` [1h]
- `apps/web/src/components/settings/UpdateTrackSwitchDialog.tsx` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/components/settings/updateTrackSwitch.logic.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/components/settings/updateTrackSwitch.logic.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/components/sidebar/updateEverything.logic.test.ts` [1h]
- `apps/web/src/components/sidebar/updateEverything.logic.ts` [4h]
- `apps/web/src/components/sidebar/useUpdateEverything.ts` [1h]
- `apps/web/src/connection/platform.ts` [1h]
- `apps/web/src/state/npmRelease.ts` [fork-deleted / upstream-modified -> keep deleted]
- `apps/web/src/versionSkew.test.ts` [1h]
- `apps/web/src/versionSkew.ts` [1h]
- `packages/contracts/src/ipc.ts` [2h]
- `packages/contracts/src/orchestrationV2.test.ts` [1h]
- `packages/provider-core/src/server/subagentProjection.ts` [1h]
- `packages/shared/src/cliRelease.ts` [1h]
- `packages/ssh/src/tunnel.test.ts` [1h]
- `packages/ssh/src/tunnel.ts` [4h]
- `scripts/build-desktop-artifact.ts` [2h]
- `scripts/build-npm-launcher.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `scripts/install.ps1` [fork-deleted / upstream-modified -> keep deleted]
- `scripts/install.sh` [fork-deleted / upstream-modified -> keep deleted]
- `scripts/install.test.ts` [fork-deleted / upstream-modified -> keep deleted]
- `scripts/npm-launcher/t3.mjs` [fork-deleted / upstream-modified -> keep deleted]

</details>

<details>
<summary>L4: External Admin, Auth, MCP &amp; Provider Adapters (F17 / ACP) — 53 files (52 content, 1 mod/del; 140 hunks)</summary>

- `apps/server/src/auth/EnvironmentAuth.test.ts` [1h]
- `apps/server/src/auth/EnvironmentAuth.ts` [5h]
- `apps/server/src/auth/PairingGrantStore.test.ts` [2h]
- `apps/server/src/auth/PairingGrantStore.ts` [5h]
- `apps/server/src/auth/SessionStore.test.ts` [1h]
- `apps/server/src/auth/SessionStore.ts` [10h]
- `apps/server/src/auth/http.ts` [3h]
- `apps/server/src/cli/connect.ts` [2h]
- `apps/server/src/cli/pair.test.ts` [2h]
- `apps/server/src/cli/pair.ts` [1h]
- `apps/server/src/cliAuthFormat.ts` [1h]
- `apps/server/src/environment/ServerEnvironment.ts` [2h]
- `apps/server/src/mcp/McpHttpServer.test.ts` [4h]
- `apps/server/src/mcp/McpHttpServer.ts` [4h]
- `apps/server/src/mcp/McpSessionRegistry.test.ts` [2h]
- `apps/server/src/mcp/McpSessionRegistry.ts` [1h]
- `apps/server/src/mcp/OrchestratorMcpService.ts` [1h]
- `apps/server/src/mcp/toolkits/orchestrator/tools.ts` [1h]
- `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts` [2h]
- `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` [1h]
- `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts` [1h]
- `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` [3h]
- `apps/server/src/orchestration-v2/Adapters/OpenCode2AdapterV2.test.ts` [1h]
- `apps/server/src/persistence/AuthPairingLinks.ts` [6h]
- `apps/server/src/persistence/AuthSessions.ts` [1h]
- `apps/server/src/provider/CodexProvider.test.ts` [2h]
- `apps/server/src/provider/acp/AcpJsonRpcConnection.test.ts` [1h]
- `apps/server/src/server.ts` [2h]
- `apps/server/src/ws.test.ts` [2h]
- `apps/server/src/ws.ts` [9h]
- `apps/web/src/components/mcp/UseInAnotherAppDialog.tsx` [4h]
- `apps/web/src/components/settings/AuthorizedClientsSettings.tsx` [4h]
- `apps/web/src/components/settings/ConnectionsSettings.logic.test.ts` [1h]
- `apps/web/src/components/settings/ConnectionsSettings.logic.ts` [5h]
- `apps/web/src/components/settings/ConnectionsSettings.tsx` [7h]
- `apps/web/src/environments/primary/auth.ts` [2h]
- `apps/web/src/state/peerPairingCode.ts` [2h]
- `apps/web/test/environmentHttpTest.ts` [1h]
- `packages/client-runtime/src/state/auth.ts` [fork-deleted / upstream-modified -> keep deleted]
- `packages/client-runtime/src/state/server.ts` [3h]
- `packages/client-runtime/src/t3ToolSummary.ts` [1h]
- `packages/contracts/src/auth.ts` [3h]
- `packages/contracts/src/environmentHttp.ts` [3h]
- `packages/contracts/src/rpc.ts` [1h]
- `packages/provider-acp/src/server/adapter.ts` [2h]
- `packages/provider-acp/src/server/mcpOverAcpBridge.test.ts` [1h]
- `packages/provider-acp/src/server/mcpOverAcpBridge.ts` [4h]
- `packages/provider-cursor/src/server/adapter.ts` [2h]
- `packages/provider-muse/src/server/adapter.test.ts` [2h]
- `packages/provider-opencode/src/server/v2/adapter.ts` [7h]
- `packages/provider-pi/src/server/mcpBridge.testkit.ts` [1h]
- `packages/provider-pi/src/server/mcpExtensionSource.ts` [3h]
- `packages/shared/src/t3McpToolPresentation.ts` [2h]

</details>

<details>
<summary>L5: Thread Canvas, Page State &amp; Words Markdown (F32/F33/0fb6ac6e65) — 27 files (26 content, 1 mod/del; 66 hunks)</summary>

- `apps/server/src/orchestration-v2/ProviderTurnStartService.test.ts` [4h]
- `apps/server/src/orchestration-v2/ProviderTurnStartService.ts` [6h]
- `apps/server/src/orchestration-v2/runtimeLayer.ts` [1h]
- `apps/server/src/provider/AgentContextBudget.test.ts` [1h]
- `apps/server/src/provider/agentContextBudget.json` [1h]
- `apps/web/src/browser/ServerBrowserSurface.browser.test.tsx` [2h]
- `apps/web/src/components/ChatView.logic.ts` [2h]
- `apps/web/src/components/ChatView.tsx` [7h]
- `apps/web/src/components/RightPanelTabs.tsx` [4h]
- `apps/web/src/components/chat/AssistantCitationChip.tsx` [2h]
- `apps/web/src/components/chat/AssistantSelectionToolbar.tsx` [3h]
- `apps/web/src/components/chat/HtmlRenderDialog.tsx` [1h]
- `apps/web/src/components/chat/MarkdownFileLink.tsx` [4h]
- `apps/web/src/components/chat/MessagesTimeline.tsx` [2h]
- `apps/web/src/components/chat/RightPanelSurfaceContent.tsx` [3h]
- `apps/web/src/components/chat/SideChatPane.tsx` [upstream-deleted / fork-modified -> accept delete; replay `ownSideChat` onto `SideThreadPane.tsx`]
- `apps/web/src/components/chat/useRightPanelActions.ts` [3h]
- `apps/web/src/components/chat/useSideChat.ts` [3h]
- `apps/web/src/components/files/BrowserDocumentFrame.tsx` [1h]
- `apps/web/src/components/preview/addBrowserSurface.ts` [2h]
- `apps/web/src/components/pullRequest/ThreadPullRequestsPanel.tsx` [7h]
- `apps/web/src/rightPanelStore.ts` [2h]
- `apps/web/src/terminal/ghostty/surface.ts` [1h]
- `packages/provider-core/src/server/orchestrationInstructions.ts` [1h]
- `packages/provider-core/src/server/runtimeInstructions.test.ts` [1h]
- `packages/shared/src/htmlRender.ts` [1h]
- `packages/shared/src/markdownPipeline.ts` [1h]

</details>

<details>
<summary>L6: Presentation, Preview, Ordering, Theme, Capture &amp; Mermaid (F02/F03/F04/F22/F23) — 33 files (33 content; 67 hunks)</summary>

- `apps/desktop/src/preview/Manager.test.ts` [1h]
- `apps/desktop/src/preview/Manager.ts` [1h]
- `apps/mobile/src/features/threads/threadListV2.ts` [1h]
- `apps/server/src/preview/ServerBrowser.test.ts` [1h]
- `apps/server/src/preview/ServerBrowserPage.ts` [1h]
- `apps/web/src/appInit.tsx` [2h]
- `apps/web/src/browser/HostedBrowserWebview.tsx` [1h]
- `apps/web/src/components/ChatMarkdown.browser.test.tsx` [1h]
- `apps/web/src/components/ReopenClosedViewShortcut.browser.test.tsx` [1h]
- `apps/web/src/components/Sidebar.tsx` [6h]
- `apps/web/src/components/chat/ChatComposer.tsx` [10h]
- `apps/web/src/components/chat/ComposerControlsBar.tsx` [1h]
- `apps/web/src/components/chat/ComposerFooterControls.tsx` [2h]
- `apps/web/src/components/chat/MarkdownMermaidCodeBlock.tsx` [1h]
- `apps/web/src/components/chat/ProviderModelPicker.tsx` [1h]
- `apps/web/src/components/chat/TimelineUserMessageRow.tsx` [1h]
- `apps/web/src/components/chat/useComposerAttachmentIntake.ts` [1h]
- `apps/web/src/components/chat/useComposerSend.ts` [7h]
- `apps/web/src/components/chat/useMultipleModelSend.ts` [2h]
- `apps/web/src/components/chat/useSystemComposerBanners.tsx` [2h]
- `apps/web/src/components/preview/PreviewView.tsx` [1h]
- `apps/web/src/components/preview/closePreviewSession.test.ts` [2h]
- `apps/web/src/components/preview/closePreviewSession.ts` [2h]
- `apps/web/src/components/settings/SettingsPanels.tsx` [6h]
- `apps/web/src/components/settings/settingsSearch.ts` [1h]
- `apps/web/src/hooks/useRightPanelSurfaceClose.browser.test.tsx` [1h]
- `apps/web/src/hooks/useRightPanelSurfaceClose.ts` [2h]
- `apps/web/src/keybindings.test.ts` [1h]
- `apps/web/src/routes/__root.tsx` [1h]
- `apps/web/src/shortcuts/chatRouteCommands.ts` [2h]
- `apps/web/src/timestampFormat.ts` [1h]
- `packages/client-runtime/src/operations/projects.ts` [1h]
- `packages/client-runtime/src/state/threadSort.ts` [2h]

</details>

<details>
<summary>L7: Root Governance, CI Workflows, Docs &amp; Manifests — 47 files (25 content, 22 mod/del; 73 hunks)</summary>

- `.github/triage/PLAYBOOK.md` [1h]
- `.github/workflows/ci.yml` [4h]
- `.github/workflows/mobile-showcase-screenshots.yml` [1h]
- 22 fork-deleted workflows (`agent-context-budget`, `deploy-relay`, `desktop-macos-preview`, `desktop-macos-preview-publish`, `issue-labels`, `mobile-android-apk`, `mobile-eas-preview`, `mobile-eas-preview-fork`, `mobile-eas-production`, `mobile-fingerprint-check`, `mobile-fingerprint-label`, `pr-size`, `pr-vouch`, `publish-aur`, `relay-preview`, `relay-preview-cleanup`, `release`, `release-desktop`, `stale-needs-more-info`, `thread-transfer-report`, `web-preview`, `windows-tests`) [fork-deleted / upstream-modified -> keep deleted]
- `AGENTS.md` [5h], `CONTRIBUTING.md` [6h], `README.md` [2h]
- `apps/marketing/package.json` [1h], `apps/marketing/src/pages/95.astro` [1h]
- `apps/server/package.json` [2h], `package.json` [1h], `packages/shared/package.json` [1h], `pnpm-lock.yaml` [19h]
- `docs/internals/environment-auth.md` [1h], `docs/internals/server-updates.md` [1h], `docs/internals/voice-input.md` [1h]
- `docs/operations/development.md` [1h], `docs/operations/release.md` [2h]
- `docs/user/background-service.md` [5h], `docs/user/install.md` [4h], `docs/user/outside-agents.md` [1h], `docs/user/remote-access.md` [8h], `docs/user/source-control.md` [1h], `docs/user/thread-sidebar.md` [1h], `docs/user/updating.md` [2h]
- `evals/mcp-tool-use/run.ts` [1h]

</details>

### Non-conflicting silent-break / semantic-override surfaces (critical!)
These paths do **not** show up in `git merge-tree` conflicts, yet will break compilation, tests, or fork policy if missed:
1. **`apps/web/src/fork/ExcalidrawBoard.tsx` & `apps/web/src/fork/canvasStateChips.ts` & `canvasStateChips.test.ts`:** fail to compile/run after `0fb6ac6e65` removes `extraRemarkPlugins`, `mdast`, `unified`, and `remark-*` from `apps/web`.
2. **`apps/server/src/provider/acp/AntigravityAcpSupport.ts` (`7966f202ef`):** pre-approves only `ServerName === "t3-code"` and `/^Run mcp_t3-code_/` instead of all 4 fork MCP namespaces (`t3-code`, `t3-code-preview`, `t3-code-device`, `t3-code-pull-requests`).
3. **`apps/server/src/issue/IssueService.ts` & `packages/client-runtime/src/issueLinks.ts` & `issueList.ts` (`c79f618bf8`):** newly added upstream code queries upstream issues on a fork — violates F06.
4. **`apps/server/src/feedback/FeedbackService.ts` (`fe9c98c98f`):** new upstream agent-feedback reporting path to T3 telemetry — must be disabled in fork.
5. **Six new upstream migration test files (`075`, `094`, `095`, `096`, `102`, `103` `.test.ts`):** pass upstream `toMigrationInclusive` IDs and must be remapped by `+24`.
6. **Three newly added upstream workflows (`.github/workflows/issue-vouch.yml`, `mobile-dev-client.yml`, `pr-limits.yml`):** clean adds that must be removed to maintain fork workflow hygiene.
7. **`apps/web/src/markdown/wordsHast.ts` (`makeInert`):** downgrades only `language-mermaid` and should also downgrade `mmd`/`MMD` via `isMermaidFenceLanguage` (F22).
8. **`apps/web/src/components/chat/SideThreadPane.tsx` (`7c6e889ddb`):** new replacement for deleted `SideChatPane.tsx` — must receive F32.D7's `ownSideChat` guard.

## 7. Exact Migration ID Mapping (Upstream 081-108 -> Fork 105-132)

At `2dbeae9bea` / `1fff32521c`, `apps/server/src/persistence/ForkMigrationPlan.ts` ends at **fork ID `104`** (`104_ScheduledTaskThreadMode`, executing upstream `080_ScheduledTaskThreadMode`).

All 28 new upstream migrations (`081`-`108`) have **zero** SQL references to `effect_sql_migrations` or upstream migration IDs (only explanatory comments in `099`, `102`, `107`). They append cleanly in upstream source order with a constant **`+24`** offset as fork IDs **`105` through `132`**:

| Upstream ID & Filename | Fork Execution ID & Name | Purpose / Fork Interaction Notes |
| --- | --- | --- |
| `081_ProjectionMessageSearchText.ts` | `105_ProjectionMessageSearchText` | Recreates FTS search triggers & readable search text |
| `082_TurnItemConversationIndex.ts` | `106_TurnItemConversationIndex` | Conversation window index on `orchestration_v2_projection_turn_items` |
| `083_CommandReadIndexes.ts` | `107_CommandReadIndexes` | Command non-settled node read indexes |
| `084_LastExecutedRunIndex.ts` | `108_LastExecutedRunIndex` | Last executed run lookup index (used by `099`/fork `123`) |
| `085_TurnItemCounts.ts` | `109_TurnItemCounts` | Per-(thread, run) item count table & triggers (prerequisite for `102`/fork `126`) |
| `086_QueuedTurnInputIndex.ts` | `110_QueuedTurnInputIndex` | Held/queued input partial index (repaired by `092`/fork `116`) |
| `087_ProjectionProjectsCustomTitle.ts` | `111_ProjectionProjectsCustomTitle` | Idempotent `PRAGMA table_info` custom project title column |
| `088_TurnItemTypeStatusIndex.ts` | `112_TurnItemTypeStatusIndex` | Typed active tool item lookup index |
| `089_ShellThreadReadIndexes.ts` | `113_ShellThreadReadIndexes` | Shell worktree & family filter indexes |
| `090_AuthConnectDevices.ts` | `114_AuthConnectDevices` | Idempotent `PRAGMA table_info` columns on `auth_pairing_links` (`requires_connect_approval`, `requested_client_json`), `auth_sessions` (`proof_key_thumbprint`), and `auth_connect_devices` table. **Coexists with fork `58_PairingEnrollmentClass`; F17 runtime gates T3 Connect.** |
| `091_AuthConnectDeniedRequests.ts` | `115_AuthConnectDeniedRequests` | Idempotent `connect_denied` column on `auth_pairing_links` |
| `092_QueuedTurnInputIndexJsonValid.ts` | `116_QueuedTurnInputIndexJsonValid` | Rebuilds `110` index with `json_valid` guard |
| `093_ProviderTurnAttemptIndex.ts` | `117_ProviderTurnAttemptIndex` | Provider turn attempt lookup index |
| `094_TurnItemMessageOrdinalIndex.ts` | `118_TurnItemMessageOrdinalIndex` | Expression index on `$.messageId` ordinal |
| `095_TurnItemInlineWorkOutput.ts` | `119_TurnItemInlineWorkOutput` | Inline work output column/flag for thread window reads |
| `096_RepairStaleTitleRegeneration.ts` | `120_RepairStaleTitleRegeneration` | Data repair clearing orphaned `$.titleRegeneration` markers without active outbox job |
| `097_IssueTrackerBindings.ts` | `121_IssueTrackerBindings` | Standalone issue tracker bindings table (prerequisite for `103`/fork `127`) |
| `098_ActiveShellIndexIndexes.ts` | `122_ActiveShellIndexIndexes` | Covering indexes for `listActiveShellIndex` |
| `099_BackgroundRecoveryIndexes.ts` | `123_BackgroundRecoveryIndexes` | Usage-limit failure recovery partial index |
| `100_TurnStartReadIndexes.ts` | `124_TurnStartReadIndexes` | Turn-start lookup indexes (prerequisite for `107`/fork `131`) |
| `101_DelegatedTaskReadIndexes.ts` | `125_DelegatedTaskReadIndexes` | Delegated task finalization & child wake indexes |
| `102_ThreadItemCounts.ts` | `126_ThreadItemCounts` | Per-thread total item count table & triggers (`WITHOUT ROWID`), seeded from `109` |
| `103_IssueTrackerAdditionalScopes.ts` | `127_IssueTrackerAdditionalScopes` | Adds `additional_scopes` column to `issue_tracker_bindings` |
| `104_ProjectionProjectsTrackedFolders.ts` | `128_ProjectionProjectsTrackedFolders` | Idempotent tracked-folders column for multi-repo projects (`60863edc41`) |
| `105_TaskFolders.ts` | `129_TaskFolders` | Folder-keyed task table |
| `106_WorktreePathKeyIndex.ts` | `130_WorktreePathKeyIndex` | Loose worktree filter index |
| `107_DeferredSlashCommandIndex.ts` | `131_DeferredSlashCommandIndex` | Rebuilds `124` deferred slash command partial index |
| `108_AgentFeedback.ts` | `132_AgentFeedback` | `agent_feedback` table (`PERSIST.D3` schema parity; reporting disabled at runtime) |

### Modified earlier upstream migrations in `3e4d449308..dd19bce823` (already executed on deployed fork DBs)
- `026_CanonicalizeModelSelectionOptions.ts` (fork `26`): wraps `json_group_array` in `json(...)` for fresh/old upgrades; safe to accept.
- `064_CanonicalizeThreadPullRequestLinks.ts` (fork `88`): adds `AND json_valid(payload_json)` safety guard; safe to accept.
- `071_PeerLinkFence.ts` (fork `95`): adds `PRAGMA table_info` idempotency guard; safe to accept.
- `072_WaitingLinkRequestIndex.ts` (fork `96`): adds `IF NOT EXISTS`; safe to accept.
- `075_SubagentDeliveryState.ts` (fork `99`): adds `json_valid(payload_json)` guard; safe to accept.

### `Migrations.ts` & test cutoff reconciliation
- **`apps/server/src/persistence/Migrations.ts`:** keep `ForkMigrationPlan.makeMigrationLoader` as sole lineage authority (do **not** adopt `reconcileV2PreviewMigration` or upstream `assertV2MigrationsCanRun`). **Do** adopt upstream's `hasPendingMigrations` (against fork head `132`), `DATABASE_MIGRATIONS_STARTED_MESSAGE` / `DATABASE_MIGRATION_PROGRESS_MESSAGE` / `DATABASE_MIGRATIONS_FINISHED_MESSAGE` log signals (required by desktop startup readiness budget!), and **one-transaction-per-migration** execution loop so large index builds across 105-132 can resume after interruption rather than rolling back all 28 migrations.
- **Test cutoffs requiring `+24` remapping:**
  - `075_SubagentDeliveryState.test.ts`: `74 -> 98`, `75 -> 99`
  - `094_TurnItemMessageOrdinalIndex.test.ts`: `93 -> 117`, `94 -> 118`
  - `095_TurnItemInlineWorkOutput.test.ts`: `94 -> 118`, `95 -> 119`
  - `096_RepairStaleTitleRegeneration.test.ts`: `95 -> 119`, `96 -> 120`
  - `102_ThreadItemCounts.test.ts`: `101 -> 125`
  - `103_IssueTrackerAdditionalScopes.test.ts`: `102 -> 126`
- **New fork persistence proof required:** add `ForkMigrationUpstream81To108.test.ts` proving continuation from a populated fork-104 file database through `105`-`132` with retained threads, attachments, `auth_pairing_links.enrollment_class`, and authority rows; reopen with zero pending migrations; independent runner replay; rejection of upstream-numbered `81`/`90`/`104` journals before writes; and rollback-and-resume behavior across the per-migration loop. Update `fork/persistence-compatibility.md` to record 105-132 and the pre-105 binary rollback boundary.

## 8. Concrete Impact Of `0fb6ac6e65` (`Words` Static Markdown Islands)

Commit `0fb6ac6e65` (`perf(web): Markdown renders with Words as static islands under one shared tooltip; remark leaves the web app (#27866)`) replaces `remark`/`unified`/`react-markdown` in `apps/web` with `@pierre/words` (`apps/web/deps/pierre-words-0.2.2-t3.4-7c04b7f1.tgz`), `apps/web/src/markdown/wordsHast.ts`, and `apps/web/src/components/chat/markdownIslands.ts`. It removes `react-markdown`, `remark-gfm`, `remark-math`, `remark-parse`, `remark-rehype`, `unified`, `mdast-util-from-markdown`, `@types/mdast`, and `micromark-*` from `apps/web/package.json`.

### Exact impact & required replay on F32 and F22
1. **F32 Markdown cards (`apps/web/src/fork/ExcalidrawBoard.tsx`):**
   - Currently passes `lineBreaks` and `extraRemarkPlugins={CANVAS_CARD_REMARK_PLUGINS}` to `<ChatMarkdown>`.
   - `lineBreaks` **survives** (mapped to `WordsHastOptions.breaks` -> `breakLines(child, breaks)` in `wordsHast.ts`).
   - `extraRemarkPlugins` is **removed** from `ChatMarkdownProps` (silent typecheck break in `ExcalidrawBoard.tsx`).
   - **Replay:** replace with `extensions={CANVAS_CARD_MARKDOWN_EXTENSIONS}` (a stable module constant `{ canvasStateChips: true }`) keyed into `ChatMarkdown`'s `WeakMap<MarkdownExtensions, ...>` parse cache.
2. **F32 state chips (`apps/web/src/fork/canvasStateChips.ts` & `canvasStateChips.test.ts`):**
   - Currently imports `mdast` and `unified` (both deleted from `apps/web/package.json`), and its test imports `remark-gfm`, `remark-parse`, `remark-rehype`, `unified`.
   - **Replay:** rewrite `canvasStateChips.ts` as a pure **HAST transform** (`applyCanvasStateChips(tree: Root)`) using `@types/hast` (still in `apps/web/package.json`), keeping `leadingState` intact.
   - **Critical edge case:** unlike mdast where list items wrap text in `paragraph`, Words/HAST tight list items (`<li>`) hold bare phrasing children without a `<p>` wrapper (`wordsHast.ts` unwraps tight list paragraphs). `applyCanvasStateChips` must visit `<p>`, `<td>`, `<th>`, **and** `<li>` direct phrasing runs (skipping nested block elements), transforming index `0` and any index immediately after `<br>` for both plain `text` nodes and single-text `<strong>` elements into `<span class="canvas-state" data-state="{tone}">{word}</span>`.
   - **Sanitizer pipeline order:** invoke `applyCanvasStateChips(tree)` inside `wordsHast()` when `extensions.canvasStateChips` is true, **after** `transform(tree, walk, ...)` (so `breakLines` has already inserted `<br>` nodes) and **before** `sanitizeChatHast(tree)` (so F32.D5's security invariant — chips admitted strictly by the shared sanitizer — holds end to end).
   - **Static island compatibility:** `span` is not an island in `markdownIslands.ts`, so `serialize()` emits `<span class="canvas-state" data-state="...">WORD</span>` as zero-overhead static HTML via `property-information`.
   - **Tests:** rewrite `canvasStateChips.test.ts` to run against `wordsHast(markdown, { ..., breaks: true, extensions: CANVAS_CARD_MARKDOWN_EXTENSIONS })` and verify paragraphs, hard/soft line breaks, tight & loose list items, table cells, bold state words, and `sanitizeChatHast` preservation.
3. **`packages/shared/src/markdownPipeline.ts` -> `packages/shared/src/markdownHast.ts`:**
   - `0fb6ac6e65` extracted `CHAT_MARKDOWN_SANITIZE_SCHEMA` out of `markdownPipeline.ts` into `packages/shared/src/markdownHast.ts` (consumed by both `markdownPipeline.ts` and `wordsHast.ts` via `sanitizeChatHast`), and added `"dataLeadingWhitespace"` to `span`.
   - **Replay:** accept upstream `markdownPipeline.ts` cleanly and move the fork's `span` admission (`["className", "canvas-state"]`, `["dataState", "good", "bad", "warn", "wait", "news"]`) into `packages/shared/src/markdownHast.ts` alongside `"dataLeadingWhitespace"`.
4. **F32 Markdown tables (`turnTableWidth.ts` & `MarkdownTable.tsx`):**
   - **Preserved intact:** `ChatMarkdown.tsx` keeps `case "table": return true` in `isIsland`, and `MarkdownTable.tsx` still renders `<div ref={containerRef} className="chat-markdown-table-container">`. No structural break to `turnTableWidth.ts`.
5. **F32 file links (`MarkdownFileLink.tsx`):**
   - Upstream switched tooltips to `useSharedTooltip` / `withSharedTooltip`, added `gt-react`, `AppBundleIcon`, and native file drag.
   - **Replay:** retain fork's `"Preview in canvas"` menu item and `[data-turn-card]` lookup inside `showFileContextMenu` / `handleContextMenu` (orthogonal to `useSharedTooltip`). Verify `ExcalidrawBoard` Markdown cards render inside or supply `SharedTooltipProvider` (note `ChatMarkdown` itself wraps/uses `SharedTooltipProvider` fallback to `<Tooltip>` when absent).
6. **F22 Mermaid rendering (`ChatMarkdown.tsx`, `MarkdownMermaidCodeBlock.tsx`, `wordsHast.ts`):**
   - **Low impact / clean preservation:** `isIsland` still treats `<pre>` as a React island, so fenced code blocks still render via `MarkdownCodeBlock` / `MarkdownMermaidCodeBlock`.
   - `ChatMarkdown.tsx` auto-merges fork's `isMermaidFenceLanguage(language)` check (verify post-merge that `mermaid`, `mmd`, and `MMD` fences still route to `MarkdownMermaidCodeBlock`).
   - `MarkdownMermaidCodeBlock.tsx` has a trivial 1-hunk conflict with `gt-react` (`useGT()` for `"Show diagram"` / `"Show code"`): preserve `<MermaidVisibleDiagram>` wrapper around `<Suspense><MermaidDiagram ... /></Suspense>`.
   - **Bonus seam check:** update `makeInert` in `apps/web/src/markdown/wordsHast.ts` (line 1092) to downgrade `mmd`/`MMD` fences alongside `language-mermaid` so inert Markdown previews never bypass inert mode for `mmd`.

## 9. Categorized Gemini / Antigravity / ACP Commits In `3e4d449308..dd19bce823`

214 commits in `3e4d449308..dd19bce823` touch ACP, Antigravity, or Gemini surfaces. The commits below affect protected fork seams or require explicit verification:

### Category A: MCP Bridge, Four-Endpoint Admission & Tool Schemas (F17 / F32 / F33 — HIGH PRIORITY)
- `7966f202ef` (`#39822`) `fix(antigravity): pre-approve T3 MCP tools in Auto and Auto-accept edits` — **REQUIRES FORK OVERRIDE:** checks only `ServerName === "t3-code"` and `/^Run mcp_t3-code_/`; must recognize all 4 fork MCP servers (`t3-code`, `t3-code-preview`, `t3-code-device`, `t3-code-pull-requests`) and include F32/F33 tools (`canvas_read`, `canvas_update`, `canvas_preview`, `page_state`) in `T3_MCP_TOOL_NAMES` (`packages/shared/src/t3McpToolPresentation.ts`).
- `015eba4083` (`#33069`) `fix(acp): a failed MCP-over-ACP disconnect can be retried` — **DIRECT CONFLICT (`mcpOverAcpBridge.ts`):** must reconcile retryable disconnect with fork's multi-server `replaceServers`, `connection.closed`, and mutex-guarded DELETE isolation.
- `b46edac5c1` (`#38237`) `fix(acp): MCP bridge disconnect gives up on an endpoint that never answers` — **DIRECT CONFLICT (`mcpOverAcpBridge.ts`):** keep disconnect timeout while preserving fork's per-endpoint DELETE headers and stale-server cleanup.
- `c67deb12dd` (`#36495`) `fix(antigravity): thread sessions spawn with their T3 thread and MCP environment` — verify all 4 fork MCP endpoints and thread env vars are injected properly for Antigravity spawns.
- `6c0698c0af` (`#36439`) `fix(server): Antigravity turns no longer fail on a roots notification to the T3 MCP server` — verify `roots` notification handling applies across all 4 fresh MCP transports in `McpHttpServer.ts`.
- `9504f65989` (`#37031`) `fix(server): MCP tools no longer advertise non-string enums that Gemini rejects` — **VERIFY F32 & F33 SCHEMAS:** audit `canvas_read`, `canvas_update`, `canvas_preview`, and `page_state` tool JSON schemas for any numeric/boolean enums that Gemini/Antigravity rejects.
- `f2839735ef` (`#31319`) `fix(server): Gemini Spark can register its six MCP OAuth redirect URIs` — verify `McpOAuth.ts` redirect allowlist stays inside F17 external Admin / OAuth boundaries.
- `158394194c` (`#38898`) `fix(shared): html_render cards show for Antigravity's acp-mcp-call terminal fallback` & `7f928416b2` (`#39474`) `fix(antigravity): MCP calls through call_mcp_tool show the tool, not "Ran command"` — verify `displayWidth` (F32.D5) and `t3.state` (F33.D3) survive Antigravity's `acp-mcp-call` and `call_mcp_tool` paths.
- `a308715773` (`#29141`) & `d47591f613` (`#33677`) (Hermes/OMP `html_render` pages in ACP) — verify `html_render` adapter consistency.
- `45b0fe4a8e` (`#35805`) `fix(server): ACP terminal MCP calls answer interleaved server requests` & `fe1f1a5732` (`#26652`) `fix(acp): Devin terminals no longer inherit the launching thread's T3 MCP credentials` (aligned with F17 credential isolation).

### Category B: Managed Runtime Updates, Versioning & Policy (F01 / F20 / F06)
- `315b06c5ec` (`#21249`) `feat(providers): managed Antigravity and Codex installs can update past their pin` — verify interaction with fork's server image pinned Codex/Antigravity policy (`patch.md` / F20).
- `4099e62767` (`#35409`) `feat(antigravity): support native goals and managed CLI updates` & `d1822be5a9` (`#39363`) `fix(server): stop managed Antigravity CLI from self-updating in place and recover on reinstall`.
- `90a86d5cb1` (`#38970`) `fix(server): refuse Antigravity runtimes below 1.5` & `90aa7669a8` (`#39427`) `fix(server): one compatibility lookup and one refusal for broken provider versions` — **operational note:** staging/production Antigravity CLI (`agy`) must be `>= 1.5`.
- `68ea2220c1` (`#38740`) `fix(server): managed Antigravity and Codex runtimes prune old versions`, `67692a7549` (`#39028`), `cf65084c97` (`#34486`), `0058a4abb3` (`#37916`), `9771c5fd2d` (`#35171`).
- `2109868980` (`#31761`) `feat(cli): allow Antigravity in terminal triage` — verify `triagePrompt.ts` keeps exact-origin session files (F06) and never clones/fetches/mutates upstream.
- `fe9c98c98f` (`#35871`) `feat: agents can report T3 Code problems when you turn feedback on` — touches `packages/provider-acp/src/server/adapter.ts`; disable reporting in fork.
- `60863edc41` (`#35925`) `feat(projects): a project covers several repositories` — touches ACP workspace roots; verify F06 exact-origin per repo.

### Category C: Instructions, Context Budget, Skills, Whitespace & Delegation (F04 / F32 / F33)
- `5959787bae` (`#26959`) `fix(acp): agents get T3's runtime notes once per session, not on every message` — verify F32 Canvas and F33 Page State guidance reach ACP/Antigravity sessions on session start and fit `agentContextBudget.json`.
- `e923b5d8d8` (`#39531`) `fix(server): Antigravity threads follow the user's global AGENTS.md and GEMINI.md`.
- `e8bfabaa39` (`#37505`) `fix(server): preserve whitespace in ACP history replay` — verify compatibility with F04 whitespace contract.
- `5ee1c2f652` (`#39413`) `fix(server): accept Antigravity model IDs with thinking levels when delegating`, `43b37b6d3c` (`#38966`), `066be30005` (`#39004`), `194726492b` (`#39519`), `cfd24da4a7` (`#39165`), `db04d3abe9` (`#34877`) — verify delegated Antigravity subagents still inherit parent canvas (`F32.D3`) and delegator page state (`F33.D1`).
- Skill discovery & manifest wave: `2953fda660` (`#32182`), `1c379b63ba` (`#39765`), `26b48d2da8` (`#40020`), `367f9d3759` (`#40194`), `f0ceeefc08` (`#40488`), `ece4964b8e` (`#40287`), `bb234221ce` (`#39037`), `292a8e448b` (`#38960`), `9d0d00656f` (`#37997`).

### Category D: Antigravity 1.5 Runtime, Permissions, Auth, Models & Turn Lifecycle (Verify On Staging)
- **Auto mode & permissions:** `5dd565d6b1` (`#39378` Auto uses agy's own Auto review), `ad1b1f9ca4` (`#40154` keeps Auto in mode picker after restart), `ea4e7c1a60` (`#35837`), `26f0a62f73` (`#34526`), `b4e47a5a62` (`#37826`).
- **Background wakes, steering & settlement:** `344de5fe8e` (`#40858`), `3a91757430` (`#39989`), `6edb53026b` (`#39806`), `e24f0c7154` (`#39767`), `505f6d6cf4` (`#39421`), `f9b9bc742d` (`#38916`), `12be92d034` (`#38864`), `990f31cac2` (`#39395`), `9f6f5540cf` (`#39422` worktree handoff), `f68d36d8aa` (`#39869`), `f9a3c38c50` (`#28889`), `68a564ef69` (`#35463`), `2ea1c51f18` (`#40629`), `426b5a6888` (`#40734`), `2f19cec079` (`#40864`).
- **Auth & sign-in:** `084ad5e1a0` (`#39485` isolated per-instance Google sign-in), `944d1820e2` (`#38953`), `2ba4fde9a5` (`#36037`), `320ab2a2ac` (`#39443`), `5283f33ca9` (`#38957`), `71e1bb2dcc` (`#28355`), `6e8851cc43` (`#29057`), `c8b214158e` (`#39275`).
- **Gemini 4 models, usage & pricing:** `e8d3075e48` (`#33991` Gemini 4 Carbon & quota), `755de001f2` (`#40352` Antigravity Orchestrator pricing), `46b626263f` (`#39897`), `602e5b32f5` (`#39686` no thinking token double-count), `490a0d687b` (`#39435`), `047d492736` (`#32425`), `e2aa223229` (`#33661`), `9a3f8db9b3` (`#13809`), `44ebb2fe57` (`#33800`), `e74b795535` (`#39720`), `b1ca56209c` (`#36035`).
- **Edit from here, slash commands, compaction & history:** `a99faf5a62` (`#38227`), `ccae953c46` (`#30188`), `00200bd412` (`#35621`), `91f166adf3` (`#38955`), `cdf5a6c0fc` (`#37020`), `ac7c7f66d9` (`#28822`), `6d6ca60907` (`#39891`), `ad4d0f0659` (`#39855`), `df67c4f7f9` (`#40702`), `df09ced768` (`#39697`), `c4dc9ed55b` (`#38837`), `0c921e1fdf` (`#40328`), `35d01dc291` (`#23724`), `1c18c16e93` (`#29422`), `75c7fb28af` (`#22155`), `c6969f8f73` (`#33604`).

## 10. Recommended Execution Lane Order & Owner Seams

Execute in **4 waves** on `intake/upstream-20261122` (created from `1fff32521c`) so shared contracts, migrations, and lockfiles settle before parallel domain lanes run:

1. **Wave 0 — Root Merge Skeleton & Contracts/Manifests (Serial, Root Owner):**
   - Run `git merge --no-commit dd19bce823` from `1fff32521c`.
   - Resolve `package.json`, `packages/shared/package.json`, `apps/server/package.json`, `apps/marketing/package.json`, `pnpm-lock.yaml` (`pnpm install --lockfile-only` or conflict resolution preserving `@pierre/words` + fork Excalidraw deps), `packages/contracts/src/{auth,environmentHttp,ipc,rpc}.ts`, and bulk-keep all 62 fork-deleted files deleted (plus delete the 3 newly added upstream workflows `issue-vouch.yml`, `mobile-dev-client.yml`, `pr-limits.yml`).
   - Resolve `packages/shared/src/markdownPipeline.ts` -> move chip span admission to `packages/shared/src/markdownHast.ts`, and resolve `packages/shared/src/{git,cliRelease,htmlRender,t3McpToolPresentation}.ts`.
2. **Wave 1 — Core Server Foundation (L1 Persistence + L4 External Admin/Auth/MCP):**
   - **L1 (`PERSIST`):** Register upstream `081`-`108` as fork `105`-`132` in `ForkMigrationPlan.ts`, reconcile `Migrations.ts` (per-migration transaction loop + desktop log signals), `DatabaseMaintenance.ts`, `Sqlite.ts`, `initializeV2Database.ts`, `doctor.ts`, `storageCleanup.ts`, remap the 6 upstream migration test cutoffs (`+24`), and write `ForkMigrationUpstream81To108.test.ts`.
   - **L4 (`F17` / ACP):** Resolve `SessionStore.ts`, `EnvironmentAuth.ts`, `PairingGrantStore.ts`, `AuthPairingLinks.ts`, `AuthSessions.ts`, `McpHttpServer.ts`, `ws.ts`, `mcpOverAcpBridge.ts`, provider adapters, and web auth/connections settings; override `AntigravityAcpSupport.ts` (`7966f202ef`) for 4 MCP server names; disable `FeedbackService` upstream transmission (`fe9c98c98f`); gate T3 Connect external approval and verify DPoP renewal against F17 containment.
3. **Wave 2 — Parallel Domain Lanes (L2 Exact-Origin, L3 Release/Desktop/Thread, L5 Canvas/PageState/Words, L6 Presentation/Mermaid/Preview):**
   - **L2 (`F06`):** Resolve `GitVcsDriverCore.ts`, `GitManager.ts`, `PullRequestService.ts`, PR MCP handlers, all 6 source-control packages, `triagePrompt.ts`; override `c79f618bf8` (no upstream issues on fork); enforce exact-origin on new PR/CI/issue MCP tools and multi-repo tracked folders (`60863edc41`).
   - **L3 (`F01`/`F16`/`F20`/`F27`):** Resolve `apps/desktop/src/**`, `selfUpdate.ts`, `binCli.ts` + `binCli.test.ts` (`add/add`), `ThreadLaunchService.ts`, `serverRuntimeStartup.ts`, `packages/ssh/src/tunnel.ts`, web update/skew/empty-state components, and `scripts/build-desktop-artifact.ts`.
   - **L5 (`F32`/`F33`/`0fb6ac6e65`):** Rewrite `canvasStateChips.ts` + `canvasStateChips.test.ts` to HAST on `wordsHast.ts`; wire `CANVAS_CARD_MARKDOWN_EXTENSIONS` in `ExcalidrawBoard.tsx`; replay `ownSideChat` guard from deleted `SideChatPane.tsx` onto `SideThreadPane.tsx`; resolve `ChatView.tsx`, `MessagesTimeline.tsx`, `RightPanelTabs.tsx`, `RightPanelSurfaceContent.tsx`, `MarkdownFileLink.tsx`, `BrowserDocumentFrame.tsx`, `ThreadPullRequestsPanel.tsx`, `ProviderTurnStartService.ts`, `runtimeLayer.ts`, `orchestrationInstructions.ts`, and recalibrate `agentContextBudget.json`.
   - **L6 (`F02`/`F03`/`F04`/`F22`/`F23`/Ordering):** Resolve `ChatComposer.tsx`, `useComposerSend.ts`, `useMultipleModelSend.ts`, `Sidebar.tsx`, `SettingsPanels.tsx`, `MarkdownMermaidCodeBlock.tsx` (+ `makeInert` `mmd` check in `wordsHast.ts`), `Manager.ts`, `useRightPanelSurfaceClose.ts`, `closePreviewSession.ts`, `threadSort.ts`, `threadListV2.ts`, and `__root.tsx`.
4. **Wave 3 — L7 Governance/Docs, Full Gates & Fresh-Reviewer Preservation Gate:**
   - Reconcile `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `docs/**`, `.github/workflows/ci.yml`, `patch.md`, `fork/persistence-compatibility.md`, `fork/F32-thread-canvas.md`, and write `.ledger/upstream-intake-20261122.md`.
   - Run full repository gates and dispatch independent reviewer(s) to audit every item in the Section 5 Immutable Baseline against the zero blocking-hunk gate.

## 11. Compatibility Surfaces Requiring Evidence

1. **SQLite persistence (`PERSIST.D1-D7`):** fork `104 -> 132` populated-DB continuation, reopen with zero pending migrations, independent runner proof, rejection of upstream-numbered `81`/`90`/`104` journals before writes, per-migration failure/resume rollback, `doctor.ts` retaining `state.sqlite`, and FTS rebuild after `VACUUM`.
2. **Exact-origin authority (`F06`):** new Issues subsystem rejects/omits upstream repo issues (`c79f618bf8` overridden), PR/CI/issue MCP tools fail closed outside exact origin, multi-repo tracked folders enforce origin per repo, Cursor Origin & `GitHubStarPrompt` absent.
3. **External Admin & MCP isolation (`F17` / ACP):** `5549706896` 30s unconfirmed admission grace intact, DPoP renewal cannot bypass disabled/revoked Admin authority, T3 Connect cannot bypass external Admin enrollment, 4 MCP endpoints retain separate admission & DELETE isolation, `mcpOverAcpBridge` handles multi-server rotation + retryable/timed-out disconnect, `AntigravityAcpSupport` pre-approves all 4 fork MCP namespaces.
4. **Thread Canvas & Page State (`F32` / `F33` / `0fb6ac6e65`):** Markdown cards render state chips (paragraphs, soft/hard line breaks, tight & loose list items, table cells, bold words) through `wordsHast` + `sanitizeChatHast`; `turnTableWidth` widens tables; `SideThreadPane` enforces `ownSideChat`; `t3.state` bridge & guest refusal pass browser tests; `canvas_*` and `page_state` tool schemas pass Gemini enum validation; `AgentContextBudget.test.ts` passes.
5. **Mermaid (`F22`), Preview (`F23`), Theme (`F02`), Capture (`F03`), Whitespace (`F04`), Ordering, & Hosted Thread (`F27`):** `mermaid`/`mmd`/`MMD` routing + visibility gating + inert downgrade; preview close/reopen history; Omarchy theme precedence over agent CSS themes; screenshot attachment reservation; outgoing whitespace; conversation ordering across web & mobile; Thread `creationSurface`, one-use WSS tickets, and native window title.
6. **Zero upstream transmission:** `agentFeedback` disabled; `git remote -v` confirms `upstream` has no writable push URL; CI safety checks exclude upstream release/vouch/preview workflows.

## 12. Verification Commands And Manual Checks

Run all automated checks with `NODE_ENV` and every `T3CODE_*` environment variable unset so browser tests never proxy to a running T3 host:

```bash
env -u NODE_ENV $(env | sed -n 's/^\(T3CODE_[^=]*\)=.*/-u \1/p') pnpm fmt
env -u NODE_ENV $(env | sed -n 's/^\(T3CODE_[^=]*\)=.*/-u \1/p') pnpm lint
env -u NODE_ENV $(env | sed -n 's/^\(T3CODE_[^=]*\)=.*/-u \1/p') pnpm typecheck
env -u NODE_ENV $(env | sed -n 's/^\(T3CODE_[^=]*\)=.*/-u \1/p') pnpm test
```

Targeted lane verification suites (run per lane before convergence):
- **L1:** `ForkMigrationPlan.test.ts`, `ForkMigrationHistory.test.ts`, `ForkMigrationContinuation.test.ts`, `ForkMigrationUpgrade.test.ts`, `ForkMigrationUpstream81To108.test.ts`, `initializeV2Database.test.ts`, `DatabaseMaintenance.test.ts`, `doctor.test.ts`, and remapped `075`/`094`/`095`/`096`/`102`/`103` migration tests.
- **L2:** `GitVcsDriverCore.test.ts`, `GitManager.test.ts`, `PullRequestService.test.ts`, `IssueService.test.ts`, `mcp/toolkits/pullRequests/handlers.test.ts`, and all 6 `packages/source-control-*` suites.
- **L3:** `apps/desktop` unit suite, `selfUpdate.test.ts`, `binCli.test.ts`, `packages/ssh` suite.
- **L4:** `ClientConnectionRegistry.test.ts`, `SessionStore.test.ts`, `EnvironmentAuth.test.ts`, `PairingGrantStore.test.ts`, `McpHttpServer.test.ts`, `mcpOverAcpBridge.test.ts`, `AntigravityAcpSupport.test.ts`, `ws.test.ts`, `FeedbackService.test.ts`.
- **L5:** `canvasStateChips.test.ts`, `ServerDrawing.browser.test.tsx`, `CanvasSurfaceCardView.browser.test.tsx`, `canvasCards.browser.test.ts`, `pageStateBridge.browser.test.tsx`, `ThreadCanvasStore.test.ts`, `PageStateStore.test.ts`, `McpCanvasToolkit.test.ts`, `AgentContextBudget.test.ts`, `turnTableWidth.browser.test.ts`.
- **L6:** `ChatMarkdown.browser.test.tsx`, `MarkdownMermaidCodeBlock.browser.test.tsx`, `MermaidVisibleDiagram.browser.test.tsx`, `useRightPanelSurfaceClose.browser.test.tsx`, `ReopenClosedViewShortcut.browser.test.tsx`, `threadSort.test.ts`, `apps/mobile` suite.
- **Mobile lint (if any native mobile code changes):** `pnpm lint:mobile`.

Manual / staging checks (separate from source gate, required before production cutover):
1. Verify Antigravity (`agy >= 1.5`) thread launch, 4-endpoint MCP tool pre-approval in Auto mode, `canvas_update` / `page_state` tool calls, and `html_render` display.
2. Visually verify Excalidraw canvas Markdown cards (state chips, tables, single line breaks), `SideThreadPane` chat cards, `mmd`/`mermaid` visibility gating, and Omarchy theme precedence alongside custom CSS themes.
3. Verify T3 Code and T3 Thread Linux desktop launchers on staging channel (Wayland app ID, window title, one-use WSS tickets, external Admin enrollment).

## 13. Publication And Rollback Plan For `origin`

- **Remote safety:** `upstream` remains strictly read-only (`git remote -v` push URL verified disabled before any remote operation). Every branch, tag, release, and PR targets **`origin` exclusively** and requires **separate explicit user authorization** before pushing.
- **Pre-reconciliation tip preservation:** before replacing or fast-forwarding any accepted `origin` branch, tag or record the pre-reconciliation `origin/main` and `promote/staging-canvas-20261122` (`1fff32521c`) tips as immutable local baseline refs (`baseline/origin-before-intake-20261122`).
- **Database rollback boundary:** any runtime built before fork migration `105` rejects journal identities `105`-`132` on reopen. Production activation therefore requires:
  1. Stopping the active server completely (single-writer rule, `PERSIST.D7`).
  2. Taking a cold backup of `statev2.sqlite` (and retaining `state.sqlite`).
  3. Rolling back across this intake by stopping the new binary, restoring the pre-upgrade `statev2.sqlite` snapshot, and reconciling any external Admin grants/revocations made during the new run before re-admitting clients.
