// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  DesktopInteractionEventSchema,
  type DesktopInteractionArmInput,
  type DesktopInteractionDisarmInput,
  type DesktopInteractionEvent,
  type DesktopInteractionPointerInput,
  type DesktopInteractionStartInput,
  type DesktopInteractionStopInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  nativeInteractionCapability,
  type InteractionCapability,
  type InteractionChild,
} from "./InteractionCapability.ts";
import {
  nativeObservationSink,
  type NativeObservationBinding,
  type NativeObservationSink,
} from "./NativeObservationSink.ts";

const MAGIC = Buffer.from("MWI1", "ascii");
const PREFIX_BYTES = 12;
const MAX_HEADER_BYTES = 16_384;
const MAX_PAYLOAD_BYTES = 640 * 360 * 4;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const FRAME_STALE_MS = 250;
const INPUT_STALE_MS = 100;
const STOP_TIMEOUT_MS = 1_500;
const decodeNativeEvent = Schema.decodeUnknownSync(DesktopInteractionEventSchema);

async function persistEvidenceArtifact(
  directoryPath: string,
  artifactPath: string,
  bytes: Buffer,
): Promise<void> {
  await NodeFSP.mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const directoryStat = await NodeFSP.lstat(directoryPath);
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    (directoryStat.mode & 0o077) !== 0
  ) {
    throw new Error("Interaction evidence root must be a private directory.");
  }
  try {
    const artifact = await NodeFSP.open(artifactPath, "wx", 0o600);
    try {
      await artifact.writeFile(bytes);
      await artifact.sync();
    } finally {
      await artifact.close();
    }
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error;
    }
    const stat = await NodeFSP.lstat(artifactPath);
    const existing = await NodeFSP.readFile(artifactPath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      existing.byteLength !== bytes.byteLength ||
      !NodeCrypto.timingSafeEqual(existing, bytes)
    ) {
      throw new Error("Existing interaction evidence does not match this session.", {
        cause: error,
      });
    }
  }
  const directory = await NodeFSP.open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export function resolveInteractionEvidenceDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.T3_INTERACTION_EVIDENCE_ROOT?.trim();
  if (configured === undefined || configured.length === 0) {
    return NodePath.join(NodeOS.homedir(), ".t3code", "interaction-evidence");
  }
  if (!NodePath.isAbsolute(configured)) {
    throw new Error("T3_INTERACTION_EVIDENCE_ROOT must be an absolute path.");
  }
  return NodePath.normalize(configured);
}

function parseJsonWithoutDuplicateKeys(text: string): unknown {
  let offset = 0;
  const whitespace = () => {
    while (/\s/u.test(text[offset] ?? "")) offset += 1;
  };
  const string = (): string => {
    const start = offset;
    if (text[offset++] !== '"') throw new Error("Invalid interaction JSON.");
    while (offset < text.length) {
      if (text[offset] === "\\") {
        offset += 2;
      } else if (text[offset++] === '"') {
        return JSON.parse(text.slice(start, offset)) as string;
      }
    }
    throw new Error("Truncated interaction JSON string.");
  };
  const value = (): unknown => {
    whitespace();
    if (text[offset] === '"') return string();
    if (text[offset] === "{") {
      offset += 1;
      const object: Record<string, unknown> = {};
      const keys = new Set<string>();
      whitespace();
      if (text[offset] === "}") {
        offset += 1;
        return object;
      }
      for (;;) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error(`Duplicate interaction JSON key: ${key}`);
        keys.add(key);
        whitespace();
        if (text[offset++] !== ":") throw new Error("Invalid interaction JSON object.");
        object[key] = value();
        whitespace();
        const delimiter = text[offset++];
        if (delimiter === "}") return object;
        if (delimiter !== ",") throw new Error("Invalid interaction JSON object.");
      }
    }
    if (text[offset] === "[") {
      offset += 1;
      const array: unknown[] = [];
      whitespace();
      if (text[offset] === "]") {
        offset += 1;
        return array;
      }
      for (;;) {
        array.push(value());
        whitespace();
        const delimiter = text[offset++];
        if (delimiter === "]") return array;
        if (delimiter !== ",") throw new Error("Invalid interaction JSON array.");
      }
    }
    const start = offset;
    while (offset < text.length && !/[\s,}\]]/u.test(text[offset]!)) offset += 1;
    return JSON.parse(text.slice(start, offset)) as unknown;
  };
  const parsed = value();
  whitespace();
  if (offset !== text.length) throw new Error("Trailing interaction JSON data.");
  return parsed;
}

function hasNoUnknownFields(raw: unknown, decoded: unknown): boolean {
  if (Array.isArray(raw)) {
    return (
      Array.isArray(decoded) &&
      raw.length === decoded.length &&
      raw.every((item, index) => hasNoUnknownFields(item, decoded[index]))
    );
  }
  if (typeof raw === "object" && raw !== null) {
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return false;
    return Object.entries(raw).every(
      ([key, value]) =>
        key in decoded && hasNoUnknownFields(value, (decoded as Record<string, unknown>)[key]),
    );
  }
  return true;
}

type HostRecord =
  | Readonly<{ kind: "Start"; protocolVersion: 1; nativeSessionId: string }>
  | Readonly<{ kind: "Arm" } & DesktopInteractionArmInput>
  | Readonly<{ kind: "Input" } & DesktopInteractionPointerInput>
  | Readonly<{ kind: "Disarm" } & DesktopInteractionDisarmInput>
  | Readonly<{ kind: "Stop" } & DesktopInteractionStopInput>
  | Readonly<{
      kind: "EvidenceCommitted";
      nativeSessionId: string;
      artifactDigest: string;
      artifactByteCount: string;
    }>;

type Session = {
  readonly nativeSessionId: string;
  readonly ownerRendererId: number;
  readonly child: InteractionChild;
  buffer: Buffer;
  evidence: Array<Record<string, unknown>>;
  evidenceBytes: number;
  queuedFrame: DesktopInteractionEvent | null;
  frameScheduled: boolean;
  stopping: Promise<void> | null;
  terminalResolve: (() => void) | null;
  terminalReject: ((error: Error) => void) | null;
  readonly childExit: Promise<void>;
  childExitResolve: (() => void) | null;
  childExited: boolean;
  childKillRequested: boolean;
  clearOnLateExit: boolean;
  readonly binding: NativeObservationBinding;
  readonly threadId: string;
  ownerQueue: Promise<void>;
  ownerBound: boolean;
  ownerQualified: boolean;
  evidenceReadyReceived: boolean;
  evidenceCommitted: boolean;
  interactionGeneration: string | null;
  sourceStreamId: string | null;
  presentationRevision: number | null;
  pendingArm: DesktopInteractionArmInput | null;
  activeEngagementEpoch: string | null;
  receiptEngagementEpoch: string | null;
  lastDisarmed: Extract<DesktopInteractionEvent, { kind: "Disarmed" }> | null;
  lastForwardedSourceSequence: bigint;
  latestFrameSequence: bigint | null;
  lastOwnerReceiptId: string | null;
  cancelled: boolean;
  ownerCancellationCompleted: boolean;
  hostFaultEmitted: boolean;
};

export interface InteractionManagerOptions {
  readonly capability?: InteractionCapability;
  readonly now?: () => number;
  readonly evidenceDirectory?: string;
  readonly observationSink?: NativeObservationSink;
}

export class InteractionManager {
  readonly #capability: InteractionCapability;
  readonly #now: () => number;
  readonly #evidenceDirectory: string;
  readonly #observationSink: NativeObservationSink;
  readonly #listeners = new Set<
    (event: DesktopInteractionEvent, ownerRendererId: number) => void
  >();
  #startQueue: Promise<void> = Promise.resolve();
  #session: Session | null = null;

  constructor(options: InteractionManagerOptions = {}) {
    this.#capability = options.capability ?? nativeInteractionCapability;
    this.#now = options.now ?? Date.now;
    this.#evidenceDirectory = options.evidenceDirectory ?? resolveInteractionEvidenceDirectory();
    this.#observationSink = options.observationSink ?? nativeObservationSink;
  }

  onEvent(listener: (event: DesktopInteractionEvent) => void): () => void {
    const ownedListener = (event: DesktopInteractionEvent) => listener(event);
    this.#listeners.add(ownedListener);
    return () => this.#listeners.delete(ownedListener);
  }

  onOwnedEvent(
    listener: (event: DesktopInteractionEvent, ownerRendererId: number) => void,
  ): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(input: DesktopInteractionStartInput, ownerRendererId: number): Promise<void> {
    const operation = this.#startQueue.then(() => this.#start(input, ownerRendererId));
    this.#startQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #start(input: DesktopInteractionStartInput, ownerRendererId: number): Promise<void> {
    const existing = this.#session;
    if (existing !== null) {
      if (existing.stopping === null) {
        throw new Error("A native interaction session is already active.");
      }
      await existing.stopping;
      if (this.#session === existing) {
        throw new Error("The previous native interaction session did not finish cleanup.");
      }
      if (this.#session !== null) {
        throw new Error("A native interaction session is already active.");
      }
    }
    await this.#observationSink.ready();
    const child = await this.#capability.launch();
    let childExitResolve!: () => void;
    const childExit = new Promise<void>((resolve) => {
      childExitResolve = resolve;
    });
    const session: Session = {
      nativeSessionId: input.nativeSessionId,
      ownerRendererId,
      child,
      buffer: Buffer.alloc(0),
      evidence: [],
      evidenceBytes: 0,
      queuedFrame: null,
      frameScheduled: false,
      stopping: null,
      terminalResolve: null,
      terminalReject: null,
      childExit,
      childExitResolve,
      childExited: false,
      childKillRequested: false,
      clearOnLateExit: false,
      binding: {
        requestRef: input.requestRef,
        requestRevision: input.requestRevision,
        requestDigest: input.requestDigest,
        resourceId: input.interactionId,
        resourceRevision: input.resourceRevision,
        conditionRevision: input.conditionRevision,
        resourceBindingProvenance: input.resourceBindingProvenance,
      },
      threadId: input.threadId,
      ownerQueue: Promise.resolve(),
      ownerBound: false,
      ownerQualified: false,
      evidenceReadyReceived: false,
      evidenceCommitted: false,
      interactionGeneration: null,
      sourceStreamId: null,
      presentationRevision: null,
      pendingArm: null,
      activeEngagementEpoch: null,
      receiptEngagementEpoch: null,
      lastDisarmed: null,
      lastForwardedSourceSequence: 0n,
      latestFrameSequence: null,
      lastOwnerReceiptId: null,
      cancelled: false,
      ownerCancellationCompleted: false,
      hostFaultEmitted: false,
    };
    this.#session = session;
    child.stdout.on("data", (chunk: Buffer | Uint8Array) =>
      this.#consume(session, Buffer.from(chunk)),
    );
    child.stderr.on("data", () => undefined);
    child.stdout.once("end", () => this.#transportEnded(session));
    child.once("error", (error) => this.#fail(session, error));
    child.once("exit", (code, signal) => {
      session.childExited = true;
      session.childExitResolve?.();
      session.childExitResolve = null;
      if (this.#session === session && session.stopping === null) {
        this.#fail(
          session,
          new Error(`Native interaction exited unexpectedly with ${code ?? signal}.`),
        );
      } else if (session.clearOnLateExit && this.#session === session) {
        this.#session = null;
      }
    });
    await this.#write(session, {
      kind: "Start",
      protocolVersion: 1,
      nativeSessionId: input.nativeSessionId,
    });
  }

  async arm(input: DesktopInteractionArmInput, ownerRendererId: number): Promise<void> {
    const session = this.#requireSession(input.nativeSessionId, ownerRendererId);
    if (
      session.presentationRevision !== input.presentationRevision ||
      session.pendingArm !== null ||
      session.activeEngagementEpoch !== null ||
      input.provenanceClass !== session.binding.resourceBindingProvenance ||
      BigInt(input.activationReleaseSourceSequence) <= session.lastForwardedSourceSequence
    ) {
      throw new Error("Native interaction arm does not match the active presentation fence.");
    }
    session.pendingArm = input;
    session.lastForwardedSourceSequence = BigInt(input.activationReleaseSourceSequence);
    try {
      await this.#write(session, { kind: "Arm", ...input });
    } catch (error) {
      session.pendingArm = null;
      throw error;
    }
  }

  async input(input: DesktopInteractionPointerInput, ownerRendererId: number): Promise<boolean> {
    const receivedAt = this.#now();
    const session = this.#requireSession(input.nativeSessionId, ownerRendererId);
    const sourceSequence = BigInt(input.sourceSequence);
    const displayedFrameSequence = BigInt(input.displayedFrameSequence);
    if (
      this.#now() - receivedAt > INPUT_STALE_MS ||
      session.ownerQualified ||
      session.activeEngagementEpoch !== input.engagementEpoch ||
      session.presentationRevision !== input.presentationRevision ||
      input.provenanceClass !== session.binding.resourceBindingProvenance ||
      sourceSequence <= session.lastForwardedSourceSequence ||
      session.latestFrameSequence === null ||
      displayedFrameSequence > session.latestFrameSequence
    ) {
      return false;
    }
    session.lastForwardedSourceSequence = sourceSequence;
    await this.#write(session, { kind: "Input", ...input });
    return this.#now() - receivedAt <= INPUT_STALE_MS;
  }

  async disarm(input: DesktopInteractionDisarmInput, ownerRendererId: number): Promise<void> {
    const session = this.#requireSession(input.nativeSessionId, ownerRendererId);
    const sourceSequence = BigInt(input.sourceSequence);
    if (
      (session.activeEngagementEpoch !== input.engagementEpoch &&
        session.pendingArm?.engagementEpoch !== input.engagementEpoch) ||
      sourceSequence <= session.lastForwardedSourceSequence
    ) {
      throw new Error("Native interaction disarm does not match the active engagement fence.");
    }
    session.activeEngagementEpoch = null;
    session.pendingArm = null;
    session.lastForwardedSourceSequence = sourceSequence;
    await this.#write(session, { kind: "Disarm", ...input });
  }

  stop(input: DesktopInteractionStopInput, ownerRendererId: number): Promise<void> {
    const session = this.#requireSession(input.nativeSessionId, ownerRendererId);
    if (session.stopping !== null) return session.stopping;
    session.stopping = this.#stop(session, input);
    return session.stopping;
  }

  async #stop(session: Session, input: DesktopInteractionStopInput): Promise<void> {
    const terminal = new Promise<void>((resolve, reject) => {
      session.terminalResolve = resolve;
      session.terminalReject = reject;
    });
    this.#cancelOwner(session, input.reason);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          session.activeEngagementEpoch = null;
          session.pendingArm = null;
          await this.#write(session, { kind: "Stop", ...input });
          await terminal;
          await session.childExit;
        })(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Native interaction stop timed out.")),
            STOP_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      session.child.stdin.destroy();
      session.child.stdout.destroy();
      session.child.stderr.destroy();
      this.#killOwnedChild(session);
      if (!session.childExited) session.clearOnLateExit = true;
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (session.childExited && this.#session === session) this.#session = null;
    }
  }

  retireRenderer(ownerRendererId: number, reason: "navigation" | "disconnect"): Promise<boolean> {
    const session = this.#session;
    if (session === null || session.ownerRendererId !== ownerRendererId) {
      return Promise.resolve(false);
    }
    return this.stop({ nativeSessionId: session.nativeSessionId, reason }, ownerRendererId).then(
      () => true,
    );
  }

  #requireSession(nativeSessionId: string, ownerRendererId: number): Session {
    const session = this.#session;
    if (
      session === null ||
      session.nativeSessionId !== nativeSessionId ||
      session.ownerRendererId !== ownerRendererId
    ) {
      throw new Error("No matching native interaction session is active.");
    }
    return session;
  }

  #write(session: Session, record: HostRecord): Promise<void> {
    const header = Buffer.from(JSON.stringify(record), "utf8");
    if (header.byteLength > MAX_HEADER_BYTES)
      return Promise.reject(new Error("Interaction header is too large."));
    const prefix = Buffer.alloc(PREFIX_BYTES);
    MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(header.byteLength, 4);
    prefix.writeUInt32BE(0, 8);
    return new Promise((resolve, reject) => {
      session.child.stdin.write(Buffer.concat([prefix, header]), (error?: Error | null) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  #consume(session: Session, chunk: Buffer): void {
    if (this.#session !== session) return;
    session.buffer = Buffer.concat([session.buffer, chunk]);
    try {
      while (session.buffer.byteLength >= PREFIX_BYTES) {
        if (!session.buffer.subarray(0, 4).equals(MAGIC))
          throw new Error("Invalid interaction magic.");
        const headerLength = session.buffer.readUInt32BE(4);
        const payloadLength = session.buffer.readUInt32BE(8);
        if (headerLength > MAX_HEADER_BYTES || payloadLength > MAX_PAYLOAD_BYTES) {
          throw new Error("Interaction record exceeds its bound.");
        }
        const total = PREFIX_BYTES + headerLength + payloadLength;
        if (session.buffer.byteLength < total) return;
        const header = parseJsonWithoutDuplicateKeys(
          session.buffer.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength).toString("utf8"),
        );
        if (typeof header !== "object" || header === null || Array.isArray(header)) {
          throw new Error("Interaction header must be a JSON object.");
        }
        const body = session.buffer.subarray(PREFIX_BYTES + headerLength, total);
        session.buffer = session.buffer.subarray(total);
        this.#accept(session, header as Record<string, unknown>, body);
      }
    } catch (error) {
      this.#fail(session, error instanceof Error ? error : new Error(String(error)));
    }
  }

  #accept(session: Session, header: Record<string, unknown>, body: Buffer): void {
    if (header.nativeSessionId !== session.nativeSessionId)
      throw new Error("Native session identity changed.");
    const isFrame = header.kind === "Frame";
    if (isFrame !== body.byteLength > 0) throw new Error("Unexpected interaction payload.");
    if (
      isFrame &&
      (header.payloadLength !== body.byteLength || body.byteLength !== MAX_PAYLOAD_BYTES)
    ) {
      throw new Error("Interaction frame payload length mismatch.");
    }
    const event = decodeNativeEvent(
      isFrame ? { ...header, payload: new Uint8Array(body) } : header,
    );
    const decodedHeader = event.kind === "Frame" ? { ...event, payload: undefined } : event;
    if (!hasNoUnknownFields(header, decodedHeader))
      throw new Error("Unknown interaction record field.");
    if (
      "sourceStreamId" in event &&
      session.sourceStreamId !== null &&
      event.sourceStreamId !== session.sourceStreamId
    ) {
      throw new Error("Native source stream identity changed.");
    }
    if (event.kind === "Ready") {
      if (session.sourceStreamId !== null || session.presentationRevision !== null) {
        throw new Error("Native interaction emitted duplicate readiness.");
      }
      session.sourceStreamId = event.sourceStreamId;
      session.presentationRevision = event.presentationRevision;
    }
    if (
      event.kind !== "Ready" &&
      event.kind !== "Fault" &&
      event.kind !== "Terminal" &&
      session.presentationRevision === null
    ) {
      throw new Error("Native interaction emitted data before readiness.");
    }
    if (
      "presentationRevision" in event &&
      session.presentationRevision !== null &&
      event.presentationRevision !== session.presentationRevision
    ) {
      throw new Error("Native presentation revision changed.");
    }
    if (event.kind !== "Frame") {
      session.evidenceBytes += Buffer.byteLength(JSON.stringify(header));
      if (session.evidenceBytes > MAX_EVIDENCE_BYTES) {
        throw new Error("Interaction evidence exceeds its retention bound.");
      }
      session.evidence.push(header);
    }
    if (event.kind === "EvidenceReady") {
      if (session.evidenceReadyReceived) {
        this.#fail(session, new Error("Native interaction emitted duplicate evidence readiness."));
        return;
      }
      session.evidenceReadyReceived = true;
      void this.#commitEvidence(session).catch((error) => this.#fail(session, error));
    }
    if (event.kind === "Terminal") {
      if (
        event.outcome === "success" &&
        (!session.evidenceReadyReceived || !session.evidenceCommitted)
      ) {
        this.#fail(
          session,
          new Error("Native interaction terminated before evidence commitment completed."),
        );
        return;
      }
      this.#emit(session, event);
      if (event.outcome === "success") session.terminalResolve?.();
      else {
        this.#cancelOwner(session, event.reason);
        session.terminalReject?.(new Error(`Native interaction failed: ${event.reason}`));
      }
      return;
    }
    if (event.kind === "Frame") {
      const frameGeneration = BigInt(event.interactionGeneration);
      const frameSequence = BigInt(event.frameSequence);
      if (session.latestFrameSequence !== null && frameSequence <= session.latestFrameSequence) {
        this.#fail(session, new Error("Native frame sequence did not advance."));
        return;
      }
      session.latestFrameSequence = frameSequence;
      if (session.interactionGeneration === null) {
        session.interactionGeneration = event.interactionGeneration;
        this.#enqueueOwner(session, async () => {
          const result = await this.#observationSink.bindResource({
            schemaVersion: 1,
            operationId: `desktop-bind:${session.nativeSessionId}`,
            requestRef: session.binding.requestRef,
            requestRevision: session.binding.requestRevision,
            requestDigest: session.binding.requestDigest,
            resourceId: session.binding.resourceId,
            resourceRevision: session.binding.resourceRevision,
            threadId: session.threadId,
            presentationRevision: event.presentationRevision,
            nativeSessionId: event.nativeSessionId,
            sourceStreamId: event.sourceStreamId,
            interactionGeneration: event.interactionGeneration,
            resourceBindingProvenance: session.binding.resourceBindingProvenance,
          });
          session.ownerBound = true;
          if (result.receiptId !== null) session.lastOwnerReceiptId = result.receiptId;
        });
      } else if (frameGeneration < BigInt(session.interactionGeneration)) {
        this.#cancelOwner(session, "interaction-generation-regressed");
        this.#fail(session, new Error("Native interaction generation regressed."));
        return;
      } else {
        session.interactionGeneration = event.interactionGeneration;
      }
      const receivedAt = this.#now();
      session.queuedFrame = event;
      if (!session.frameScheduled) {
        session.frameScheduled = true;
        setTimeout(() => {
          session.frameScheduled = false;
          const frame = session.queuedFrame;
          session.queuedFrame = null;
          if (frame !== null && this.#now() - receivedAt <= FRAME_STALE_MS)
            this.#emit(session, frame);
        }, 0);
      }
      return;
    }
    if (event.kind === "Armed") {
      const pendingArm = session.pendingArm;
      if (
        pendingArm === null ||
        pendingArm.engagementEpoch !== event.engagementEpoch ||
        BigInt(event.firstAcceptedSourceSequence) <=
          BigInt(pendingArm.activationReleaseSourceSequence) ||
        session.interactionGeneration === null ||
        BigInt(event.interactionGeneration) < BigInt(session.interactionGeneration)
      ) {
        this.#fail(session, new Error("Native armed acknowledgment violates the host fence."));
        return;
      }
      session.pendingArm = null;
      session.activeEngagementEpoch = event.engagementEpoch;
      session.receiptEngagementEpoch = event.engagementEpoch;
      session.interactionGeneration = event.interactionGeneration;
      this.#enqueueOwner(session, async () => {
        if (!session.ownerBound || session.interactionGeneration === null)
          throw new Error("Native interaction armed before owner resource binding.");
        const result = await this.#observationSink.activateEngagement({
          schemaVersion: 1,
          operationId: `desktop-arm:${session.nativeSessionId}:${event.engagementEpoch}`,
          requestRef: session.binding.requestRef,
          requestRevision: session.binding.requestRevision,
          requestDigest: session.binding.requestDigest,
          resourceId: session.binding.resourceId,
          resourceRevision: session.binding.resourceRevision,
          presentationRevision: 1,
          interactionGeneration: event.interactionGeneration,
          engagementEpoch: event.engagementEpoch,
          activationReleaseConsumed: true,
        });
        if (result.receiptId !== null) session.lastOwnerReceiptId = result.receiptId;
      });
    } else if (event.kind === "InputReceipt") {
      if (session.receiptEngagementEpoch !== event.engagementEpoch) {
        this.#fail(session, new Error("Native receipt names an inactive engagement epoch."));
        return;
      }
      if (
        session.interactionGeneration === null ||
        BigInt(event.interactionGeneration) < BigInt(session.interactionGeneration)
      ) {
        this.#fail(session, new Error("Native receipt interaction generation regressed."));
        return;
      }
      session.interactionGeneration = event.interactionGeneration;
      this.#enqueueOwner(session, async () => {
        if (session.ownerQualified) return;
        if (!session.ownerBound)
          throw new Error("Native receipt arrived before the owner resource binding.");
        const result = await this.#observationSink.admitObservation({
          schemaVersion: 1,
          ...session.binding,
          hostOperationId: `desktop-observe:${session.nativeSessionId}:${event.receiptId}`,
          receipt: event,
        });
        if (result.receiptId !== null) session.lastOwnerReceiptId = result.receiptId;
        if (result.ownerState === "qualified") {
          session.ownerQualified = true;
          session.activeEngagementEpoch = null;
          void this.stop(
            { nativeSessionId: session.nativeSessionId, reason: "stop" },
            session.ownerRendererId,
          ).catch((error) =>
            this.#fail(session, error instanceof Error ? error : new Error(String(error))),
          );
        }
      });
    } else if (event.kind === "Disarmed") {
      if (session.ownerQualified) {
        session.receiptEngagementEpoch = null;
        session.lastDisarmed = event;
        this.#emit(session, event);
        return;
      }
      if (
        session.receiptEngagementEpoch === null &&
        session.lastDisarmed !== null &&
        JSON.stringify(session.lastDisarmed) === JSON.stringify(event)
      ) {
        this.#emit(session, event);
        return;
      }
      if (session.receiptEngagementEpoch !== event.engagementEpoch) {
        this.#fail(session, new Error("Native disarm names an inactive engagement epoch."));
        return;
      }
      if (
        session.interactionGeneration === null ||
        BigInt(event.interactionGeneration) < BigInt(session.interactionGeneration)
      ) {
        this.#fail(session, new Error("Native disarm interaction generation regressed."));
        return;
      }
      session.interactionGeneration = event.interactionGeneration;
      session.receiptEngagementEpoch = null;
      session.lastDisarmed = event;
      this.#enqueueOwner(session, async () => {
        if (session.interactionGeneration === null) return;
        const result = await this.#observationSink.disarmEngagement({
          schemaVersion: 1,
          operationId: `desktop-disarm:${session.nativeSessionId}:${event.engagementEpoch}`,
          requestRef: session.binding.requestRef,
          requestRevision: session.binding.requestRevision,
          requestDigest: session.binding.requestDigest,
          resourceId: session.binding.resourceId,
          resourceRevision: session.binding.resourceRevision,
          presentationRevision: 1,
          interactionGeneration: event.interactionGeneration,
          engagementEpoch: event.engagementEpoch,
          reason: event.reason,
        });
        if (result.receiptId !== null) session.lastOwnerReceiptId = result.receiptId;
      });
    }
    this.#emit(session, event);
  }

  #enqueueOwner(session: Session, operation: () => Promise<void>): void {
    const next = session.ownerQueue.then(async () => {
      if (!session.cancelled) await operation();
    });
    session.ownerQueue = next;
    void next.catch((error) => {
      this.#fail(session, error instanceof Error ? error : new Error(String(error)));
    });
  }

  #cancelOwner(session: Session, reason: string): void {
    if (session.cancelled || session.ownerQualified) return;
    session.cancelled = true;
    session.ownerQueue = session.ownerQueue
      .catch(() => undefined)
      .then(() =>
        this.#observationSink
          .cancel({
            schemaVersion: 1,
            cancellationOperationId: `desktop-cancel:${session.nativeSessionId}`,
            requestRef: session.binding.requestRef,
            requestRevision: session.binding.requestRevision,
            requestDigest: session.binding.requestDigest,
            resourceId: session.binding.resourceId,
            resourceRevision: session.binding.resourceRevision,
            reason,
          })
          .then(() => {
            session.ownerCancellationCompleted = true;
          }),
      )
      .then(
        () => undefined,
        () => undefined,
      );
  }

  #killOwnedChild(session: Session): void {
    if (session.childExited || session.childKillRequested || session.child.exitCode !== null)
      return;
    session.childKillRequested = true;
    session.child.kill("SIGKILL");
  }

  async #commitEvidence(session: Session): Promise<void> {
    const bytes = Buffer.from(
      JSON.stringify({ protocolVersion: 1, records: session.evidence }),
      "utf8",
    );
    const digest = `sha256:${NodeCrypto.createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
      throw new Error("Interaction evidence exceeds its retention bound.");
    }
    const artifactPath = NodePath.join(this.#evidenceDirectory, `${session.nativeSessionId}.json`);
    await persistEvidenceArtifact(this.#evidenceDirectory, artifactPath, bytes);
    await session.ownerQueue;
    if (session.ownerQualified) {
      if (session.lastOwnerReceiptId === null) {
        throw new Error("Qualified interaction owner did not retain its evidence receipt.");
      }
      const ownerResult = await this.#observationSink.acknowledgeEvidence({
        schemaVersion: 1,
        operationId: `desktop-evidence:${session.nativeSessionId}`,
        requestRef: session.binding.requestRef,
        requestRevision: session.binding.requestRevision,
        requestDigest: session.binding.requestDigest,
        resourceId: session.binding.resourceId,
        resourceRevision: session.binding.resourceRevision,
        ownerReceiptId: session.lastOwnerReceiptId,
        evidence: {
          ref: `interaction-evidence:${session.nativeSessionId}:${digest.slice("sha256:".length)}`,
          digest,
          byteCount: bytes.byteLength,
          mediaType: "application/vnd.t3.interaction-evidence+json",
        },
      });
      if (ownerResult.receiptId !== null) session.lastOwnerReceiptId = ownerResult.receiptId;
    } else if (!session.ownerCancellationCompleted) {
      throw new Error("Unqualified interaction owner did not complete cancellation.");
    }
    await this.#write(session, {
      kind: "EvidenceCommitted",
      nativeSessionId: session.nativeSessionId,
      artifactDigest: digest,
      artifactByteCount: String(bytes.byteLength),
    });
    session.evidenceCommitted = true;
  }

  #emit(session: Session, event: DesktopInteractionEvent): void {
    for (const listener of this.#listeners) listener(event, session.ownerRendererId);
  }

  #transportEnded(session: Session): void {
    if (session.buffer.byteLength !== 0)
      this.#fail(session, new Error("Truncated interaction record."));
  }

  #fail(session: Session, error: Error): void {
    if (!session.hostFaultEmitted) {
      session.hostFaultEmitted = true;
      this.#emit(session, {
        kind: "Fault",
        nativeSessionId: session.nativeSessionId,
        code: "desktop-host-failure",
        terminal: true,
      });
    }
    this.#cancelOwner(session, "desktop-host-failure");
    session.terminalReject?.(error);
    this.#killOwnedChild(session);
    if (this.#session === session && session.stopping === null) this.#session = null;
  }
}

export const interactionManager = new InteractionManager();
