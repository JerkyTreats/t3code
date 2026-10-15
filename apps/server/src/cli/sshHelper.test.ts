// @effect-diagnostics nodeBuiltinImport:off -- Exercises the remote CLI helpers against synthetic state and owned loopback listeners.
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Command } from "effect/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
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

// On macOS, Node can bind 127.0.0.1:<port> while another process (such as the
// desktop app with network access on) listens on *:<port>. Linux refuses that
// bind unless both sockets set SO_REUSEPORT, so on Linux the preload adds it to
// the picker's probe and the holder sets it too. macOS needs neither.
const MACOS_BIND_PRELOAD = `const net = require("node:net");
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, host, callback) {
  if (typeof port !== "number" || typeof host !== "string") return listen.apply(this, arguments);
  return listen.call(this, { port, host, reusePort: true }, callback);
};
`;

describe("__ssh-helper pick-port", () => {
  const hostPlatform = HostProcess.Platform.defaultValue();
  const linuxHost = hostPlatform === "linux";
  const windowsHost = hostPlatform === "win32";

  const holdWildcardPort = Effect.acquireRelease(
    Effect.callback<NodeNet.Server>((resume) => {
      const server = NodeNet.createServer((socket) => socket.destroy());
      server.once("error", (error) => resume(Effect.die(error)));
      server.listen({ port: 0, host: "0.0.0.0", reusePort: linuxHost }, () =>
        resume(Effect.succeed(server)),
      );
    }),
    (server) =>
      Effect.callback<void>((resume) => {
        server.close(() => resume(Effect.void));
      }),
  );

  it.effect.skipIf(windowsHost)(
    "skips a port another server answers on loopback",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pick-port-" });
        yield* fs.writeFileString(`${root}/preload.cjs`, MACOS_BIND_PRELOAD);
        const holder = yield* holdWildcardPort;
        const heldPort = (holder.address() as NodeNet.AddressInfo).port;

        const child = yield* spawner.spawn(
          ChildProcess.make(process.execPath, [
            ...(linuxHost ? ["--require", `${root}/preload.cjs`] : []),
            "--experimental-strip-types",
            new URL("../bin.ts", import.meta.url).pathname,
            "__ssh-helper",
            "pick-port",
            "",
            String(heldPort),
            "20",
          ]),
        );
        const [stdout, exitCode] = yield* Effect.all(
          [
            child.stdout.pipe(
              Stream.decodeText(),
              Stream.runFold(
                () => "",
                (acc, chunk) => acc + chunk,
              ),
            ),
            child.exitCode.pipe(Effect.map(Number)),
          ],
          { concurrency: "unbounded" },
        );

        assert.equal(exitCode, 0);
        const picked = Number(stdout);
        assert.isAbove(picked, heldPort);
        assert.isBelow(picked, heldPort + 20);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    30_000,
  );
});
