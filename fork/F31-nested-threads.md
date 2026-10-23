# F31 Nested Threads

Date: 2026-10-15
Status: active

## Intent

Let an orchestrating thread own ordinary child threads so a manager running many concurrent workers keeps one tidy sidebar row instead of flooding the thread list.

## Required Behavior

- `thread.create` accepts an optional `nestedUnderThreadId`. The target must exist in the same project, must not be archived, a subagent, nested itself, or the new thread. Otherwise the command is rejected and no thread is created.
- Nesting is one level and is chosen only at creation. `thread.metadata.update` with `nestedUnderThreadId: null` moves a thread back to top level. Clearing an unnested thread changes nothing.
- Nesting is separate from lineage. A nested thread keeps top-level lineage, its own lifecycle, stop, wake and settle behavior, and can take messages.
- Forks, subagent children and provider-created threads never inherit nesting.
- Archiving or deleting a parent leaves its children unchanged; clients show those children at top level.
- Older clients and servers ignore the field and list nested threads at top level. Rolling the server back loses no data.
- Web and mobile group visible children under their parent row. Children do not take part in status sections or drag. A child that needs approval or input surfaces its parent in the active section.
- The expansion control appears only when visible children exist. Selecting a non-active row opens it. Selecting the active row toggles expansion. The control toggles without navigating: a chevron on web, the provider badge on mobile, which is filled while expanded. A parent expands automatically while one of its children is active.
- The parent row's badge shows the parent's own provider icon, then up to two child provider icons with the most recently active first, and `+n` for the rest. On card rows the badge replaces the parent's provider history and follows the machine icon. Compact list mode and the rail show the badge only.
- Keyboard traversal and jump hints follow the visible nested order. The command palette labels nested threads `parent › child`.
- **Move to top level** is available on nested threads on web and mobile.
- Nested threads cannot be pinned; **Move to top level** first.

## Durable Owners

- `apps/server/src/orchestration-v2/threadNesting.ts`
- `packages/client-runtime/src/state/fork/threadNesting.ts`
- `apps/web/src/fork/sidebarThreadNesting.ts`
- `apps/web/src/fork/SidebarNestedThreads.tsx`

## Upstream Sensitive Adapters

- `packages/contracts/src/orchestrationV2.ts`
- `apps/server/src/orchestration-v2/Orchestrator.ts`
- `apps/server/src/orchestration-v2/ProjectionStore.ts`
- `apps/server/src/orchestration-v2/ThreadForkService.ts`
- `apps/server/src/orchestration-v2/ProviderEventIngestor.ts`
- `packages/provider-core/src/server/subagentProjection.ts`
- `packages/client-runtime/src/state/models.ts`
- `packages/client-runtime/src/state/threadShell.ts`
- `packages/client-runtime/src/operations/commands.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/components/ThreadNotificationCoordinator.tsx`
- `apps/web/src/uiStateStore.ts`
- `apps/mobile/src/features/threads/threadListV2.ts`
- `apps/mobile/src/features/threads/thread-list-v2-items.tsx`
- `apps/mobile/src/features/threads/useThreadListActions.ts`
- `apps/mobile/src/features/keyboard/commandPaletteItems.ts`
- `apps/mobile/src/persistence/mobile-preferences.ts`

## Upstream Substrate

- thread creation, metadata update and shell projection
- sidebar sections, rows, provider icons and conversation order
- mobile thread list items and virtualization
- command palette thread items and keyboard traversal

## Non Ownership Boundaries

- F31 does not change lineage, subagents, delegated tasks or forks.
- F31 does not add MCP tool parameters, tables, migrations, commands or event types.
- Persisted client state is limited to per-thread expansion choices: web `nestedThreadExpandedByKey` and mobile `threadListNestedExpansion`. Older state defaults to empty.
- F31 does not nest the legacy sidebar.
- F31 does not let users nest an existing top-level thread.

## Verification

- Orchestrator tests cover nested creation, every rejection, clearing, repeated clearing, and children surviving an archived and deleted parent.
- Projection tests prove the in-memory and SQL shells agree, and that a shell carrying the field decodes under the schema without it.
- Fork tests prove a fork of a nested thread is top-level.
- Client-runtime owner tests cover grouping, orphans, badge, expansion, attention, traversal, palette label, move eligibility and stable identity.
- Web and mobile adapter tests cover rows, expansion control, drag exclusion, traversal, palette and move availability.
