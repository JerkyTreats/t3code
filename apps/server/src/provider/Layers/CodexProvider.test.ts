import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import {
  buildCodexInitializeParams,
  mapCodexModelCapabilities,
  parseCodexCliVersionOutput,
  resolveCodexCliInitializeClientVersion,
} from "./CodexProvider.ts";
import packageJson from "../../../package.json" with { type: "json" };

const encoder = new TextEncoder();

it("maps current Codex model capability fields", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: [],
    defaultReasoningEffort: "super-high",
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    defaultServiceTier: "flex",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "Lower latency responses.",
      },
      {
        id: "flex",
        name: "Flex",
        description: "Lower-cost asynchronous routing.",
      },
    ],
    supportedReasoningEfforts: [
      {
        description: "Maximum reasoning",
        reasoningEffort: "super-high",
      },
    ],
  });

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [{ id: "super-high", label: "super-high", isDefault: true }],
      currentValue: "super-high",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard" },
        {
          id: "priority",
          label: "Fast",
          description: "Lower latency responses.",
        },
        {
          id: "flex",
          label: "Flex",
          description: "Lower-cost asynchronous routing.",
          isDefault: true,
        },
      ],
      currentValue: "flex",
    },
  ]);
});

it("uses standard routing when the catalog has no default service tier", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: ["fast"],
    defaultReasoningEffort: "medium",
    defaultServiceTier: null,
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "1.5x speed, increased usage",
      },
    ],
    supportedReasoningEfforts: [],
  });

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        {
          id: "priority",
          label: "Fast",
          description: "1.5x speed, increased usage",
        },
      ],
      currentValue: "default",
    },
  ]);
});

it("parses Codex CLI version output", () => {
  assert.strictEqual(parseCodexCliVersionOutput("codex-cli 0.28.0\n"), "0.28.0");
  assert.strictEqual(parseCodexCliVersionOutput("codex 0.28.0-beta.1\n"), "0.28.0-beta.1");
  assert.strictEqual(parseCodexCliVersionOutput("not a version"), undefined);
});

it("uses the selected Codex CLI version for initialize client info", () => {
  assert.strictEqual(buildCodexInitializeParams("0.28.0").clientInfo.version, "0.28.0");
});

it.effect("bounds Codex version probe output while fully draining both streams", () =>
  Effect.gen(function* () {
    const floodChunk = encoder.encode("x".repeat(4 * 1024));
    const stdoutChunks = [
      floodChunk,
      floodChunk,
      floodChunk,
      floodChunk,
      floodChunk,
      encoder.encode("codex-cli 9.8.7\n"),
    ];
    const stderrChunks = Array.from({ length: 8 }, () => floodChunk);
    let stdoutChunksDrained = 0;
    let stderrChunksDrained = 0;
    const stdout = Stream.fromIterable(stdoutChunks).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          stdoutChunksDrained += 1;
        }),
      ),
    );
    const stderr = Stream.fromIterable(stderrChunks).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          stderrChunksDrained += 1;
        }),
      ),
    );
    const handle = ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(1),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      unref: Effect.succeed(Effect.void),
      stdin: Sink.drain,
      stdout,
      stderr,
      all: Stream.empty,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
    });
    const spawner = ChildProcessSpawner.make(() => Effect.succeed(handle));

    const version = yield* resolveCodexCliInitializeClientVersion({
      binaryPath: "codex",
      cwd: "/tmp",
    }).pipe(Effect.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)));

    assert.strictEqual(version, packageJson.version);
    assert.strictEqual(stdoutChunksDrained, stdoutChunks.length);
    assert.strictEqual(stderrChunksDrained, stderrChunks.length);
  }),
);
