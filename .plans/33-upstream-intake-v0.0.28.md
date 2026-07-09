# Upstream Intake v0.0.28

Date: 2026-07-02
Status: Wave 4 cross slice repairs complete with full gates passing

## Scope

Integrate upstream `v0.0.28` from `pingdotgg/t3code` into the opinionated T3 Code fork.

## Product Direction Update

Date: 2026-07-09

The fork is no longer an Omarchy edition. Omarchy remains one supported local desktop integration lane, not the product boundary.

The unified right panel is now the primary product destination for project management. A compact project header should carry global project context, while `Open a surface` stays concise and launches project or thread surfaces.

Git Panel and Inference Dashboard should open as unified right panel surfaces. The standalone project management route is compatibility or deep link infrastructure, not the expected product entrypoint.

Direct screenshot attach remains protected as F3. New screenshot entities may support the feature when they can produce a bounded PNG `File` plus draft preview URL without replacing active draft text.

Target upstream tag: `v0.0.28`

Target upstream commit: `fda6486233e0b2f07ecfea166e1a94533cb923c4`

Prior accepted upstream tag: `v0.0.27`

Prior upstream commit: `a3422a9bb51d73724b9b665ae0ef1fb756f753d1`

Current fork head during intake review: `74821b708846152e22474a7911c11b179cb8444d`

Merge base: `a3422a9bb51d73724b9b665ae0ef1fb756f753d1`

Selected workflow: base rebuild and replay candidate

The workflow recommendation is not final. The direct merge conflict count is high enough that a straight merge and repair path risks preserving stale fork shapes across changed upstream runtime, desktop, and web component boundaries.

## Requirements Read

- `governance/upstream_merge_policy.md`
- `patch.md`
- all active feature specs from `fork/F01` through `fork/F14`

## Program Ledger Strategy

This note is the controlling upstream intake note and the seed program ledger for the replay. It must be kept current as slices move from investigation to implementation, review, and final signoff.

Ledger sections to maintain during implementation:

- Objective
- Source plan
- Program branch
- Phase inventory
- Dependency graph
- Wave plan
- Shared contract decisions
- Wave execution log
- Gate evidence
- Review findings
- Phase completion matrix
- Risks and exceptions
- Final reconciliation

This thread remains the program orchestrator and final signoff owner. Subagents may plan, implement, and review bounded slices, but this thread owns product decisions, dependency graph changes, shared contract choices, integration, conflict resolution, final mile checks, and preservation gate evidence.

## Agent Orchestration Model

Each replay slice should use this worker loop unless the slice is trivial:

- Planning worker reads the upstream slice, fork specs, current fork implementation, and this note. It returns the upstream primitives, fork outcomes, affected files, expected seams, tests, likely conflicts, and final mile risks.
- Implementation worker receives the accepted slice packet and edits only that packet scope. It reports changed files, commits or patch summary, gates run, unresolved risks, and any place where upstream primitives were insufficient.
- Review worker uses fresh context and does not edit files. It reviews against the slice packet, fork specs, and final mile gate. Findings must include missing wiring, orphan helpers, hidden UI paths, stale imports, duplicate old and new paths, and tests that prove helper behavior without proving app path behavior.
- Orchestrator integrates accepted work, resolves conflicts centrally, runs the required gates, updates this ledger, and performs final mile signoff before marking the slice complete.

Subagents can recommend `accept`, `replay`, or `override`, but this thread decides. A worker must not preserve old fork code only because it is familiar, and must not accept upstream behavior that silently drops a protected fork outcome.

## Final Mile Gate

Every implemented slice must pass this final mile check before it can be marked complete:

- New or replayed behavior is reachable through the real user workflow.
- New helpers, policy seams, contracts, and adapters are called by production paths.
- UI entry points are visible or intentionally capability gated.
- Server RPC, WebSocket, IPC, provider, source control, preview, route, or runtime registrations are complete where the slice requires them.
- Tests cover the real app path or adapter path, not only pure helpers.
- Old fork paths are removed, unused, or documented with a removal condition.
- No stale fork implementation shadows an accepted upstream primitive.
- No protected behavior falls back to generic upstream behavior without an explicit `accept` decision.
- Verification evidence names the command, focused test, manual scenario, or reviewer finding used for signoff.

## Parallelization Strategy

Parallelize planning and review freely when slices are independent enough to reason about separately.

Parallelize implementation only when all of these are true:

- Write scopes are disjoint or isolated in separate worktrees.
- No shared public contract is being designed independently by more than one worker.
- Runtime state, route shape, migration order, and persistent settings order are deterministic.
- The integration boundary can be verified with focused tests after merge.
- The final mile path for each slice does not depend on unmerged behavior from another worker.

Prefer central implementation or one active implementation worker for shared contracts, runtime transport, route shape, desktop IPC, provider routing, source control contracts, and web chat ownership. These areas are integration hubs and should not be independently redesigned by parallel workers.

Initial implementation wave guidance:

- Wave 1 is central only for dependency, generated schema, contracts, and runtime transport decisions.
- Wave 2 can split desktop local integration replay from server provider and source control planning, but implementation should wait on Wave 1 contract decisions.
- Wave 3 can split Git workflow, source control provider lane, and provider runtime only after shared contracts and runtime adapters are stable.
- Wave 4 can split browser preview, file preview substrate, and F9 document or plan preview planning, but final implementation needs central route and right panel integration.
- Wave 5 can split project management, sidebar cues, composer chrome, and auth connections only after route, runtime, and provider decisions are stable.
- Final wave is central only for preservation gate, final mile checks, full gates, and fresh-context program review.

## Domain Planning Results

Read only planning workers completed packets for these domains:

- shared substrate, contracts, runtime transport, and generated schema
- desktop local integration, desktop backend, browser preview, and preview automation
- server Git, source control, provider, and auth
- web chat, composer, sidebar, status, and timeline
- F9 document and plan preview plus F14 project management
- mobile, relay, deployment separation, and workflow policy

Shared conclusion:

- Planning and review can run in parallel across these domains.
- Implementation must begin with one central foundation wave.
- Browser preview is upstream owned and should be accepted.
- File preview is upstream substrate and should be accepted.
- F9 document and plan preview remains fork owned and must be replayed.
- Old fork paths should not be restored wholesale when upstream has a usable primitive.
- Direct GitHub issue paths, Git promotion, local desktop IPC, provider instance routing, and auth access need explicit final mile checks because helper level tests can pass while production wiring still points at upstream defaults.

## Phase Inventory

### Phase A Foundation Contracts And Runtime

Status: complete for foundation substrate, pending server and app consumer wiring in later waves

Decision: `accept` plus `replay`

Owned write scope:

- root package metadata and lockfile
- generated Codex app server schema
- `packages/contracts/src`
- `packages/client-runtime/src`
- `apps/server/src/ws.ts`
- `apps/server/src/server.ts`
- web connection and runtime adapters
- desktop bridge contract surfaces

Key plan:

- Accept upstream package and generated schema baseline as a unit.
- Accept upstream client runtime subpath architecture and state atoms.
- Do not preserve deleted `wsRpcClient`, `wsTransport`, or root client runtime imports only for fork compatibility.
- Replay additive fork contracts for local desktop theme, direct screenshot attach, auth access, source control, provider instances, Git promotion, project routes, and Codex binary selection.
- Keep shared contracts central only until typecheck and focused contract tests pass.

Final mile risks:

- App code can still call old runtime adapters after new contracts compile.
- RPC methods can exist in contracts but be missing from `ws.ts`.
- Desktop IPC schemas can exist without preload or handler registration.
- Provider instance contracts can decode while runtime routing still collapses to provider kind.

Focused verification:

- `pnpm --filter @t3tools/contracts test`
- `pnpm --filter @t3tools/client-runtime test`
- server WebSocket focused tests
- web runtime adapter tests
- desktop IPC focused tests

### Phase B Desktop Local Integration And Browser Preview Infrastructure

Status: ready for planning, blocked on Phase A contracts

Decision: `accept` plus `replay`

Owned write scope:

- `apps/desktop/src/app`
- `apps/desktop/src/backend`
- `apps/desktop/src/wsl`
- `apps/desktop/src/preview`
- `apps/desktop/src/ipc`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/fork`
- desktop launcher and release identity paths
- server preview manager and MCP preview broker when paired with browser preview

Key plan:

- Accept upstream desktop backend pool, WSL and Windows backend mode picker, Electron startup fixes, browser preview manager, browser session isolation, preview IPC, server preview manager, MCP preview tools, browser screenshots, and recording.
- Replay F1 desktop identity, F2 local desktop theme, F3 direct desktop screenshot attach, and F10 Codex binary bridge.
- Keep browser preview screenshots separate from direct composer screenshot attach.
- Keep F9 document preview out of browser preview authority.

Final mile risks:

- `desktopBridge.preview.captureScreenshot` returns browser artifacts and must not replace composer screenshot attach.
- `captureScreenshot`, `getSystemTheme`, and `onSystemTheme` can disappear from preload while tests cover only lower level services.
- WSL mode can reintroduce upstream desktop copy or lose local desktop integration.
- Codex binary settings can be honored by probes but ignored by backend process launch.

Focused verification:

- desktop preview manager tests
- desktop browser session tests
- preview IPC tests
- WSL backend and settings tests
- local desktop theme source tests
- direct screenshot attach tests
- Codex binary resolver and desktop launch checks

### Phase C Server Git Source Control Provider And Auth

Status: ready for planning, blocked on Phase A contracts

Decision: `accept` plus `replay`

Owned write scope:

- `apps/server/src/sourceControl`
- `apps/server/src/git`
- `apps/server/src/fork`
- `apps/server/src/provider`
- `apps/server/src/auth`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- matching contract files

Key plan:

- Accept upstream source control service shape, structured errors, provider registry work, repository publish behavior, VCS refresh primitives, provider drivers, provider update settings, auth access hardening, and Grok ACP resume hardening.
- Replay F6 fork first GitHub identity in provider registry and direct `GitHubCli` issue resolution.
- Replay F7 promotion through contracts, `GitManager`, `GitWorkflowService`, and WebSocket handlers while preserving upstream remote tracking helpers.
- Replay F10 binary resolution, live Codex model and skill discovery, and client version initialization.
- Replay F12 provider instance hydration, cache identity, targeted refresh, active instance routing, skills, commands, and unknown instance preservation.
- Replay F13 auth access snapshot, pairing links, revocation, current session protection, and scope enforcement.

Final mile risks:

- Direct GitHub issue RPCs can still target upstream even if source control discovery is fork first.
- Git promotion helpers can compile but have no WebSocket route or UI path.
- Provider update settings can be accepted without UI or runtime registration.
- Auth stream can exist but lose current session identity through the rewritten transport.

Focused verification:

- fork policy tests
- source control registry and repository service tests
- GitHub CLI tests
- Git manager and workflow tests
- provider registry, status cache, and maintenance tests
- Codex binary and provider tests
- auth access and session revocation tests

### Phase D Web Chat Composer Sidebar And Timeline

Status: ready for planning, blocked on Phase A and partly on Phase C

Decision: `accept` plus `replay`

Owned write scope:

- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/ChatView.logic.ts`
- `apps/web/src/components/chat`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ThreadStatusIndicators.tsx`
- provider instance UI
- Connections settings access management UI

Key plan:

- Accept upstream timeline anchoring, timeline minimap, overlay composer measurement, turn folds, composer pending context UI, composer provider state stabilization, file tags, review comments, preview annotations, right panel tabs, and provider update UI primitives.
- Replay F3 screenshot top action through the active draft.
- Replay F4 rich draft mode, toolbar, attachment warnings, runtime chrome, and draft ownership.
- Replay F5 Git panel draft isolation.
- Replay F8 sidebar fractional progress and plan cues.
- Replay F12 provider instance model picker, slash commands, skill chips, and exact instance routing.
- Replay F13 access management UI and current session guard.

Final mile risks:

- Composer store migration can silently drop `richDraftMode`.
- Deleted browser split tests currently hold protected assertions and need real replacements.
- Upstream timeline can remove markdown preview callbacks needed by F9.
- Provider instance UI can display custom instances while send routing still uses provider kind.
- Settings can show access controls while transport capability gating is wrong.

Focused verification:

- composer draft migration tests
- screenshot attach tests
- rich draft toolbar tests
- Git branch draft preservation tests
- provider instance model and command tests
- skill chip tests
- timeline row and anchoring tests
- sidebar fractional progress tests
- Connections access action tests

### Phase E F9 Document Plan Preview And F14 Project Management

Status: in progress, F9 replay complete in working tree, F14 core replay complete with project scoped Git parity follow-up remaining

Decision: `accept` plus `replay`

Owned write scope:

- right panel route and state integration
- `apps/web/src/components/files`
- `apps/web/src/components/DocumentMarkdownRenderer.tsx`
- `apps/web/src/components/PlanConversationDocument.tsx`
- `apps/web/src/markdown-links.ts`
- `apps/web/src/diffRouteSearch.ts`
- `apps/web/src/components/project-management`
- `apps/web/src/project-management`
- sidebar and command palette project actions
- project scoped Git adapter

Key plan:

- Accept upstream right panel host, `components/files`, file browser, editable file preview, markdown render toggle, task toggles, review comments, save coordinator, and browser open affordance.
- Replay F9 virtual plan preview, plan actions, return behavior, document markdown, Mermaid, image routing, local anchors, external links, workspace markdown links, outline, source footer policy, and horizontal overflow.
- Keep F9 virtual plan preview URL search driven on `_chat.$environmentId.$threadId`; keep project document preview on the upstream file preview and right panel substrate.
- Replay F14 concrete environment and project identity, unified project context, right panel surfaces, project scripts, latest thread navigation, project scoped Git, inference dashboard totals, and no composer draft mutation.

Final mile risks:

- Upstream `plan` panel can be confused with fork virtual plan document preview.
- Upstream rendered markdown toggle uses `ChatMarkdown` and does not satisfy all F9 behavior.
- Route tree generation can be missed after route changes.
- Project scoped Git can render but still require an active thread underneath.
- Inference dashboard can count helper data correctly while links route to the wrong environment.

Focused verification:

- markdown link routing tests
- Mermaid rendering tests
- wide table and code overflow tests
- plan preview route open and return tests
- plan copy, download, save, and hidden footer tests
- project route helper tests
- project inference tests
- project scoped Git without active thread tests
- route tree generation check

### Phase F Mobile Relay Deployment And Workflows

Status: ready for planning, blocked on Phase A contracts

Decision: `accept` plus `replay`

Owned write scope:

- `apps/mobile`
- `infra/relay`
- relay and mobile shared contracts
- `apps/server/src/cloud`
- server CLI and headless serve paths
- workflow files
- fork server Dockerfile
- release and operations docs

Key plan:

- Accept upstream mobile native composer, mobile markdown, mobile file viewer, mobile archive and connection polish, relay runtime hardening, DPoP, managed endpoints, environment linking, tracing, APNS, and client runtime relay primitives.
- Replay F13 access management through NativeApi and Connections settings.
- Replay fork server image and headless `t3 serve`.
- Replay desktop fork release identity where release scripts are touched.
- Disable, delete, or leave inactive upstream hosted deployment automation unless the fork explicitly adopts it.
- Treat governance workflows as separate candidates rather than runtime requirements.

Final mile risks:

- Upstream release workflow can silently publish, deploy, version bump, or announce upstream service operations.
- Fork server image workflow can be lost during workflow reconciliation.
- Mobile deployment metadata can point to upstream ownership.
- Relay docs can describe active production deploy automation even when workflow is disabled.
- CI docs can drift back to stale Bun commands.

Focused verification:

- relay tests
- client runtime relay tests
- server cloud tests
- mobile tests
- `pnpm lint:mobile` when native mobile code changes
- Docker build when available
- workflow policy review

## Dependency Graph

- Phase B depends on Phase A because desktop preview, local desktop IPC, backend bootstraps, and browser preview contracts must be stable first.
- Phase C depends on Phase A because Git, source control, provider, auth, settings, and RPC routes share contract and transport definitions.
- Phase D depends on Phase A because web state, composer draft ownership, runtime adapters, and route shape depend on accepted client runtime architecture.
- Phase D partly depends on Phase C because provider instances, source control state, Git actions, and auth access UI need server routes.
- Phase E depends on Phase A because file preview and project routes depend on contracts, assets, project files, and runtime state.
- Phase E depends on Phase D because plan preview and document preview entry points live in chat, timeline, and right panel integration.
- Phase E partly depends on Phase C because project scoped Git uses source control and Git workflow seams.
- Phase F depends on Phase A because mobile and relay consume shared contracts and client runtime primitives.
- Final preservation gate depends on all phases because protected features cross desktop, server, web, runtime, mobile, and workflow surfaces.

## Build Wave Plan

### Wave 0 Broad Planning

Status: complete

Scope:

- Complete domain analysis.
- Record phase packets and dependency graph.
- Check in with the user before implementation.

Parallelization:

- Planning workers ran in parallel.
- No implementation workers launched.

### Wave 1 Central Foundation

Status: complete

Parallelization: central only

Scope:

- Accept package and generated schema substrate.
- Accept shared package substrate needed by upstream client runtime.
- Accept upstream contracts and client runtime architecture.
- Replay additive fork contracts.
- Establish server WebSocket and desktop IPC registration strategy.
- Establish route and runtime adapter strategy.

Implementation evidence:

- Accepted upstream `package.json`, `pnpm-lock.yaml`, `packages/effect-codex-app-server`, `packages/client-runtime`, `packages/contracts`, and `packages/shared` as the Wave 1 substrate.
- Removed old root `packages/client-runtime/src/index.ts`, `wsRpcClient`, `wsTransport`, and legacy root state files in favor of upstream subpath exports.
- Replayed fork contract surfaces for GitHub issues, Git promotion, auth access stream, provider instances, direct screenshot attach, local desktop theme, thread sync V2, plan progress shell fields, markdown diff rendering, diff word wrap, shared fork verification, product identity, and shared plan progress.
- Kept upstream `projects.listEntries` as the canonical project file listing route for downstream replay.
- Kept browser preview screenshot contracts separate from composer screenshot attach contracts.
- Did not edit `apps/server/src/ws.ts`, `apps/server/src/server.ts`, desktop IPC implementation, or web runtime adapters in Wave 1. Limited server provider snapshot edits only stamp legacy `provider` identity beside upstream `instanceId` and `driver`. Remaining server, desktop, and web consumers stay in Wave 2 and Wave 3.

Gate evidence:

- `pnpm --filter @t3tools/contracts test` failed because `pnpm` was not on `PATH`.
- `corepack pnpm --filter @t3tools/contracts test` passed, `14` files and `186` tests.
- `corepack pnpm --filter @t3tools/contracts typecheck` passed.
- `corepack pnpm --filter @t3tools/shared test` passed, `38` files and `279` tests.
- `corepack pnpm --filter @t3tools/shared typecheck` passed.
- `corepack pnpm --filter @t3tools/client-runtime test` passed, `36` files and `247` tests.
- `corepack pnpm --filter @t3tools/client-runtime typecheck` passed.
- `corepack pnpm --filter effect-codex-app-server test` passed, `4` files and `18` tests.
- `corepack pnpm --filter effect-codex-app-server typecheck` passed.
- `corepack pnpm fmt` passed.
- All `corepack pnpm` commands warned that this shell uses Node `v26.0.0` while the repo engine asks for `^24.13.1`.
- Anchored merge marker scan `rg -n "^(<<<<<<<|=======|>>>>>>>)" .plans packages apps package.json pnpm-lock.yaml` found no markers.

Review loop evidence:

- Fresh review found `F12` provider snapshot compatibility incomplete. Fixed by decoding legacy `provider` only snapshots, deriving missing `instanceId` and `driver`, preserving `provider`, and stamping live server provider snapshots with all three identity fields.
- Fresh review found GitHub issue links only existed on thread read models. Fixed by adding `issueLink` to thread create commands, thread metadata commands, turn start bootstrap creation, thread created events, and thread metadata events.
- Fresh review found `diffWordWrap` dropped from client settings while web and desktop consumers still read it. Fixed by restoring the setting, patch field, and focused setting test.
- Fresh review found shared shell API changes still break server consumers. Deferred to Wave 2 server wiring because the failure is outside the shared substrate and must be fixed with server process launch and OS jank consumers.
- `corepack pnpm --filter @t3tools/contracts test` passed after review fixes, `14` files and `190` tests.
- `corepack pnpm --filter @t3tools/contracts typecheck` passed after review fixes.
- `corepack pnpm --filter t3 typecheck` failed as a Wave 2 probe. Representative remaining consumer breaks include shared shell API use in `apps/server/src/os-jank.ts` and `apps/server/src/process/externalLauncher.ts`, renamed project listing contracts in `apps/server/src/ws.ts`, preview contract mismatches in `apps/server/src/filePreview.ts`, and Codex app server client API changes in `apps/server/src/provider/Layers/CodexProvider.ts`.

Exit criteria:

- Focused contract and runtime tests passed.
- Downstream workers have shared DTOs, settings fields, RPC names, IPC names, and route keys for Wave 2 and Wave 3.
- Full repository `pnpm lint`, `pnpm typecheck`, and `pnpm test` are intentionally deferred because Wave 2 and Wave 3 must update server, desktop, web, mobile, and workflow consumers of the new substrate.

### Wave 2 Infrastructure Replay

Status: implemented in working tree, final full gates pending

Parallelization: limited after Wave 1

Candidate split:

- Desktop local integration and browser preview infrastructure.
- Server Git, source control, provider, and auth.
- Mobile and relay runtime intake.

Planning evidence:

- Desktop and preview planning worker completed. It recommended accepting upstream desktop backend pool, WSL primitives, browser preview primitives, preview IPC, and server preview infrastructure, while replaying desktop identity, local desktop theme, direct screenshot attach, and Codex binary path preservation.
- Mobile, relay, deployment, and workflow planning worker completed. It recommended accepting upstream mobile, relay runtime, DPoP, managed relay, APNS, tracing, and server cloud runtime, while preserving fork server image, headless serve, auth access behavior, and workflow policy.
- Server planning worker was stopped after usage interruption. This thread completed the server packet locally from `corepack pnpm --filter t3 typecheck`, the Wave 1 ledger, and fork specs.

Constraints:

- Any edit to `apps/server/src/ws.ts`, `apps/server/src/server.ts`, contract files, route shape, or desktop IPC returns to central integration.
- Workflows and deployment files stay under orchestrator review.

Server packet:

- Accept upstream `apps/server/src/server.ts` infrastructure for asset routes, browser preview layers, preview automation, port discovery, MCP preview tools, relay tracing, and zero grace HTTP shutdown.
- Accept upstream `apps/server/src/ws.ts` route shape for `projects.listEntries`, assets, preview RPCs, preview automation RPCs, and discovered local servers.
- Replay fork RPCs for Git promotion, Git merge and abort, direct GitHub issue operations, auth access stream, provider instance routing, and project scoped Git.
- Update old project listing consumers from `projects.listDirectory` and `ProjectListDirectoryError` to `projects.listEntries` and current project entry errors.
- Update workspace file preview and file preview server consumers to match upstream `ProjectReadFileResult` and file preview contracts.
- Update shared shell consumers in `apps/server/src/os-jank.ts`, `apps/server/src/process/externalLauncher.ts`, and tests for Effect based `resolveWindowsEnvironment`, `isCommandAvailable`, and `resolveCommandPath`.
- Update provider runtime consumers for upstream `effect-codex-app-server` client API changes while preserving F10 binary selection and F12 provider instance identity.
- Fix structured error constructor drift in Git, source control, terminal, diagnostics, and workspace services where upstream requires `cwd`, failure tags, or updated tagged error constructors.
- Keep `apps/server/src/ws.ts`, `apps/server/src/server.ts`, and shared contract edits central in this thread.

Server final mile checks:

- `projects.listEntries` is the only project listing RPC exposed by server and consumed by web runtime.
- Git promotion, merge, abort, and direct GitHub issue RPCs are present in contracts, authorized in `RPC_REQUIRED_SCOPE`, routed in `ws.ts`, and backed by live services.
- Auth access stream still protects current session revocation and publishes real access snapshots.
- Provider instance refresh and send paths route by `providerInstanceId`, with legacy `provider` only as compatibility metadata.
- Browser preview RPCs are reachable through `ws.ts` and backed by live `PreviewManager`, `PortDiscovery`, and `PreviewAutomationBroker` layers.
- Shared shell helper calls run through Effect and still support platform and environment test injection.

Desktop and preview packet:

- Accept upstream desktop package, build, backend pool, WSL backend, browser preview files, preview IPC, and preview picker preload.
- Replay desktop identity through launcher, environment metadata, app name, data dirs, and product identity.
- Replay local desktop theme through `DesktopSystemThemeService`, theme source, IPC channels, preload, and app registration.
- Replay direct screenshot attach through top level `desktopBridge.captureScreenshot`; do not replace it with browser preview screenshot capture.
- Accept plural local environment bootstraps, bearer token IPC, WSL distro selection, WSL only mode, and target environment folder picking.
- Keep F9 document and plan markdown preview out of this wave except where server browser preview substrate must be accepted.

Desktop final mile checks:

- `DesktopIpcHandlers` registers preview, WSL, local desktop theme, and direct screenshot attach handlers.
- `preload.ts` exposes top level screenshot attach and nested browser preview methods.
- Browser screenshots and recordings use browser artifact storage, not composer screenshot attach paths.
- Local desktop theme events come from the running desktop app, not only typed contracts.
- Product name scans do not reintroduce upstream desktop branding.

Mobile, relay, deployment, and workflow packet:

- Accept upstream mobile, relay runtime, DPoP, managed endpoints, APNS, tracing, and client runtime relay primitives.
- Replay F13 mobile auth access behavior on the accepted connection controller, including pairing, reconnect, disconnect, forget, cloud link, DPoP refresh, and saved environment restore.
- Accept server cloud runtime while preserving local headless `t3 serve` output, pairing URL, token, and QR code.
- Preserve fork server image lane with `docker/t3code-server.Dockerfile`, Node `24`, `T3CODE_NO_BROWSER=1`, and `T3CODE_HOME=/data`.
- Keep upstream hosted relay deploy, mobile preview deploy, and upstream release automation absent or disabled unless explicitly adopted.

Mobile and workflow final mile checks:

- Mobile can scan or paste a `t3 serve` pairing URL and reach a thread.
- Mobile restart restores saved environments and reconnects.
- Managed relay refreshes DPoP without persisting transient access tokens.
- Current session revoke is impossible, while non-current session revoke still works.
- Server cloud startup does not require hosted config for local headless serve.
- Workflow scan finds no active upstream hosted deploy or upstream release automation.

Wave 2 focused gates:

- `corepack pnpm --filter t3 typecheck`
- `corepack pnpm --filter t3 test`
- `corepack pnpm --filter @t3tools/desktop typecheck`
- `corepack pnpm --filter @t3tools/desktop test`
- `corepack pnpm --filter @t3tools/client-runtime typecheck`
- `corepack pnpm --filter @t3tools/client-runtime test`
- `corepack pnpm --filter @t3tools/contracts typecheck`
- `corepack pnpm --filter @t3tools/contracts test`
- `corepack pnpm --filter @t3tools/mobile typecheck`
- `corepack pnpm --filter @t3tools/mobile test`
- `corepack pnpm --filter t3code-relay typecheck`
- `corepack pnpm --filter t3code-relay test`
- `corepack pnpm lint:mobile` if native mobile changes land
- `corepack pnpm fmt`

Wave 2 static checks:

- `rg -n "getLocalEnvironmentBootstrap" apps packages`
- `rg -n "desktopBridge\\.preview\\.captureScreenshot|desktopBridge\\?\\.captureScreenshot" apps/web apps/desktop`
- `rg -n "CAPTURE_SCREENSHOT_CHANNEL|SYSTEM_THEME_GET_CHANNEL|PREVIEW_CAPTURE_SCREENSHOT_CHANNEL" apps/desktop/src`
- `rg -n "previewOpen|subscribePreviewEvents|PreviewAutomationBroker|PreviewManager|PortDiscovery" apps/server/src/ws.ts apps/server/src/server.ts`
- `rg -n "bun test|deploy-relay|mobile-eas-preview|ghcr.io/pingdotgg|T3 Code v" .github docker infra/relay scripts`

Wave 2 execution evidence:

- Desktop, server, mobile, relay, contract, shared, runtime, SSH, and generated Codex app server focused gates passed during replay.
- Accepted upstream browser preview as the preview lane and kept it separate from composer screenshot attach.
- `.github` and `docker` remain excluded from adoption in this replay pass unless a later workflow slice explicitly accepts fork owned forms.
- Final full repository gates still need to be rerun after the web product assembly edits.

### Wave 3 Web Product Assembly

Parallelization: limited

Status: in progress

Candidate split:

- Web chat composer sidebar and timeline.
- F9 document and plan preview plus F14 project management.

Constraints:

- Route shape, right panel state, composer ownership, and project scoped Git are integration hubs.
- Final implementation may need one central worker even if planning stays split.

Implementation evidence:

- Accepted upstream `apps/web` from `v0.0.28` as the compile baseline and installed the matching web dependency graph.
- Replayed F1 web branding through shared product identity, with current cleanup now removing Omarchy as the broad product qualifier.
- Replayed F3 direct screenshot attach through top level `desktopBridge.captureScreenshot` in `ChatComposer`, while browser preview screenshots remain under the upstream preview bridge.
- Rebuilt F14 project management on current upstream state atoms, connection runtime, route shape, sidebar grouping rules, and project identity refs.
- Added `/projects/$environmentId/$projectId` with `view=management` and `view=inference`, updated the route tree, and wired sidebar project context actions plus command palette project actions.
- Project management now exposes project name, workspace root, repo summary, direct VCS status, refresh, pull, new thread, latest thread navigation, preferred editor open, script add and edit control, script run handoff, linked threads, and inference navigation.
- Script run from the project page schedules a pending script run before thread navigation, then `ChatView` consumes it and uses the existing terminal runner, avoiding a duplicate terminal lifecycle.
- Script save and update paths preserve `previewUrl` and `autoOpenPreview` fields in both the project page and chat header paths.
- Inference dashboard uses restored rollup helpers and current resident thread activity atoms, including latest usage snapshot per turn and provider reported processed token totals when available.
- F9 planning and final mile review used two read only explorer agents, then central implementation for route shape, timeline wiring, right panel integration, and document rendering.
- Added `planPreviewRouteSearch` for virtual plan preview search parsing and clearing, then wired `_chat.$environmentId.$threadId` to render `PlanConversationDocument` without requiring a workspace write.
- Replayed fullscreen plan preview entry points from both timeline `ProposedPlanCard` rows and the right panel `PlanSidebar`, with copy, download, save to workspace, close, and return to chat behavior.
- Added `DocumentMarkdownRenderer` and document markdown helpers for outline extraction, heading ids, document relative link cwd, source footer policy, and shared document rendering over upstream file preview primitives.
- Updated `FilePreviewPanel` so markdown files default to rendered document preview, keep task list toggles and save coordination, and can switch back to source without stale fork state.
- Extended `ChatMarkdown` document mode with stable heading ids, local anchor handling, safe raw HTML sanitization, table and code overflow controls, code copy controls, Mermaid diagram rendering with source backed failure state, and document image lightbox support.
- Replayed workspace asset routing for document image paths while preserving external image links, and restored the fork `mermaid` dependency in the web package and lockfile.
- Added focused tests for virtual plan preview route search and document markdown heading, outline, and document relative link cwd helpers.

Fresh review evidence:

- Fresh F9 review found real markdown file source footer wiring incomplete. Fixed by passing the file preview source action through `RenderedMarkdownSurface` into `DocumentMarkdownRenderer`.
- Fresh F9 review found outline clicks could miss sanitized heading ids. Fixed by resolving both raw heading ids and `user-content-` prefixed ids.
- Fresh F9 review found workspace markdown links depended too heavily on precomputed regex extraction. Fixed by resolving rendered links directly through `ChatMarkdown` fallback link metadata.

Focused gate evidence:

- `corepack pnpm --filter @t3tools/web typecheck` passed after upstream web accept.
- `corepack pnpm --filter @t3tools/web test` passed after F1 and F3 replay with `149` files and `1288` tests.
- `corepack pnpm --filter @t3tools/web typecheck` passed after F14 route, sidebar, command palette, and script handoff wiring.
- `corepack pnpm --filter @t3tools/web test` passed after F14 wiring with `153` files and `1296` tests.
- `corepack pnpm --filter @t3tools/web typecheck` passed after F9 plan preview, document markdown, Mermaid, and image routing replay.
- `corepack pnpm --filter @t3tools/web test` passed after final F9 review fixes with `155` files and `1306` tests.
- `corepack pnpm --filter @t3tools/web build` passed after final F9 review fixes, with expected chunk size warnings from the production bundle and Mermaid split chunks emitted.
- All `corepack pnpm` commands warned that this shell uses Node `v26.0.0` while the repo engine asks for `^24.13.1`.

Full gate evidence:

- `corepack pnpm fmt` passed on `2012` files after final F9 review fixes.
- `corepack pnpm lint` passed with `6` existing unused disable warnings and `0` errors.
- `corepack pnpm typecheck` passed across `15` workspaces.
- `corepack pnpm test` passed across `14` test workspaces after final F9 review fixes, with `1403` tests passed and `7` skipped.
- `corepack pnpm lint:mobile` passed after final F9 review fixes, with SwiftLint, ktlint, and detekt skipped because those tools are not installed in this environment.
- `git diff --check` passed after final F9 review fixes.

Remaining web risks:

- F9 implementation is complete in the working tree and has focused, full, and fresh review evidence, but it still needs the broader Wave 4 program review pass before final program signoff.
- F14 project scoped Git currently covers route scoped status, changed files, refresh, and pull without an active thread. Full historical `ProjectScopedGitPanel` parity is not restored as a separate component; further Git actions should reuse current VCS and Git action primitives rather than the deleted adapter shape.
- Patch guide and F9 spec already describe the behavior replayed here; no policy edit is required unless Wave 4 changes behavior or owner expectations.

### Wave 4 Cross Slice Repair And Review

Parallelization: review can be parallel, fixes are scoped

Status: complete in working tree

Scope:

- Fresh-context review against all protected features.
- Fix missing wiring, orphan helpers, stale paths, duplicate old and new code, and tests that miss the real app path.
- Run focused gates after every accepted fix.

Method:

- Orchestrator retained final signoff and used Wave 4 as the final mile check for cross slice wiring.
- Review scope targeted F2, F3, F8, F9, F10, F11, F13, and one desktop typecheck cleanup found by the gate.
- Fixes were applied centrally because they touched shared contracts, desktop preload, server projection, server provider startup, and web runtime wiring.

Accepted findings and fixes:

- F2 local desktop theme bridge was read by desktop but not projected into web runtime theme variables. Fixed by subscribing to `desktopBridge.getSystemTheme` and `desktopBridge.onSystemTheme`, projecting selected local colors into app and terminal CSS variables, and making the terminal drawer consume those CSS variables.
- F3 screenshot attach was exposed in preload on every platform. Fixed by exposing `desktopBridge.captureScreenshot` only when supported while leaving browser preview screenshots under the preview bridge.
- F8 sidebar progress was always null in shell snapshots and the sidebar ignored the field. Fixed by deriving shell `activePlanProgress` from projected `turn.plan.updated` activities and rendering fractional plan labels before generic working state.
- F9 nested document markdown links resolved from the document path but reported workspace metadata relative to the document directory. Fixed link metadata so resolution uses document cwd while display and workspace relative paths use the workspace root.
- F10 Codex initialize still sent the server package version instead of the selected Codex CLI version. Fixed provider probe and session runtime initialize paths to resolve the selected binary version with `codex --version`, with timeout fallback to package version.
- F11 publish quick action could enable before provider discovery was ready. Fixed the quick action to require a ready source control provider before offering repository publish.
- F13 paired standard client scopes lacked `relay:write`, so mobile agent activity publication could receive a token that later failed relay writes. Fixed standard scopes and updated access tests while preserving reduced scope denial coverage.
- Desktop menu update checks required `ElectronApp` at action time but omitted it from the captured menu action context. Fixed the runtime service set so desktop typecheck remains clean.

Final mile evidence:

- F2 projection is exercised by `apps/web/src/hooks/useTheme.test.ts` and production paths in `useTheme` and `ThreadTerminalDrawer`.
- F3 platform gating is in `apps/desktop/src/preload.ts`; browser screenshots remain under `desktopBridge.preview.captureScreenshot`.
- F8 progress is exercised through `ProjectionSnapshotQuery` shell snapshots and `Sidebar.logic`.
- F9 nested link metadata is exercised by `apps/web/src/markdown-links.test.ts` and production `ChatMarkdown` plus `DocumentMarkdownRenderer` wiring.
- F10 binary version resolution is exercised by `CodexProvider.test.ts` and production `CodexProvider` plus `CodexSessionRuntime`.
- F11 publish readiness is exercised by `GitActionsControl.logic.test.ts` and production `GitActionsControl` discovery state.
- F13 relay write scope is exercised by contracts, server auth, server HTTP, and client runtime authorization tests.

Focused verification:

- `corepack pnpm --filter @t3tools/web test -- src/hooks/useTheme.test.ts src/markdown-links.test.ts src/components/Sidebar.logic.test.ts src/components/GitActionsControl.logic.test.ts` passed with `155` files and `1311` tests.
- `corepack pnpm --dir apps/server exec vp test run src/provider/Layers/CodexProvider.test.ts src/provider/Layers/ProviderRegistry.test.ts src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/server.test.ts` passed with `4` files and `150` tests.
- `corepack pnpm --filter @t3tools/contracts test -- src/auth.test.ts` passed with `14` files and `190` tests.
- `corepack pnpm --filter @t3tools/client-runtime test -- src/authorization/remote.test.ts` passed with `36` files and `247` tests.
- `corepack pnpm --filter @t3tools/desktop test -- src/window/DesktopApplicationMenu.test.ts` passed with `52` files and `344` tests.
- `corepack pnpm --filter t3 typecheck` passed.
- `corepack pnpm --filter @t3tools/web typecheck` passed.
- `corepack pnpm --filter @t3tools/contracts typecheck` passed.
- `corepack pnpm --filter @t3tools/client-runtime typecheck` passed.
- `corepack pnpm --filter @t3tools/desktop typecheck` passed with existing Effect suggestions only.

Full gate evidence:

- `corepack pnpm fmt` passed on `2012` files.
- `corepack pnpm lint` passed with `0` errors and existing unused disable warnings.
- `corepack pnpm typecheck` passed across `15` workspaces.
- First `corepack pnpm test` run failed once in the CursorAdapter interrupt cancellation test. The isolated test then passed, full server package test passed with `1405` tests and `7` skipped, and the final rerun of `corepack pnpm test` passed across `14` test workspaces.
- `corepack pnpm lint:mobile` passed. SwiftLint, ktlint, and detekt were skipped because those optional tools are not installed in this environment.

Remaining risks:

- The CursorAdapter interrupt cancellation test showed one transient full suite failure and then passed in isolation, full server suite, and final full repository suite. Track as a suite flake if it repeats.
- Wave 5 still needs final preservation signoff across F1 through F14 and the fork preservation gate narrative.

### Wave 5 Final Preservation Gate

Parallelization: central only

Scope:

- Required fork preservation gate.
- Full repository gates.
- `pnpm lint:mobile` if native mobile changed.
- Final mile verification evidence for F1 through F14.
- Update `patch.md` or feature specs only if behavior, owner modules, or verification expectations changed.

## Intake Summary

The upstream range from `v0.0.27` to `v0.0.28` has 341 commits.

Our fork is 54 commits ahead of `v0.0.27`.

`v0.0.28` is 341 commits ahead of `v0.0.27`.

`upstream/main` is 5 commits ahead of `v0.0.28` at investigation time.

Raw upstream diff from `v0.0.27` to `v0.0.28`:

```text
1670 files changed, 165841 insertions, 91480 deletions
```

Changed file status inventory:

```text
690 added
159 deleted
792 modified
29 renamed
```

Changed package and app surface inventory:

```text
474 files    43035 add    46471 del    89506 total apps/web
363 files    24250 add     6820 del    31070 total apps/mobile
325 files    34980 add    16000 del    50980 total apps/server
165 files    18992 add    11212 del    30204 total packages/client-runtime
125 files    20357 add     3794 del    24151 total apps/desktop
 53 files     4371 add     1451 del     5822 total infra/relay
 42 files     3129 add      492 del     3621 total packages/shared
 29 files     3272 add      142 del     3414 total packages/contracts
 15 files     4618 add     2161 del     6779 total packages/effect-codex-app-server
 12 files     1373 add      571 del     1944 total packages/effect-acp
```

The raw release looks large by commit count. Initial classification shows about 208 commits are mechanical error typing, diagnostics, or Effect service cleanup, with 223 commits using the `[codex]` subject prefix. The functional lift is still significant because the mechanical changes land on the same service boundaries used by fork seams.

Date distribution shows one major mechanical spike:

```text
186 commits on 2026-06-20
48 commits on 2026-06-19
341 commits total in range
```

## Upstream Commit Inventory

Representative product and architecture commits from the range:

```text
fda648623 2026-06-29 Restore chat scroll affordances and add timeline minimap (#3587)
a9b1190a1 2026-06-27 Desktop: parallel WSL + Windows backends with mode picker (#2751)
44fb34ad5 2026-06-27 Stabilize preview browser surfaces, automation, and recording (#3565)
6245c547c 2026-06-26 Fix native composer lag with revision-gated updates (#3574)
24abab789 2026-06-26 Stabilize chat scroll anchoring after send (#3564)
52b04b947 2026-06-26 fix(grok): Harden ACP resume with replay-idle load readiness (#3156)
ffae5410e 2026-06-25 Route preview automation through live owner streams (#3548)
31dfe3596 2026-06-25 Fix Electron dev and packaged renderer startup (#3557)
c2776c233 2026-06-25 Restore right panel inset when maximized (#3555)
22f021ed6 2026-06-24 [codex] Upgrade Legend List chat scrolling (#3545)
c6c64918f 2026-06-23 Reduce ChatMarkdown settings rerenders (#3536)
6672a1d21 2026-06-22 Bump Clerk packages and refresh lockfile (#3511)
b2d17b710 2026-06-22 Add main sidebar toggle (#3497)
fb1034546 2026-06-23 feat: add persistent word-wrap setting for chat code blocks and tables (#3480)
f5f98cf0a 2026-06-22 Stabilize composer provider state while typing (#3507)
37ac970e2 2026-06-22 Persist mobile composer selectors across drafts (#3496)
335e0b59e 2026-06-19 Fix PR creation from origin-based worktrees (#3218)
d2c0a6a48 2026-06-19 Add diff scope switching and provider update settings (#3169)
753bc4672 2026-06-19 Harden preview ownership and option-based secret handling (#3172)
d9f59be70 2026-06-19 feat(sidebar): worktree indicator on session rows (#3057)
494350cc0 2026-06-19 feat(composer): clickable PR pill next to branch selector (#3065)
5d4e2fae0 2026-06-19 feat: allow disabling provider update checks (#3130)
3e01c4bc5 2026-06-19 Migrate desktop auth to Clerk bridge (#3092)
52a24c890 2026-06-18 Add origin-based worktree bootstrap option (#3157)
30034eced 2026-06-18 Add archived threads and mobile file viewer (#3155)
e95b57dc2 2026-06-18 [codex] Rewrite client connection architecture (#2978)
b489ea52a 2026-06-16 Improve inline panel, file preview, and MCP session handling (#3121)
3a5ec9464 2026-06-16 Render the plan surface in the inline right panel (#3118)
e56bb200f 2026-06-16 Add right-panel bulk close and tab context menu actions (#3116)
c2ca9de33 2026-06-16 Add file preview comments and task toggles (#3115)
689a88204 2026-06-16 [codex] Add native mobile composer and markdown (#3101)
de8bdc10f 2026-06-15 Add workspace file browser and preview panel (#3087)
cd91ec75f 2026-06-13 Consolidate preview automation framework
29150b573 2026-06-11 Add shared MCP preview automation
07c6d70b9 2026-06-11 Add preview annotation capture tooling
17fb0e4a9 2026-05-03 feat(preview): element-pick attachments + sandboxed picker preload
52c77c1ec 2026-05-03 feat(preview): in-app browser preview panel
```

Full inventory command for expansion before broad implementation:

```text
git log --format='%h %ad %s' --date=short v0.0.27..v0.0.28
```

## Major Upstream Product Lanes

- `accept` browser preview as an upstream owned lane. This means the browser panel, preview automation, element pick annotations, browser screenshots, recording, local server discovery, desktop preview manager, server preview manager, and MCP preview tools.
- `accept` file preview as an upstream substrate. This means the workspace file browser, file preview panel, file comments, task toggles, browser open affordance for previewable files, and right panel file routes.
- `replay` document and plan preview as fork owned F9 behavior. This means virtual plan markdown preview, plan actions, route return behavior, document markdown rendering, Mermaid, image handling, document outline, markdown link routing, source footer policy, and horizontal overflow behavior.
- `accept` mobile native composer, mobile markdown, mobile file viewer, and mobile cloud polish as upstream owned lanes.
- `accept` desktop WSL and Windows backend mode picker, desktop auth bridge, and Electron startup fixes while replaying fork desktop identity, local desktop theme, and direct screenshot attach behavior.
- `accept` right panel improvements, diff scope switching, provider update settings, and timeline minimap as upstream primitives.
- `accept` client runtime connection rewrite, relay hardening, cloud diagnostics, and environment scoped settings as upstream primitives.
- `accept` Effect service cleanup, structured errors, diagnostics enrichment, and generated Codex app server schema updates as implementation substrate.
- `replay` protected fork behavior for all feature specs touched by the intake.
- `override` any upstream behavior that routes fork owned GitHub, desktop identity, local desktop theme, screenshot attach, draft ownership, Git workflow, markdown preview, unified project surfaces, provider instance, Codex binary, or auth access outcomes back to generic upstream behavior.

Preview terminology for this intake:

- Browser preview is the live app browser and automation lane. It is upstream owned and should be accepted unless it conflicts with a protected fork feature.
- File preview is the workspace file browser and file viewer lane. It should be accepted as the substrate for project file navigation and editing.
- Document and plan preview is the F9 fork lane. It must be replayed on top of upstream file and route primitives where possible.
- Browser screenshots are part of upstream browser preview. Direct composer screenshot attach remains F3. Preview annotation screenshot entities may feed F3 when they create a normal draft image attachment.

## Protected Fork Features Touched

- `F1` branding and release identity
- `F2` local desktop theme projection
- `F3` desktop screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git surface isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and document markdown rendering behavior
- `F10` Codex model and binary selection
- `F11` source control provider lane and publish workflow
- `F12` provider instance identity seam
- `F13` auth access management
- `F14` unified project context and inference dashboard

## Direct Conflict Inventory

Dry merge command:

```text
git merge-tree --write-tree HEAD v0.0.28
```

Direct conflict count: 94

Conflict count by top surface:

```text
50 apps/web
18 apps/server
8 apps/desktop
7 packages/client-runtime
5 packages/contracts
3 .github/workflows
1 scripts/notify-discord-release.test.ts
1 scripts/build-desktop-artifact.ts
1 pnpm-lock.yaml
```

Conflict files:

```text
.github/workflows/ci.yml
.github/workflows/mobile-eas-preview.yml
.github/workflows/release.yml
apps/desktop/scripts/electron-launcher.mjs
apps/desktop/src/app/DesktopApp.ts
apps/desktop/src/ipc/DesktopIpcHandlers.ts
apps/desktop/src/ipc/methods/window.ts
apps/desktop/src/main.ts
apps/desktop/src/settings/DesktopClientSettings.test.ts
apps/desktop/src/ssh/DesktopSshPasswordPrompts.ts
apps/desktop/src/window/DesktopApplicationMenu.ts
apps/server/src/checkpointing/Layers/CheckpointDiffQuery.test.ts
apps/server/src/environment/Layers/ServerEnvironment.ts
apps/server/src/git/GitManager.ts
apps/server/src/git/GitWorkflowService.test.ts
apps/server/src/git/GitWorkflowService.ts
apps/server/src/orchestration/Layers/ProjectionPipeline.test.ts
apps/server/src/orchestration/Layers/ProjectionPipeline.ts
apps/server/src/project/Layers/ProjectSetupScriptRunner.test.ts
apps/server/src/project/RepositoryIdentityResolver.test.ts
apps/server/src/project/RepositoryIdentityResolver.ts
apps/server/src/provider/Layers/CodexProvider.ts
apps/server/src/server.ts
apps/server/src/sourceControl/GitHubCli.ts
apps/server/src/workspace/Layers/WorkspaceEntries.ts
apps/server/src/workspace/Layers/WorkspaceFileQuery.ts
apps/server/src/workspace/Services/WorkspaceEntries.ts
apps/server/src/workspace/WorkspaceEntries.test.ts
apps/server/src/ws.ts
apps/web/index.html
apps/web/src/branding.ts
apps/web/src/components/ChatMarkdown.browser.tsx
apps/web/src/components/ChatMarkdown.tsx
apps/web/src/components/ChatView.browser.tsx
apps/web/src/components/ChatView.tsx
apps/web/src/components/CommandPalette.tsx
apps/web/src/components/DiffPanel.tsx
apps/web/src/components/GitActionsControl.browser.tsx
apps/web/src/components/GitActionsControl.tsx
apps/web/src/components/PlanSidebar.tsx
apps/web/src/components/Sidebar.logic.test.ts
apps/web/src/components/Sidebar.tsx
apps/web/src/components/WebSocketConnectionSurface.logic.test.ts
apps/web/src/components/WebSocketConnectionSurface.tsx
apps/web/src/components/chat/ChatComposer.tsx
apps/web/src/components/chat/ChatHeader.tsx
apps/web/src/components/chat/CompactComposerControlsMenu.browser.tsx
apps/web/src/components/chat/MessagesTimeline.browser.tsx
apps/web/src/components/chat/MessagesTimeline.tsx
apps/web/src/components/chat/ProposedPlanCard.tsx
apps/web/src/components/desktop/SshPasswordPromptDialog.tsx
apps/web/src/components/settings/ConnectionsSettings.tsx
apps/web/src/components/settings/KeybindingsSettings.tsx
apps/web/src/components/settings/SettingsPanels.browser.tsx
apps/web/src/components/settings/SettingsPanels.tsx
apps/web/src/diffRouteSearch.test.ts
apps/web/src/diffRouteSearch.ts
apps/web/src/environmentApi.ts
apps/web/src/environmentGrouping.test.ts
apps/web/src/environments/runtime/connection.test.ts
apps/web/src/environments/runtime/connection.ts
apps/web/src/environments/runtime/service.addSavedEnvironment.test.ts
apps/web/src/environments/runtime/service.savedEnvironments.test.ts
apps/web/src/environments/runtime/service.threadSubscriptions.test.ts
apps/web/src/environments/runtime/service.ts
apps/web/src/hooks/useHandleNewThread.ts
apps/web/src/hooks/useTheme.ts
apps/web/src/hooks/useThreadActions.ts
apps/web/src/index.css
apps/web/src/localApi.test.ts
apps/web/src/markdown-links.ts
apps/web/src/routes/_chat.$environmentId.$threadId.tsx
apps/web/src/rpc/wsTransport.test.ts
apps/web/src/rpc/wsTransport.ts
apps/web/src/store.test.ts
apps/web/src/store.ts
apps/web/src/types.ts
apps/web/src/uiStateStore.test.ts
apps/web/src/uiStateStore.ts
packages/client-runtime/src/environmentConnection.ts
packages/client-runtime/src/shellSnapshotState.test.ts
packages/client-runtime/src/wsRpcClient.test.ts
packages/client-runtime/src/wsRpcClient.ts
packages/client-runtime/src/wsRpcProtocol.ts
packages/client-runtime/src/wsTransport.test.ts
packages/client-runtime/src/wsTransport.ts
packages/contracts/src/ipc.test.ts
packages/contracts/src/ipc.ts
packages/contracts/src/project.ts
packages/contracts/src/rpc.ts
packages/contracts/src/settings.ts
pnpm-lock.yaml
scripts/build-desktop-artifact.ts
scripts/notify-discord-release.test.ts
```

## Initial Replay Lift Assessment

The upstream release is large but not uniformly feature dense. Most commit count comes from structured error and Effect cleanup. Replay lift remains high because upstream changed or removed fork owner modules and runtime adapter paths.

High lift:

- Web chat and composer surfaces, including deleted `.browser` split modules, new chat timeline behavior, composer provider state, screenshot control placement, and rich draft controls.
- Markdown and document preview surfaces, because upstream deleted fork document preview modules and added new file preview primitives that do not fully carry F9 by themselves.
- Git surface and unified project context, because upstream deletes the fork `git-panel` and `files-panel` directories in favor of different right panel and file preview primitives.
- Shared runtime transport, because upstream deletes older `wsRpcClient`, `wsTransport`, and runtime service files while adding connection registry and supervisor primitives.
- Desktop, because upstream changes Electron startup, WSL and Windows backend selection, IPC window methods, and theme channels while the fork must replay fork identity, local theme, and screenshot attach.
- Contracts, because upstream modifies IPC, RPC, project, and settings contracts touched by fork auth, desktop, source control, provider instance, and project surface features.

Medium lift:

- Provider runtime and Codex model selection, because upstream adds driver and ACP changes while fork binary and model discovery must remain authoritative.
- Source control provider lane, because upstream already includes many fork aligned GitHub and provider features but conflicts still hit `GitHubCli`, `GitManager`, and `SourceControlProviderRegistry`.
- Auth access management, because upstream changes Clerk, desktop auth, DPoP, and environment scoped settings but the fork UI and transport protection can replay on new primitives.
- Sidebar plan cues, because upstream adds timeline and sidebar changes while fork plan progress and group presentation rules must stay visible.

Lower lift:

- Mobile lane should mostly be accepted unless contract changes break fork web or server features.
- Relay and hosted runtime should mostly be accepted as runtime connectivity while deployment automation remains separately classified.
- Generated Codex app server schema should be accepted and regenerated only if dependency sync requires it.

## Replay Order

### Slice 1 Governance And Intake Note

Decision: `replay`

Upstream primitives:

- upstream release refs
- upstream commit and conflict inventory

Fork seams:

- `.plans/33-upstream-intake-v0.0.28.md`
- `patch.md`
- `fork/`
- governance requirements

Implementation notes:

- Keep this note current as the controlling intake record.
- Expand commit inventory before broad implementation if this draft becomes the final controlling note.
- Record any selective port exception before implementation.

### Slice 2 Dependency And Generated Substrate

Decision: `accept`

Upstream primitives:

- `pnpm-lock.yaml`
- `packages/effect-codex-app-server/src/_generated/schema.gen.ts`
- Effect service cleanup
- structured error changes
- package metadata

Implementation notes:

- Accept upstream generated schema, lockfile, and package changes.
- Reapply fork package and release identity only where F1 requires it.

### Slice 3 Contracts And Runtime Transport

Decision: `accept` plus `replay`

Upstream primitives:

- `packages/contracts`
- `packages/client-runtime/src/connection`
- `packages/client-runtime/src/state`
- new connection registry and supervisor
- environment scoped settings

Fork seams:

- auth access contracts
- desktop IPC theme and screenshot methods
- source control RPC methods
- provider instance contracts
- project route contracts

Implementation notes:

- Start from upstream runtime contracts.
- Replay additive fork methods and settings shapes on top of upstream primitives.
- Do not preserve deleted `wsRpcClient` or `wsTransport` shapes solely because fork code used them.

### Slice 4 Desktop And Local Integrations

Decision: `accept` plus `replay`

Upstream primitives:

- Electron startup fixes
- desktop auth Clerk bridge
- parallel WSL and Windows backend mode picker
- desktop preview manager and browser session primitives
- Electron theme service

Fork seams:

- fork product identity
- local desktop theme source service
- desktop system theme service
- desktop screenshot attach service
- desktop screenshot and theme IPC bridge
- Codex binary environment bridge

Implementation notes:

- Replay F1, F2, F3, and F10 after accepting upstream desktop startup and backend selection changes.
- Keep upstream browser preview screenshots separate from composer screenshot attach.

### Slice 5 Server Runtime And Provider Services

Decision: `accept` plus `replay`

Upstream primitives:

- provider drivers
- ACP runtime changes
- Grok ACP resume hardening
- provider maintenance settings
- terminal manager changes
- project and workspace Effect services

Fork seams:

- provider instance identity
- Codex model and binary discovery
- provider status projection
- orchestration event compatibility

Implementation notes:

- Accept provider driver and terminal service changes.
- Replay F10 and F12 on the upstream provider runtime.
- Verify orchestration projection changes preserve fork sidebar status cues.

### Slice 6 Source Control And Git Workflow

Decision: `accept` plus `replay`

Upstream primitives:

- origin based worktree bootstrap
- source control structured errors
- provider registry and repository service changes
- VCS status parallel refresh

Fork seams:

- fork first GitHub identity
- source control context policy
- Git promotion policy
- worktree lifecycle helpers
- project scoped Git surface adapter

Implementation notes:

- Replay F5, F6, F7, F11, and F14 on top of upstream Git and source control primitives.
- Preserve backup branch creation, fork upstream tracking, and draft isolation.
- Keep GitHub issue UI GitHub scoped until provider parity exists.

### Slice 7 Web Composer And Timeline

Decision: `accept` plus `replay`

Upstream primitives:

- Legend List chat scrolling
- timeline minimap
- chat scroll anchoring
- composer provider state stabilization
- file tags and pending context UI
- right panel tabs

Fork seams:

- composer draft store or current upstream draft owner
- composer screenshot helper
- composer rich draft helper
- composer chrome integration
- plan presentation policy

Implementation notes:

- Identify upstream draft owner first.
- Replay F3, F4, F5, F8, F9, F12, and F14 without restoring stale broad component shapes.

### Slice 8 Markdown Files Preview And Project Surfaces

Decision: `accept` plus `replay`

Upstream primitives:

- workspace file browser
- file preview panel
- right panel route integration
- markdown styling and word wrap
- preview comments and task toggles

Fork seams:

- document markdown renderer
- markdown link resolver
- plan conversation document surface
- document outline and source footer policy
- project route compatibility helpers
- inference dashboard helpers
- project scoped Git adapter

Implementation notes:

- Prefer upstream file preview primitives for project file navigation, file content loading, code preview, task toggles, comments, and browser open affordances.
- Replay fork F9 behavior only where upstream file preview does not already carry it.
- Replay virtual plan markdown preview, plan actions, route return behavior, richer document markdown, Mermaid, image links, outline, source footer policy, workspace link routing, local anchor routing, external link routing, and horizontal overflow behavior.
- Do not treat upstream browser preview as the authority for F9 document or plan preview.
- Rebuild project management on upstream route and file primitives where possible.

### Slice 9 Auth Connections Relay And Mobile

Decision: `accept` plus `replay`

Upstream primitives:

- Clerk package updates
- desktop auth bridge
- connection architecture rewrite
- relay diagnostics
- mobile native composer and markdown
- mobile file viewer

Fork seams:

- auth access contracts
- NativeApi adapter
- Connections settings access management
- saved environment flows

Implementation notes:

- Accept mobile and relay runtime improvements by default.
- Replay F13 current session protection and capability gating.
- Keep hosted deployment automation separately classified under deployment separation rules.

## Selective Port Exceptions

None at investigation time.

## Verification Evidence Required

Focused gates should be chosen after the final replay slice list is approved.

Minimum full repository gate before ready for review:

```text
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
```

Also required if native mobile code is changed:

```text
pnpm lint:mobile
```

Do not run `bun test`.

Feature verification evidence required:

- F1 desktop name, app id stability, release artifact naming, and desktop web branding without Omarchy as broad product identity.
- F2 local desktop theme read, projection, fallback, IPC, and CSS variables.
- F3 direct screenshot capture, artifact wait, clipboard fallback, screenshot entity compatibility, and composer attachment.
- F4 draft text, images, screenshots, attachments, terminal chips, rich draft, and provider selection survival.
- F5 Git surface and project scoped Git actions do not mutate active composer drafts.
- F6 GitHub repo, issue, PR, and panel context remain fork first.
- F7 promotion creates backup branch, merges target, pushes target, cleans source only on safe success, and worktree close or discard teardown remains coherent.
- F8 sidebar and activity surfaces keep plan progress such as `1/4`.
- F9 fullscreen virtual plan preview, document markdown, Mermaid, image preview, link routing, outline, and horizontal overflow.
- F10 live Codex app server model and skill discovery, client version initialize, binary detection, and explicit binary pinning.
- F11 provider neutral source control discovery, clone, publish, raw Git URL bypass, empty repo publish, and GitHub issue scoping.
- F12 provider instance snapshot, aggregation, settings, routing, command menu, skill menu, and metadata compatibility.
- F13 auth access snapshot, pairing link create and revoke, client session revoke, current session protection, and saved environment flows.
- F14 unified project context, right panel surface launchers, script actions, latest thread navigation, project scoped Git, inference totals, and dashboard links.

## Open Decisions

- Confirm base rebuild and replay versus merge and repair after reviewing this investigation.
- Decide whether to target exactly `v0.0.28` or include the 5 commits currently after `v0.0.28` on `upstream/main`.
- Decide whether upstream hosted deployment workflow files stay deleted, disabled, or accepted in a fork owned form.
- F9 seam decision is recorded in Wave 3: URL search driven virtual plan preview plus document markdown rendering on the upstream `FilePreviewPanel` and right panel substrate.
