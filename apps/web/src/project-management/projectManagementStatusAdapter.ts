import type { VcsStatusResult } from "@t3tools/contracts";

import type { ProjectManagementRepositoryStatusInput } from "./projectManagementTypes";

export function mapVcsStatusToProjectRepositoryStatus(
  status: VcsStatusResult | null,
): ProjectManagementRepositoryStatusInput | null {
  if (!status) {
    return null;
  }

  return {
    isRepo: status.isRepo,
    hasOriginRemote: status.hasPrimaryRemote,
    branch: status.refName,
    hasWorkingTreeChanges: status.hasWorkingTreeChanges,
    changedFileCount: status.workingTree.files.length,
    hasUpstream: status.hasUpstream,
    aheadCount: status.aheadCount,
    behindCount: status.behindCount,
  };
}
