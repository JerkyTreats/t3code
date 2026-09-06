import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";
import type { McpCapability } from "./McpInvocationContext.ts";

const environmentId = EnvironmentId.make("environment-1");
const makeFakeHttpServer = (hostname: string, port = 43123) =>
  HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname, port },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
const fakeHttpServer = makeFakeHttpServer("127.0.0.1");
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = (now: () => number, httpServer = fakeHttpServer) =>
  McpSessionRegistry.__testing
    .make({
      now,
      livenessWindowMs: 100,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, httpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["preview"]),
    });
    expect(issued.config.previewEndpoint).toBe("http://127.0.0.1:43123/mcp/preview");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("builds MCP endpoints from the bound server host", () =>
  Effect.gen(function* () {
    const cases = [
      ["100.64.0.40", "http://100.64.0.40:43123/mcp/preview"],
      ["0.0.0.0", "http://127.0.0.1:43123/mcp/preview"],
      ["localhost", "http://localhost:43123/mcp/preview"],
      ["127.0.0.1", "http://127.0.0.1:43123/mcp/preview"],
    ] as const;

    for (const [hostname, expectedEndpoint] of cases) {
      const registry = yield* makeRegistry(() => 1_000, makeFakeHttpServer(hostname));
      const issued = yield* registry.issue({
        threadId: ThreadId.make(`thread-${hostname}`),
        providerInstanceId: ProviderInstanceId.make("codex"),
        capabilities: new Set(["preview"]),
      });
      expect(issued.config.previewEndpoint).toBe(expectedEndpoint);
    }
  }),
);

it.effect("expires credentials once their session stops showing signs of life", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
      capabilities: new Set(["preview"]),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("keeps a credential alive across turns that never touch an MCP tool", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-3");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("claude"),
      capabilities: new Set(["preview"]),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    // Well past the liveness window in total, but each turn reports in before
    // it lapses — this is the long-session case that used to lose the toolkit.
    for (let turn = 0; turn < 10; turn += 1) {
      timestamp += 99;
      yield* registry.touch(threadId);
    }

    expect((yield* registry.resolve(token))?.threadId).toBe(threadId);
  }),
);

it.effect("does not keep credentials of other threads alive", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-4"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["preview"]),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    timestamp += 99;
    yield* registry.touch(ThreadId.make("thread-unrelated"));
    timestamp += 2;

    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("issues exactly the requested capabilities with independent toolkit endpoints", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const cases: ReadonlyArray<ReadonlyArray<McpCapability>> = [
      [],
      ["preview"],
      ["board"],
      ["board", "board-write"],
      ["board", "preview"],
    ];
    const authors = new Set<string>();
    for (const requested of cases) {
      const capabilities = new Set(requested);
      const issued = yield* registry.issue({
        threadId: ThreadId.make(`thread-${requested.join("-") || "empty"}`),
        providerInstanceId: ProviderInstanceId.make("custom-instance"),
        capabilities,
      });
      const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
      capabilities.add("board-write");
      const resolved = yield* registry.resolve(token);
      expect(resolved?.capabilities).toEqual(new Set(requested));
      expect(issued.config.capabilities).toEqual(new Set(requested));
      expect(issued.config.boardEndpoint).toBe(
        requested.includes("board") ? "http://127.0.0.1:43123/mcp" : undefined,
      );
      expect(issued.config.previewEndpoint).toBe(
        requested.includes("preview") ? "http://127.0.0.1:43123/mcp/preview" : undefined,
      );
      expect(resolved?.boardAuthorId).toBeTruthy();
      expect(resolved?.boardAuthorId).not.toBe(resolved?.providerSessionId);
      if (resolved) authors.add(resolved.boardAuthorId);
    }
    expect(authors.size).toBe(cases.length);
  }),
);

it.effect(
  "changes Board write mode on the existing token without escalating preview-only tokens",
  () =>
    Effect.gen(function* () {
      const registry = yield* makeRegistry(() => 1_000);
      const boardThread = ThreadId.make("board-thread");
      const previewThread = ThreadId.make("preview-thread");
      const issue = (threadId: ThreadId, capabilities: ReadonlySet<McpCapability>) =>
        registry.issue({
          threadId,
          providerInstanceId: ProviderInstanceId.make("instance"),
          capabilities,
        });
      const board = yield* issue(boardThread, new Set(["board", "board-write", "preview"]));
      const preview = yield* issue(previewThread, new Set(["preview"]));
      const boardToken = board.config.authorizationHeader.replace(/^Bearer\s+/, "");
      const previewToken = preview.config.authorizationHeader.replace(/^Bearer\s+/, "");
      const original = yield* registry.resolve(boardToken);
      yield* registry.setBoardWriteEnabled(boardThread, false);
      expect((yield* registry.resolve(boardToken))?.capabilities).toEqual(
        new Set(["board", "preview"]),
      );
      expect((yield* registry.resolve(previewToken))?.capabilities).toEqual(new Set(["preview"]));
      yield* registry.setBoardWriteEnabled(boardThread, true);
      const restored = yield* registry.resolve(boardToken);
      expect(restored?.capabilities).toEqual(new Set(["board", "board-write", "preview"]));
      expect(restored?.boardAuthorId).toBe(original?.boardAuthorId);
      for (const enabled of [false, true, false, true]) {
        yield* registry.setBoardWriteEnabled(previewThread, enabled);
        expect((yield* registry.resolve(previewToken))?.capabilities).toEqual(new Set(["preview"]));
      }
    }),
);

it.effect("cannot restore revoked or expired credentials through mode updates", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("mode-expiry");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["board", "board-write"]),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    yield* registry.setBoardWriteEnabled(threadId, true);
    expect(yield* registry.resolve(token)).toBeUndefined();
    const replacement = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["board", "board-write"]),
    });
    const replacementToken = replacement.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(yield* registry.resolve(replacementToken)).toBeDefined();
    yield* registry.revokeThread(threadId);
    yield* registry.setBoardWriteEnabled(threadId, true);
    expect(yield* registry.resolve(replacementToken)).toBeUndefined();
  }),
);
