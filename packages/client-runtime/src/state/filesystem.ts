import { type FilesystemBrowseEntry, WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentConnectionPhase } from "../connection/presentation.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  canNavigateUp,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  hasTrailingPathSeparator,
  isFilesystemBrowseQuery,
} from "./projects.ts";

export function resolveFilesystemBrowsePath(query: string, platform = "", enabled = true) {
  const isBrowsing = enabled && isFilesystemBrowseQuery(query, platform);
  const directoryPath = isBrowsing ? getBrowseDirectoryPath(query) : "";
  const filterQuery =
    isBrowsing && !hasTrailingPathSeparator(query) ? getBrowseLeafPathSegment(query) : "";
  return {
    isBrowsing,
    directoryPath,
    filterQuery,
    parentPath: isBrowsing ? getBrowseParentPath(directoryPath) : null,
    canBrowseUp: isBrowsing && canNavigateUp(directoryPath),
  };
}

export function filterFilesystemBrowseEntries(
  entries: ReadonlyArray<FilesystemBrowseEntry>,
  query: string,
) {
  const normalizedQuery = query.toLowerCase();
  const includeHidden = query.startsWith(".");
  const visibleEntries = entries.filter(
    (entry) =>
      entry.name.toLowerCase().startsWith(normalizedQuery) &&
      (includeHidden || !entry.name.startsWith(".")),
  );
  return {
    visibleEntries,
    exactEntry:
      query.length > 0 ? (visibleEntries.find((entry) => entry.name === query) ?? null) : null,
  };
}

export function createBrowseNavigationCoordinator() {
  let generation = 0;
  return {
    invalidate(): void {
      generation += 1;
    },
    async run(load: () => Promise<unknown>, commit: () => void): Promise<boolean> {
      const navigationGeneration = ++generation;
      await load();
      if (navigationGeneration !== generation) return false;
      commit();
      return true;
    },
  };
}

export function canPreloadBrowsePath(
  connectionPhase: EnvironmentConnectionPhase | null | undefined,
): boolean {
  return connectionPhase === "connected";
}

export function createFilesystemEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    browse: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:filesystem:browse",
      tag: WS_METHODS.filesystemBrowse,
    }),
  };
}
