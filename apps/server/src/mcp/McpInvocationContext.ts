import {
  BoardAuthorId,
  type EnvironmentId,
  McpCapabilityUnavailableError,
  PreviewAutomationUnavailableError,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export type McpCapability = "board" | "board-write" | "preview" | "device" | "pull-requests";

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly boardAuthorId: BoardAuthorId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly issuedAt: number;
}

export class McpInvocationContext extends Context.Service<
  McpInvocationContext,
  McpInvocationScope
>()("t3/mcp/McpInvocationContext") {}

export class BoardCapabilityUnavailableError extends Schema.TaggedError<BoardCapabilityUnavailableError>()(
  "BoardCapabilityUnavailableError",
  {
    capability: Schema.Literal("board"),
    environmentId: Schema.String,
    threadId: Schema.String,
    providerSessionId: Schema.String,
    providerInstanceId: Schema.String,
  },
) {
  override get message(): string {
    return "MCP credential does not grant the Board capability.";
  }
}

export class BoardWriteCapabilityUnavailableError extends Schema.TaggedError<BoardWriteCapabilityUnavailableError>()(
  "BoardWriteCapabilityUnavailableError",
  {
    capability: Schema.Literal("board-write"),
    environmentId: Schema.String,
    threadId: Schema.String,
    providerSessionId: Schema.String,
    providerInstanceId: Schema.String,
  },
) {
  override get message(): string {
    return "MCP credential does not grant Board writes in the current interaction mode.";
  }
}

/** Board identity and admission come only from the server-minted invocation scope. */
export const requireBoardCapability = Effect.fn("mcp.requireBoardCapability")(function* () {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has("board")) {
    return yield* new BoardCapabilityUnavailableError({
      capability: "board",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
  }
  return {
    invocation,
    author: {
      kind: "agent" as const,
      id: invocation.boardAuthorId,
      providerInstanceId: invocation.providerInstanceId,
    },
  };
});

export const requireBoardWriteCapability = Effect.fn("mcp.requireBoardWriteCapability")(
  function* () {
    const identity = yield* requireBoardCapability();
    if (!identity.invocation.capabilities.has("board-write")) {
      return yield* new BoardWriteCapabilityUnavailableError({
        capability: "board-write",
        environmentId: identity.invocation.environmentId,
        threadId: identity.invocation.threadId,
        providerSessionId: identity.invocation.providerSessionId,
        providerInstanceId: identity.invocation.providerInstanceId,
      });
    }
    return identity;
  },
);

/** The error a missing capability surfaces as; preview keeps its own so the broker can route it. */
export type McpCapabilityError<C extends McpCapability> = C extends "preview"
  ? PreviewAutomationUnavailableError
  : McpCapabilityUnavailableError;

const missingCapability = (
  invocation: McpInvocationScope,
  capability: McpCapability,
): PreviewAutomationUnavailableError | McpCapabilityUnavailableError => {
  const fields = {
    environmentId: invocation.environmentId,
    threadId: invocation.threadId,
    providerSessionId: invocation.providerSessionId,
    providerInstanceId: invocation.providerInstanceId,
  };
  return capability === "preview"
    ? new PreviewAutomationUnavailableError({ capability, ...fields })
    : new McpCapabilityUnavailableError({ capability, ...fields });
};

export const requireMcpCapability = <const C extends McpCapability>(
  capability: C,
): Effect.Effect<McpInvocationScope, McpCapabilityError<C>, McpInvocationContext> =>
  McpInvocationContext.pipe(
    Effect.filterOrFail(
      (invocation) => invocation.capabilities.has(capability),
      // The conditional type narrows what the literal argument decided at runtime.
      (invocation) => missingCapability(invocation, capability) as McpCapabilityError<C>,
    ),
    Effect.withSpan("mcp.requireCapability"),
  );
