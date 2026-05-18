import type {
  SourceControlCloneRepositoryInput,
  SourceControlPublishRepositoryInput,
  SourceControlRepositoryLookupInput,
} from "@t3tools/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";
import { invalidateGitQueries } from "./gitReactQuery";

export const sourceControlQueryKeys = {
  all: ["source-control"] as const,
  discovery: () => ["source-control", "discovery"] as const,
  lookupRepository: () => ["source-control", "lookup-repository"] as const,
  cloneRepository: () => ["source-control", "clone-repository"] as const,
  publishRepository: (cwd: string | null) => ["source-control", "publish-repository", cwd] as const,
};

export function sourceControlDiscoveryQueryOptions() {
  return queryOptions({
    queryKey: sourceControlQueryKeys.discovery(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.discoverSourceControl();
    },
    staleTime: 30_000,
  });
}

export function sourceControlLookupRepositoryMutationOptions() {
  return mutationOptions({
    mutationKey: sourceControlQueryKeys.lookupRepository(),
    mutationFn: async (input: SourceControlRepositoryLookupInput) => {
      const api = ensureNativeApi();
      return api.sourceControl.lookupRepository(input);
    },
  });
}

export function sourceControlCloneRepositoryMutationOptions() {
  return mutationOptions({
    mutationKey: sourceControlQueryKeys.cloneRepository(),
    mutationFn: async (input: SourceControlCloneRepositoryInput) => {
      const api = ensureNativeApi();
      return api.sourceControl.cloneRepository(input);
    },
  });
}

export function sourceControlPublishRepositoryMutationOptions(input: {
  readonly cwd: string | null;
  readonly queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: sourceControlQueryKeys.publishRepository(input.cwd),
    mutationFn: async (payload: SourceControlPublishRepositoryInput) => {
      const api = ensureNativeApi();
      return api.sourceControl.publishRepository(payload);
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}
