# F8 Plan Aware Sidebar And Activity Status Cues

Date: 2026-06-02
Status: active

## Intent

Thread and sidebar status cues reflect plan state directly instead of collapsing plan work into a generic running label.

## Required Behavior

- Sidebar and activity surfaces show explicit plan aware progress when plan data exists.
- Fractional plan progress such as `1/4` remains visible when a plan exposes step progress.
- Plan ready and active plan cues remain visible where the fork currently surfaces them.
- Plan sidebar affordances remain available from the active thread view.
- Optional logical project grouping may add sidebar group labels, but concrete project rows, thread rows, status dots, plan progress, rename, removal, and project path actions remain owned by the original project entries.
- Group labels are presentation only and must not become the source of GitHub identity, project identity, or workspace path decisions.

## Owner Modules

- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`

## Fork Seams

- plan presentation policy
- sidebar logic
- plan sidebar affordance wiring
- project grouping presentation logic

## One Shot Rebuild Notes

- Restore plan presentation derivation before sidebar layout changes.
- Keep fractional progress visible on concrete thread rows even when grouping is enabled.
- Treat project group labels as display only.
- Verify plan sidebar entry points after route and layout changes.

## Upstream Replay Rule

- Replay upstream activity and thread status changes so plan aware cues remain explicit.
- Override upstream regressions that replace explicit plan progress with generic running labels.

## Verification

- Threads with active plan steps show fractional progress when the data exists.
- Plan ready and in progress cues render in sidebar and thread activity surfaces.
- Plan sidebar remains reachable from the thread view.
- Enabling logical project grouping keeps concrete project actions and plan aware thread cues visible.

## Compatibility Checks

- Group labels never become route ids, repository ids, GitHub ids, or workspace paths.
- Sidebar row actions still target concrete projects and threads.
