# F8 Plan Aware Sidebar And Activity Status Cues

Date: 2026-06-02
Status: active

## Intent

Thread and sidebar status cues reflect plan state directly instead of collapsing plan work into a generic running label.

## Required Behavior

- Sidebar and activity surfaces show explicit plan aware progress when plan data exists.
- Fractional plan progress such as `1/4` remains visible when a plan exposes step progress.
- Shell snapshots derive active plan progress from `turn.plan.updated` activity rows.
- Plan ready and active plan cues remain visible where the fork currently surfaces them.
- Plan sidebar affordances remain available from the active thread view.
- Optional logical project grouping may add sidebar group labels, but concrete project rows, thread rows, status dots, plan progress, rename, removal, and project path actions remain owned by the original project entries.
- Group labels are presentation only and must not become the source of GitHub identity, project identity, or workspace path decisions.
- Sidebar V2 is an optional surface that defaults off for its first fork release.
- Settings persist both the Sidebar V2 enabled value and whether the user configured that value explicitly.
- Sidebar V1 remains available while Sidebar V2 is optional.
- Sidebar V2 uses the same plan progress derivation as Sidebar V1. Active fractional plan progress replaces the generic Working label while approval and input states remain higher priority.
- Sidebar V2 actions remain capability gated and preserve concrete environment, project, and thread identities.
- Sidebar V2 supports bounded pagination, project grouping, project actions, bulk settle, unread state, delete, rename, and keyboard traversal.
- Settled threads remain reachable and can be explicitly settled or returned to active state.
- Persisted thread settlement uses `settledOverride` with null, `settled`, or `active`, plus `settledAt` as an ISO timestamp or null.
- Settle and unsettle commands emit idempotent events. The first settle and user unsettle use server acceptance time, and repeated settle preserves the original accepted timestamp.
- User unsettle writes the active override and clears the settled timestamp. Waking activity clears both fields.
- User message, live session transition, approval request, and user-input request count as waking activity.
- Pending approval, pending input, starting session, running session, and a queued turn block settlement.
- Queued turn detection uses a two-minute grace and compares the latest user message with latest turn request, start, and completion timestamps.
- Explicit settled state wins only after active blockers clear. Explicit active state suppresses merged, closed, and inactivity auto-settlement until real activity clears the override.
- Merged or closed change request state settles only when no active blocker and no explicit active override remains.
- Inactivity uses the latest valid user or turn timestamp. Invalid timestamps never hide a thread.
- `sidebarAutoSettleAfterDays` defaults to 3, accepts null to disable, and otherwise accepts only integers from 1 through 90.
- Invalid auto-settle UI values are not persisted.
- Existing projection rows migrate through migration 39 with both settled fields initialized to null and migrations 33 through 38 left unchanged.
- Thread snoozing is explicitly deferred and is not implied by settlement.

## Owner Modules

Current owner modules:

- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/server/src/persistence/Migrations/039_ProjectionThreadsSettled.ts`
- `apps/server/src/persistence/Services/ProjectionThreads.ts`
- `apps/server/src/persistence/Layers/ProjectionThreads.ts`
- `packages/shared/src/planProgress.ts`
- `apps/web/src/session-logic.ts`
- `packages/client-runtime/src/state/threadDetail.ts`
- `packages/client-runtime/src/state/threadSettled.ts`
- `packages/client-runtime/src/state/threadReducer.ts`
- `packages/client-runtime/src/state/threadCommands.ts`
- `packages/client-runtime/src/operations/commands.ts`
- `packages/contracts/src/settings.ts`
- `apps/web/src/hooks/useSettings.ts`
- `apps/web/src/clientPersistenceStorage.ts`
- `apps/desktop/src/settings/DesktopClientSettings.ts`
- `packages/contracts/src/orchestration.ts`

Planned owner modules:

- `apps/web/src/components/SidebarV2.tsx`
- `apps/web/src/components/AppSidebarLayout.tsx`

## Fork Seams

- plan presentation policy
- sidebar logic
- plan sidebar affordance wiring
- project grouping presentation logic
- optional Sidebar V2 layout adapter
- persisted Sidebar V2 settings resolver
- settled lifecycle policy
- thread settlement command and projection

## One Shot Origin Rebuild Notes

- Restore plan presentation derivation before sidebar layout changes.
- Restore shell snapshot plan progress projection before relying on sidebar rendering tests.
- Keep fractional progress visible on concrete thread rows even when grouping is enabled.
- Treat project group labels as display only.
- Verify plan sidebar entry points after route and layout changes.
- Restore settlement contracts, migration, policy, and projection before mounting Sidebar V2.
- Keep one shared plan progress resolver across both sidebar versions.
- Route Sidebar V1, Sidebar V2, and command palette project actions through one concrete project launcher.
- Keep unsupported settlement actions hidden through environment capability checks.
- Do not add snooze fields, commands, events, timers, or user interface in this rebuild.

## Origin Rebuild Rule

- Rebuild activity and thread status changes only from origin-owned changes so plan aware cues remain explicit.
- Reject origin regressions that replace explicit plan progress with generic running labels.

## Verification

- Threads with active plan steps show fractional progress when the data exists.
- Server shell snapshots include active plan progress when the latest turn has plan activity.
- Plan ready and in progress cues render in sidebar and thread activity surfaces.
- Plan sidebar remains reachable from the thread view.
- Enabling logical project grouping keeps concrete project actions and plan aware thread cues visible.
- Sidebar V2 defaults off, honors explicit persisted choices, and leaves Sidebar V1 selectable.
- Both sidebar versions agree on fractional plan progress and status priority.
- Settled policy tests cover explicit state, waking activity, blockers, queued-turn grace, merged or closed state, inactivity, and invalid timestamps.
- A schema 38 database upgrades to migration 39 without rewriting migrations 33 through 38.
- Auto-settle settings decode old data, persist null or integers from 1 through 90, and reject invalid UI values.
- Client setting patches are schema validated before optimistic snapshot replacement or browser and desktop persistence.
- Bulk settle, unread, delete, rename, pagination, grouping, project actions, and keyboard traversal work without losing concrete identities.
- Static scans prove that snooze commands, events, persistence fields, wake scheduling, and UI are absent.

## Compatibility Checks

- Group labels never become route ids, repository ids, GitHub ids, or workspace paths.
- Sidebar row actions still target concrete projects and threads.
- Old settings decode with Sidebar V2 off and auto-settle set to 3.
- Unsupported environments do not expose settlement mutations.
- Settlement fields remain additive to shell, detail, and hydration payloads.
