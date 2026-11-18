import {
  PAGE_STATE_MAX_DOCUMENT_BYTES,
  PAGE_STATE_MAX_DOCUMENTS,
  type PageStateDocument,
  PageStateError,
  type ThreadId,
} from "@t3tools/contracts";
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { delegatorOf } from "./delegator.ts";

const StoredDocument = Schema.fromJsonString(
  Schema.Struct({
    value: Schema.Json,
    revision: Schema.Int,
    updatedBy: Schema.Literals(["agent", "user"]),
  }),
);
const decodeStored = Schema.decodeUnknownEffect(StoredDocument);
const encodeStored = Schema.encodeEffect(StoredDocument);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * RFC 7386: objects merge key by key, null removes a key, anything else replaces. Results have no
 * prototype, so a "__proto__" key is data like any other.
 */
function applyJsonMergePatch(target: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return patch;
  const merged: Record<string, unknown> = Object.create(null);
  if (isObject(target)) for (const [key, value] of Object.entries(target)) merged[key] = value;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = applyJsonMergePatch(merged[key], value);
  }
  return merged;
}

export interface PageStateWrite {
  readonly threadId: ThreadId;
  readonly key: string;
  readonly set?: Schema.Json | undefined;
  readonly merge?: Schema.Json | undefined;
  readonly expectedRevision?: number | undefined;
  readonly by: "agent" | "user";
}

/**
 * A thread's page state: named JSON documents the pages T3 renders read and write through
 * `t3.state`, and agents through `page_state`. A delegated task's state is its delegator's.
 */
export class PageStateStore extends Context.Service<
  PageStateStore,
  {
    /** The thread whose state a thread uses: its delegator's for a delegated task. */
    readonly ownerOf: (threadId: ThreadId) => Effect.Effect<ThreadId, PageStateError>;
    readonly list: (
      threadId: ThreadId,
    ) => Effect.Effect<ReadonlyArray<PageStateDocument>, PageStateError>;
    readonly get: (
      threadId: ThreadId,
      key: string,
    ) => Effect.Effect<PageStateDocument, PageStateError>;
    readonly write: (input: PageStateWrite) => Effect.Effect<PageStateDocument, PageStateError>;
    /** The document now, then each later write of it. */
    readonly follow: (
      threadId: ThreadId,
      key: string,
    ) => Stream.Stream<PageStateDocument, PageStateError>;
  }
>()("t3/pageState/PageStateStore") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const directory = path.join(config.stateDir, "page-state");
  const writes = yield* Semaphore.make(1);
  const changes = yield* PubSub.unbounded<{
    readonly threadId: ThreadId;
    readonly document: PageStateDocument;
  }>();

  const storage = () =>
    new PageStateError({ reason: "storage", message: "Could not access page state." });

  // Only a thread that exists has state; past it, unreadable lineage leaves a thread its own.
  const ownerOf = Effect.fn("PageStateStore.ownerOf")(function* (threadId: ThreadId) {
    const shell = yield* orchestrator.getThreadShell(threadId).pipe(Effect.mapError(storage));
    if (shell === null) {
      return yield* new PageStateError({ reason: "invalid", message: "No such thread." });
    }
    return yield* delegatorOf(threadId, (id) =>
      id === threadId
        ? Effect.succeed(shell.lineage)
        : orchestrator.getThreadShell(id).pipe(
            Effect.map((parent) => (parent === null ? null : parent.lineage)),
            Effect.orElseSucceed(() => null),
          ),
    );
  });
  // A hash names each thread's directory, so no thread id can name another path.
  const threadDirectory = (threadId: ThreadId) => {
    const resolved = path.join(
      directory,
      NodeCrypto.createHash("sha256").update(threadId).digest("hex"),
    );
    if (path.dirname(resolved) !== directory) throw new Error("Page state path escaped its store.");
    return resolved;
  };
  const fileFor = (threadId: ThreadId, key: string) =>
    path.join(threadDirectory(threadId), `${key}.json`);

  const readOwned = (threadId: ThreadId, key: string) =>
    fileSystem.readFileString(fileFor(threadId, key)).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound" ? Effect.succeed(null) : Effect.fail(storage()),
      }),
      Effect.flatMap((contents) =>
        contents === null
          ? Effect.succeed<PageStateDocument>({ key, value: null, revision: 0 })
          : decodeStored(contents).pipe(
              Effect.map((stored): PageStateDocument => ({ key, ...stored })),
              Effect.mapError(storage),
            ),
      ),
    );

  const keysOf = (threadId: ThreadId) =>
    fileSystem.readDirectory(threadDirectory(threadId)).pipe(
      Effect.map((names) =>
        names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)),
      ),
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(storage()),
      }),
    );

  const list: PageStateStore["Service"]["list"] = Effect.fn("PageStateStore.list")(
    function* (threadId) {
      const owner = yield* ownerOf(threadId);
      const keys = yield* keysOf(owner);
      return yield* Effect.forEach(keys.toSorted(), (key) => readOwned(owner, key));
    },
  );

  const get: PageStateStore["Service"]["get"] = Effect.fn("PageStateStore.get")(
    function* (threadId, key) {
      return yield* readOwned(yield* ownerOf(threadId), key);
    },
  );

  const write: PageStateStore["Service"]["write"] = Effect.fn("PageStateStore.write")(
    function* (input) {
      if ((input.set === undefined) === (input.merge === undefined)) {
        return yield* new PageStateError({
          reason: "invalid",
          message: "Send set or merge, not both.",
        });
      }
      const owner = yield* ownerOf(input.threadId);
      return yield* writes.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* readOwned(owner, input.key);
          if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
            return yield* new PageStateError({
              reason: "conflict",
              message: `${input.key} is at revision ${current.revision}, not ${input.expectedRevision}.`,
              revision: current.revision,
            });
          }
          if (current.revision === 0 && (yield* keysOf(owner)).length >= PAGE_STATE_MAX_DOCUMENTS) {
            return yield* new PageStateError({
              reason: "full",
              message: `This thread already keeps ${PAGE_STATE_MAX_DOCUMENTS} page state documents.`,
            });
          }
          const value =
            input.set !== undefined ? input.set : applyJsonMergePatch(current.value, input.merge);
          const document = {
            value: value as Schema.Json,
            revision: current.revision + 1,
            updatedBy: input.by,
          };
          const json = yield* encodeStored(document).pipe(
            Effect.mapError(
              () => new PageStateError({ reason: "invalid", message: `${input.key} is not JSON.` }),
            ),
          );
          if (Buffer.byteLength(json) > PAGE_STATE_MAX_DOCUMENT_BYTES) {
            return yield* new PageStateError({
              reason: "too_large",
              message: `${input.key} would exceed ${PAGE_STATE_MAX_DOCUMENT_BYTES / 1024} KB.`,
            });
          }
          // Through a temp file so a crash cannot leave half a document for the next read.
          const file = fileFor(owner, input.key);
          const temp = `${file}.${document.revision}.tmp`;
          yield* fileSystem
            .makeDirectory(threadDirectory(owner), { recursive: true })
            .pipe(
              Effect.andThen(fileSystem.writeFileString(temp, json)),
              Effect.andThen(fileSystem.rename(temp, file)),
              Effect.mapError(storage),
            );
          const written: PageStateDocument = { key: input.key, ...document };
          yield* PubSub.publish(changes, { threadId: owner, document: written });
          return written;
        }),
      );
    },
  );

  const follow: PageStateStore["Service"]["follow"] = (threadId, key) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const owner = yield* ownerOf(threadId);
        // Subscribing before the read means no write can fall between the two.
        const subscription = yield* PubSub.subscribe(changes);
        const initial = yield* readOwned(owner, key);
        return Stream.make(initial).pipe(
          Stream.concat(
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((change) => change.threadId === owner && change.document.key === key),
              Stream.map((change) => change.document),
            ),
          ),
        );
      }),
    );

  return PageStateStore.of({ ownerOf, list, get, write, follow });
});

export const layer = Layer.effect(PageStateStore, make);
