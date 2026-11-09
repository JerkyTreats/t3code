# F32 Thread Canvas

Date: 2026-11-08
Status: active on the canvas working branch `demo/excalidraw-board`

## Intent

Give every thread a shared Excalidraw canvas behind its turns, where the agent lays out answers as
diagrams and cards beside the turn that asked, and the user draws or writes notes the agent reads.

## Required Behavior

- `F32.D1` Board presence. On web and desktop at Comfortable chat width, a thread shows its board
  behind the turns, and each turn lands as a box the reader can drag aside. The compact T3 Thread
  client, side chats and other embedded chats never mount a board, so one thread has at most one
  board on screen. A draft has its own board; when the draft is sent, its user marks move to the
  new thread's board. Mobile has no board and ignores canvas data.
- `F32.D2` Shared scene. A thread's canvas is one scene of Excalidraw elements stored by the
  server per thread and merged element by element, newest version winning, with deletions kept as
  tombstones. Clients save through `threadCanvas.save`, guarded by its client RPC scope, and follow
  changes through `subscribeThreadCanvas`; every client and the agent see the same scene. Moving
  or zooming the camera never saves. The server treats element data as opaque apart from `id` and
  `version`.
- `F32.D3` Agent tools. The orchestration MCP endpoint offers `canvas_read`, `canvas_update` and
  `canvas_preview`. `canvas_update` takes shapes, a Mermaid flowchart that the server lays out
  (bands, lead and aside roles, kinds coloured with a legend), markdown cards and html cards, and
  patches an existing drawing by id. Drawings placed `besideLatestTurn` go in the column beside the
  latest turn and stay out of the turns' own column; a drawing sent again in a later turn moves
  beside that turn. A delegated task draws on its parent's canvas. `canvas_preview` renders a region
  so the agent can see it, including which cards are cut off.
- `F32.D4` User marks reach the agent. Anything the user draws or writes is a mark. Marks the agent
  has not seen are summarised into the next turn, and the send button sends them with nothing
  typed. A note is never sent on its own from the board. `canvas_read` reports marks with the text
  they cover.
- `F32.D5` Card presentation. Markdown cards keep single line breaks; a capitalised state word that
  starts a line, list item or table cell renders as a coloured chip, with the chip span admitted by
  the shared Markdown sanitizer; a card holding a table widens to fit it. html cards are agent
  attachments shown behind a cover that lets wheel and drag pan the board until clicked. Citation
  chips in a reply pan the board to the cited card. `html_render` with `displayWidth` widens that
  turn's card on the board.
- `F32.D6` Agent guidance. The orchestration instructions carry a Canvas section, delivered to
  Claude and Codex, that tells agents when and how to draw. Its byte size is part of the committed
  agent context budget.

## Durable Owners

- `apps/web/src/fork/ExcalidrawBoard.tsx`, `turnBoard.ts`, `TurnCards.tsx`, `ThreadCanvasSync.tsx`
- `apps/web/src/fork/canvasCards.ts`, `canvasMarks.ts`, `canvasStateChips.ts`, `cardMiddleDrag.ts`,
  `draftBoardHandoff.ts`, `turnTableWidth.ts`
- `apps/web/src/state/threadCanvas.ts`
- `apps/server/src/canvas/ThreadCanvasStore.ts`, `threadCanvasScene.ts`, `threadCanvasPlan.ts`,
  `canvasDiagram.ts`, `canvasPreviewPage.ts`, `sharedCanvas.ts`
- `apps/server/src/mcp/toolkits/canvas/tools.ts` and `handlers.ts`
- `packages/shared/src/threadCanvasDrawing.ts`
- `packages/contracts/src/threadCanvas.ts`

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatView.tsx`: mounts the board and decides when it shows (D1).
- `apps/web/src/components/chat/MessagesTimeline.tsx`: renders turn cards instead of the list
  while a board is mounted.
- `apps/web/src/components/chat/ChatComposer.tsx`: sends unseen marks (D4).
- `apps/web/src/index.css`: board, card and chip styles.
- `packages/contracts/src/rpc.ts` and `clientRpcPermissions.ts`, `apps/server/src/ws.ts`: the two
  canvas RPCs and the save scope (D2).
- `apps/server/src/orchestration-v2/runtimeLayer.ts`: provides `ThreadCanvasStore`.
- `apps/server/src/orchestration-v2/ProviderTurnStartService.ts`: adds the unseen-marks note to a
  turn (D4).
- `apps/server/src/mcp/McpHttpServer.ts`: registers the canvas toolkit on the orchestration
  endpoint (D3).
- `apps/server/src/htmlRender/HtmlRender.ts` and `apps/server/src/mcp/toolkits/html/handlers.ts`:
  html card storage and `displayWidth` (D5).
- `packages/shared/src/markdownPipeline.ts`: admits the state chip span (D5).
- `packages/provider-core/src/server/orchestrationInstructions.ts` and
  `apps/server/src/provider/agentContextBudget.json`: the Canvas section and its budget (D6).

## Upstream Substrate

Excalidraw and its scene model, upstream's html render attachments and preview browser, the MCP
server and invocation context, ordinary chat Markdown rendering, and the thread snapshot that
supplies turns.

## Non-Ownership

The canvas does not own turns, messages, runs or attachments; it lays out what upstream
orchestration produces. It does not change chat layout outside Comfortable width, add mobile
behavior, or give agents any file, network or command authority beyond upstream's html tools.

## Evidence

- `apps/server/src/canvas/*.test.ts`: scene merge and tombstones, placement, diagram layout,
  preview page, shared parent canvas and store delivery.
- `apps/server/src/mcp/McpCanvasToolkit.test.ts`: the three tools end to end on the orchestration
  endpoint, including diagram parse errors.
- `apps/server/src/mcp/toolkits/core.test.ts`: `html_render` keeps `displayWidth`.
- `apps/server/src/provider/AgentContextBudget.test.ts`: the guidance budget.
- `apps/web/src/fork/*.test.ts(x)`: turn layout and settling, cards, marks, chips, middle drag,
  draft handoff, citation reveal and server drawings loading into Excalidraw.
- `packages/shared/src/threadCanvasDrawing.test.ts`: shape and card construction.

## Replay Notes

Upstream intakes that touch `ChatView.tsx`, `MessagesTimeline.tsx`, `HtmlRender.ts`, the html
handlers, `runtimeLayer.ts`, the RPC contracts or the orchestration instructions must keep the
adapters above routing to these owners. An optional field can disappear without a type error, so
the evidence tests above, not compilation, are the check that `displayWidth`, the save scope and
the Canvas section survived.

Known limits: a save sends and broadcasts the whole scene, and every turn card and canvas card stays
mounted however far off screen it is.
