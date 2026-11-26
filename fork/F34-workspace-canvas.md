# F34 — Workspace Canvas, Peer Chat Pins & Sidebar Spatial Anchors

Project-scoped infinite 2D canvases independent of any single thread's vertical turn spine, where
any number of peer chats live as spatial pins beside files, terminals, browsers, notes, diagrams
and html pages, navigated through live spatial waypoints in the left sidebar.

Builds on [F32 thread canvas](F32-thread-canvas.md) for scene persistence, `sharedCanvas` MCP
routing, surface cards, marks and grouped sketch pictures, and on [F33 page state](F33-page-state.md)
for live pages.

## Contract

- `F34.D1` Project-scoped identity. A Workspace Canvas has id `canvas:<uuid>`, typed
  `WorkspaceCanvasId`, and belongs to one `ProjectId`. `WorkspaceCanvasStore` keeps each record's
  `id`, `projectId`, `title`, `createdAt` and `updatedAt` in `stateDir/workspace-canvases.json`,
  outside `stateDir/canvases/`, so `ThreadCanvasStore`'s startup scan never reads it as a scene. It
  needs no SQLite migration. An index that fails to parse or decode is moved aside to
  `workspace-canvases.json.corrupt-<time>-<id>` with a logged warning, and the list starts empty.
- `F34.D2` Live RPCs. Clients follow an environment's canvases through
  `subscribeWorkspaceCanvases` and change them through `workspaceCanvas.create`,
  `workspaceCanvas.rename` and `workspaceCanvas.delete` with the orchestration operate scope.
  Titles are at most 120 characters; the default `<project> canvas` title shortens the project name
  to fit. A client whose server lacks the subscription shows no canvases and the canvas route says
  canvases are unavailable.
- `F34.D3` Deletion. Deleting a canvas removes its scene, sketches and `chatBoards` routing through
  `ThreadCanvasStore.remove`, and closes the terminals and browser tabs opened on it through
  `ResourceCleanupService`. It never deletes a pinned chat thread. Every board write,
  `threadCanvas.save` and the canvas MCP tool's draw, runs through `WorkspaceCanvasStore.writeBoard`,
  which refuses a `canvas:` board that is no longer listed, so a stale client or agent cannot bring
  a deleted canvas back, before or after a restart. Writes already in flight in the process are
  dropped by `ThreadCanvasStore`. The deleting client also forgets the board's local copy and
  drops its pending save. Deleting a project deletes its canvases through
  `WorkspaceCanvasStore.layerProjectCleanup`, which follows `ProjectService.subscribeDeletions` and
  checks every listing, so canvases of a project deleted while the server was down, or created by
  a request that landed after the deletion, go too. A scene file that cannot be removed fails the
  deletion and leaves the canvas listed for another try. An unreadable index is moved aside only
  under the store's write lock after reading it again, so a racing read never moves a repaired one.
- `F34.D4` Spineless board and peer Chat Pins. `/canvas/$environmentId/$canvasId` renders
  `WorkspaceCanvasView` with `ExcalidrawBoard` in `workspaceMode`: no turn spine, no turn box
  reconciliation and no turn-chasing camera. A pan or zoom only places cards; markdown cards fit
  their text when the scene changes. Any number of threads may be created or placed on the board
  as `side-chat` cards. The header offers New chat, Frame and Zoom to fit, and the empty-canvas
  menu offers New chat, New frame, Files, New terminal and New browser. New chats and frames take
  the next unused `Chat N` or `Zone N` name.
- `F34.D5` One focused Chat Pin. The canvas anchors store holds each board's focused pin. Pressing
  a pin's card or its sidebar waypoint focuses it; otherwise the first pin is focused. The focused
  card is ringed in its chat's colour and is where Cite on any board element quotes into, and a diff
  card on the canvas shows the focused pin's diffs. A pinned chat's tool diff focuses that chat and
  opens a diff card beside it on that tool call, and its code block command runs in a new terminal
  card beside it.
- `F34.D6` Shared agent routing. Because a `WorkspaceCanvasId` is a valid `ThreadId`,
  `ThreadCanvasStore` and `sharedCanvas.ts` route each pinned chat's `canvas_read`,
  `canvas_update`, `canvas_preview`, `page_state` reveal, unseen marks and sketch pictures to the
  canvas beside that chat's own card. `canvas_update` resolves a pull request card's project from
  `WorkspaceCanvasStore` when the board is a Workspace Canvas.
- `F34.D7` Sidebar spatial waypoints. The sidebar lists Workspace Canvases, filtered to the scoped
  projects when scoped, and creates, opens, renames and deletes them; rename and delete open from
  right-click or the row's `…` button. With several projects in view, `+` asks which project the
  canvas belongs to. While a canvas is open, its **Pinned Chats**, each with its colour dot and
  working, waiting or idle state, and its **Frames** list under it. A chat waypoint glides the camera
  so the pin's top clears the header and focuses it, a frame waypoint fits its zone, and the `+`
  beside Pinned Chats creates a pin whether the board or the view mounted first. Waypoints carry no
  geometry, so dragging on the board re-renders neither the sidebar nor the view. "Place on canvas"
  on any sidebar thread places it on the open Workspace Canvas.

Future slices, not implemented here: a "New note here" menu entry, a "Canvas options…" entry, and
a per-pin Stop button beyond the chat card's existing status header.

Mobile has no Workspace Canvas route or sidebar section and ignores canvas data, as for F32.

## Durable Owners

- `packages/contracts/src/workspaceCanvas.ts`
- `apps/server/src/canvas/WorkspaceCanvasStore.ts`
- `apps/web/src/state/workspaceCanvas.ts`
- `apps/web/src/fork/canvasAnchors.ts`
- `apps/web/src/fork/workspaceCanvasBoards.ts`
- `apps/web/src/fork/WorkspaceCanvasView.tsx`
- `apps/web/src/fork/SidebarCanvasSection.tsx`
- `apps/web/src/routes/_chat.canvas.$environmentId.$canvasId.tsx`

## Upstream Sensitive Adapters

- `packages/contracts/src/index.ts`, `rpc.ts`, `clientRpcPermissions.ts`: workspace canvas RPC
  methods and operate-scope permissions, D2.
- `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/observability/RpcInstrumentation.ts`,
  `apps/server/src/ws.ts`, `apps/server/src/orchestration-v2/runtimeLayer.ts`: register
  `WorkspaceCanvasStore`, its project cleanup layer and the four RPCs, and gate `threadCanvas.save`
  through `writeBoard`, D1 to D3.
- `apps/web/src/components/DiffPanel.tsx`: an optional thread for hosts with no thread route, D5.
- `apps/server/src/project/ProjectService.ts`: `subscribeDeletions` publishes each committed
  project deletion, D3.
- `apps/server/src/canvas/ThreadCanvasStore.ts`: `remove` deletes a board's files and routing and
  drops later writes to it, D3.
- `apps/server/src/mcp/toolkits/canvas/handlers.ts` and `tools.ts`: draw through `writeBoard`,
  resolve a Workspace Canvas pull request card's project and adapt the `canvas_read` note, D3 and D6.
- `apps/web/src/fork/ExcalidrawBoard.tsx`, `CanvasSurfaceCardView.tsx`: `workspaceMode`, anchor
  publication, camera glide, zoom to fit, frames, focus ring and pin focus, and the Workspace
  Canvas pull request availability check, D4, D5 and D7.
- `apps/web/src/components/terminal/useThreadTerminalActions.ts`: an optional project for boards
  with no thread of their own, so canvas terminals open, D5.
- `apps/web/src/components/chat/SideThreadPane.tsx` and `RightPanelSurfaceContent.tsx`: optional
  `composerHandleRef` and `composerHandleForThread` so Cite reaches the focused pin, D5.
- `apps/web/src/components/Sidebar.tsx`: renders `SidebarCanvasSection`, adds "New canvas" to the
  project menu, and targets "Place on canvas" at the open Workspace Canvas, D7.

## Evidence

- `apps/server/src/canvas/WorkspaceCanvasStore.test.ts`: create, list, rename, persistence across
  restart, `follow`, deletion with terminal and preview cleanup, rejected writes after deletion
  before and after restart, corrupt and missing index recovery, and project deletion cleanup.
- `apps/server/src/canvas/ThreadCanvasStore.test.ts`: `remove` deletes scene and sketch files,
  clears `chatBoards`, publishes an empty scene and drops later saves and draws.
- `apps/server/src/canvas/sharedCanvas.test.ts` and `apps/server/src/mcp/McpCanvasToolkit.test.ts`:
  peer chats on a `canvas:<uuid>` board read and draw beside their own card and resolve a pull
  request card's project from `WorkspaceCanvasStore`.
- `apps/web/src/fork/canvasAnchors.test.ts`: anchor extraction ignores deleted elements and
  geometry, default names skip used numbers, focus falls back to the first pin, and a chat pin
  action registered before the board mounts survives it.
- `apps/web/src/fork/WorkspaceCanvasView.browser.test.tsx`: the board mounts with no turns, board
  and sidebar share pin focus, a waypoint jump centres the pin and keeps a tall pin's top below the
  chrome, new frames list as waypoints, and the sidebar filters by project scope.
