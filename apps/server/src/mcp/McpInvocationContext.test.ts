import { expect, it } from "@effect/vitest";
import {
  BoardAuthorId,
  EnvironmentId,
  PreviewAutomationUnavailableError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "./McpInvocationContext.ts";

it.effect("reports the scoped credential context when preview capability is unavailable", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
    providerSessionId: "provider-session-1",
    boardAuthorId: BoardAuthorId.make("board-author-1"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    capabilities: new Set(["board"]),
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
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
    expect(error.message).toBe("MCP credential does not grant the preview capability.");
  });
});

it.effect("requires Board admission and derives its author from trusted session context", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
    providerSessionId: "provider-session-1",
    boardAuthorId: BoardAuthorId.make("board-author-1"),
    providerInstanceId: ProviderInstanceId.make("codex"),
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
      id: invocation.boardAuthorId,
      providerInstanceId: invocation.providerInstanceId,
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
    threadId: ThreadId.make("thread-plan"),
    providerSessionId: "provider-session-plan",
    boardAuthorId: BoardAuthorId.make("board-author-plan"),
    providerInstanceId: ProviderInstanceId.make("codex"),
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
    expect(writable.author.id).toBe(invocation.boardAuthorId);
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
