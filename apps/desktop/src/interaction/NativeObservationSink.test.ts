// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeEvents from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { InteractionChild } from "./InteractionCapability.ts";
import { makeNativeObservationSink } from "./NativeObservationSink.ts";

const temporaryDirectories: string[] = [];

class FakeOwnerChild extends NodeEvents.EventEmitter implements InteractionChild {
  readonly stdin = new NodeStream.PassThrough();
  readonly stdout = new NodeStream.PassThrough();
  readonly stderr = new NodeStream.PassThrough();
  readonly pid = 43;
  exitCode: number | null = null;
  readonly kill = vi.fn(() => true);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => NodeFSP.rm(path, { recursive: true })),
  );
});

describe("NativeObservationSink", () => {
  it("uses one verified fixed owner invocation with JSON stdin and a sanitized environment", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-owner-sink-"));
    temporaryDirectories.push(root);
    const binaryPath = NodePath.join(root, "meld-interaction-owner");
    const binary = Buffer.from("owner artifact");
    await NodeFSP.writeFile(binaryPath, binary, { mode: 0o700 });
    const child = new FakeOwnerChild();
    const written: Buffer[] = [];
    child.stdin.on("data", (chunk: Buffer) => written.push(chunk));
    child.stdin.on("finish", () => {
      child.stdout.end(
        `${JSON.stringify({
          schemaVersion: 1,
          operation: "observation-admit",
          disposition: "progress",
          requestRef: "request:one",
          requestRevision: "revision:one",
          requestDigest: "digest:one",
          ownerState: "engaged",
          receiptId: "receipt:one",
          evidenceRef: null,
          evidenceDigest: null,
          reason: null,
          publicationAttemptCount: 0,
          publicationEffectCount: 0,
        })}\n`,
      );
      child.emit("exit", 0, null);
    });
    const spawnProcess = vi.fn(() => child);
    const sink = makeNativeObservationSink({
      binaryPath,
      expectedSha256: NodeCrypto.createHash("sha256").update(binary).digest("hex"),
      stateRoot: root,
      environment: { LANG: "C", HOME: "/private", LD_PRELOAD: "/bad.so" },
      spawnProcess,
    });
    await sink.admitObservation({
      schemaVersion: 1,
      requestRef: "request:one",
      requestRevision: "revision:one",
      requestDigest: "digest:one",
      resourceId: "interaction:one",
      resourceRevision: 1,
      conditionRevision: "condition:one",
      resourceBindingProvenance: "physical",
      hostOperationId: "desktop:receipt:one",
      receipt: {} as never,
    });
    expect(spawnProcess).toHaveBeenCalledExactlyOnceWith(
      binaryPath,
      ["observation-admit", "--state-root", root, "--input", "-"],
      { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true, env: { LANG: "C" } },
    );
    expect(JSON.parse(Buffer.concat(written).toString())).toMatchObject({
      schemaVersion: 1,
      hostOperationId: "desktop:receipt:one",
    });
  });
});
