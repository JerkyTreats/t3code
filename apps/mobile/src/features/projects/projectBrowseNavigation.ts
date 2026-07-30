import type { AddProjectRemoteSource } from "@t3tools/client-runtime/operations/projects";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { createBrowseNavigationCoordinator } from "@t3tools/client-runtime/state/filesystem";
import type { EnvironmentId } from "@t3tools/contracts";

function createContextOwnedBrowseNavigationCoordinator<Context>(
  contextKey: (context: Context) => string,
) {
  const coordinator = createBrowseNavigationCoordinator();
  let activeContextKey: string | null = null;

  return {
    updateContext(context: Context): void {
      const nextContextKey = contextKey(context);
      if (nextContextKey === activeContextKey) {
        return;
      }
      activeContextKey = nextContextKey;
      coordinator.invalidate();
    },
    invalidate(): void {
      coordinator.invalidate();
    },
    run: coordinator.run,
  };
}

export function createProjectDestinationNavigationCoordinator() {
  return createContextOwnedBrowseNavigationCoordinator(
    (input: {
      readonly environmentId: EnvironmentId | null;
      readonly source: AddProjectRemoteSource;
      readonly connectionPhase: EnvironmentConnectionPhase | null;
      readonly baseDirectory: string | null;
      readonly repositoryQuery: string;
    }) =>
      JSON.stringify([
        input.environmentId,
        input.source,
        input.connectionPhase,
        input.baseDirectory,
        input.repositoryQuery,
      ]),
  );
}

export function createProjectFolderNavigationCoordinator() {
  return createContextOwnedBrowseNavigationCoordinator(
    (input: {
      readonly environmentId: EnvironmentId;
      readonly connectionPhase: EnvironmentConnectionPhase;
      readonly platform: string;
      readonly pathInput: string;
    }) =>
      JSON.stringify([input.environmentId, input.connectionPhase, input.platform, input.pathInput]),
  );
}
