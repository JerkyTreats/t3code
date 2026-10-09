import { expect, it } from "@effect/vitest";
import {
  BoardAuthorId,
  EnvironmentId,
  McpCapabilityUnavailableError,
  PreviewAutomationUnavailableError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "./McpInvocationContext.ts";

it.effect("reports the scoped credential context when preview capability is unavailable", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    requestNamespace: "provider-session-1",
    thread: {
      threadId: ThreadId.make("thread-1"),
      providerSessionId: "provider-session-1",
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    client: undefined,
    capabilities: new Set(),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    const error = yield* McpInvocationContext.requireMcpCapability("preview").pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.flip,
    );

    expect(error).toBeInstanceOf(PreviewAutomationUnavailableError);
    expect(error).toMatchObject({
      capability: "preview",
      environmentId: invocation.environmentId,
      threadId: invocation.thread?.threadId,
      providerSessionId: invocation.thread?.providerSessionId,
      providerInstanceId: invocation.thread?.providerInstanceId,
    });
    expect(error.message).toContain("MCP credential does not grant the preview capability");
    expect(error.message).toContain("use a headless browser from the shell");
  });
});

it.effect("reports other missing capabilities with the neutral error", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    requestNamespace: "provider-session-1",
    thread: {
      threadId: ThreadId.make("thread-1"),
      providerSessionId: "provider-session-1",
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    client: undefined,
    capabilities: new Set(["preview"]),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    const error = yield* McpInvocationContext.requireMcpCapability("pull-requests").pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.flip,
    );

    expect(error).toBeInstanceOf(McpCapabilityUnavailableError);
    expect(error).toMatchObject({
      capability: "pull-requests",
      threadId: invocation.thread?.threadId,
    });

    const scope = yield* McpInvocationContext.requireMcpCapability("preview").pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    );
    expect(scope).toBe(invocation);
  });
});

it.effect("refuses thread-owned capabilities to a caller signed in from outside a thread", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    requestNamespace: "client:session-1",
    thread: undefined,
    client: { sessionId: "session-1", label: "Claude Code", access: "auto" },
    capabilities: new Set(["preview", "orchestration"]),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    const error = yield* McpInvocationContext.requireThreadMcpCapability("preview").pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.flip,
    );
    expect(error).toBeInstanceOf(PreviewAutomationUnavailableError);
    expect(error).toMatchObject({ capability: "preview", environmentId: "environment-1" });
    expect(error.threadId).toBeUndefined();
  });
});

it.effect("requires Board admission and derives its author from trusted session context", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    requestNamespace: "provider-session-1",
    thread: {
      threadId: ThreadId.make("thread-1"),
      providerSessionId: "provider-session-1",
      boardAuthorId: BoardAuthorId.make("board-author-1"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    client: undefined,
    capabilities: new Set(["board"]),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    const admitted = yield* McpInvocationContext.requireBoardCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    );
    expect(admitted.invocation).toBe(invocation);
    expect(admitted.author).toEqual({
      kind: "agent",
      id: invocation.thread?.boardAuthorId,
      providerInstanceId: invocation.thread?.providerInstanceId,
    });

    const denied = yield* McpInvocationContext.requireBoardCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, {
        ...invocation,
        capabilities: new Set<McpInvocationContext.McpCapability>(["preview"]),
      }),
      Effect.flip,
    );
    expect(denied).toBeInstanceOf(McpInvocationContext.BoardCapabilityUnavailableError);
  });
});

it.effect("keeps Board reads available while rejecting writes without mode authority", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    requestNamespace: "provider-session-plan",
    thread: {
      threadId: ThreadId.make("thread-plan"),
      providerSessionId: "provider-session-plan",
      boardAuthorId: BoardAuthorId.make("board-author-plan"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    client: undefined,
    capabilities: new Set(["board"]),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    yield* McpInvocationContext.requireBoardCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    );
    const denied = yield* McpInvocationContext.requireBoardWriteCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.flip,
    );
    expect(denied).toBeInstanceOf(McpInvocationContext.BoardWriteCapabilityUnavailableError);
    const writable = yield* McpInvocationContext.requireBoardWriteCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, {
        ...invocation,
        capabilities: new Set<McpInvocationContext.McpCapability>(["board", "board-write"]),
      }),
    );
    expect(writable.author.id).toBe(invocation.thread?.boardAuthorId);
    const writeOnlyDenied = yield* McpInvocationContext.requireBoardWriteCapability().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, {
        ...invocation,
        capabilities: new Set<McpInvocationContext.McpCapability>(["board-write"]),
      }),
      Effect.flip,
    );
    expect(writeOnlyDenied).toBeInstanceOf(McpInvocationContext.BoardCapabilityUnavailableError);
  });
});

it.effect("refuses Board grants without a trusted thread author", () =>
  Effect.gen(function* () {
    const external: McpInvocationContext.McpInvocationScope = {
      environmentId: EnvironmentId.make("environment-1"),
      requestNamespace: "client:external",
      thread: undefined,
      client: { sessionId: "external", label: "External agent", access: "full-access" },
      capabilities: new Set(["board", "board-write"]),
      issuedAt: 1,
    };
    const missingAuthor: McpInvocationContext.McpInvocationScope = {
      ...external,
      thread: {
        threadId: ThreadId.make("thread-no-author"),
        providerSessionId: "session-no-author",
        providerInstanceId: ProviderInstanceId.make("codex"),
      },
      client: undefined,
    };
    for (const invocation of [external, missingAuthor]) {
      const denied = yield* McpInvocationContext.requireBoardWriteCapability().pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
        Effect.flip,
      );
      expect(denied).toBeInstanceOf(McpInvocationContext.BoardCapabilityUnavailableError);
    }
  }),
);
