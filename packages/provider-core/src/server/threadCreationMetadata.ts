import type { OrchestrationV2AppThread } from "@t3tools/contracts";

type ThreadCreationMetadata = Pick<
  OrchestrationV2AppThread,
  "createdBy" | "creationSource" | "creationSurface"
>;

/** Apply after copying a parent so each new thread has its own creation provenance. */
export function threadCreationMetadata(input: ThreadCreationMetadata): ThreadCreationMetadata {
  return {
    createdBy: input.createdBy,
    creationSource: input.creationSource,
    creationSurface: input.creationSurface,
  };
}
