import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";

export const sourceControlQueryKeys = {
  all: ["source-control"] as const,
  discovery: () => ["source-control", "discovery"] as const,
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
