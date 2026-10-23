import * as Schema from "effect/Schema";

import { strictStruct } from "./baseSchemas.ts";

export const THREAD_APP_CONTRACT_VERSION = 1 as const;
export const THREAD_APP_ACTIVATION_MAX_BYTES = 64 * 1024;

const ThreadAppLaunchId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
);

const ThreadAppDraft = Schema.String.check(
  Schema.makeFilter(
    (text) =>
      new TextEncoder().encode(text).byteLength <= 32 * 1024 || "Message text exceeds 32 KiB.",
  ),
  Schema.makeFilter((text) => !text.includes("\0") || "Message text must not contain NUL."),
);

const ThreadAppWorkingDirectory = Schema.String.check(
  Schema.makeFilter(
    (path) =>
      (path.startsWith("/") &&
        !path.includes("\0") &&
        new TextEncoder().encode(path).byteLength <= 4096) ||
      "Working directory must be an absolute POSIX path of at most 4096 UTF-8 bytes without NUL.",
  ),
);

export const ThreadAppActivation = Schema.Struct({
  contractVersion: Schema.Literal(THREAD_APP_CONTRACT_VERSION),
  launchId: ThreadAppLaunchId,
  draft: Schema.optionalKey(ThreadAppDraft),
  workingDirectory: Schema.optionalKey(ThreadAppWorkingDirectory),
}).pipe(strictStruct);
export type ThreadAppActivation = typeof ThreadAppActivation.Type;

export const ThreadAppReadyAck = Schema.Struct({
  contractVersion: Schema.Literal(THREAD_APP_CONTRACT_VERSION),
  launchId: ThreadAppLaunchId,
  ready: Schema.Literal(true),
}).pipe(strictStruct);
export type ThreadAppReadyAck = typeof ThreadAppReadyAck.Type;

export const ThreadAppActivationCompletion = Schema.Struct({
  contractVersion: Schema.Literal(THREAD_APP_CONTRACT_VERSION),
  launchId: ThreadAppLaunchId,
}).pipe(strictStruct);
export type ThreadAppActivationCompletion = typeof ThreadAppActivationCompletion.Type;
