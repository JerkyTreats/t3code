import { useAtomValue } from "@effect/atom-react";
import { type EnvironmentId, WS_METHODS, type WorkspaceCanvasRecord } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

const workspaceCanvasesList = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:workspace-canvas:list",
  tag: WS_METHODS.subscribeWorkspaceCanvases,
});

export const workspaceCanvasCreate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:workspace-canvas:create",
  tag: WS_METHODS.workspaceCanvasCreate,
});

export const workspaceCanvasRename = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:workspace-canvas:rename",
  tag: WS_METHODS.workspaceCanvasRename,
});

export const workspaceCanvasDelete = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:workspace-canvas:delete",
  tag: WS_METHODS.workspaceCanvasDelete,
});

const EMPTY_CANVASES_ATOM = Atom.make(
  AsyncResult.success({ canvases: [] as ReadonlyArray<WorkspaceCanvasRecord> }),
).pipe(Atom.withLabel("environment-data:workspace-canvas:empty"));

const EMPTY_INPUT = {} as const;

/**
 * An environment's Workspace Canvases. `loaded` once the server has listed them; `failed` when it
 * cannot, as an older linked server without canvases cannot, which leaves the list empty.
 */
export function useEnvironmentWorkspaceCanvases(environmentId: EnvironmentId | null): {
  readonly canvases: ReadonlyArray<WorkspaceCanvasRecord>;
  readonly loaded: boolean;
  readonly failed: boolean;
} {
  const result = useAtomValue(
    environmentId === null
      ? EMPTY_CANVASES_ATOM
      : workspaceCanvasesList({ environmentId, input: EMPTY_INPUT }),
  );
  // A failure after a listing keeps the last list, so a dropped connection hides nothing.
  const listed = AsyncResult.value(result);
  if (Option.isSome(listed)) {
    return { canvases: listed.value.canvases, loaded: true, failed: false };
  }
  return { canvases: [], loaded: false, failed: AsyncResult.isFailure(result) };
}
