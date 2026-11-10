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
  `version`. Everything but turn boxes and labels keeps a `t3Below` anchor: the turn it sits
  beside and its offset from that turn's top (an agent drawing placed below a turn keeps the
  bottom edge). Layout puts content at its anchor and never re-anchors it; content takes a new
  anchor only when someone moves it, and content without one takes the turn it sits beside now
  through the shared `contentAnchorOf`. The same rule holds whoever drew it.
- `F32.D3` Agent tools. The orchestration MCP endpoint offers `canvas_read`, `canvas_update` and
  `canvas_preview`. `canvas_update` takes shapes, a Mermaid flowchart that the server lays out
  (bands, lead and aside roles, kinds coloured with a legend), markdown cards, html cards and live panel cards
  (`card`: a file, Files, a browser tab, a terminal, the diff, a pull request, the linked pull
  requests, a chat or a device), and patches an existing drawing by id. A redraw deletes only the drawing's own `<drawing>/<shape>`
  ids it did not send again, and a patch only the shapes it removes with the arrows joining them;
  an element carrying the drawing's tag under any other id is never deleted. Drawings placed `besideLatestTurn` go in the column beside the
  latest turn and stay out of the turns' own column; a drawing sent again in a later turn moves
  beside that turn. A delegated task draws on its parent's canvas. A chat placed as a card on another
  thread's board, a side chat or any other thread, draws there beside its card; its pieces carry
  `t3OnCard` so they move with the card, every piece carries `t3Drawing.by`, and `canvas_read`
  names the card as `yourCard`. `canvas_preview` renders a region
  so the agent can see it, including which cards are cut off.
- `F32.D3a` Browser trail. While a browser card's tab is open, the server keeps a JPEG of it each
  time a page settles and every 30 seconds after, skipping unchanged frames, up to 60 per tab, as
  thread attachments indexed under the canvases directory. When the tab is gone the card replays
  them through `threadCanvas.browserTrail`, a read-scoped RPC.
- `F32.D4` User marks reach the agent. A mark nearer a chat card than any turn reaches that chat
  instead of the board's thread. Anything the user draws or writes is a mark. Marks the agent
  has not seen are summarised into the next turn, and the send button sends them with nothing
  typed. A note is never sent on its own from the board. A mark is seen by what it is, how it is
  drawn, its labels and what it sits on, never by position or version, so the board moving it with
  a growing turn is not news. `canvas_read` reports marks with the text they cover.
- `F32.D5` Card presentation. Markdown cards keep single line breaks; a capitalised state word that
  starts a line, list item or table cell renders as a coloured chip, with the chip span admitted by
  the shared Markdown sanitizer; a card holding a table widens to fit it. html cards are agent
  attachments shown behind a cover that lets wheel and drag pan the board until clicked. Citation
  chips pan the board to the cited card, shape or note. `html_render` with `displayWidth` widens
  that turn's card on the board.
- `F32.D7` Surface cards. Every right panel tab kind can be placed on the board as its own
  Excalidraw box: a workspace file, Files, a browser tab, a terminal group, Diff, a pull request,
  Linked pull requests, a device and a side chat. The box's `t3Card` holds a reference, never a
  copy, parsed by one shared reader. A card runs the same component and header the panel shows,
  live at any zoom; only cards off screen or past a cap of six show a face, and cards join or
  leave that set only once the camera rests, so a pan never mounts a panel mid-gesture. Once the
  zoom rests above 100%, a card lays out with CSS zoom at that level and scales back, so it
  renders at screen resolution; terminals refit their backing store to it. A streamed browser
  lays out at its card's own size, and only a device card has a click-to-lift cover. Wheel over
  content that scrolls, including scrollers inside shadow roots, scrolls it. Where the panel keys
  tab state by surface id, a card passes its own `show`, `place` and `close`, so a card's own
  navigation changes that card: Files, file moves and every breadcrumb, linked pull request rows
  and Back, the device picker, terminal splits and closes. Links inside a card's content, such
  as a pull request link in a description or a pull request in another environment, still open
  as panel tabs. A browser tab, terminal, side chat or device the panel or floating player already shows
  in this client stays on its face with "Show here"; among live cards naming the same one, the
  card chosen with "Show here" shows it, then the lowest element id. The terminal drawer leaves
  card terminals alone. A card whose board unmounted while its resource started opens as the
  thread's panel tab. Showing another surface in a card stays out of undo; placing and closing are
  undoable. Entry points: the tab's "Place on canvas"; a right-click where Excalidraw's own hit
  test opens its canvas menu, which T3's menu replaces with the panel's new tabs and "Canvas
  options…" that reopens Excalidraw's menu; "Preview in canvas" on a file link in a turn, which
  places beside that turn; and Cite atop Excalidraw's element menu, which quotes any element
  through the composer with an anchor that follows the element.
  Scene sync is unchanged: two editors of one file can overwrite each other, and the raw or
  rendered file view stays the panel's global preference. `canvas_read` names each card's kind and
  resource.
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
- `apps/web/src/fork/canvasSurfaceCards.ts`, `CanvasSurfaceCardView.tsx`, `CanvasCardTerminal.tsx`,
  `canvasContextMenus.ts`
- `packages/shared/src/threadCanvasDrawing.ts`, `canvasSurfaceCard.ts`, `threadCanvasMarks.ts`
- `packages/contracts/src/threadCanvas.ts`

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatView.tsx`: mounts the board and decides when it shows (D1); hands
  the board `renderPanelSurface`, the new-tab menu items and Cite (D7).
- `apps/web/src/components/chat/RightPanelSurfaceContent.tsx` and
  `components/device/DevicePanel.tsx`: the optional `card` prop that routes tab writes to the
  card (D7).
- `apps/web/src/components/RightPanelTabs.tsx`: "Place on canvas" and the exported
  `rightPanelNewSurfaceActions` both menus share (D7).
- `apps/web/src/components/chat/useChatTerminalActions.ts`, `useRightPanelActions.ts`,
  `useSideChat.ts` and `components/preview/addBrowserSurface.ts`: a `place` option that mounts a
  new terminal, browser tab or side chat in a card instead of a panel tab (D7).
- `apps/web/src/components/PersistentThreadTerminals.tsx`: the drawer skips card terminals (D7).
- `apps/web/src/components/pullRequest/ThreadPullRequestsPanel.tsx` and
  `lib/openPullRequestLink.ts`: an optional callback that shows a resolved pull request in the
  card (D7).
- `apps/web/src/browser/BrowserSurfaceSlot.tsx`: `presentBrowserSurfaceSlots`, which the board
  calls while a browser card moves (D7); `browser/ServerBrowserSurface.tsx`: sizes the streamed
  page by layout size, not the zoomed rect (D7).
- `apps/web/src/terminal/ghostty/surface.ts` with `lib/rasterScale.ts`: sizes the terminal's
  backing store by its CSS zoom and refits when a card's raster zoom changes (D7).
- `apps/web/src/components/chat/MarkdownFileLink.tsx`: "Preview in canvas" (D7).
- `apps/web/src/components/chat/AssistantCitationChip.tsx`: reveals any cited board element (D5).
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
- `apps/web/src/fork/canvasSurfaceCards.test.ts`: refs round-trip to the panel's surfaces, the
  live cap, and the one-live-view check.
- `apps/web/src/fork/CanvasSurfaceCardView.browser.test.tsx`: a card runs the panel component and
  its navigation rewrites the card; the empty-canvas menu and "Canvas options…"; Cite atop
  Excalidraw 0.18's element menu.
- `apps/web/src/fork/canvasCards.browser.test.ts`: the wheel rule that leaves a terminal's wheel
  alone.
- `apps/web/src/components/chat/RightPanelSurfaceContent.browser.test.tsx`: Files navigation in a
  card never moves the panel tab.
- `packages/shared/src/threadCanvasDrawing.test.ts`, `canvasSurfaceCard.test.ts`: shape and card
  construction, and which surface refs resolve.
- `packages/shared/src/threadCanvasMarks.test.ts`: which mark edits read as news and which board
  moves do not, and older version records still honored.

## Replay Notes

Upstream intakes that touch `ChatView.tsx`, `MessagesTimeline.tsx`, `HtmlRender.ts`, the html
handlers, `runtimeLayer.ts`, the RPC contracts or the orchestration instructions must keep the
adapters above routing to these owners. An optional field can disappear without a type error, so
the evidence tests above, not compilation, are the check that `displayWidth`, the save scope and
the Canvas section survived.

Upgrading Excalidraw must keep the menu tests passing: they depend on its context menu state
naming each item's action, on the element menu rendering `li[data-testid]` per item, and on
`handleCanvasContextMenu` reading only an event's position.

Known limits: a save sends and broadcasts the whole scene, and every turn card, markdown card and
html card stays mounted however far off screen it is. A terminal chord such as split, pressed in a
card's terminal, acts on the panel's active terminal tab. A card's terminal maps the pointer
with unscaled cell metrics, so selection at a board zoom other than 100% lands off target, and a
streamed browser's frames stay at layout resolution above 100%.
