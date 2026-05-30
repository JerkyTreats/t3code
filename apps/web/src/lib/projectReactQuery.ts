import type {
  EnvironmentId,
  ProjectListDirectoryResult,
  ProjectSearchEntriesResult,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureEnvironmentApi } from "~/environmentApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  searchEntries: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    query: string,
    limit: number,
  ) => ["projects", "search-entries", environmentId ?? null, cwd, query, limit] as const,
  listDirectory: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    directoryPath: string | null,
    limit: number,
  ) => ["projects", "list-directory", environmentId ?? null, cwd, directoryPath, limit] as const,
  readFile: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    relativePath: string | null,
  ) => ["projects", "read-file", environmentId ?? null, cwd, relativePath] as const,
};

const DEFAULT_DIRECTORY_LIST_LIMIT = 200;
const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_PROJECT_READ_FILE_STALE_TIME = 5_000;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const EMPTY_DIRECTORY_LIST_RESULT: ProjectListDirectoryResult = {
  entries: [],
  truncated: false,
};
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};

export function projectListDirectoryQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  directoryPath: string | null;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_DIRECTORY_LIST_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.listDirectory(
      input.environmentId,
      input.cwd,
      input.directoryPath,
      limit,
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace directory listing is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.listDirectory({
        cwd: input.cwd,
        directoryPath: input.directoryPath,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null && input.cwd !== null,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_DIRECTORY_LIST_RESULT,
  });
}

export function projectReadFileQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  relativePath: string | null;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: projectQueryKeys.readFile(input.environmentId, input.cwd, input.relativePath),
    queryFn: async () => {
      if (!input.cwd || !input.relativePath || !input.environmentId) {
        throw new Error("Workspace file preview is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.readFile({
        cwd: input.cwd,
        relativePath: input.relativePath,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      typeof input.relativePath === "string" &&
      input.relativePath.trim().length > 0,
    staleTime: input.staleTime ?? DEFAULT_PROJECT_READ_FILE_STALE_TIME,
  });
}

export function projectSearchEntriesQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.environmentId, input.cwd, input.query, limit),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace entry search is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}
