import type { AddProjectRemoteSource } from "@t3tools/client-runtime/operations/projects";
import { createBrowseNavigationCoordinator } from "@t3tools/client-runtime/state/filesystem";
import type { EnvironmentId } from "@t3tools/contracts";

export function createProjectDestinationNavigationCoordinator() {
  const coordinator = createBrowseNavigationCoordinator();
  let contextKey: string | null = null;

  return {
    updateContext(input: {
      readonly environmentId: EnvironmentId | null;
      readonly source: AddProjectRemoteSource;
    }): void {
      const nextContextKey = JSON.stringify([input.environmentId, input.source]);
      if (nextContextKey === contextKey) {
        return;
      }
      contextKey = nextContextKey;
      coordinator.invalidate();
    },
    invalidate(): void {
      coordinator.invalidate();
    },
    run: coordinator.run,
  };
}
