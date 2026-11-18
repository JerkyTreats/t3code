# F33 Page State

Date: 2026-11-18
Status: active on the canvas working branch `spike/canvas-surface-cards`

## Intent

Let an agent show a page once and keep its data current, and let the reader's edits in the page
reach every other open copy and the agent, without sending a new page.

## Required Behavior

- `F33.D1` Thread documents. Each thread keeps named JSON documents, stored durably by the server
  per thread and key. A write replaces the value or applies an RFC 7386 merge patch, raises the
  revision by one, and fails with a conflict when an expected revision does not match. A document
  is capped at 256 KB and a thread at 64 documents. A delegated task, however deep, reads and
  writes its delegator's documents. Only an existing thread has documents, and no thread id
  names a path outside the store. A `__proto__` key merges as data.
- `F33.D2` Agent tool. `page_state` on the orchestration endpoint lists documents, returns one, or
  writes one as the agent. With `reveal`, it brings canvas html cards whose `stateKeys` name the
  key and that the writer's state thread drew beside the latest turn (F32).
- `F33.D3` Page API. Every page T3 renders in a web or desktop frame, in a turn, on the canvas or
  full screen, has `t3.state.subscribe`, `get`, `set` and `merge`. A subscribed value arrives now
  and on each write, without reloading the frame. A canvas html card reads the state of the thread
  that drew it. A page's write is the reader's and needs the orchestration operate scope. A guest
  link's page gets no state: reads fail as unavailable and writes are refused as read only, at
  once. Only the written key crosses the WebSocket.
- `F33.D4` Agent guidance. The Visuals section of the orchestration instructions teaches agents to
  render from `t3.state` and update with `page_state`; `page_state`'s description names the page
  API.

## Durable Owners

- `apps/server/src/pageState/PageStateStore.ts`, `delegator.ts`
- `apps/server/src/mcp/toolkits/pageState/tools.ts` and `handlers.ts`
- `packages/contracts/src/pageState.ts`
- `apps/web/src/fork/pageStateBridge.tsx`, `apps/web/src/state/pageState.ts`

## Upstream Sensitive Adapters

- `packages/shared/src/htmlRender.ts`: the `t3.state` bootstrap script and its messages (D3).
- `apps/web/src/components/files/BrowserDocumentFrame.tsx`: `HtmlRenderDocument` hands frame
  messages to the bridge and renders its feeds; `stateThreadRef` on it, `HtmlRenderFrame` and
  `HtmlRenderDialog` carries a canvas card's drawing thread (D3).
- `apps/web/src/fork/canvasCards.ts` and `ExcalidrawBoard.tsx`: an html card's `owner` (D3).
- `apps/web/src/components/guest/GuestHtmlRender.tsx`: answers a guest page's state messages (D3).
- `packages/contracts/src/rpc.ts`, `clientRpcPermissions.ts`, `apps/server/src/auth/RpcAuthorization.ts`,
  `apps/server/src/observability/RpcInstrumentation.ts`, `packages/client-runtime/src/rpc/client.ts`
  and `apps/server/src/ws.ts`: the two RPCs and the write scope (D3).
- `apps/server/src/orchestration-v2/runtimeLayer.ts`: provides `PageStateStore` (D1).
- `apps/server/src/mcp/McpHttpServer.ts`: registers `page_state` (D2).
- `packages/provider-core/src/server/orchestrationInstructions.ts` and
  `apps/server/src/provider/agentContextBudget.json`: the guidance and its budget (D4).

## Upstream Substrate

Upstream's html render attachments, their sandboxed frame and host message protocol, the MCP
server, environment RPC subscriptions and commands, and thread lineage.

## Non-Ownership

Page state runs no code on the server and serves no files; pages stay sandboxed upstream html
attachments. It does not notify an agent's next turn of the reader's edits; the agent sees them
when it reads.

## Evidence

- `apps/server/src/pageState/PageStateStore.test.ts`: merge, revision conflict, size cap,
  persistence across a fresh store, a subagent writing its delegator's state, a follow that
  carries only its key, `__proto__` keys kept through merge and restart, and unknown thread ids
  refused with every directory a hash.
- `apps/server/src/canvas/ThreadCanvasStore.test.ts`: reveal moves only the cards bound to a key
  and drawn by the writer's state thread.
- `apps/web/src/fork/pageStateBridge.browser.test.tsx`: a framed page receives a later value
  without its frame or document reloading, its merge reaches the write command as the reader's, a
  prototype-named key subscribes, and a frame with no thread answers reads and writes at once.
- `apps/web/src/fork/canvasCards.browser.test.ts`: an html card carries the thread that drew it.
- `apps/server/src/provider/AgentContextBudget.test.ts`: the guidance budget.

## Replay Notes

Upstream intakes that touch `htmlRender.ts` or `BrowserDocumentFrame.tsx` must keep the state
script in the injected bootstrap and the bridge call before the frame's focus gate; the browser
test is the check.

Known limits: mobile WebViews have no `t3.state` host, and pages stored before this change carry
the older bootstrap.
