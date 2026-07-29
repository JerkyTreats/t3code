# F15 Connection Resilience And Offline Send Durability

Date: 2026-07-29
Status: active

## Intent

Connection failures, restarts, partial streams, renderer crashes, and transport optimization must not lose an accepted user turn, duplicate provider work, corrupt thread state, or hide actionable diagnostics.

## Required Behavior

- User sends enter a durable per-environment thread outbox before network dispatch.
- Every queued send has stable command and message identities across retry, reconnect, reload, and process restart.
- Acknowledgement removes an outbox entry only after the server has durably accepted its command identity.
- Retriable failures remain queued. Terminal failures expose explicit retry and discard actions without silently clearing draft or queue state.
- Offline drafts and queued prompts survive browser and desktop restart.
- Provider instance identity and model intent remain stable from draft through outbox delivery and recovery.
- Thread synchronization subscribes before applying its initial snapshot, then reconciles snapshot sequence, replayed events, and live events without gaps or duplicates.
- Events at or below the accepted snapshot sequence are ignored.
- Dropped-event detection performs a bounded recovery instead of applying an incomplete stream.
- V2 thread synchronization preserves shell-first project state, bounded page loading, deferred payload hydration, and Unicode-safe content chunking.
- Detail, shell, hydration, plan progress, and inference consumers agree on the authoritative retained activity rows.
- Server projection owns context-window row trimming and retains the latest resolvable row for each turn with provider processed totals intact.
- Connection diagnostics and the persistent flight recorder remain bounded, structured, sanitized, and free of credentials.
- Diagnostic state distinguishes capability, authentication, secure storage, reachability, protocol, replay, and terminal send failures.
- Electron renderer failure recovery uses bounded backoff, cancels stale recovery after a stable load, and leaves clean exits alone.
- HTTP JSON compression applies only to eligible responses above a tested threshold and includes correct `Vary` behavior.
- WebSocket compression negotiates `permessage-deflate` through an origin-owned compatibility patch for the selected Effect platform version.
- Compressed and uncompressed clients receive equivalent decoded payloads and identical sequencing behavior.
- Compression never changes authorization, snapshot paging, payload hydration, command identity, replay boundaries, or diagnostic sanitization.
- A deterministic connection resilience benchmark enforces wire-size, latency, memory, reconnect, replay, and duplicate-receipt thresholds.

## Owner Modules

Current owner modules:

- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/rpc.ts`
- `packages/client-runtime/src/state/threadOutbox.ts`
- `apps/web/src/threadOutbox.ts`
- `apps/web/src/components/ThreadOutboxCoordinator.tsx`
- `apps/web/src/components/ChatView.tsx`
- `packages/client-runtime/src/state/threads.ts`
- `packages/client-runtime/src/state/threadSyncDiagnostics.ts`
- `packages/client-runtime/src/state/threadSnapshotHttp.ts`
- `packages/client-runtime/src/connection/driver.ts`
- `packages/client-runtime/src/connection/supervisor.ts`
- `packages/client-runtime/src/connection/diagnostics.ts`
- `apps/web/src/connection/runtime.ts`
- `apps/web/src/connectionFlightRecorderHistory.ts`
- `apps/web/src/components/settings/ConnectionFlightRecorder.tsx`
- `apps/server/src/ws.ts`
- `apps/server/src/http.ts`
- `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/orchestration/RemoteThreadEventStream.ts`
- `apps/server/src/persistence/Services/OrchestrationCommandReceipts.ts`
- `apps/server/src/persistence/Layers/OrchestrationCommandReceipts.ts`
- `apps/desktop/src/window/DesktopWindow.ts`
- `patches`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

Planned owner modules:

- `apps/server/src/httpCompression.ts`
- `scripts/bench-connection-resilience.ts`
- `package.json`

## Fork Seams

- durable thread outbox
- idempotent command receipt
- subscribe-first snapshot and event reconciliation
- bounded V2 thread hydration
- thread sync diagnostics
- connection supervisor
- sanitized flight recorder
- renderer crash recovery
- HTTP response compression policy
- WebSocket compression compatibility patch
- connection resilience benchmark

## One Shot Origin Rebuild Notes

- Restore outbox persistence and stable identities before changing transport dispatch.
- Restore subscribe-first synchronization and dropped-event recovery before adding compression.
- Keep server projection as the only owner of context-window activity trimming.
- Add compression through narrow HTTP and WebSocket seams without replacing the connection driver, supervisor, outbox, thread synchronization, or diagnostics subtrees.
- Patch only the selected Effect platform package behavior needed for WebSocket compression and register the patch explicitly.
- Preserve every diagnostic redaction boundary while adding compression and replay metrics.
- Compose renderer recovery with updater-controlled relaunch and ordinary guarded shutdown.
- Use deterministic local fixtures and an isolated temporary data directory for the benchmark.

## Origin Rebuild Rule

- Rebuild transport efficiency only through origin-owned changes and explicit package compatibility patches.
- Reject any change that removes the durable outbox, stable command identity, sequence reconciliation, diagnostics, flight recorder, or renderer recovery.
- Reject broad package or subtree replacement as a delivery mechanism.
- Treat the read-only stable reference as behavioral evidence only.

## Verification

- Accepted sends survive offline state, reconnect, reload, and process restart.
- Reconnect never duplicates an accepted turn or provider dispatch.
- Retriable and terminal failures retain distinct retry and discard behavior.
- Snapshot, replay, and live event boundary tests prove no gap and no duplicate application.
- Dropped-event tests prove bounded recovery.
- V2 paging, hydration, and Unicode-safe chunk tests continue to pass.
- Diagnostics remain bounded and credential safe under connection and send failures.
- Renderer recovery tests prove bounded backoff, stability reset, stale recovery cancellation, and clean-exit handling.
- HTTP tests prove threshold, content negotiation, equivalent decoded bodies, and `Vary` behavior.
- WebSocket tests prove optional `permessage-deflate` negotiation and uncompressed compatibility.
- The benchmark uses 100 active threads and 250 MiB of deterministic activity payloads.
- The benchmark runs on Node 24 through a release server build over loopback with 10 warmup requests, 30 measured requests at concurrency 4, and 10 forced reconnect cycles.
- Eligible leviathan snapshots shrink by at least 50 percent.
- Compressed p95 latency remains within 20 percent of the uncompressed baseline.
- Peak server RSS and client heap remain within 15 percent of the uncompressed baseline.
- Benchmark duplicate receipt count remains zero.

## Compatibility Checks

- Existing outbox and flight-recorder storage decode without data loss.
- Existing clients can remain uncompressed.
- WebSocket compression is negotiated rather than required.
- HTTP caches distinguish accepted encodings.
- Provider instance and model intent remain stable across persisted drafts and outbox entries.
- Auth scope enforcement remains identical for compressed and uncompressed transports.
- Shell, detail, hydration, plan progress, and inference projections remain semantically equivalent.
