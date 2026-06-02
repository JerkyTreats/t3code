# F14 Project Management And Inference Dashboard

Date: 2026-06-02
Status: active

## Intent

Project level management gives each concrete project a first class workspace page for repository operations, project scripts, editor actions, linked threads, and inference usage without collapsing project identity into sidebar grouping or thread only surfaces.

## Required Behavior

- Project management is reachable from sidebar project actions and command palette project actions.
- Project routes preserve concrete project identity, including environment identity when multiple environments can expose projects with overlapping ids.
- Logical project grouping remains presentation only and must not become the source of workspace path, repository identity, or project route decisions.
- The management page exposes project name, workspace path, repository summary, new thread action, latest active thread navigation, editor open actions, and project script actions.
- Project scoped Git management works without requiring an active thread while preserving thread scoped Git actions where they remain meaningful.
- Project scoped Git management must not take ownership of, clear, or reroute unrelated composer draft content.
- The inference dashboard is reachable from project management and summarizes project wide model work across linked project threads.
- Inference rollups use the latest usage snapshot per turn and preserve provider reported total processed tokens when available.
- Inference rollups handle cached input tokens without double counting cached input when providers report cached input as a subset of input.
- The dashboard shows lifetime burn, recent burn, projected thirty day burn, input, cached input, output, tracked turns, and a ranked thread leaderboard.
- Thread links from the project page and dashboard preserve environment aware thread routing.
- Missing project data after bootstrap redirects or degrades safely instead of rendering stale project content.

## Owner Modules

- `apps/web/src/routes/_chat.projects.$environmentId.$projectId.tsx`
- `apps/web/src/components/project-management/ProjectManagementRoute.tsx`
- `apps/web/src/components/project-management/ProjectManagementPage.tsx`
- `apps/web/src/components/project-management/ProjectInferenceDashboardPage.tsx`
- `apps/web/src/components/project-management/ProjectManagementHeader.tsx`
- `apps/web/src/components/project-management/ProjectManagementShell.tsx`
- `apps/web/src/components/project-management/ProjectMetricCard.tsx`
- `apps/web/src/components/project-management/ProjectScopedGitPanel.tsx`
- `apps/web/src/project-management/projectManagementRoute.ts`
- `apps/web/src/project-management/projectManagementOverview.ts`
- `apps/web/src/project-management/projectManagementInference.ts`
- `apps/web/src/project-management/projectManagementTypes.ts`
- `apps/web/src/project-management/adapters/projectManagementScriptAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementStatusAdapter.ts`
- `apps/web/src/project-management/adapters/projectManagementStoreAdapter.ts`
- `apps/web/src/components/ProjectScriptsControl.tsx`
- `apps/web/src/components/git-panel/GitPanel.tsx`
- `apps/web/src/components/git-panel/GitPanelRouteAdapter.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/hooks/useHandleNewThread.ts`
- `apps/web/src/projectPendingScriptRun.ts`
- `apps/web/src/threadRoutes.ts`
- `apps/web/src/storeSelectors.ts`

## Fork Seams

- project management product helpers
- project management route helpers
- project management store adapter
- project scoped Git panel adapter
- project script adapter
- sidebar and command palette project actions

## One Shot Rebuild Notes

- Restore product helpers before route and UI integration.
- Keep concrete project identity as environment id plus project id.
- Keep sidebar grouping presentation only.
- Add project scoped Git through an adapter instead of faking active thread identity.
- Preserve latest thread navigation through environment aware thread route helpers.
- Rebuild inference rollups from latest usage snapshot per turn before rendering dashboard metrics.
- Recheck markdown and file preview behavior from `F9` because project management links into those surfaces.

## Upstream Intake Rule

- Adapt upstream project page, dashboard, and route changes so concrete project identity and environment aware routing remain explicit.
- Preserve fork sidebar grouping rules so grouped labels never replace concrete project identity for management actions.
- Preserve fork Git panel draft isolation and source control guardrails when project scoped Git actions are added or changed.
- Reject upstream changes that make inference totals depend only on prompt and response tokens when provider processed token totals are available.
- Reject upstream changes that remove project level access to scripts, editor actions, latest thread navigation, or dashboard navigation.

## Verification

- Sidebar and command palette project actions open the management page for the intended concrete project.
- Environment scoped project routes distinguish projects with the same id or path across saved environments.
- Grouped sidebar projects keep group labels presentation only while concrete project actions still target concrete projects.
- Project management can start a new thread, open the latest active thread, open the project in an available editor, and run project scripts.
- Project scoped Git management renders repository state without an active thread and does not clear active composer drafts.
- The inference dashboard counts only the latest usage snapshot for each turn.
- The inference dashboard preserves `totalProcessedTokens` and falls back to `usedTokens` plus token components when needed.
- Cached input handling avoids double counting when cached input is reported as an input subset.
- Dashboard leaderboard links navigate to the correct environment scoped threads.
- Missing or removed project state after bootstrap exits the page without stale project details.

## Compatibility Checks

- Project routes remain environment aware.
- Legacy or missing project state redirects or degrades safely.
- Project scoped Git management does not mutate unrelated composer draft state.
