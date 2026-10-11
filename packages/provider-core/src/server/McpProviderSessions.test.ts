import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as McpProviderSessions from "./McpProviderSessions.ts";

describe("McpProviderSessions", () => {
  it.effect("keeps credentials and revocation isolated between runtimes sharing a thread ID", () =>
    Effect.gen(function* () {
      const first = yield* McpProviderSessions.McpProviderSessions.pipe(
        Effect.provide(McpProviderSessions.layer),
      );
      const second = yield* McpProviderSessions.McpProviderSessions.pipe(
        Effect.provide(McpProviderSessions.layer),
      );
      const threadId = ThreadId.make("synthetic-shared-thread");
      const config = {
        environmentId: EnvironmentId.make("synthetic-environment"),
        threadId,
        providerSessionId: "synthetic-provider-session",
        providerInstanceId: ProviderInstanceId.make("synthetic-provider"),
        endpoint: "http://fixture.invalid/mcp",
        browserToolsAvailable: false,
        capabilities: new Set(["orchestration"]),
      };
      yield* first.set({ ...config, authorizationHeader: "Bearer synthetic-first" });
      yield* second.set({ ...config, authorizationHeader: "Bearer synthetic-second" });
      assert.equal((yield* first.read(threadId))?.authorizationHeader, "Bearer synthetic-first");
      assert.equal((yield* second.read(threadId))?.authorizationHeader, "Bearer synthetic-second");
      yield* first.clear(threadId);
      assert.isUndefined(yield* first.read(threadId));
      assert.equal((yield* second.read(threadId))?.authorizationHeader, "Bearer synthetic-second");
    }),
  );
});
