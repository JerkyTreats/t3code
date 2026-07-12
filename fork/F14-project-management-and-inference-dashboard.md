# F14 Unified Project Context And Inference Dashboard

Date: 2026-07-10
Status: active

## Intent

Project level management lives in the unified right panel.

The right panel provides compact global project context while `Open a surface` launches thread and project surfaces such as Git Panel and Inference Dashboard.

## Required Behavior

- Unified right panel is the primary product destination for project management.
- Standalone project management routes are compatibility or deep link surfaces, not the expected entrypoint.
- Sidebar and command palette project actions open the unified right panel for the intended concrete project.
- Project routes preserve concrete project identity, including environment identity when multiple environments can expose projects with overlapping ids.
- Logical project grouping remains presentation only and must not become the source of workspace path, repository identity, or project route decisions.
- The right panel header exposes compact global project information such as project name, workspace path, repository summary, environment, latest active thread, editor actions, and project script entrypoints.
- `Open a surface` stays concise and represents selectable surfaces rather than wordy project documentation.
- Git Panel is opened as a unified right panel surface.
- Project scoped Git management works without requiring an active thread while preserving thread scoped Git actions where they remain meaningful.
- Project scoped Git management must not take ownership of, clear, or reroute unrelated composer draft content.
- Inference Dashboard is opened as a unified right panel surface and summarizes project wide model work across linked project threads.
- Inference rollups use the latest usage snapshot per turn and preserve provider reported total processed tokens when available.
- Inference rollups handle cached input tokens without double counting cached input when providers report cached input as a subset of input.
- The dashboard shows lifetime burn, recent burn, projected thirty day burn, input, cached input, output, tracked turns, and a ranked thread leaderboard.
- Large token totals use compact magnitude suffixes through billions, trillions, and quadrillions instead of accumulating under the millions suffix.
- Thread links from project surfaces and dashboard preserve environment aware thread routing.
- Missing project data after bootstrap redirects or degrades safely instead of rendering stale project content.

## Owner Modules

- `apps/web/src/routes/_chat.projects.$environmentId.$projectId.tsx`
- `apps/web/src/components/project-management/ProjectManagementRoute.tsx`
- `apps/web/src/components/project-management/ProjectManagementPage.tsx`
- `apps/web/src/components/project-management/ProjectInferenceDashboardPage.tsx`
- `apps/web/src/components/project-management/ProjectContextHeader.tsx`
- `apps/web/src/components/project-management/ProjectManagementShell.tsx`
- `apps/web/src/components/project-management/ProjectMetricCard.tsx`
- `apps/web/src/components/git-panel/GitPanelSurface.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/RightPanelTabs.tsx`
- `apps/web/src/rightPanelStore.ts`
- `apps/web/src/project-management/projectManagementRoute.ts`
- `apps/web/src/project-management/projectManagementOverview.ts`
- `apps/web/src/project-management/projectManagementInference.ts`
- `apps/web/src/project-management/projectManagementTypes.ts`
- `apps/web/src/project-management/useProjectManagementThreads.ts`
- `apps/web/src/project-management/projectManagementStatusAdapter.ts`
- `apps/web/src/components/ProjectScriptsControl.tsx`
- `apps/web/src/lib/projectPaths.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/hooks/useHandleNewThread.ts`
- `apps/web/src/projectPendingScriptRun.ts`
- `apps/web/src/threadRoutes.ts`

## Fork Seams

- project context product helpers
- unified right panel surface descriptors
- project route compatibility helpers
- project management store adapter
- project scoped Git surface adapter
- project script adapter
- sidebar and command palette project actions

## One Shot Rebuild Notes

- Restore product helpers before route and UI integration.
- Keep concrete project identity as environment id plus project id.
- Keep sidebar grouping presentation only.
- Add the project context header before adding project surfaces.
- Add project scoped Git through a right panel surface adapter instead of faking active thread identity.
- Add Inference Dashboard through a right panel surface descriptor instead of a standalone management page dependency.
- Preserve latest thread navigation through environment aware thread route helpers.
- Rebuild inference rollups from latest usage snapshot per turn before rendering dashboard metrics.
- Recheck markdown and file preview behavior from `F9` because project surfaces link into those surfaces.

## Upstream Replay Rule

- Replay upstream right panel, dashboard, and route changes so concrete project identity and environment aware routing remain explicit.
- Preserve fork sidebar grouping rules so grouped labels never replace concrete project identity for management actions.
- Preserve fork Git panel draft isolation and source control guardrails when project scoped Git actions are added or changed.
- Override upstream changes that make inference totals depend only on prompt and response tokens when provider processed token totals are available.
- Override upstream changes that remove project level access to scripts, editor actions, latest thread navigation, Git Panel, or Inference Dashboard.
- Prefer unified right panel surfaces over standalone project management routes.

## Verification

- Sidebar and command palette project actions open the unified right panel for the intended concrete project.
- Environment scoped project routes distinguish projects with the same id or path across saved environments.
- Grouped sidebar projects keep group labels presentation only while concrete project actions still target concrete projects.
- Project context can start a new thread, open the latest active thread, open the project in an available editor, and run project scripts.
- `Open a surface` exposes Git Panel and Inference Dashboard as concise launchers.
- Project scoped Git surface renders repository state without an active thread and does not clear active composer drafts.
- Git surface keeps commit, pull, promote, pull request, publish, status refresh, workspace summary, and changed file actions visible without returning to a standalone route.
- The inference dashboard counts only the latest usage snapshot for each turn.
- The inference dashboard preserves `totalProcessedTokens` and falls back to `usedTokens` plus token components when needed.
- Cached input handling avoids double counting when cached input is reported as an input subset.
- Token totals remain readable across `K`, `M`, `B`, `T`, and `Q` magnitudes with stable rounding at unit boundaries.
- Dashboard leaderboard links navigate to the correct environment scoped threads.
- Missing or removed project state after bootstrap exits or degrades without stale project details.

## Compatibility Checks

- Project routes remain environment aware.
- Legacy or missing project state redirects or degrades safely.
- Project scoped Git surface does not mutate unrelated composer draft state.
