import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ThreadCanvasElement,
  ThreadCanvasScene,
  ThreadId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { type RefObject, useEffect } from "react";

import { useAtomCommand } from "../state/use-atom-command";
import { threadCanvasSave, threadCanvasScene } from "../state/threadCanvas";

export interface ThreadCanvasTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export type SaveThreadCanvas = (
  elements: ReadonlyArray<ThreadCanvasElement>,
  sketch?: string,
) => Promise<unknown>;

/** Keeps a board on its thread's server scene. Draft boards have no scene, so this mounts apart. */
export function ThreadCanvasSync(props: {
  readonly target: ThreadCanvasTarget;
  readonly onScene: (scene: ThreadCanvasScene) => void;
  readonly saveRef: RefObject<SaveThreadCanvas | null>;
}) {
  const { environmentId, threadId } = props.target;
  const { onScene, saveRef } = props;
  const result = useAtomValue(threadCanvasScene({ environmentId, input: { threadId } }));
  const scene = AsyncResult.isSuccess(result) ? result.value : null;
  const save = useAtomCommand(threadCanvasSave, { reportFailure: false });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands the save command to the board, whose scene lives outside React
  useEffect(() => {
    saveRef.current = (elements, sketch) =>
      save({
        environmentId,
        input: {
          threadId,
          elements,
          ...(sketch === undefined ? {} : { sketch }),
        },
      });
  }, [environmentId, save, saveRef, threadId]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes each server scene into the external Excalidraw scene
  useEffect(() => {
    if (scene !== null) onScene(scene);
  }, [onScene, scene]);

  return null;
}
