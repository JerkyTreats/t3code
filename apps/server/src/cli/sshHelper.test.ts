// @effect-diagnostics nodeBuiltinImport:off -- Exercises the remote CLI helpers against synthetic state and owned loopback listeners.
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/cli";
import { afterEach, expect, vi } from "vite-plus/test";

import { sshHelperCommand } from "./sshHelper.ts";

const encodeRuntimeDescriptor = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Struct({ pid: Schema.Int, port: Schema.Int, origin: Schema.String }),
  ),
);

const runHelper = (args: ReadonlyArray<string>) =>
  Command.runWith(sshHelperCommand, { version: "0.0.0" })(args).pipe(
    Effect.provide(NodeServices.layer),
  );

const close = (server: NodeNet.Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

const listen = (server: NodeNet.Server) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") reject(new Error("No loopback port"));
      else resolve(address.port);
    });
  });

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it.effect("picks a free port using the persisted preferred port", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "ssh-helper-")),
    );
    const server = NodeNet.createServer();
    const port = yield* Effect.promise(() => listen(server));
    yield* Effect.promise(() => close(server));
    try {
      const portFile = NodePath.join(directory, "port");
      yield* Effect.promise(() => NodeFSP.writeFile(portFile, String(port)));
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      yield* runHelper(["pick-port", portFile, "3773", "1"]);
      expect(output).toHaveBeenCalledWith(String(port));
      expect(process.exitCode).toBeUndefined();
    } finally {
      yield* Effect.promise(() => NodeFSP.rm(directory, { recursive: true, force: true }));
    }
  }),
);

it.effect("recognizes an owned loopback server as ready", () =>
  Effect.gen(function* () {
    const server = NodeHttp.createServer((_request, response) => response.end("ready"));
    const port = yield* Effect.promise(() => listen(server));
    try {
      yield* runHelper(["wait-ready", String(port), "1000", "100"]);
      expect(process.exitCode).toBeUndefined();
    } finally {
      yield* Effect.promise(() => close(server));
    }
  }),
);

it.effect("reads only a live loopback runtime descriptor", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "ssh-helper-")),
    );
    try {
      const runtimeFile = NodePath.join(directory, "runtime.json");
      yield* Effect.promise(() =>
        NodeFSP.writeFile(
          runtimeFile,
          encodeRuntimeDescriptor({
            pid: process.pid,
            port: 3773,
            origin: "http://127.0.0.1:3773",
          }),
        ),
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      yield* runHelper(["runtime-port", runtimeFile]);
      expect(output).toHaveBeenCalledWith(`${process.pid} 3773`);
      expect(process.exitCode).toBeUndefined();

      output.mockClear();
      yield* Effect.promise(() =>
        NodeFSP.writeFile(
          runtimeFile,
          encodeRuntimeDescriptor({
            pid: process.pid,
            port: 3773,
            origin: "https://service.example.test:3773",
          }),
        ),
      );
      yield* runHelper(["runtime-port", runtimeFile]);
      expect(output).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      yield* Effect.promise(() => NodeFSP.rm(directory, { recursive: true, force: true }));
    }
  }),
);
