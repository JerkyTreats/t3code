import {
  IsoDateTime,
  isWorkspaceCanvasId,
  type ProjectId,
  ThreadCanvasError,
  type ThreadId,
  WORKSPACE_CANVAS_ID_PREFIX,
  WorkspaceCanvasError,
  WorkspaceCanvasId,
  WorkspaceCanvasList,
  type WorkspaceCanvasRecord,
  workspaceCanvasThreadId,
} from "@t3tools/contracts";
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";

import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as ResourceCleanupService from "../orchestration-v2/ResourceCleanupService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ThreadCanvasStore from "./ThreadCanvasStore.ts";

const DEFAULT_TITLE = "Untitled canvas";

const decodeList = Schema.decodeUnknownEffect(Schema.fromJsonString(WorkspaceCanvasList));

/**
 * Project-scoped Workspace Canvases. Stored outside `stateDir/canvases/` so ThreadCanvasStore's
 * startup scene scan never mistakes the index for a board scene. A canvas's board is a
 * ThreadCanvasStore scene under its id; deleting the canvas, or its project, deletes the board
 * and the terminals and browser tabs opened on it, never the chats pinned to it.
 */
export class WorkspaceCanvasStore extends Context.Service<
  WorkspaceCanvasStore,
  {
    readonly list: Effect.Effect<ReadonlyArray<WorkspaceCanvasRecord>, WorkspaceCanvasError>;
    readonly get: (
      canvasId: WorkspaceCanvasId,
    ) => Effect.Effect<WorkspaceCanvasRecord | null, WorkspaceCanvasError>;
    readonly create: (input: {
      readonly projectId: ProjectId;
      readonly title?: string | undefined;
    }) => Effect.Effect<WorkspaceCanvasRecord, WorkspaceCanvasError>;
    readonly rename: (input: {
      readonly canvasId: WorkspaceCanvasId;
      readonly title: string;
    }) => Effect.Effect<WorkspaceCanvasRecord, WorkspaceCanvasError>;
    readonly remove: (canvasId: WorkspaceCanvasId) => Effect.Effect<void, WorkspaceCanvasError>;
    /** Removes every canvas of a project, as deleting the project does. */
    readonly removeForProject: (projectId: ProjectId) => Effect.Effect<void, WorkspaceCanvasError>;
    /**
     * Runs a write to board `threadId`. A workspace canvas board must still be listed, and stays
     * listed until the write ends, so no client or agent write can bring a deleted one back.
     * Any other board's write runs as it is.
     */
    readonly writeBoard: <A, E, R>(
      threadId: ThreadId,
      write: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ThreadCanvasError, R>;
    readonly follow: Stream.Stream<WorkspaceCanvasList, WorkspaceCanvasError>;
  }
>()("t3/canvas/WorkspaceCanvasStore") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const threadCanvas = yield* ThreadCanvasStore.ThreadCanvasStore;
  const resources = yield* ResourceCleanupService.ResourceCleanupService;
  const indexFile = path.join(config.stateDir, "workspace-canvases.json");
  const writes = yield* Semaphore.make(1);
  const changes = yield* PubSub.unbounded<WorkspaceCanvasList>();

  const failure = (message: string) => (cause: unknown) =>
    new WorkspaceCanvasError({ message: `${message}: ${String(cause)}` });

  // An index that no longer decodes is moved aside, so the canvases start over instead of
  // every read failing until someone edits the file by hand.
  const setAside = Effect.fn("WorkspaceCanvasStore.setAside")(function* (cause: unknown) {
    // Timestamped, and never over an earlier one moved aside in the same millisecond.
    const aside = `${indexFile}.corrupt-${yield* Clock.currentTimeMillis}-${NodeCrypto.randomUUID().slice(0, 8)}`;
    // Another read may have moved it first.
    yield* fileSystem.rename(indexFile, aside).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.void
            : Effect.fail(failure("Could not move the invalid workspace canvas index")(error)),
      }),
    );
    yield* Effect.logWarning(
      `The workspace canvas index was invalid and was moved to ${path.basename(aside)}.`,
      cause,
    );
    return { canvases: [] } satisfies WorkspaceCanvasList;
  });

  const readIndex = <E>(
    onInvalid: (cause: unknown) => Effect.Effect<WorkspaceCanvasList, WorkspaceCanvasError | E>,
  ) =>
    fileSystem.readFileString(indexFile).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(null)
            : Effect.fail(failure("Could not read workspace canvases")(error)),
      }),
      Effect.flatMap((contents) =>
        contents === null
          ? Effect.succeed<WorkspaceCanvasList>({ canvases: [] })
          : decodeList(contents).pipe(Effect.catch(onInvalid)),
      ),
    );
  // For callers holding the write permit: an invalid index is moved aside here.
  const readLocked = readIndex(setAside);
  // For everyone else: an invalid index is read again under the permit before it is moved, so a
  // read that raced a repair never moves the repaired index away.
  const readAll = readIndex(() => writes.withPermits(1)(readLocked));

  const writeAll = (canvases: ReadonlyArray<WorkspaceCanvasRecord>) => {
    const payload: WorkspaceCanvasList = { canvases };
    const temp = `${indexFile}.${NodeCrypto.randomUUID()}.tmp`;
    return fileSystem
      .makeDirectory(path.dirname(indexFile), { recursive: true })
      .pipe(
        Effect.andThen(fileSystem.writeFileString(temp, JSON.stringify(payload, null, 2))),
        Effect.andThen(fileSystem.rename(temp, indexFile)),
        Effect.mapError(failure("Could not save workspace canvases")),
        Effect.andThen(PubSub.publish(changes, payload)),
        Effect.as(payload),
      );
  };

  const list: WorkspaceCanvasStore["Service"]["list"] = readAll.pipe(
    Effect.map((data) => data.canvases),
  );

  const get: WorkspaceCanvasStore["Service"]["get"] = (canvasId) =>
    list.pipe(Effect.map((canvases) => canvases.find((canvas) => canvas.id === canvasId) ?? null));

  const create: WorkspaceCanvasStore["Service"]["create"] = (input) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* readLocked;
        const now = IsoDateTime.make(DateTime.formatIso(yield* DateTime.now));
        const title = input.title?.trim() || DEFAULT_TITLE;
        const record: WorkspaceCanvasRecord = {
          id: WorkspaceCanvasId.make(`${WORKSPACE_CANVAS_ID_PREFIX}${NodeCrypto.randomUUID()}`),
          projectId: input.projectId,
          title,
          createdAt: now,
          updatedAt: now,
        };
        yield* writeAll([record, ...current.canvases]);
        return record;
      }),
    );

  const rename: WorkspaceCanvasStore["Service"]["rename"] = (input) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* readLocked;
        const existing = current.canvases.find((canvas) => canvas.id === input.canvasId);
        if (existing === undefined) {
          return yield* new WorkspaceCanvasError({
            message: `Workspace canvas not found: ${input.canvasId}`,
          });
        }
        const now = IsoDateTime.make(DateTime.formatIso(yield* DateTime.now));
        const updated: WorkspaceCanvasRecord = {
          ...existing,
          title: input.title.trim() || existing.title,
          updatedAt: now,
        };
        yield* writeAll(
          current.canvases.map((canvas) => (canvas.id === input.canvasId ? updated : canvas)),
        );
        return updated;
      }),
    );

  // The board goes first: a failure leaves the canvas listed, so deleting it again finishes.
  // Terminals and browser tabs are best effort, as a deleted thread's are.
  const removeBoards = (canvasIds: ReadonlyArray<WorkspaceCanvasId>) =>
    Effect.forEach(
      canvasIds,
      (canvasId) =>
        Effect.gen(function* () {
          const boardId = workspaceCanvasThreadId(canvasId);
          yield* threadCanvas
            .remove(boardId)
            .pipe(Effect.mapError(failure("Could not remove workspace canvas scene")));
          yield* Effect.all(
            [resources.cleanupTerminals(boardId), resources.cleanupPreviews(boardId)],
            {
              discard: true,
            },
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(`Could not close everything open on ${canvasId}.`, cause),
            ),
          );
        }),
      { discard: true },
    );

  const removeWhere = (
    doomed: (canvas: WorkspaceCanvasRecord) => boolean,
    alsoBoards: ReadonlyArray<WorkspaceCanvasId> = [],
  ) =>
    writes.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* readLocked;
        const removed = current.canvases.filter(doomed).map((canvas) => canvas.id);
        yield* removeBoards([...new Set([...removed, ...alsoBoards])]);
        if (removed.length > 0) {
          yield* writeAll(current.canvases.filter((canvas) => !doomed(canvas)));
        }
      }),
    );

  // An unlisted id still clears any scene left behind under it.
  const remove: WorkspaceCanvasStore["Service"]["remove"] = (canvasId) =>
    removeWhere((canvas) => canvas.id === canvasId, [canvasId]);

  const removeForProject: WorkspaceCanvasStore["Service"]["removeForProject"] = (projectId) =>
    removeWhere((canvas) => canvas.projectId === projectId);

  const writeBoard: WorkspaceCanvasStore["Service"]["writeBoard"] = (threadId, write) =>
    isWorkspaceCanvasId(threadId)
      ? writes.withPermits(1)(
          Effect.gen(function* () {
            const listed = yield* readLocked.pipe(
              Effect.map((data) => data.canvases.some((canvas) => canvas.id === threadId)),
              Effect.mapError((error) => new ThreadCanvasError({ message: error.message })),
            );
            if (!listed) {
              return yield* new ThreadCanvasError({
                message: "This workspace canvas was deleted.",
              });
            }
            return yield* write;
          }),
        )
      : write;

  const follow: WorkspaceCanvasStore["Service"]["follow"] = Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(changes);
      const initial = yield* readAll;
      return Stream.make(initial).pipe(Stream.concat(Stream.fromSubscription(subscription)));
    }),
  );

  return WorkspaceCanvasStore.of({
    list,
    get,
    create,
    rename,
    remove,
    removeForProject,
    writeBoard,
    follow,
  });
});

export const layer = Layer.effect(WorkspaceCanvasStore, make);

/**
 * Deletes a project's canvases when the project is deleted. Every listing is checked too, so the
 * canvases of a project deleted while the server was down go at start, and one created by a
 * request that lands after its project's deletion goes as soon as it is listed.
 */
export const layerProjectCleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* WorkspaceCanvasStore;
    const projects = yield* ProjectService.ProjectService;
    const logFailure = Effect.catchCause((cause) =>
      Effect.logWarning("Could not remove a deleted project's workspace canvases.", cause),
    );
    const deleted = new Set<ProjectId>();
    // Checked once each; a later deletion arrives through the subscription.
    const active = new Set<ProjectId>();
    const isDeleted = Effect.fn("WorkspaceCanvasStore.isDeletedProject")(function* (
      projectId: ProjectId,
    ) {
      if (deleted.has(projectId)) return true;
      if (active.has(projectId)) return false;
      const project = yield* projects.getById(projectId, { includeDeleted: true });
      if (Option.isSome(project) && project.value.deletedAt !== null) {
        deleted.add(projectId);
        return true;
      }
      active.add(projectId);
      return false;
    });
    // Both subscribed before either runs, so no deletion or listing falls between them.
    const deletions = yield* projects.subscribeDeletions;
    const listings = yield* Stream.toPull(store.follow);
    yield* Effect.forkScoped(
      Stream.runForEach(deletions, (projectId) =>
        Effect.sync(() => {
          active.delete(projectId);
          deleted.add(projectId);
        }).pipe(Effect.andThen(store.removeForProject(projectId)), logFailure),
      ),
    );
    yield* Effect.forkScoped(
      Effect.forever(
        listings.pipe(
          Effect.flatMap((batch) =>
            Effect.forEach(
              new Set(batch.flatMap((list) => list.canvases.map((canvas) => canvas.projectId))),
              (projectId) =>
                isDeleted(projectId).pipe(
                  Effect.flatMap((gone) =>
                    gone ? store.removeForProject(projectId) : Effect.void,
                  ),
                  logFailure,
                ),
              { discard: true },
            ),
          ),
        ),
      ).pipe(Effect.ignore),
    );
  }),
);
