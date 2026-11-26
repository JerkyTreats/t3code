# Infinite Canvas Roadmap

The canvas work aims at one shared, persistent 2D workspace where the user and several agents at
once keep chats, terminals, files, diffs, browsers, pull requests, drawings and live html pages
side by side, with no forced vertical chat spine. This page records the architecture decision and
the order of the slices. Shipped behavior is specified by the fork specs it links; this page makes
no behavior promise of its own.

## What the thread canvas taught

[F32 thread canvas](../../fork/F32-thread-canvas.md) works well for agents laying out markdown
and live html cards beside a conversation, and for users sketching and dropping text notes beside
them. Grouped sketch pictures let agents see hand-drawn marks without pasted screenshots.

Anchoring a board to one thread's turns breaks down at scale:

- A long thread's turn spine grows hundreds of thousands of pixels tall, so spatial locality is
  lost and every new turn drags its surroundings.
- Users run several chats against the same artifacts, such as a planner, a builder and a reviewer,
  and one thread as the spine makes the others second class.
- A large 2D space needs spatial waypoints, not a switch to another chat's own board.
- Every offscreen card stays mounted, and each save sends the whole scene.

## Decision: keep Excalidraw thin

- Upstream `@excalidraw/excalidraw` stays stock, used as a drawing and camera adapter.
- T3 Code owns the workspace model, spatial anchors, the agent drawing and layout engine, the
  surface card host and any virtualization, under `apps/server/src/canvas`, `packages/shared` and
  `apps/web/src/fork`.
- Per-thread canvases keep working unchanged beside Workspace Canvases.
- Workspace metadata lives in file-backed Effect stores, not new SQLite tables, so upstream
  intakes stay conflict-free.

## Slices

| Slice | Status  | Outcome                                                                                                                                                                               |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Shipped | Grouped sketch pictures: unseen hand-drawn marks reach the agent as one cropped picture per area, part of F32.                                                                        |
| 2     | Built   | [F34 workspace canvas](../../fork/F34-workspace-canvas.md): project canvases with no turn spine, peer chat pins, one focused pin for Cite, and sidebar waypoints for pins and frames. |
| 3     | Planned | Large canvases stay smooth: offscreen markdown and html cards virtualized, level of detail when zoomed far out, and scene deltas instead of whole-scene saves.                        |
| 4     | Planned | Multi-agent choreography: links between pins, files and frames that scope an agent's context, frame-aware `canvas_read` and `canvas_update`, and a renderer-independent scene model.  |

Ideas not yet scheduled in a slice: a "New note here" canvas menu entry, a "Canvas options…" entry
on Workspace Canvases, and a Stop control on each pin beyond the chat card's status header.

## Non-goals for now

- No vendored Excalidraw fork unless an adapter cannot reach a needed behavior.
- No removal of per-thread canvases.
- No mobile canvas; web and desktop wide layouts only.
