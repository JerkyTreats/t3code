// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeEvents from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";

import { ThreadId } from "@t3tools/contracts";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { InteractionChild } from "./InteractionCapability.ts";
import { InteractionManager, resolveInteractionEvidenceDirectory } from "./Manager.ts";
import type { NativeObservationSink, OwnerResultV1 } from "./NativeObservationSink.ts";

const sessionId = "11111111111111111111111111111111";
const streamId = "22222222222222222222222222222222";
const temporaryDirectories: string[] = [];
const startInput = {
  nativeSessionId: sessionId,
  threadId: ThreadId.make("thread:one"),
  requestRef: "request:one",
  requestRevision: "revision:one",
  requestDigest: "sha256:request",
  interactionId: "interaction:one",
  resourceRevision: 1,
  conditionRevision: "condition:one",
  resourceBindingProvenance: "physical" as const,
};
const ownerResult: OwnerResultV1 = {
  schemaVersion: 1,
  operation: "test",
  disposition: "admitted",
  requestRef: startInput.requestRef,
  requestRevision: startInput.requestRevision,
  requestDigest: startInput.requestDigest,
  ownerState: "pending",
  receiptId: "owner-receipt",
  evidenceRef: null,
  evidenceDigest: null,
  reason: null,
  publicationAttemptCount: 0,
  publicationEffectCount: 0,
};

function nativeReady() {
  return {
    kind: "Ready",
    protocolVersion: 1,
    nativeSessionId: sessionId,
    sourceStreamId: streamId,
    width: 640,
    height: 360,
    strideBytes: 2560,
    pixelFormat: "rgba8-srgb",
    presentationRevision: 1,
    maxFramesPerSecond: 10,
    frameSlotCapacity: 3,
    inputQueueCapacity: 64,
  } as const;
}

function nativeReceipt(receiptId: string, sourceSequence: string, generation: string) {
  return {
    kind: "InputReceipt",
    nativeSessionId: sessionId,
    sourceStreamId: streamId,
    receiptId,
    engagementEpoch: "1",
    firstSourceSequence: sourceSequence,
    lastSourceSequence: sourceSequence,
    previousAcceptedNativeReceiveMonotonicNs: null,
    previousAcceptedNormalizedX: null,
    previousAcceptedNormalizedY: null,
    firstNativeReceiveMonotonicNs: sourceSequence,
    lastNativeReceiveMonotonicNs: sourceSequence,
    maxConsecutiveNativeReceiveGapNs: "0",
    firstNormalizedX: 0.25,
    firstNormalizedY: 0.25,
    lastNormalizedX: 0.25,
    lastNormalizedY: 0.25,
    normalizedPathLength: 0,
    positiveMotionEdgeCount: 0,
    sampleCount: 1,
    nativeCanvasWidthPx: 640,
    nativeCanvasHeightPx: 360,
    presentationRevision: 1,
    provenanceClass: "physical",
    interactionGeneration: generation,
    timingBasis: "native-receive-monotonic-v1",
    maxDisplayedFrameAgeNs: "1",
    samples: [
      {
        sourceSequence,
        nativeReceiveMonotonicNs: sourceSequence,
        phase: "move",
        normalizedX: 0.25,
        normalizedY: 0.25,
        displayedFrameSequence: "1",
      },
    ],
  } as const;
}

function fakeObservationSink(): NativeObservationSink {
  return {
    ready: vi.fn(async () => undefined),
    bindResource: vi.fn(async () => ownerResult),
    activateEngagement: vi.fn(async () => ownerResult),
    admitObservation: vi.fn(async () => ownerResult),
    disarmEngagement: vi.fn(async () => ownerResult),
    acknowledgeEvidence: vi.fn(async () => ownerResult),
    cancel: vi.fn(async () => ownerResult),
  };
}

class FakeChild extends NodeEvents.EventEmitter implements InteractionChild {
  readonly stdin = new NodeStream.PassThrough();
  readonly stdout = new NodeStream.PassThrough();
  readonly stderr = new NodeStream.PassThrough();
  readonly pid = 42;
  exitCode: number | null = null;
  readonly kill = vi.fn(() => true);

  exit(code = 0): void {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

function encode(header: Record<string, unknown>, payload = Buffer.alloc(0)): Buffer {
  const json = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(12);
  prefix.write("MWI1");
  prefix.writeUInt32BE(json.byteLength, 4);
  prefix.writeUInt32BE(payload.byteLength, 8);
  return Buffer.concat([prefix, json, payload]);
}

function decodeWrites(bytes: Buffer): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const headerLength = bytes.readUInt32BE(offset + 4);
    expect(bytes.subarray(offset, offset + 4).toString()).toBe("MWI1");
    records.push(JSON.parse(bytes.subarray(offset + 12, offset + 12 + headerLength).toString()));
    offset += 12 + headerLength;
  }
  return records;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => NodeFSP.rm(path, { recursive: true })),
  );
});

describe("InteractionManager", () => {
  it("uses only an absolute main-process evidence root override", () => {
    expect(
      resolveInteractionEvidenceDirectory({
        T3_INTERACTION_EVIDENCE_ROOT: "/var/lib/t3-staging/interaction-evidence",
      }),
    ).toBe("/var/lib/t3-staging/interaction-evidence");
    expect(() =>
      resolveInteractionEvidenceDirectory({ T3_INTERACTION_EVIDENCE_ROOT: "relative/evidence" }),
    ).toThrow("must be an absolute path");
  });
  it("launches only the admitted capability and writes framed host records", async () => {
    const child = new FakeChild();
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      observationSink: fakeObservationSink(),
    });
    await manager.start(startInput);
    child.stdout.write(encode(nativeReady()));
    await manager.arm({
      nativeSessionId: sessionId,
      presentationRevision: 1,
      engagementEpoch: "1",
      activationReleaseSourceSequence: "4",
      provenanceClass: "physical",
    });
    const written = decodeWrites(child.stdin.read() as Buffer);
    expect(written.map((record) => record.kind)).toEqual(["Start", "Arm"]);
    expect(written[0]).toEqual({ kind: "Start", protocolVersion: 1, nativeSessionId: sessionId });
  });

  it("rejects malformed frame lengths before publishing pixels", async () => {
    const child = new FakeChild();
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      observationSink: fakeObservationSink(),
    });
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.start(startInput);
    child.stdout.write(
      encode(
        {
          kind: "Frame",
          protocolVersion: 1,
          nativeSessionId: sessionId,
          sourceStreamId: streamId,
          frameSequence: "1",
          semanticTick: "1",
          interactionGeneration: "0",
          captureStartedNativeMonotonicNs: "1",
          captureCompletedNativeMonotonicNs: "2",
          width: 640,
          height: 360,
          strideBytes: 2560,
          pixelFormat: "rgba8-srgb",
          presentationRevision: 1,
          droppedSincePrevious: "0",
          payloadLength: 4,
        },
        Buffer.alloc(4),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  });

  it("persists bounded evidence before acknowledgment and accepts only successful Terminal", async () => {
    const child = new FakeChild();
    const evidenceDirectory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-interaction-"),
    );
    temporaryDirectories.push(evidenceDirectory);
    const sink = fakeObservationSink();
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      evidenceDirectory,
      observationSink: sink,
    });
    await manager.start(startInput);
    child.stdout.write(encode(nativeReady()));
    child.stdout.write(
      encode(
        {
          kind: "Frame",
          protocolVersion: 1,
          nativeSessionId: sessionId,
          sourceStreamId: streamId,
          frameSequence: "1",
          semanticTick: "1",
          interactionGeneration: "1",
          captureStartedNativeMonotonicNs: "1",
          captureCompletedNativeMonotonicNs: "2",
          width: 640,
          height: 360,
          strideBytes: 2560,
          pixelFormat: "rgba8-srgb",
          presentationRevision: 1,
          droppedSincePrevious: "0",
          payloadLength: 921600,
        },
        Buffer.alloc(921600),
      ),
    );
    const stopping = manager.stop({ nativeSessionId: sessionId, reason: "stop" });
    child.stdout.write(
      encode({
        kind: "EvidenceReady",
        nativeSessionId: sessionId,
        finalFrameSequence: "3",
        finalInputSourceSequence: "5",
        finalEngagementEpoch: "1",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        receiptCount: "1",
      }),
    );
    await vi.waitFor(() => {
      const written = decodeWrites(child.stdin.read() as Buffer);
      expect(written.at(-1)?.kind).toBe("EvidenceCommitted");
    });
    expect(
      await NodeFSP.readFile(NodePath.join(evidenceDirectory, `${sessionId}.json`), "utf8"),
    ).toContain("EvidenceReady");
    expect(sink.acknowledgeEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({
          ref: expect.stringMatching(/^interaction-evidence:[a-f0-9]{32}:[a-f0-9]{64}$/),
        }),
      }),
    );
    child.stdout.write(
      encode({
        kind: "Terminal",
        nativeSessionId: sessionId,
        sourceStreamId: streamId,
        finalFrameSequence: "3",
        finalInputSourceSequence: "5",
        finalEngagementEpoch: "1",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        terminalNativeMonotonicNs: "9",
        outcome: "success",
        reason: "stop",
      }),
    );
    child.exit();
    await expect(stopping).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("latches owner qualification and drains later receipts into evidence without re-admission", async () => {
    const child = new FakeChild();
    const written: Buffer[] = [];
    child.stdin.on("data", (chunk: Buffer) => written.push(chunk));
    const evidenceDirectory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-interaction-qualified-"),
    );
    temporaryDirectories.push(evidenceDirectory);
    const sink = fakeObservationSink();
    const qualified = {
      ...ownerResult,
      operation: "observation-admit",
      disposition: "qualified",
      ownerState: "qualified" as const,
      receiptId: "qualified-owner-receipt",
    };
    vi.mocked(sink.admitObservation).mockResolvedValue(qualified);
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      evidenceDirectory,
      observationSink: sink,
    });
    await manager.start(startInput);
    child.stdout.write(encode(nativeReady()));
    child.stdout.write(
      encode(
        {
          kind: "Frame",
          protocolVersion: 1,
          nativeSessionId: sessionId,
          sourceStreamId: streamId,
          frameSequence: "1",
          semanticTick: "1",
          interactionGeneration: "0",
          captureStartedNativeMonotonicNs: "1",
          captureCompletedNativeMonotonicNs: "2",
          width: 640,
          height: 360,
          strideBytes: 2560,
          pixelFormat: "rgba8-srgb",
          presentationRevision: 1,
          droppedSincePrevious: "0",
          payloadLength: 921600,
        },
        Buffer.alloc(921600),
      ),
    );
    await manager.arm({
      nativeSessionId: sessionId,
      presentationRevision: 1,
      engagementEpoch: "1",
      activationReleaseSourceSequence: "1",
      provenanceClass: "physical",
    });
    child.stdout.write(
      encode({
        kind: "Armed",
        nativeSessionId: sessionId,
        engagementEpoch: "1",
        firstAcceptedSourceSequence: "2",
        interactionGeneration: "1",
        armedNativeMonotonicNs: "3",
      }),
    );
    child.stdout.write(encode(nativeReceipt("33333333333333333333333333333333", "2", "2")));
    child.stdout.write(encode(nativeReceipt("44444444444444444444444444444444", "3", "3")));

    await vi.waitFor(() => {
      expect(sink.admitObservation).toHaveBeenCalledTimes(1);
      expect(decodeWrites(Buffer.concat(written)).some((record) => record.kind === "Stop")).toBe(
        true,
      );
    });
    const disarmed = {
      kind: "Disarmed",
      nativeSessionId: sessionId,
      engagementEpoch: "1",
      lastAcceptedSourceSequence: "3",
      interactionGeneration: "3",
      disarmedNativeMonotonicNs: "4",
      reason: "stop",
    };
    child.stdout.write(encode(disarmed));
    child.stdout.write(encode(disarmed));
    child.stdout.write(
      encode({
        kind: "EvidenceReady",
        nativeSessionId: sessionId,
        finalFrameSequence: "1",
        finalInputSourceSequence: "3",
        finalEngagementEpoch: "1",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        receiptCount: "2",
      }),
    );
    await vi.waitFor(() => {
      expect(sink.acknowledgeEvidence).toHaveBeenCalledTimes(1);
      expect(
        decodeWrites(Buffer.concat(written)).some((record) => record.kind === "EvidenceCommitted"),
      ).toBe(true);
    });
    child.stdout.write(
      encode({
        kind: "Terminal",
        nativeSessionId: sessionId,
        sourceStreamId: streamId,
        finalFrameSequence: "1",
        finalInputSourceSequence: "3",
        finalEngagementEpoch: "1",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        terminalNativeMonotonicNs: "5",
        outcome: "success",
        reason: "stop",
      }),
    );
    child.exit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sink.disarmEngagement).not.toHaveBeenCalled();
    expect(sink.cancel).not.toHaveBeenCalled();
  });

  it("waits for exact stopped-child exit and admits only one racing successor", async () => {
    const child = new FakeChild();
    const successorChild = new FakeChild();
    const launch = vi
      .fn<() => Promise<InteractionChild>>()
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce(successorChild);
    const sink = fakeObservationSink();
    const manager = new InteractionManager({
      capability: { launch },
      observationSink: sink,
    });
    await manager.start(startInput);
    child.stdout.write(encode(nativeReady()));
    child.stdout.write(
      encode(
        {
          kind: "Frame",
          protocolVersion: 1,
          nativeSessionId: sessionId,
          sourceStreamId: streamId,
          frameSequence: "1",
          semanticTick: "1",
          interactionGeneration: "1",
          captureStartedNativeMonotonicNs: "1",
          captureCompletedNativeMonotonicNs: "2",
          width: 640,
          height: 360,
          strideBytes: 2560,
          pixelFormat: "rgba8-srgb",
          presentationRevision: 1,
          droppedSincePrevious: "0",
          payloadLength: 921600,
        },
        Buffer.alloc(921600),
      ),
    );
    await vi.waitFor(() => {
      expect(sink.bindResource).toHaveBeenCalledTimes(1);
    });
    const stopping = manager.stop({ nativeSessionId: sessionId, reason: "stop" });
    const settled = vi.fn();
    void stopping.then(settled);
    child.stdout.write(
      encode({
        kind: "EvidenceReady",
        nativeSessionId: sessionId,
        finalFrameSequence: "0",
        finalInputSourceSequence: "0",
        finalEngagementEpoch: "0",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        receiptCount: "0",
      }),
    );
    await vi.waitFor(() => {
      expect(
        decodeWrites(child.stdin.read() as Buffer).some(
          (record) => record.kind === "EvidenceCommitted",
        ),
      ).toBe(true);
    });
    child.stdout.write(
      encode({
        kind: "Terminal",
        nativeSessionId: sessionId,
        sourceStreamId: streamId,
        finalFrameSequence: "0",
        finalInputSourceSequence: "0",
        finalEngagementEpoch: "0",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        terminalNativeMonotonicNs: "1",
        outcome: "success",
        reason: "stop",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).not.toHaveBeenCalled();
    const firstSuccessor = manager.start({
      ...startInput,
      nativeSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const secondSuccessor = manager.start({
      ...startInput,
      nativeSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(launch).toHaveBeenCalledTimes(1);
    child.exit();
    await expect(stopping).resolves.toBeUndefined();
    await expect(firstSuccessor).resolves.toBeUndefined();
    await expect(secondSuccessor).rejects.toThrow("already active");
    expect(launch).toHaveBeenCalledTimes(2);
    expect(decodeWrites(successorChild.stdin.read() as Buffer)).toEqual([
      { kind: "Start", protocolVersion: 1, nativeSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    ]);
  });

  it("rejects a successful Terminal before evidence commitment", async () => {
    const child = new FakeChild();
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      observationSink: fakeObservationSink(),
    });
    await manager.start(startInput);
    const stopping = manager.stop({ nativeSessionId: sessionId, reason: "stop" });
    child.stdout.write(
      encode({
        kind: "Terminal",
        nativeSessionId: sessionId,
        sourceStreamId: streamId,
        finalFrameSequence: "0",
        finalInputSourceSequence: "0",
        finalEngagementEpoch: "0",
        droppedFrameCount: "0",
        rejectedInputCount: "0",
        terminalNativeMonotonicNs: "1",
        outcome: "success",
        reason: "stop",
      }),
    );
    await expect(stopping).rejects.toThrow("before evidence commitment");
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  });

  it("kills and retains the session fence when the Stop write fails", async () => {
    const child = new FakeChild();
    const originalWrite = child.stdin.write.bind(child.stdin);
    vi.spyOn(child.stdin, "write").mockImplementation(((
      chunk: Uint8Array,
      callback: (error?: Error | null) => void,
    ) => {
      if (Buffer.from(chunk).includes(Buffer.from('"kind":"Stop"'))) {
        callback(new Error("broken stdin"));
        return false;
      }
      return originalWrite(chunk, callback);
    }) as never);
    const manager = new InteractionManager({
      capability: { launch: async () => child },
      observationSink: fakeObservationSink(),
    });
    await manager.start(startInput);
    await expect(manager.stop({ nativeSessionId: sessionId, reason: "stop" })).rejects.toThrow(
      "broken stdin",
    );
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    await expect(
      manager.start({ ...startInput, nativeSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
    ).rejects.toThrow("broken stdin");
    child.exit(1);
  });
});
