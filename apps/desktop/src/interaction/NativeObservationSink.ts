// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import type { DesktopInteractionEvent } from "@t3tools/contracts";

import {
  sanitizedChildEnvironment,
  verifyExecutableArtifact,
  type InteractionChild,
} from "./InteractionCapability.ts";

export const INTERACTION_OWNER_BINARY_PATH_CONFIG = "T3_INTERACTION_OWNER_BINARY_PATH";
export const INTERACTION_OWNER_BINARY_SHA256_CONFIG = "T3_INTERACTION_OWNER_BINARY_SHA256";
export const INTERACTION_OWNER_STATE_ROOT_CONFIG = "T3_INTERACTION_OWNER_STATE_ROOT";
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const OWNER_OPERATION_TIMEOUT_MS = 2_000;
const OWNER_DISPOSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  "resource-bind": new Set(["bound", "duplicate"]),
  "engagement-activate": new Set(["activated", "duplicate"]),
  "observation-admit": new Set(["progress", "qualified", "duplicate"]),
  "engagement-disarm": new Set(["disarmed", "duplicate"]),
  "evidence-ack": new Set(["evidence_acknowledged", "duplicate"]),
  "request-cancel": new Set(["cancelled", "duplicate"]),
};

type InputReceipt = Extract<DesktopInteractionEvent, { readonly kind: "InputReceipt" }>;

export interface NativeObservationBinding {
  readonly requestRef: string;
  readonly requestRevision: string;
  readonly requestDigest: string;
  readonly resourceId: string;
  readonly resourceRevision: number;
  readonly conditionRevision: string;
  readonly resourceBindingProvenance: "synthetic" | "physical";
}

export interface InteractionObservationEnvelopeV1 extends NativeObservationBinding {
  readonly schemaVersion: 1;
  readonly hostOperationId: string;
  readonly receipt: InputReceipt;
}

export interface OwnerResultV1 {
  readonly schemaVersion: 1;
  readonly operation: string;
  readonly disposition: string;
  readonly requestRef: string;
  readonly requestRevision: string | null;
  readonly requestDigest: string | null;
  readonly ownerState: string | null;
  readonly receiptId: string | null;
  readonly evidenceRef: string | null;
  readonly evidenceDigest: string | null;
  readonly reason: string | null;
  readonly publicationAttemptCount: number;
  readonly publicationEffectCount: number;
}

export interface NativeObservationSink {
  readonly ready: () => Promise<void>;
  readonly bindResource: (input: Readonly<Record<string, unknown>>) => Promise<OwnerResultV1>;
  readonly activateEngagement: (input: Readonly<Record<string, unknown>>) => Promise<OwnerResultV1>;
  readonly admitObservation: (envelope: InteractionObservationEnvelopeV1) => Promise<OwnerResultV1>;
  readonly disarmEngagement: (input: Readonly<Record<string, unknown>>) => Promise<OwnerResultV1>;
  readonly acknowledgeEvidence: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<OwnerResultV1>;
  readonly cancel: (input: Readonly<Record<string, unknown>>) => Promise<OwnerResultV1>;
}

interface NativeObservationSinkConfig {
  readonly binaryPath: string | undefined;
  readonly expectedSha256: string | undefined;
  readonly stateRoot: string | undefined;
  readonly environment?: NodeJS.ProcessEnv;
  readonly spawnProcess?: (
    binaryPath: string,
    arguments_: readonly string[],
    options: NodeChildProcess.SpawnOptionsWithoutStdio,
  ) => InteractionChild;
}

function decodeOwnerResult(raw: unknown): OwnerResultV1 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Interaction owner returned a non-object result.");
  }
  const value = raw as Record<string, unknown>;
  const expectedKeys = new Set([
    "schemaVersion",
    "operation",
    "disposition",
    "requestRef",
    "requestRevision",
    "requestDigest",
    "ownerState",
    "receiptId",
    "evidenceRef",
    "evidenceDigest",
    "reason",
    "publicationAttemptCount",
    "publicationEffectCount",
  ]);
  const nullableString = (key: string) => value[key] === null || typeof value[key] === "string";
  if (
    Object.keys(value).some((key) => !expectedKeys.has(key)) ||
    value.schemaVersion !== 1 ||
    typeof value.operation !== "string" ||
    typeof value.disposition !== "string" ||
    typeof value.requestRef !== "string" ||
    !nullableString("requestRevision") ||
    !nullableString("requestDigest") ||
    !(
      value.ownerState === null ||
      [
        "pending",
        "engaged",
        "qualified",
        "resolution_pending",
        "completed",
        "cancelled",
        "expired",
        "failed",
      ].includes(String(value.ownerState))
    ) ||
    !nullableString("receiptId") ||
    !nullableString("evidenceRef") ||
    !nullableString("evidenceDigest") ||
    !nullableString("reason") ||
    !Number.isSafeInteger(value.publicationAttemptCount) ||
    !Number.isSafeInteger(value.publicationEffectCount)
  ) {
    throw new Error("Interaction owner returned an invalid result.");
  }
  return value as unknown as OwnerResultV1;
}

export function makeNativeObservationSink(
  config: NativeObservationSinkConfig,
): NativeObservationSink {
  const resolveBinding = async () => {
    const binaryPath = await verifyExecutableArtifact(
      config.binaryPath,
      config.expectedSha256,
      INTERACTION_OWNER_BINARY_PATH_CONFIG,
      INTERACTION_OWNER_BINARY_SHA256_CONFIG,
    );
    const stateRoot = config.stateRoot;
    if (stateRoot === undefined || !NodePath.isAbsolute(stateRoot)) {
      throw new Error(`${INTERACTION_OWNER_STATE_ROOT_CONFIG} must name an absolute directory.`);
    }
    const stat = await NodeFSP.lstat(stateRoot);
    if (!stat.isDirectory()) throw new Error("Interaction owner state root must be a directory.");
    return { binaryPath, stateRoot };
  };

  const invoke = async (operation: string, inputValue: object): Promise<OwnerResultV1> => {
    const { binaryPath, stateRoot } = await resolveBinding();
    const input = Buffer.from(`${JSON.stringify(inputValue)}\n`, "utf8");
    if (input.byteLength > MAX_INPUT_BYTES)
      throw new Error("Interaction observation is too large.");
    const spawnProcess = config.spawnProcess ?? NodeChildProcess.spawn;
    const child = spawnProcess(binaryPath, [operation, "--state-root", stateRoot, "--input", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: sanitizedChildEnvironment(config.environment ?? NodeProcess.env),
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk: Buffer | Uint8Array) => {
      const bytes = Buffer.from(chunk);
      outputBytes += bytes.byteLength;
      if (outputBytes <= MAX_OUTPUT_BYTES) output.push(bytes);
    });
    child.stderr.on("data", () => undefined);
    child.stdin.end(input);
    const exitCode = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        reject(new Error("Interaction owner admission timed out."));
      }, OWNER_OPERATION_TIMEOUT_MS);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code ?? 1);
      });
    });
    if (outputBytes > MAX_OUTPUT_BYTES) throw new Error("Interaction owner result is too large.");
    const lines = Buffer.concat(output).toString("utf8").trimEnd().split("\n");
    if (lines.length !== 1) throw new Error("Interaction owner must return exactly one JSON line.");
    const raw = JSON.parse(lines[0]!);
    if (exitCode === 2) {
      const disposition =
        typeof raw === "object" && raw !== null && "disposition" in raw
          ? String(raw.disposition)
          : "rejected";
      throw new Error(`Interaction owner rejected observation: ${disposition}.`);
    }
    if (exitCode !== 0) throw new Error(`Interaction owner exited with code ${exitCode}.`);
    const result = decodeOwnerResult(raw);
    const expectedRequestRef = Reflect.get(inputValue, "requestRef");
    const expectedRequestRevision = Reflect.get(inputValue, "requestRevision");
    const expectedRequestDigest = Reflect.get(inputValue, "requestDigest");
    if (
      result.operation !== operation ||
      !OWNER_DISPOSITIONS[operation]?.has(result.disposition) ||
      result.requestRef !== expectedRequestRef ||
      result.requestRevision !== expectedRequestRevision ||
      result.requestDigest !== expectedRequestDigest
    ) {
      throw new Error("Interaction owner result does not match the admitted operation.");
    }
    return result;
  };

  return {
    ready: async () => {
      await resolveBinding();
    },
    bindResource: (input) => invoke("resource-bind", input),
    activateEngagement: (input) => invoke("engagement-activate", input),
    admitObservation: (input) => invoke("observation-admit", input),
    disarmEngagement: (input) => invoke("engagement-disarm", input),
    acknowledgeEvidence: (input) => invoke("evidence-ack", input),
    cancel: (input) => invoke("request-cancel", input),
  };
}

export const nativeObservationSink = makeNativeObservationSink({
  binaryPath: NodeProcess.env[INTERACTION_OWNER_BINARY_PATH_CONFIG],
  expectedSha256: NodeProcess.env[INTERACTION_OWNER_BINARY_SHA256_CONFIG],
  stateRoot: NodeProcess.env[INTERACTION_OWNER_STATE_ROOT_CONFIG],
});
