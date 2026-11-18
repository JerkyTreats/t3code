import {
  type ChatImageAttachment,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ThreadCanvasElement,
  ThreadCanvasError,
  ThreadCanvasScene,
  type ThreadId,
} from "@t3tools/contracts";
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";

import * as Clock from "effect/Clock";
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
import { createAttachmentId, resolveAttachmentPath } from "../attachmentStore.ts";
import { type DrawInput, planDrawing } from "./threadCanvasPlan.ts";
import { chatCardsIn, describeCanvasChanges, mergeCanvasElements } from "./threadCanvasScene.ts";
import { canvasMarksSeenOnLoad } from "@t3tools/shared/threadCanvasMarks";

const EMPTY_SCENE: ThreadCanvasScene = { revision: 0, elements: [] };

/** The scene with the agent's record of the user's marks replaced; an absent one is left out. */
const withSeen = (
  scene: ThreadCanvasScene,
  seen: ThreadCanvasScene["seen"],
  seenMarks: ThreadCanvasScene["seenMarks"],
): ThreadCanvasScene => ({
  revision: scene.revision,
  elements: scene.elements,
  ...(seen === undefined ? {} : { seen }),
  ...(seenMarks === undefined ? {} : { seenMarks }),
});
const decodeScene = Schema.decodeUnknownEffect(Schema.fromJsonString(ThreadCanvasScene));
const SketchMarksJson = Schema.fromJsonString(Schema.Array(Schema.Array(Schema.String)));
const decodeSketchMarks = Schema.decodeUnknownEffect(SketchMarksJson);
const encodeSketchMarks = Schema.encodeEffect(SketchMarksJson);
// Enough ids for the agent to match a picture to the note's marks.
const SKETCH_NOTE_MAX_IDS = 10;

/** Says which marks each attached picture shows, by the ids the note gives them. */
const sketchNote = (
  pictures: ReadonlyArray<{
    readonly attachment: { readonly name: string };
    readonly marks: ReadonlyArray<string>;
  }>,
) =>
  `Each attached picture shows one area of the board around marks that have no text:\n${pictures
    .map(({ attachment, marks }) => {
      const ids = marks.slice(0, SKETCH_NOTE_MAX_IDS).map((id) => `[${id}]`);
      const more = marks.length - ids.length;
      return `- ${attachment.name}: ${ids.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
    })
    .join("\n")}`;
// Subagent thread ids embed their ancestors, so nested ones outgrow a filename.
const MAX_ENCODED_THREAD_ID_CHARS = 200;

/** What a turn tells its agent about the canvas. `acknowledge` runs once the agent has it. */
export interface ThreadCanvasDelivery {
  readonly note: string;
  readonly attachments: ReadonlyArray<ChatImageAttachment>;
  readonly acknowledge: Effect.Effect<void, ThreadCanvasError>;
}

export const EMPTY_CANVAS_DELIVERY: ThreadCanvasDelivery = {
  note: "",
  attachments: [],
  acknowledge: Effect.void,
};

/** Each thread's canvas. Clients and agents both write here, and every open client follows it. */
export class ThreadCanvasStore extends Context.Service<
  ThreadCanvasStore,
  {
    readonly read: (threadId: ThreadId) => Effect.Effect<ThreadCanvasScene, ThreadCanvasError>;
    readonly saveFromClient: (input: {
      readonly threadId: ThreadId;
      readonly elements: ReadonlyArray<ThreadCanvasElement>;
      readonly sketches?:
        | ReadonlyArray<{ readonly png: string; readonly marks: ReadonlyArray<string> }>
        | undefined;
    }) => Effect.Effect<void, ThreadCanvasError>;
    /** Builds a whole drawing into the scene, and reports where it landed and how it came out. */
    readonly draw: (
      input: DrawInput & { readonly threadId: ThreadId },
    ) => Effect.Effect<ReturnType<typeof planDrawing>["report"], ThreadCanvasError>;
    /**
     * The user's unseen canvas changes for a turn. `picture` attaches sketches of them, and
     * `delivered` names the marks a canvas_read result listed, the only ones it acknowledges.
     */
    readonly deliverToAgent: (input: {
      readonly threadId: ThreadId;
      readonly message: string;
      readonly picture: boolean;
      readonly delivered?: ReadonlySet<string> | undefined;
    }) => Effect.Effect<ThreadCanvasDelivery, ThreadCanvasError>;
    /** The board a chat's card sits on, and the card; null when no board shows it. */
    readonly chatCardOf: (
      chatThreadId: ThreadId,
    ) => Effect.Effect<{ readonly canvasThreadId: ThreadId; readonly card: string } | null>;
    /** The current scene, then every later one. */
    readonly follow: (threadId: ThreadId) => Stream.Stream<ThreadCanvasScene, ThreadCanvasError>;
  }
>()("t3/canvas/ThreadCanvasStore") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const directory = path.join(config.stateDir, "canvases");
  const writes = yield* Semaphore.make(1);
  const changes = yield* PubSub.unbounded<{
    readonly threadId: ThreadId;
    readonly scene: ThreadCanvasScene;
  }>();

  const fileStem = (threadId: ThreadId) => {
    const encoded = encodeURIComponent(threadId);
    const stem =
      encoded.length <= MAX_ENCODED_THREAD_ID_CHARS
        ? encoded
        : NodeCrypto.createHash("sha256").update(threadId).digest("hex");
    return path.join(directory, stem);
  };
  const fileFor = (threadId: ThreadId) => `${fileStem(threadId)}.json`;
  const sketchFor = (threadId: ThreadId, index: number) =>
    `${fileStem(threadId)}.sketch-${index + 1}.png`;
  // The marks each saved sketch shows, which also says how many there are.
  const sketchMarksFor = (threadId: ThreadId) => `${fileStem(threadId)}.sketches.json`;
  const failure = (message: string) => (cause: unknown) =>
    new ThreadCanvasError({ message: `${message}: ${String(cause)}` });

  const read = (threadId: ThreadId) =>
    fileSystem.readFileString(fileFor(threadId)).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(null)
            : Effect.fail(failure("Could not read the canvas")(error)),
      }),
      Effect.flatMap((contents) =>
        contents === null
          ? Effect.succeed(EMPTY_SCENE)
          : decodeScene(contents).pipe(
              Effect.mapError(failure("The saved canvas is invalid")),
              // Records made before anchors are restated against the scene they were made on.
              Effect.map((scene) => {
                const { seen, seenMarks } = canvasMarksSeenOnLoad(scene);
                return withSeen(scene, seen, seenMarks);
              }),
            ),
      ),
    );

  // Which boards show each chat as a card, by chat thread, the board written last at the end.
  const chatBoards = new Map<string, Map<ThreadId, string>>();
  const indexBoard = (canvasThreadId: ThreadId, elements: ReadonlyArray<ThreadCanvasElement>) => {
    for (const boards of chatBoards.values()) boards.delete(canvasThreadId);
    for (const [chatThreadId, card] of chatCardsIn(elements)) {
      if (chatThreadId === canvasThreadId) continue;
      const boards = chatBoards.get(chatThreadId) ?? new Map<ThreadId, string>();
      boards.set(canvasThreadId, String(card.id));
      chatBoards.set(chatThreadId, boards);
    }
  };
  // A board saved under a hashed name keeps its thread id beside it, in `<stem>.thread`.
  const indexed = yield* Effect.cached(
    Effect.gen(function* () {
      const names = yield* fileSystem.readDirectory(directory);
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const stem = path.join(directory, name.slice(0, -".json".length));
        const encoded = decodeURIComponent(name.slice(0, -".json".length)) as ThreadId;
        const canvasThreadId =
          fileStem(encoded) === stem
            ? encoded
            : ((yield* fileSystem
                .readFileString(`${stem}.thread`)
                .pipe(Effect.orElseSucceed(() => ""))) as ThreadId);
        if (canvasThreadId === "" || fileStem(canvasThreadId) !== stem) continue;
        const scene = yield* read(canvasThreadId);
        indexBoard(canvasThreadId, scene.elements);
      }
    }).pipe(Effect.ignore),
  );

  const chatCardOf: ThreadCanvasStore["Service"]["chatCardOf"] = Effect.fn(
    "ThreadCanvasStore.chatCardOf",
  )(function* (chatThreadId) {
    yield* indexed;
    const last = [...(chatBoards.get(chatThreadId) ?? [])].at(-1);
    return last === undefined ? null : { canvasThreadId: last[0], card: last[1] };
  });

  // Writes through a temp file so a crash cannot leave half a scene for the next read.
  const write = (threadId: ThreadId, scene: ThreadCanvasScene) => {
    const file = fileFor(threadId);
    const temp = `${file}.${scene.revision}.tmp`;
    return fileSystem.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fileSystem.writeFileString(temp, JSON.stringify(scene))),
      Effect.andThen(fileSystem.rename(temp, file)),
      Effect.andThen(
        path.basename(fileStem(threadId)) === encodeURIComponent(threadId) ||
          chatCardsIn(scene.elements).size === 0
          ? Effect.void
          : fileSystem.writeFileString(`${fileStem(threadId)}.thread`, threadId),
      ),
      Effect.mapError(failure("Could not save the canvas")),
      Effect.tap(() => Effect.sync(() => indexBoard(threadId, scene.elements))),
      Effect.andThen(PubSub.publish(changes, { threadId, scene })),
      Effect.asVoid,
    );
  };

  const saveFromClient: ThreadCanvasStore["Service"]["saveFromClient"] = (input) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const sketches = input.sketches;
        if (sketches !== undefined) {
          yield* fileSystem.makeDirectory(directory, { recursive: true }).pipe(
            Effect.andThen(
              Effect.forEach(
                sketches,
                (sketch, index) =>
                  fileSystem.writeFile(
                    sketchFor(input.threadId, index),
                    Buffer.from(sketch.png, "base64"),
                  ),
                { discard: true },
              ),
            ),
            Effect.andThen(encodeSketchMarks(sketches.map((sketch) => sketch.marks))),
            Effect.flatMap((marks) =>
              fileSystem.writeFileString(sketchMarksFor(input.threadId), marks),
            ),
            Effect.mapError(failure("Could not save the canvas sketches")),
          );
        }
        const current = yield* read(input.threadId);
        const { elements, changed } = mergeCanvasElements(current.elements, input.elements);
        // An unchanged save publishes nothing, which ends the client's save and reload echo.
        if (!changed) return;
        yield* write(input.threadId, { ...current, revision: current.revision + 1, elements });
      }),
    );

  const draw: ThreadCanvasStore["Service"]["draw"] = ({ threadId, ...input }) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* read(threadId);
        const { elements, seen, seenMarks, report } = planDrawing({
          scene: current,
          draw: input,
          randomInt: () => NodeCrypto.randomInt(2 ** 31),
          now: yield* Clock.currentTimeMillis,
        });
        yield* write(threadId, {
          ...withSeen(current, seen, seenMarks),
          revision: current.revision + 1,
          elements,
        });
        return report;
      }),
    );

  // A missing or oversized sketch only costs the agent that picture, never its turn.
  const attachSketch = Effect.fn("ThreadCanvasStore.attachSketch")(
    function* (threadId: ThreadId, source: string, name: string) {
      const { size } = yield* fileSystem.stat(source);
      const id = createAttachmentId(threadId, ".png");
      if (id === null || size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) return [];
      const attachment: ChatImageAttachment = {
        type: "image",
        id,
        name,
        mimeType: "image/png",
        sizeBytes: Number(size),
      };
      const target = resolveAttachmentPath({
        attachmentsDir: config.attachmentsDir,
        attachment,
      });
      if (target === null) return [];
      yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
      yield* fileSystem.copyFile(source, target);
      return [attachment];
    },
    Effect.orElseSucceed((): ReadonlyArray<ChatImageAttachment> => []),
  );

  const attachSketches = Effect.fn("ThreadCanvasStore.attachSketches")(function* (
    threadId: ThreadId,
  ) {
    const areas = yield* fileSystem.readFileString(sketchMarksFor(threadId)).pipe(
      Effect.flatMap(decodeSketchMarks),
      Effect.orElseSucceed((): ReadonlyArray<ReadonlyArray<string>> => []),
    );
    const pictures: Array<{
      readonly attachment: ChatImageAttachment;
      readonly marks: ReadonlyArray<string>;
    }> = [];
    for (const [index, marks] of areas.entries()) {
      const name = `canvas-sketch-${pictures.length + 1}.png`;
      for (const attachment of yield* attachSketch(threadId, sketchFor(threadId, index), name)) {
        pictures.push({ attachment, marks });
      }
    }
    return pictures;
  });

  // Merged at write time, so each chat on a board records only the marks it was told about.
  const acknowledge = (
    threadId: ThreadId,
    changes: {
      readonly seenMarks: Readonly<Record<string, string>>;
      readonly forget: ReadonlyArray<string>;
    },
  ) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* read(threadId);
        const forgotten = new Set(changes.forget);
        const keep = (id: string) => !forgotten.has(id) && changes.seenMarks[id] === undefined;
        // A mark's old version stamp goes once its content stamp is recorded.
        const seen = Object.fromEntries(
          Object.entries(current.seen ?? {}).filter(([id]) => keep(id)),
        );
        const seenMarks = {
          ...Object.fromEntries(
            Object.entries(current.seenMarks ?? {}).filter(([id]) => !forgotten.has(id)),
          ),
          ...changes.seenMarks,
        };
        yield* write(threadId, {
          ...withSeen(current, Object.keys(seen).length === 0 ? undefined : seen, seenMarks),
          revision: current.revision + 1,
        });
      }),
    );

  const deliverToAgent: ThreadCanvasStore["Service"]["deliverToAgent"] = Effect.fn(
    "ThreadCanvasStore.deliverToAgent",
  )(function* (input) {
    // A chat placed on another thread's board hears the marks around its card there.
    const placed = yield* chatCardOf(input.threadId);
    const canvasThreadId = placed?.canvasThreadId ?? input.threadId;
    const changes = describeCanvasChanges(
      yield* read(canvasThreadId),
      input.message,
      placed === null ? null : input.threadId,
      input.delivered,
    );
    if (changes.note === "") return EMPTY_CANVAS_DELIVERY;
    const pictures = input.picture && changes.sketched ? yield* attachSketches(canvasThreadId) : [];
    return {
      note: pictures.length === 0 ? changes.note : `${changes.note}\n\n${sketchNote(pictures)}`,
      attachments: pictures.map((picture) => picture.attachment),
      acknowledge: acknowledge(canvasThreadId, changes),
    };
  });

  const follow: ThreadCanvasStore["Service"]["follow"] = (threadId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribing before the read means no change can fall between the two.
        const subscription = yield* PubSub.subscribe(changes);
        const initial = yield* read(threadId);
        return Stream.make(initial).pipe(
          Stream.concat(
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((change) => change.threadId === threadId),
              Stream.map((change) => change.scene),
            ),
          ),
        );
      }),
    );

  return ThreadCanvasStore.of({ read, saveFromClient, draw, deliverToAgent, chatCardOf, follow });
});

export const layer = Layer.effect(ThreadCanvasStore, make);

/** For tests whose turns never touch a canvas. */
export const layerNoChanges = Layer.mock(ThreadCanvasStore)({
  deliverToAgent: () => Effect.succeed(EMPTY_CANVAS_DELIVERY),
  chatCardOf: () => Effect.succeed(null),
});
