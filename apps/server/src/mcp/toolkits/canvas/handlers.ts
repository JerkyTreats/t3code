import { OrchestratorMcpFailure, type ThreadCanvasError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { describeCanvas } from "../../../canvas/threadCanvasScene.ts";
import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { CanvasToolkit } from "./tools.ts";

const toFailure = (error: ThreadCanvasError) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message });

export const layer = McpToolAccess.toLayer(CanvasToolkit, {
  canvas_read: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "canvas_read");
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const scene = yield* canvas.read(thread.threadId).pipe(Effect.mapError(toFailure));
      const delivery = yield* canvas
        .deliverToAgent({ threadId: thread.threadId, message: "", picture: false })
        .pipe(Effect.mapError(toFailure));
      yield* delivery.acknowledge.pipe(Effect.mapError(toFailure));
      return describeCanvas(scene);
    }),
  ),
  canvas_update: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "canvas_update");
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      return yield* canvas
        .draw({ threadId: thread.threadId, ...input })
        .pipe(Effect.mapError(toFailure));
    }),
  ),
});
