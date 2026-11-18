# Page state

Page state is a thread's set of named JSON documents that the pages T3 renders read and write. It
lets an agent show a page once and then change what it shows, and lets a reader's edits in the page
reach the agent. [`PageStateStore`](../../apps/server/src/pageState/PageStateStore.ts) owns it.

## Model

- A document has a `key` (lowercase letters, digits, `.`, `_`, `-`; at most 64 characters), a JSON
  `value`, a `revision` that starts at 1 and rises by one per write, and `updatedBy` (`agent` or
  `user`). An unwritten key reads as `null` at revision 0.
- A write sends `set` (the whole value) or `merge` (an RFC 7386 merge patch), and optionally
  `expectedRevision`; a mismatch fails with `conflict` and the current revision.
- A document is capped at 256 KB serialized, since each write sends it whole to every page that
  reads it. A thread keeps at most 64 documents.
- A delegated task's thread resolves to its delegator through thread lineage, so a subagent's
  writes land in the state its parent's pages read. Pages resolve the same way, so a page in a
  subagent's chat reads its delegator's state.
- Each document is one file under `<stateDir>/page-state/<thread>/<key>.json`, written through a
  temp file and serialized by one semaphore.

## Transports

- Agents: the `page_state` MCP tool lists, reads and writes. Its writes are `updatedBy: agent`.
  With `reveal`, the canvas store moves html cards whose `stateKeys` name the key beside the latest
  turn, through the same planner as `moveToLatestTurn`.
- Clients: `subscribePageState` streams one key, its current value first, then each write of only
  that key. `pageState.write` needs the orchestration operate scope; guest links have read only.
- Pages: the injected bootstrap defines `t3.state` with `subscribe`, `get`, `set` and `merge`. It
  posts `t3/state/subscribe` and `t3/state/write` to the host frame, which follows each subscribed
  key through `subscribePageState` and posts `t3/state/changed` back. Values reach an open frame
  without a reload, so the frame keeps its page's own state.

## Limits

- Mobile WebViews have no host for `t3.state`; pages show what they were sent with.
- Pages published before page state existed carry the older bootstrap and have no `t3.state`.
