import * as path from "node:path";
import * as os from "node:os";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Stream } from "effect";

import { ThreadId } from "@t3tools/contracts";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { OpenCodeAdapter } from "../Services/OpenCodeAdapter.ts";
import { makeOpenCodeAdapterLive } from "./OpenCodeAdapter.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockAgentPath = path.join(__dirname, "../../../scripts/acp-mock-agent.ts");
const bunExe = "bun";

async function makeMockOpenCodeWrapper(argvLogPath?: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-acp-mock-"));
  const wrapperPath = path.join(dir, "fake-opencode.sh");
  const argvLog = argvLogPath
    ? `printf '%s\\t' "$@" >> ${JSON.stringify(argvLogPath)}
printf '\\n' >> ${JSON.stringify(argvLogPath)}
`
    : "";
  const script = `#!/bin/sh
${argvLog}
if [ "$1" = "acp" ]; then
  shift
fi
exec ${JSON.stringify(bunExe)} ${JSON.stringify(mockAgentPath)} "$@"
`;
  await writeFile(wrapperPath, script, "utf8");
  await chmod(wrapperPath, 0o755);
  return wrapperPath;
}

async function readArgvLog(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t").filter((token) => token.length > 0));
}

const openCodeAdapterTestLayer = it.layer(
  makeOpenCodeAdapterLive().pipe(
    Layer.provideMerge(ServerSettingsService.layerTest()),
    Layer.provideMerge(
      ServerConfig.layerTest(process.cwd(), {
        prefix: "t3code-opencode-adapter-test-",
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  ),
);

openCodeAdapterTestLayer("OpenCodeAdapterLive", (it) => {
  it.effect("starts a session and maps mock ACP prompt flow to runtime events", () =>
    Effect.gen(function* () {
      const adapter = yield* OpenCodeAdapter;
      const settings = yield* ServerSettingsService;
      const threadId = ThreadId.make("opencode-mock-thread");

      const wrapperPath = yield* Effect.promise(() => makeMockOpenCodeWrapper());
      yield* settings.updateSettings({ providers: { opencode: { binaryPath: wrapperPath } } });

      const runtimeEventsFiber = yield* Stream.take(adapter.streamEvents, 9).pipe(
        Stream.runCollect,
        Effect.forkChild,
      );

      const session = yield* adapter.startSession({
        threadId,
        provider: "opencode",
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: { provider: "opencode", model: "default" },
      });

      assert.equal(session.provider, "opencode");
      assert.deepStrictEqual(session.resumeCursor, {
        schemaVersion: 1,
        sessionId: "mock-session-1",
      });

      yield* adapter.sendTurn({
        threadId,
        input: "hello mock",
        attachments: [],
      });

      const runtimeEvents = Array.from(yield* Fiber.join(runtimeEventsFiber));
      const types = runtimeEvents.map((event) => event.type);

      for (const type of [
        "session.started",
        "session.state.changed",
        "thread.started",
        "turn.started",
        "turn.plan.updated",
        "item.started",
        "content.delta",
        "item.completed",
        "turn.completed",
      ] as const) {
        assert.include(types, type);
      }
    }),
  );

  it.effect("spawns opencode acp with the working directory flag", () =>
    Effect.gen(function* () {
      const adapter = yield* OpenCodeAdapter;
      const settings = yield* ServerSettingsService;
      const threadId = ThreadId.make("opencode-argv-thread");
      const tempDir = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "opencode-")));
      const argvLogPath = path.join(tempDir, "argv.log");
      const wrapperPath = yield* Effect.promise(() => makeMockOpenCodeWrapper(argvLogPath));

      yield* settings.updateSettings({ providers: { opencode: { binaryPath: wrapperPath } } });

      yield* adapter.startSession({
        threadId,
        provider: "opencode",
        cwd: tempDir,
        runtimeMode: "full-access",
        modelSelection: { provider: "opencode", model: "default" },
      });

      const argvRuns = yield* Effect.promise(() => readArgvLog(argvLogPath));
      assert.deepStrictEqual(argvRuns[0], ["acp", "--cwd", tempDir]);
    }),
  );
});
