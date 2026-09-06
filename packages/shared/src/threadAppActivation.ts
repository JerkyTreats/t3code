import type {
  ThreadAppActivation,
  ThreadAppActivationCompletion,
} from "@t3tools/contracts/threadAppActivation";

const MAX_DRAFT_BYTES = 32 * 1024;
const LAUNCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function decodeThreadAppActivation(value: unknown): ThreadAppActivation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("T3 Thread activation is invalid.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    record.contractVersion !== 1 ||
    typeof record.launchId !== "string" ||
    !LAUNCH_ID.test(record.launchId) ||
    !keys.every((key) => key === "contractVersion" || key === "launchId" || key === "draft") ||
    keys.length < 2 ||
    keys.length > 3 ||
    (Object.hasOwn(record, "draft") &&
      (typeof record.draft !== "string" ||
        new TextEncoder().encode(record.draft).byteLength > MAX_DRAFT_BYTES ||
        record.draft.includes("\0")))
  ) {
    throw new Error("T3 Thread activation is invalid.");
  }
  return record as ThreadAppActivation;
}

export function parseThreadAppActivation(text: string): ThreadAppActivation {
  if (new TextEncoder().encode(text).byteLength > 64 * 1024) {
    throw new Error("T3 Thread activation is too large.");
  }
  return decodeThreadAppActivation(JSON.parse(text));
}

export function decodeThreadAppActivationCompletion(value: unknown): ThreadAppActivationCompletion {
  const activation = decodeThreadAppActivation(value);
  if (Object.keys(activation).length !== 2) {
    throw new Error("T3 Thread activation completion is invalid.");
  }
  return { contractVersion: activation.contractVersion, launchId: activation.launchId };
}
