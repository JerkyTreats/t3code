// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalTimers:off
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";

import { NodeSocket } from "@effect/platform-node";
import {
  CommandId,
  MessageId,
  ORCHESTRATION_WS_METHODS,
  ProviderInstanceId,
  ThreadId,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";

const WARMUP_REQUESTS = 10;
const MEASURED_REQUESTS = 30;
const REQUEST_CONCURRENCY = 4;
const RECONNECT_CYCLES = 10;
const EXPECTED_THREADS = 100;
const EXPECTED_ACTIVITY_BYTES = 250 * 1024 * 1024;
const SERVER_READY_TIMEOUT_MS = 30_000;
const SERVER_STOP_TIMEOUT_MS = 10_000;
const RSS_SAMPLE_INTERVAL_MS = 10;
const FIXTURE_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const BENCHMARK_PROJECT_ID = "connection-resilience-benchmark";
const BENCHMARK_THREAD_ID = "connection-resilience-thread-000";
const BENCHMARK_PROVIDER_ID = "connection-resilience-missing-provider";

const smokeMode = process.argv.includes("--smoke");
const protocol = smokeMode
  ? {
      warmupRequests: 1,
      measuredRequests: 2,
      concurrency: 1,
      reconnectCycles: 2,
      threads: 4,
      activityBytes: 4 * 1024 * 1024,
    }
  : {
      warmupRequests: WARMUP_REQUESTS,
      measuredRequests: MEASURED_REQUESTS,
      concurrency: REQUEST_CONCURRENCY,
      reconnectCycles: RECONNECT_CYCLES,
      threads: EXPECTED_THREADS,
      activityBytes: EXPECTED_ACTIVITY_BYTES,
    };

interface Measurement {
  readonly latencyMs: number;
  readonly wireBytes: number;
  readonly decodedBytes: number;
  readonly decoded?: Buffer;
}

interface Series {
  readonly wireBytes: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly peakClientHeapBytes: number;
  readonly peakServerRssBytes: number;
}

interface ReconnectMetrics {
  readonly reconnectCount: number;
  readonly replayCount: number;
  readonly duplicateReceiptCount: number;
  readonly acceptedTurnCount: number;
}

interface ReleaseServer {
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly baseUrl: URL;
  readonly pid: number;
}

interface Fixture {
  readonly baseDir: string;
  readonly databasePath: string;
  readonly workspaceRoot: string;
  readonly port: number;
  readonly baseUrl: URL;
  readonly accessToken: string;
}

function percentile(values: ReadonlyArray<number>, quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? 0;
}

function assertWithin(label: string, candidate: number, baseline: number, ratio: number): void {
  if (candidate > baseline * ratio) {
    throw new Error(`${label} exceeded limit: ${candidate} > ${baseline * ratio}`);
  }
}

function progress(message: string): void {
  process.stderr.write(`[connection-resilience] ${message}\n`);
}

function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Array<Buffer> = [];
    const stderr: Array<Buffer> = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(
        new Error(
          `${command} failed with code ${String(code)} and signal ${String(signal)}\n${Buffer.concat(stderr).toString("utf8")}`,
        ),
      );
    });
  });
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to reserve a loopback TCP port"));
        return;
      }
      const { port } = address;
      server.close((cause) => {
        if (cause) {
          reject(cause);
        } else {
          resolvePromise(port);
        }
      });
    });
  });
}

function waitForExit(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`server did not stop within ${timeoutMs} milliseconds`));
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolvePromise();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}

async function stopReleaseServer(server: ReleaseServer | null): Promise<void> {
  if (server === null || server.child.exitCode !== null || server.child.signalCode !== null) {
    return;
  }
  server.child.kill("SIGTERM");
  try {
    await waitForExit(server.child, SERVER_STOP_TIMEOUT_MS);
  } catch {
    server.child.kill("SIGKILL");
    await waitForExit(server.child, SERVER_STOP_TIMEOUT_MS);
  }
}

async function waitForReleaseServer(server: ReleaseServer): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error("release server exited before becoming ready");
    }
    try {
      const status = await probeHttpStatus(new URL("/api/orchestration/snapshot", server.baseUrl));
      if (status === 401 || status === 200) {
        return;
      }
    } catch {
      // The loopback listener may not exist yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(
    `release server did not become ready within ${SERVER_READY_TIMEOUT_MS} milliseconds`,
  );
}

function probeHttpStatus(url: URL): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const outgoing = request(url, { method: "GET" }, (response) => {
      response.resume();
      resolvePromise(response.statusCode ?? 0);
    });
    outgoing.setTimeout(1000, () => {
      outgoing.destroy(new Error("loopback readiness probe timed out"));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

async function startReleaseServer(
  repositoryRoot: string,
  baseDir: string,
  port: number,
): Promise<ReleaseServer> {
  const child = spawn(
    process.execPath,
    [
      "apps/server/dist/bin.mjs",
      "--mode",
      "desktop",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--base-dir",
      baseDir,
      "--no-browser",
      "--log-level",
      "error",
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("release server did not expose a process id");
  }
  const server = {
    child,
    baseUrl: new URL(`http://127.0.0.1:${port}`),
    pid,
  };
  await waitForReleaseServer(server);
  return server;
}

async function issueAccessToken(repositoryRoot: string, baseDir: string): Promise<string> {
  const output = await runCommand(
    process.execPath,
    [
      "apps/server/dist/bin.mjs",
      "auth",
      "session",
      "issue",
      "--base-dir",
      baseDir,
      "--ttl",
      "1h",
      "--label",
      "connection-resilience-benchmark",
      "--token-only",
      "--log-level",
      "error",
    ],
    { cwd: repositoryRoot },
  );
  const token = output.trim();
  if (token.length === 0 || token.includes("\n")) {
    throw new Error("release auth command did not return one access token");
  }
  return token;
}

function deterministicPayload(byteLength: number): string {
  const pattern = "t3code-connection-resilience-0123456789abcdef\n";
  return pattern.repeat(Math.ceil(byteLength / pattern.length)).slice(0, byteLength);
}

function seedProjectionFixture(fixture: Omit<Fixture, "accessToken">): void {
  const database = new DatabaseSync(fixture.databasePath);
  const bytesPerThread = Math.ceil(protocol.activityBytes / protocol.threads);
  const payload = JSON.stringify({
    benchmarkData: deterministicPayload(bytesPerThread),
    fixture: "connection-resilience",
  });
  const modelSelection = JSON.stringify({
    instanceId: BENCHMARK_PROVIDER_ID,
    model: "benchmark",
  });
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO projection_projects (
          project_id, title, workspace_root, scripts_json, created_at, updated_at,
          deleted_at, default_model_selection_json
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        BENCHMARK_PROJECT_ID,
        "Connection resilience benchmark",
        fixture.workspaceRoot,
        "[]",
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        modelSelection,
      );
    const insertThread = database.prepare(
      `INSERT INTO projection_threads (
        thread_id, project_id, title, branch, worktree_path, latest_turn_id,
        created_at, updated_at, deleted_at, runtime_mode, interaction_mode,
        model_selection_json, archived_at
      ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, NULL)`,
    );
    const insertActivity = database.prepare(
      `INSERT INTO projection_thread_activities (
        activity_id, thread_id, turn_id, tone, kind, summary, payload_json,
        created_at, sequence
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
    );
    for (let index = 0; index < protocol.threads; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const threadId = `connection-resilience-thread-${suffix}`;
      insertThread.run(
        threadId,
        BENCHMARK_PROJECT_ID,
        `Benchmark thread ${suffix}`,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        "full-access",
        "default",
        modelSelection,
      );
      insertActivity.run(
        `connection-resilience-activity-${suffix}`,
        threadId,
        "info",
        "benchmark.fixture",
        `Deterministic activity payload ${suffix}`,
        payload,
        FIXTURE_TIMESTAMP,
      );
    }
    database.exec("COMMIT");
  } catch (cause) {
    database.exec("ROLLBACK");
    throw cause;
  } finally {
    database.close();
  }
}

async function createFixture(repositoryRoot: string): Promise<Fixture> {
  const baseDir = await mkdtemp(join(tmpdir(), "t3code-connection-resilience-"));
  const workspaceRoot = join(baseDir, "workspace");
  await mkdir(workspaceRoot, { recursive: true });
  const port = await reserveLoopbackPort();
  let initializer: ReleaseServer | null = null;
  try {
    progress("initializing isolated release data");
    initializer = await startReleaseServer(repositoryRoot, baseDir, port);
    progress("issuing scoped benchmark credential");
    const accessToken = await issueAccessToken(repositoryRoot, baseDir);
    progress("stopping initializer server");
    await stopReleaseServer(initializer);
    initializer = null;
    const fixture = {
      baseDir,
      databasePath: join(baseDir, "userdata", "state.sqlite"),
      workspaceRoot,
      port,
      baseUrl: new URL(`http://127.0.0.1:${port}`),
      accessToken,
    };
    progress("seeding deterministic projection fixture");
    seedProjectionFixture(fixture);
    return fixture;
  } catch (cause) {
    await stopReleaseServer(initializer);
    await rm(baseDir, { recursive: true, force: true });
    throw cause;
  }
}

function fetchSnapshot(
  fixture: Fixture,
  acceptEncoding: "gzip" | "identity",
  retainDecoded = false,
): Promise<Measurement> {
  const url = new URL("/api/orchestration/snapshot", fixture.baseUrl);
  return new Promise((resolvePromise, reject) => {
    const startedAt = performance.now();
    const outgoing = request(
      url,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${fixture.accessToken}`,
          "accept-encoding": acceptEncoding,
        },
      },
      (response) => {
        const chunks: Array<Buffer> = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const wire = Buffer.concat(chunks);
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `snapshot request failed with ${response.statusCode}: ${wire.toString("utf8", 0, 512)}`,
              ),
            );
            return;
          }
          const encoding = response.headers["content-encoding"];
          const decoded = encoding === "gzip" ? gunzipSync(wire) : wire;
          resolvePromise({
            latencyMs: performance.now() - startedAt,
            wireBytes: wire.length,
            decodedBytes: decoded.length,
            ...(retainDecoded ? { decoded } : {}),
          });
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function assertFixture(measurement: Measurement): void {
  if (measurement.decoded === undefined) {
    throw new Error("fixture validation requires the decoded snapshot");
  }
  const snapshot = JSON.parse(measurement.decoded.toString("utf8")) as {
    readonly threads?: ReadonlyArray<unknown>;
  };
  if (snapshot.threads?.length !== protocol.threads) {
    throw new Error(
      `expected ${protocol.threads} active threads, received ${snapshot.threads?.length ?? 0}`,
    );
  }
  if (measurement.decodedBytes < protocol.activityBytes) {
    throw new Error(
      `expected at least ${protocol.activityBytes} decoded bytes, received ${measurement.decodedBytes}`,
    );
  }
}

function decodedSnapshotDigest(measurement: Measurement): string {
  if (measurement.decoded === undefined) {
    throw new Error("snapshot digest requires the decoded response");
  }
  return createHash("sha256").update(measurement.decoded).digest("hex");
}

function mapConcurrent<T>(
  count: number,
  concurrency: number,
  task: () => Promise<T>,
): Promise<ReadonlyArray<T>> {
  const results: Array<T> = [];
  let nextIndex = 0;
  return Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < count) {
        const index = nextIndex++;
        results[index] = await task();
      }
    }),
  ).then(() => results);
}

async function serverRssBytes(pid: number): Promise<number> {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
  if (!match) {
    throw new Error(`could not read VmRSS for release server process ${pid}`);
  }
  return Number(match[1]) * 1024;
}

async function measureSeries(
  fixture: Fixture,
  server: ReleaseServer,
  acceptEncoding: "gzip" | "identity",
): Promise<Series> {
  for (let requestIndex = 0; requestIndex < protocol.warmupRequests; requestIndex += 1) {
    await fetchSnapshot(fixture, acceptEncoding);
  }

  let peakClientHeapBytes = process.memoryUsage().heapUsed;
  let peakServerRssBytes = await serverRssBytes(server.pid);
  let sampleFailure: unknown = null;
  const sampler = setInterval(() => {
    peakClientHeapBytes = Math.max(peakClientHeapBytes, process.memoryUsage().heapUsed);
    void serverRssBytes(server.pid).then(
      (rss) => {
        peakServerRssBytes = Math.max(peakServerRssBytes, rss);
      },
      (cause: unknown) => {
        sampleFailure = cause;
      },
    );
  }, RSS_SAMPLE_INTERVAL_MS);
  try {
    const measurements = await mapConcurrent(protocol.measuredRequests, protocol.concurrency, () =>
      fetchSnapshot(fixture, acceptEncoding),
    );
    peakClientHeapBytes = Math.max(peakClientHeapBytes, process.memoryUsage().heapUsed);
    peakServerRssBytes = Math.max(peakServerRssBytes, await serverRssBytes(server.pid));
    if (sampleFailure !== null) {
      throw sampleFailure;
    }
    return {
      wireBytes: measurements.reduce((total, measurement) => total + measurement.wireBytes, 0),
      p50LatencyMs: percentile(
        measurements.map((measurement) => measurement.latencyMs),
        0.5,
      ),
      p95LatencyMs: percentile(
        measurements.map((measurement) => measurement.latencyMs),
        0.95,
      ),
      peakClientHeapBytes,
      peakServerRssBytes,
    };
  } finally {
    clearInterval(sampler);
  }
}

async function issueWebSocketTicket(fixture: Fixture): Promise<string> {
  const ticket = await new Promise<string>((resolvePromise, reject) => {
    const outgoing = request(
      new URL("/api/auth/websocket-ticket", fixture.baseUrl),
      {
        method: "POST",
        headers: { authorization: `Bearer ${fixture.accessToken}` },
      },
      (response) => {
        const chunks: Array<Buffer> = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `failed to issue a WebSocket ticket with status ${response.statusCode}: ${body.toString("utf8", 0, 512)}`,
              ),
            );
            return;
          }
          try {
            const parsed = JSON.parse(body.toString("utf8")) as { readonly ticket?: unknown };
            if (typeof parsed.ticket !== "string" || parsed.ticket.length === 0) {
              reject(new Error("WebSocket ticket response did not contain a ticket"));
              return;
            }
            resolvePromise(parsed.ticket);
          } catch (cause) {
            reject(cause);
          }
        });
      },
    );
    outgoing.setTimeout(5000, () => {
      outgoing.destroy(new Error("WebSocket ticket request timed out"));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
  const url = new URL("/ws", fixture.baseUrl);
  url.protocol = "ws:";
  url.searchParams.set("wsTicket", ticket);
  return url.toString();
}

const makeWsRpcClient = RpcClient.make(WsRpcGroup);
type WsRpcClient =
  typeof makeWsRpcClient extends Effect.Effect<infer Client, any, any> ? Client : never;

function wsRpcProtocolLayer(wsUrl: string) {
  const constructorLayer = Layer.succeed(
    Socket.WebSocketConstructor,
    (url, protocols) =>
      new NodeSocket.NodeWS.WebSocket(url, protocols) as unknown as globalThis.WebSocket,
  );
  return RpcClient.layerProtocolSocket().pipe(
    Layer.provide(Socket.layerWebSocket(wsUrl).pipe(Layer.provide(constructorLayer))),
    Layer.provide(RpcSerialization.layerJson),
  );
}

function withWsRpcClient<A, E>(
  wsUrl: string,
  use: (client: WsRpcClient) => Effect.Effect<A, E, never>,
): Promise<A> {
  return Effect.runPromise(
    Effect.scoped(
      makeWsRpcClient.pipe(Effect.flatMap(use), Effect.provide(wsRpcProtocolLayer(wsUrl))),
    ),
  );
}

async function runReconnectProtocol(fixture: Fixture): Promise<ReconnectMetrics> {
  let fromSequenceExclusive = 0;
  let replayCount = 0;
  const acceptedSequences = new Map<string, number>();

  for (let cycle = 0; cycle < protocol.reconnectCycles; cycle += 1) {
    const commandId = `connection-resilience-command-${String(cycle).padStart(3, "0")}`;
    const messageId = `connection-resilience-message-${String(cycle).padStart(3, "0")}`;
    const command = {
      type: "thread.turn.start" as const,
      commandId: CommandId.make(commandId),
      threadId: ThreadId.make(BENCHMARK_THREAD_ID),
      message: {
        messageId: MessageId.make(messageId),
        role: "user" as const,
        text: `Queued reconnect turn ${cycle}`,
        attachments: [],
      },
      modelSelection: {
        instanceId: ProviderInstanceId.make(BENCHMARK_PROVIDER_ID),
        model: "benchmark",
      },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      createdAt: `2026-01-01T00:00:${String(cycle).padStart(2, "0")}.000Z`,
    };

    const firstTicket = await issueWebSocketTicket(fixture);
    const accepted = await withWsRpcClient(firstTicket, (client) =>
      client[ORCHESTRATION_WS_METHODS.dispatchCommand](command),
    );
    acceptedSequences.set(commandId, accepted.sequence);

    const retryTicket = await issueWebSocketTicket(fixture);
    const replayed = await withWsRpcClient(retryTicket, (client) =>
      Effect.gen(function* () {
        const retry = yield* client[ORCHESTRATION_WS_METHODS.dispatchCommand](command);
        const replay = yield* client[ORCHESTRATION_WS_METHODS.replayEvents]({
          fromSequenceExclusive,
        });
        return { retry, replay };
      }),
    );
    if (replayed.retry.sequence !== accepted.sequence) {
      throw new Error(`idempotent retry changed the accepted sequence for ${commandId}`);
    }
    if (replayed.replay.length === 0) {
      throw new Error(`reconnect replay was empty for ${commandId}`);
    }
    let expectedSequence = fromSequenceExclusive + 1;
    let reachedAcceptedSequence = false;
    for (const event of replayed.replay) {
      if (event.sequence !== expectedSequence) {
        throw new Error(
          `reconnect replay was not contiguous for ${commandId}: expected ${expectedSequence}, received ${event.sequence}`,
        );
      }
      if (event.sequence === accepted.sequence) {
        reachedAcceptedSequence = true;
      }
      expectedSequence += 1;
    }
    if (!reachedAcceptedSequence) {
      throw new Error(
        `reconnect replay did not reach accepted sequence ${accepted.sequence} for ${commandId}`,
      );
    }
    replayCount += replayed.replay.length;
    fromSequenceExclusive = replayed.replay.reduce(
      (maximum, event) => Math.max(maximum, event.sequence),
      fromSequenceExclusive,
    );
  }

  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    const receiptRows = database
      .prepare(
        `SELECT command_id AS commandId, result_sequence AS resultSequence
         FROM orchestration_command_receipts
         WHERE command_id LIKE 'connection-resilience-command-%'
         ORDER BY command_id`,
      )
      .all() as unknown as ReadonlyArray<{
      readonly commandId: string;
      readonly resultSequence: number;
    }>;
    const duplicateRows = database
      .prepare(
        `SELECT command_id
         FROM orchestration_command_receipts
         WHERE command_id LIKE 'connection-resilience-command-%'
         GROUP BY command_id
         HAVING COUNT(*) > 1`,
      )
      .all();
    const turnCountRow = database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM orchestration_events
         WHERE event_type = 'thread.turn-start-requested'
           AND command_id LIKE 'connection-resilience-command-%'`,
      )
      .get() as { readonly count: number };
    if (receiptRows.length !== protocol.reconnectCycles) {
      throw new Error(
        `expected ${protocol.reconnectCycles} durable command receipts, received ${receiptRows.length}`,
      );
    }
    for (const row of receiptRows) {
      if (acceptedSequences.get(row.commandId) !== row.resultSequence) {
        throw new Error(`durable receipt sequence mismatch for ${row.commandId}`);
      }
    }
    if (turnCountRow.count !== protocol.reconnectCycles) {
      throw new Error(
        `expected ${protocol.reconnectCycles} accepted queued turns, received ${turnCountRow.count}`,
      );
    }
    return {
      reconnectCount: protocol.reconnectCycles,
      replayCount,
      duplicateReceiptCount: duplicateRows.length,
      acceptedTurnCount: turnCountRow.count,
    };
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  if (!process.version.startsWith("v24.")) {
    throw new Error(`Node 24 is required, received ${process.version}`);
  }
  const repositoryRoot = resolve(import.meta.dirname, "..");
  progress("building Node release server");
  await runCommand("pnpm", ["exec", "vp", "run", "--filter", "t3", "build"], {
    cwd: repositoryRoot,
  });

  const fixture = await createFixture(repositoryRoot);
  let server: ReleaseServer | null = null;
  try {
    progress("starting identity baseline server");
    server = await startReleaseServer(repositoryRoot, fixture.baseDir, fixture.port);
    const fixtureMeasurement = await fetchSnapshot(fixture, "identity", true);
    assertFixture(fixtureMeasurement);
    const identitySnapshotDigest = decodedSnapshotDigest(fixtureMeasurement);
    const baseline = await measureSeries(fixture, server, "identity");
    progress("identity baseline complete");
    await stopReleaseServer(server);
    server = null;

    progress("starting gzip candidate server");
    server = await startReleaseServer(repositoryRoot, fixture.baseDir, fixture.port);
    const candidateFixtureMeasurement = await fetchSnapshot(fixture, "gzip", true);
    assertFixture(candidateFixtureMeasurement);
    const gzipSnapshotDigest = decodedSnapshotDigest(candidateFixtureMeasurement);
    if (gzipSnapshotDigest !== identitySnapshotDigest) {
      throw new Error("gzip snapshot did not decode to the identity snapshot bytes");
    }
    const candidate = await measureSeries(fixture, server, "gzip");
    progress("gzip candidate complete");
    const reconnect = await runReconnectProtocol(fixture);
    progress("reconnect protocol complete");

    if (candidate.wireBytes > baseline.wireBytes * 0.5) {
      throw new Error(
        `compressed wire bytes did not shrink by 50 percent: ${candidate.wireBytes} versus ${baseline.wireBytes}`,
      );
    }
    if (!smokeMode) {
      assertWithin("compressed p95 latency", candidate.p95LatencyMs, baseline.p95LatencyMs, 1.2);
      assertWithin(
        "candidate client heap",
        candidate.peakClientHeapBytes,
        baseline.peakClientHeapBytes,
        1.15,
      );
      assertWithin(
        "candidate server RSS",
        candidate.peakServerRssBytes,
        baseline.peakServerRssBytes,
        1.15,
      );
    }
    if (reconnect.duplicateReceiptCount !== 0) {
      throw new Error(
        `benchmark observed ${reconnect.duplicateReceiptCount} duplicate command receipts`,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: smokeMode ? "smoke" : "acceptance",
          performanceThresholdsEnforced: !smokeMode,
          protocol,
          baseline,
          candidate,
          ...reconnect,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await stopReleaseServer(server);
    await rm(fixture.baseDir, { recursive: true, force: true });
  }
}

await main();
