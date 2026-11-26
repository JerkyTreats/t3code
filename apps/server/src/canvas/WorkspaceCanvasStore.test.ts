import {
  ProjectId,
  ThreadId,
  isWorkspaceCanvasId,
  workspaceCanvasThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import { expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import * as ResourceCleanupService from "../orchestration-v2/ResourceCleanupService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ThreadCanvasStore from "./ThreadCanvasStore.ts";
import * as WorkspaceCanvasStore from "./WorkspaceCanvasStore.ts";

const closed: Array<string> = [];
const goneProjectId = ProjectId.make("proj-deleted-while-down");

const makeTestLayer = () => {
  const base = ServerConfig.layerTest(process.cwd(), { prefix: "t3-workspace-canvas-test-" }).pipe(
    Layer.provideMerge(NodeServices.layer),
  );
  const threadCanvas = ThreadCanvasStore.layer.pipe(Layer.provideMerge(base));
  const resources = Layer.succeed(ResourceCleanupService.ResourceCleanupService, {
    cleanupScheduledTasks: () => Effect.void,
    cleanupTerminals: (threadId) => Effect.sync(() => void closed.push(`terminals:${threadId}`)),
    cleanupPreviews: (threadId) => Effect.sync(() => void closed.push(`previews:${threadId}`)),
    cleanupDevices: () => Effect.void,
    cleanupAttachments: () => Effect.void,
  });
  return WorkspaceCanvasStore.layer.pipe(
    Layer.provideMerge(threadCanvas),
    Layer.provideMerge(resources),
  );
};

const card = (threadId: ThreadId, version = 1) => ({
  id: "card-chat-1",
  type: "rectangle",
  x: 100,
  y: 120,
  width: 484,
  height: 624,
  version,
  versionNonce: version,
  customData: {
    t3Card: {
      kind: "surface",
      surface: { kind: "side-chat", threadId },
      title: "Peer chat",
    },
  },
});

it.layer(makeTestLayer())("WorkspaceCanvasStore", (it) => {
  it.effect("creates, lists, renames, persists across restart, and removes cleanly", () =>
    Effect.gen(function* () {
      const store = yield* WorkspaceCanvasStore.WorkspaceCanvasStore;
      const threadCanvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const projectId = ProjectId.make("proj-1");

      // A missing index is an empty list.
      expect(yield* store.list).toEqual([]);

      const created = yield* store.create({ projectId, title: "Architecture Board" });
      expect(isWorkspaceCanvasId(created.id)).toBe(true);
      expect(created.projectId).toBe(projectId);
      expect(created.title).toBe("Architecture Board");

      const renamed = yield* store.rename({
        canvasId: created.id,
        title: "Spatial IDE Board",
      });
      expect(renamed.title).toBe("Spatial IDE Board");

      // Pin a chat card onto the workspace canvas and verify ThreadCanvasStore indexes it.
      const boardThreadId = workspaceCanvasThreadId(created.id);
      const chatThreadId = ThreadId.make("chat-peer-1");
      yield* store.writeBoard(
        boardThreadId,
        threadCanvas.saveFromClient({ threadId: boardThreadId, elements: [card(chatThreadId)] }),
      );
      expect(yield* threadCanvas.chatCardOf(chatThreadId)).toEqual({
        canvasThreadId: boardThreadId,
        card: "card-chat-1",
      });

      // Fresh store instance reads persisted index from stateDir/workspace-canvases.json.
      const restarted = yield* WorkspaceCanvasStore.WorkspaceCanvasStore.pipe(
        Effect.provide(Layer.fresh(WorkspaceCanvasStore.layer)),
      );
      expect(yield* restarted.get(created.id)).toMatchObject({
        id: created.id,
        projectId,
        title: "Spatial IDE Board",
      });

      // Removing the canvas deletes its metadata, its board, its chat routing and what was
      // open on it; the pinned chat itself is not touched.
      closed.length = 0;
      yield* store.remove(created.id);
      expect(yield* store.list).toEqual([]);
      expect(yield* threadCanvas.chatCardOf(chatThreadId)).toBeNull();
      expect((yield* threadCanvas.read(boardThreadId)).elements).toEqual([]);
      expect(closed.toSorted()).toEqual([
        `previews:${boardThreadId}`,
        `terminals:${boardThreadId}`,
      ]);
    }),
  );

  it.effect("rejects writes to a deleted canvas's board without bringing it back", () =>
    Effect.gen(function* () {
      const store = yield* WorkspaceCanvasStore.WorkspaceCanvasStore;
      const threadCanvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const created = yield* store.create({ projectId: ProjectId.make("proj-late") });
      const boardThreadId = workspaceCanvasThreadId(created.id);
      const chatThreadId = ThreadId.make("chat-peer-late");
      yield* store.remove(created.id);

      // A stale client's save and an agent's draw both arrive after the delete.
      const save = yield* Effect.exit(
        store.writeBoard(
          boardThreadId,
          threadCanvas.saveFromClient({ threadId: boardThreadId, elements: [card(chatThreadId)] }),
        ),
      );
      const draw = yield* Effect.exit(
        store.writeBoard(
          boardThreadId,
          threadCanvas.draw({
            threadId: boardThreadId,
            drawingId: "late",
            shapes: [{ id: "box", type: "rectangle", x: 0, y: 0 }],
          }),
        ),
      );
      expect(Exit.isFailure(save)).toBe(true);
      expect(Exit.isFailure(draw)).toBe(true);
      expect(yield* store.list).toEqual([]);
      expect((yield* threadCanvas.read(boardThreadId)).elements).toEqual([]);
      expect(yield* threadCanvas.chatCardOf(chatThreadId)).toBeNull();

      // The same holds after a restart, when the board is unknown to the new process.
      const restartedCanvas = yield* ThreadCanvasStore.ThreadCanvasStore.pipe(
        Effect.provide(Layer.fresh(ThreadCanvasStore.layer)),
      );
      const restarted = yield* WorkspaceCanvasStore.WorkspaceCanvasStore.pipe(
        Effect.provide(
          Layer.fresh(WorkspaceCanvasStore.layer).pipe(
            Layer.provide(Layer.succeed(ThreadCanvasStore.ThreadCanvasStore, restartedCanvas)),
          ),
        ),
      );
      const afterRestart = yield* Effect.exit(
        restarted.writeBoard(
          boardThreadId,
          restartedCanvas.saveFromClient({
            threadId: boardThreadId,
            elements: [card(chatThreadId, 2)],
          }),
        ),
      );
      expect(Exit.isFailure(afterRestart)).toBe(true);
      expect((yield* restartedCanvas.read(boardThreadId)).elements).toEqual([]);
      expect(yield* restartedCanvas.chatCardOf(chatThreadId)).toBeNull();

      // Ordinary thread boards are not gated.
      const thread = ThreadId.make("thread-ordinary-board");
      yield* store.writeBoard(
        thread,
        threadCanvas.saveFromClient({ threadId: thread, elements: [{ id: "note", version: 1 }] }),
      );
      expect((yield* threadCanvas.read(thread)).elements).toHaveLength(1);
    }),
  );

  it.effect("moves an unreadable index aside and starts over", () =>
    Effect.gen(function* () {
      const store = yield* WorkspaceCanvasStore.WorkspaceCanvasStore;
      const fileSystem = yield* FileSystem.FileSystem;
      const { stateDir } = yield* ServerConfig.ServerConfig;
      const indexFile = `${stateDir}/workspace-canvases.json`;
      const asideFiles = fileSystem
        .readDirectory(stateDir)
        .pipe(
          Effect.map((names) =>
            names.filter((name) => name.startsWith("workspace-canvases.json.corrupt-")),
          ),
        );

      for (const contents of ["{not json", JSON.stringify({ canvases: [{ id: "nope" }] })]) {
        const before = (yield* asideFiles).length;
        yield* fileSystem.writeFileString(indexFile, contents);
        expect(yield* store.list).toEqual([]);
        expect(yield* asideFiles).toHaveLength(before + 1);
        expect(yield* fileSystem.exists(indexFile)).toBe(false);
      }

      const created = yield* store.create({ projectId: ProjectId.make("proj-recovered") });
      expect((yield* store.list).map((canvas) => canvas.id)).toEqual([created.id]);
      yield* store.remove(created.id);
    }),
  );

  it.effect("streams workspace canvas updates through follow()", () =>
    Effect.gen(function* () {
      const store = yield* WorkspaceCanvasStore.WorkspaceCanvasStore;
      const updates = yield* Stream.toPull(store.follow);
      expect((yield* updates)[0].canvases).toEqual([]);
      const created = yield* store.create({
        projectId: ProjectId.make("proj-stream"),
        title: "Live Stream Board",
      });
      expect((yield* updates)[0].canvases.map((canvas) => canvas.id)).toEqual([created.id]);
      yield* store.remove(created.id);
    }).pipe(Effect.scoped),
  );

  it.effect("removes a project's canvases when the project is deleted, and only those", () =>
    Effect.gen(function* () {
      const store = yield* WorkspaceCanvasStore.WorkspaceCanvasStore;
      const deletedProjects = yield* PubSub.unbounded<ProjectId>();
      const doomedProject = ProjectId.make("proj-doomed");
      const keptProject = ProjectId.make("proj-kept");
      const doomed = yield* store.create({ projectId: doomedProject });
      const kept = yield* store.create({ projectId: keptProject });
      // Left behind by a project deleted while the server was down.
      const stale = yield* store.create({ projectId: goneProjectId });

      const updates = yield* Stream.toPull(store.follow);
      yield* updates;
      yield* Layer.build(
        WorkspaceCanvasStore.layerProjectCleanup.pipe(
          Layer.provide(
            Layer.mock(ProjectService.ProjectService)({
              subscribeDeletions: PubSub.subscribe(deletedProjects).pipe(
                Effect.map(Stream.fromSubscription),
              ),
              getById: (projectId) =>
                Effect.succeed(
                  projectId === goneProjectId
                    ? Option.some({ deletedAt: "2026-11-25T00:00:00.000Z" } as never)
                    : Option.none(),
                ),
            }),
          ),
          Layer.provide(Layer.succeed(WorkspaceCanvasStore.WorkspaceCanvasStore, store)),
        ),
      );
      // The start-up sweep removes the stale canvas.
      expect((yield* updates)[0].canvases.map((canvas) => canvas.id).toSorted()).toEqual(
        [doomed.id, kept.id].toSorted(),
      );

      // Each listing the store publishes, in order, until one matches.
      const listingWhere = (
        matches: (ids: ReadonlyArray<string>) => boolean,
      ): Effect.Effect<ReadonlyArray<string>, Effect.Error<typeof updates>> =>
        updates.pipe(
          Effect.flatMap((batch) => {
            const found = batch
              .map((list) => list.canvases.map((canvas) => canvas.id))
              .find(matches);
            return found === undefined ? listingWhere(matches) : Effect.succeed(found);
          }),
        );

      yield* PubSub.publish(deletedProjects, doomedProject);
      expect((yield* updates)[0].canvases.map((canvas) => canvas.id)).toEqual([kept.id]);
      expect(stale.projectId).toBe(goneProjectId);

      // A create that lands after its project's deletion is listed, then removed.
      const late = yield* store.create({ projectId: doomedProject });
      yield* listingWhere((ids) => ids.includes(late.id));
      expect(yield* listingWhere((ids) => !ids.includes(late.id))).toEqual([kept.id]);
      yield* store.remove(kept.id);
    }).pipe(Effect.scoped),
  );
});
