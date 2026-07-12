# Project Management Page Port

Date: 2026-05-31
Status: draft

## Goal

Port the `main` branch project management page and inference dashboard onto `t3code/upstream-main-rebuild` in a shape that is easy to rebuild onto future `main` snapshots.

The implementation should keep product behavior in portable feature files and keep branch specific store, router, Git, source control, and environment details behind adapters.

## Source Feature

Reference commits on `main`:

- `d87c4a3f` added the dedicated project management page.
- `6fe82db3` fixed the project overview render loop.
- `c159910f` added the project inference dashboard panels.
- `0d871218` added cached token usage handling for the dashboard.

Reference modules on `main`:

- `apps/web/src/routes/_chat.projects.$projectId.tsx`
- `apps/web/src/components/ProjectOverviewPage.tsx`
- `apps/web/src/components/ProjectInferenceDashboardPage.tsx`
- `apps/web/src/components/ProjectOverview.logic.ts`
- `apps/web/src/components/ProjectInference.logic.ts`
- `apps/web/src/components/useProjectPageData.ts`
- `apps/web/src/components/ProjectManagementHeader.tsx`
- `apps/web/src/components/ProjectPageShell.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/CommandPalette.tsx`

## Current Branch Gap

This rebuild branch has shared project UI pieces such as `ProjectPanel`, `ProjectPanelSection`, `ProjectScriptsControl`, `ProjectFavicon`, and project file preview surfaces.

It does not have:

- a project route for management or inference views
- `ProjectOverviewPage`
- `ProjectInferenceDashboardPage`
- `ProjectOverview.logic`
- `ProjectInference.logic`
- `useProjectPageData`
- sidebar or command palette navigation into a project page

The current `GitPanel` requires `activeThreadRef`, so the `main` project page cannot be copied directly. The port needs a project scoped adapter that can render repository management without inventing a fake thread identity.

## Patch Guide Status

`patch.md` now covers this feature as `F14 Project Management And Inference Dashboard`.

Protected adjacent feature ids:

- `F5` protects Git panel isolation from composer draft ownership.
- `F8` protects sidebar plan cues and logical project grouping behavior.
- `F9` protects project document preview and files preview behavior.
- `F11` protects source control provider lane, clone, publish, and Git panel boundaries.
- `F14` protects the dedicated project management page and inference dashboard.

## Architecture

Use three layers.

### Product Layer

Pure files that encode the feature contract without React Router, Zustand, query clients, environment stores, or Git panel internals.

Target directory:

- `apps/web/src/project-management`

Proposed files:

- `projectManagementTypes.ts`
- `projectManagementRoute.ts`
- `projectManagementOverview.ts`
- `projectManagementInference.ts`
- `projectManagementActions.ts`
- `projectManagementViewModel.ts`
- `projectManagementFixtures.test.ts`
- `projectManagementOverview.test.ts`
- `projectManagementInference.test.ts`
- `projectManagementRoute.test.ts`

Responsibilities:

- define stable product types for concrete project identity, route target, linked thread summary, repository summary, script action, editor action, and dashboard rows
- derive the management view model from plain input data
- derive inference totals and leaderboard from plain thread activity data
- encode route target decisions such as concrete project id plus environment id
- encode action availability and disabled reasons as plain data
- expose no React hooks
- import only stable contracts, shared utilities, and local pure helpers

### Adapter Layer

Small branch shaped files that translate current rebuild runtime data into the product layer.

Target directory:

- `apps/web/src/project-management/adapters`

Proposed files:

- `projectManagementStoreAdapter.ts`
- `projectManagementRouteAdapter.ts`
- `projectManagementGitAdapter.tsx`
- `projectManagementScriptAdapter.ts`
- `projectManagementEditorAdapter.ts`
- `projectManagementNavigationAdapter.ts`
- `projectManagementStatusAdapter.ts`

Responsibilities:

- read projects and threads from the rebuild environment aware store
- resolve concrete project identity from route params
- map `VcsStatusResult` into the product repository summary input
- map `GitPanel` capabilities into project scoped repository management
- map project scripts into command callbacks
- map editor availability and open actions into header actions
- map product navigation targets into TanStack Router calls
- isolate all current rebuild names such as `ScopedProjectRef`, `ScopedThreadRef`, `EnvironmentId`, `useStore`, `useGitStatus`, and `buildThreadRouteParams`

### UI Layer

Thin React components that render view models and call adapter callbacks.

Target directory:

- `apps/web/src/components/project-management`

Proposed files:

- `ProjectManagementRoute.tsx`
- `ProjectManagementPage.tsx`
- `ProjectInferenceDashboardPage.tsx`
- `ProjectManagementHeader.tsx`
- `ProjectManagementShell.tsx`
- `ProjectInferenceMetricCard.tsx`
- `ProjectInferenceLeaderboard.tsx`
- `ProjectScopedGitPanel.tsx`

Responsibilities:

- render product view models
- keep layout and styling local to the feature
- avoid pulling store logic into presentation components
- avoid direct dependency on sidebar grouping internals
- keep page controls feature complete but small enough to rebase cleanly

## Integration Strategy

Keep edits to existing upstream shaped files tiny.

Expected touch points:

- add one route file under `apps/web/src/routes`
- import and render the route level adapter component
- add sidebar project management command in `Sidebar.tsx`
- add command palette open project action in `CommandPalette.tsx`
- add an optional project scoped mode to Git panel only if an adapter cannot wrap the current component safely
- update generated route tree through the existing router generation path if required by the repo

Do not mix project management derivation into `Sidebar.tsx`, `CommandPalette.tsx`, or `GitPanel.tsx`. Those files should delegate to product helpers or adapters.

## Route Design

Preferred route:

- `/_chat/projects/$environmentId/$projectId`

Search state:

- `view` with values `management` and `inference`

Reason:

- the rebuild branch supports multiple environments
- `projectId` alone is not a stable global route key
- saved environments can expose project ids or workspace paths that collide

Compatibility option:

- keep a legacy `/_chat/projects/$projectId` resolver only if needed for old links
- resolve legacy links by searching active environment first, then all environments
- redirect legacy links to the environment scoped route once resolved
- never let a legacy route silently choose a grouped logical project

Product route helper:

- `resolveProjectManagementRouteTarget`
- `projectManagementRouteSearch`
- `buildProjectManagementHref`

Adapter route helper:

- `useProjectManagementRouteParams`
- `navigateToProjectManagement`
- `navigateToProjectInferenceDashboard`

## Project Scoped Git Plan

The feature needs repository management without requiring a thread.

Preferred approach:

- add `ProjectScopedGitPanel` as an adapter component
- feed it concrete project identity, repository cwd, workspace cwd, environment id, and optional latest active thread ref
- let repository wide actions run with no active thread
- hide or disable thread dependent actions when no thread is selected
- route thread dependent actions through latest active thread only when the action explicitly requires a thread and the UI makes that choice visible

Product contract:

- `ProjectGitActionAvailability`
- `ProjectGitActionKind`
- `ProjectGitActionDisabledReason`

Adapter options:

- wrap current `GitPanel` after adding optional `activeProjectRef` and nullable `activeThreadRef`
- or extract a lower level `GitPanelContent` that receives resolved project, repo, workspace, and optional thread state

Guardrails:

- never create a fake draft or fake thread to satisfy `GitPanel`
- never clear active composer draft state from project scoped Git actions
- preserve `F5`, `F6`, `F7`, and `F11` behavior

## Inference Product Logic

Portable file:

- `apps/web/src/project-management/projectManagementInference.ts`

Inputs:

- project threads
- current time as ISO string
- activity payloads as unknown records

Outputs:

- lifetime total burn tokens
- recent total burn tokens over seven days
- projected thirty day burn tokens
- lifetime input tokens
- lifetime cached input tokens
- lifetime output tokens
- recent input tokens
- recent cached input tokens
- recent output tokens
- tracked turns
- recent tracked turns
- average burn per tracked turn
- leaderboard rows

Rules:

- sort activity snapshots by created time, sequence, and id
- use only the latest usage snapshot per turn key
- prefer `totalProcessedTokens` when it is positive
- fall back to `usedTokens`
- fall back to input, cached input, output, and reasoning output component totals when needed
- do not double count cached input when cached input is already reported as an input subset
- include archived threads in dashboard totals and mark them in the leaderboard
- use thread latest turn time, update time, then create time for leaderboard tie breaking

Tests:

- latest snapshot per turn wins
- `totalProcessedTokens` wins over component total
- `usedTokens` fallback works
- cached input subset is counted once
- cached input separate component is counted once as part of total input
- recent seven day cutoff works
- leaderboard ordering is stable
- archived thread row is retained

## Overview Product Logic

Portable file:

- `apps/web/src/project-management/projectManagementOverview.ts`

Inputs:

- project
- project threads
- repository status summary input
- repository context summary input
- recent work limit
- current time as ISO string

Outputs:

- active thread count
- archived thread count
- linked threads sorted by latest activity
- recent work entries
- branch labels
- worktree count
- repository summary labels
- inference rollup summary for header or overview use

Rules:

- derive from plain data
- make status labels deterministic
- avoid direct dependency on VCS implementation details
- keep repository labels as product language
- include project scripts only as data for the UI adapter

Tests:

- thread counts are correct
- archived threads are counted separately
- linked threads sort by latest activity
- branch labels dedupe
- worktree count uses thread worktree paths
- non repo summary is clear
- dirty repo summary includes changed file count
- remote ahead and behind labels are stable

## Data Adapter Plan

Portable product code should not read the store. The adapter should read runtime state once and feed plain data into product helpers.

Adapter hook:

- `useProjectManagementData`

Input:

- environment id
- project id

Reads:

- bootstrap completion
- project by id from selected environment
- threads from selected environment
- VCS status for project cwd
- optional repository context if available
- available editors
- server keybindings

Returns:

- loading state
- missing state
- project view model
- inference dashboard view model
- action callbacks
- navigation callbacks
- project scoped Git props

Redirect behavior:

- before bootstrap completes, render loading or null
- after bootstrap completes with no project, navigate home or to a safe project list route when available
- never render stale data for a removed project

## UI Plan

Management page:

- shell with standard sidebar inset behavior
- header with favicon, project name, workspace path, repo summary, new thread, dashboard link, latest active thread link, open in editor, and scripts menu
- project scoped Git panel as the main management content
- optional lightweight project summary band if needed after Git panel extraction

Inference dashboard:

- same shell and header
- dashboard summary metrics
- input and cached input detail
- recent burn badge
- ranked thread leaderboard
- thread links using environment aware route params
- empty state when no usage snapshots exist

Styling:

- match rebuild UI patterns
- avoid copying large decorative gradients if they fight the current app style
- no nested cards
- keep dashboard dense and scannable
- ensure long project paths wrap safely
- keep button text short and icon backed

## Navigation Entry Points

Sidebar:

- add project management action to concrete project rows
- preserve current expand, collapse, rename, remove, drag, and grouping behavior
- for grouped projects, expose actions on concrete member rows or choose an explicit primary member through product policy
- never route from a group label without a concrete project target

Command palette:

- add `openProjectManagement` command with environment id and project id
- show environment label when needed to disambiguate projects
- close palette after navigation
- keep existing new thread and project creation flows unchanged

Latest active thread:

- choose latest non archived thread for the concrete project in the same environment
- navigate with `buildThreadRouteParams`

## Slice Plan

### Slice 1 Documentation And Feature Contract

Files:

- `patch.md`
- `.plans/29-fork-product-verification.md`
- `.plans/30-project-management-page-port.md`

Work:

- ensure `F14` covers route identity, project scoped Git, inference totals, and entry points
- add verification evidence expectations to `.plans/29`

Verification:

- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 2 Product Logic

Files:

- `apps/web/src/project-management/projectManagementTypes.ts`
- `apps/web/src/project-management/projectManagementInference.ts`
- `apps/web/src/project-management/projectManagementOverview.ts`
- `apps/web/src/project-management/projectManagementRoute.ts`
- tests beside those files

Work:

- port pure inference and overview logic from `main`
- adapt inputs to product types rather than current store types
- add route identity helpers

Verification:

- focused `bun run test` for project management product tests
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 3 Data Adapters

Files:

- `apps/web/src/project-management/adapters/projectManagementStoreAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementStatusAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementNavigationAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementScriptAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementEditorAdapter.ts`

Work:

- adapt rebuild store and environment state into product inputs
- adapt VCS status into repository summary input
- adapt project script and editor actions into product action callbacks
- add missing project redirect logic

Verification:

- focused adapter tests with store fixtures where practical
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 4 Route And Page Shell

Files:

- `apps/web/src/routes/_chat.projects.$environmentId.$projectId.tsx`
- `apps/web/src/components/project-management/ProjectManagementRoute.tsx`
- `apps/web/src/components/project-management/ProjectManagementShell.tsx`
- `apps/web/src/components/project-management/ProjectManagementHeader.tsx`

Work:

- add environment scoped route
- validate `view` search state
- wire route params to the adapter
- render shell and header
- regenerate route tree if the repository requires it

Verification:

- route typecheck
- focused route helper tests
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 5 Project Scoped Git Adapter

Files:

- `apps/web/src/components/project-management/ProjectScopedGitPanel.tsx`
- `apps/web/src/project-management/adapters/projectManagementGitAdapter.tsx`
- targeted edits in `apps/web/src/components/git-panel/GitPanel.tsx`
- targeted edits in `apps/web/src/components/git-panel/GitPanelRouteAdapter.tsx`

Work:

- support repository management for a concrete project with no active thread
- disable or hide thread specific actions when no thread target exists
- keep source control and promotion behavior routed through existing governed Git surfaces
- keep draft state untouched

Verification:

- focused Git panel adapter tests if practical
- existing Git panel tests
- focused draft isolation test
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 6 Management Page UI

Files:

- `apps/web/src/components/project-management/ProjectManagementPage.tsx`
- `apps/web/src/components/project-management/ProjectManagementActions.tsx` if useful

Work:

- render management view model
- wire new thread, latest thread, open editor, and scripts actions
- render project scoped Git panel

Verification:

- component smoke test if local patterns support it
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 7 Inference Dashboard UI

Files:

- `apps/web/src/components/project-management/ProjectInferenceDashboardPage.tsx`
- `apps/web/src/components/project-management/ProjectInferenceMetricCard.tsx`
- `apps/web/src/components/project-management/ProjectInferenceLeaderboard.tsx`

Work:

- render dashboard metrics and leaderboard from product view model
- add empty state
- use environment aware thread links

Verification:

- focused inference UI smoke test if local patterns support it
- product inference tests
- `bun fmt`
- `bun lint`
- `bun typecheck`

### Slice 8 Sidebar And Command Palette Entry Points

Files:

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/project-management/adapters/projectManagementNavigationAdapter.ts`
- related command palette logic files if needed

Work:

- add project management action for concrete project rows
- add command palette open project command
- include environment labels for ambiguous projects
- keep grouped project labels presentation only

Verification:

- sidebar logic tests for grouped concrete target behavior
- command palette action tests
- `bun fmt`
- `bun lint`
- `bun typecheck`

## Main Rebuild Guidance

When rebuilding onto a new `main`, copy or replay in this order:

1. Product layer files.
2. Product layer tests.
3. Adapter interfaces.
4. Route adapter for the new router shape.
5. Store adapter for the new state shape.
6. Git adapter for the new Git panel shape.
7. Thin UI components.
8. Tiny integrations in sidebar and command palette.

Expected conflict boundary:

- product layer should carry almost no conflicts unless the feature behavior changes
- adapters should absorb most upstream or rebuild shape changes
- existing shared components should need only small import and callback changes

## Acceptance Criteria

- `patch.md` includes `F14`.
- The product layer has pure tests for overview, inference, and route identity.
- The project route is environment scoped.
- Sidebar and command palette open the correct concrete project.
- Grouped sidebar labels do not become project identity.
- Project scoped Git management works without an active thread.
- Project scoped Git management does not clear unrelated composer drafts.
- The inference dashboard preserves processed token and cached input semantics.
- Dashboard thread links preserve environment aware routing.
- Removed project state after bootstrap does not render stale content.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.

## Risks

- Route collisions if project id is used without environment id.
- Git panel coupling to thread state can pull draft ownership into the project page.
- Sidebar grouping can accidentally become a project identity source.
- Inference activity payloads vary by provider and need defensive parsing.
- Copying page components directly from `main` can hide branch specific assumptions in presentation code.

## Open Decisions

- Whether to keep a legacy project id only route for old links.
- Whether to extract `GitPanelContent` or add a nullable thread mode to current `GitPanel`.
- Whether project management should live under `apps/web/src/project-management` permanently or move to a package later.
- Whether inference dashboard should include archived threads by default. The proposed default is yes because burn is historical project work.
