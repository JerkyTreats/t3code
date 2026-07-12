import { randomUUID } from "node:crypto";

import { sanitizeBranchFragment } from "@t3tools/shared/git";
import { selectOriginRemoteName } from "./originOnlySourceControlPolicy.ts";

const PROMOTE_BACKUP_BRANCH_PREFIX = "t3code/promote-backup";

export function parseRemoteNames(stdout: string): string[] {
  return stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseRemoteRefWithRemoteNames(
  remoteRef: string | null | undefined,
  remoteNames: ReadonlyArray<string>,
): { remoteName: string; remoteBranch: string } | null {
  const trimmed = remoteRef?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }

  const sortedRemoteNames = [...remoteNames].toSorted((left, right) => right.length - left.length);
  for (const remoteName of sortedRemoteNames) {
    if (!trimmed.startsWith(`${remoteName}/`)) {
      continue;
    }

    const remoteBranch = trimmed.slice(remoteName.length + 1).trim();
    if (remoteBranch.length > 0) {
      return {
        remoteName,
        remoteBranch,
      };
    }
  }

  return null;
}

export function createPromoteBackupBranchName(sourceBranch: string): string {
  const branchFragment = sanitizeBranchFragment(sourceBranch).trim() || "branch";
  return `${PROMOTE_BACKUP_BRANCH_PREFIX}/${branchFragment}/${randomUUID().slice(0, 8)}`;
}

export function choosePromotePushRemoteName(input: {
  remoteNames: ReadonlyArray<string>;
  upstreamRef: string | null;
  branchPushRemote: string | null;
  pushDefaultRemote: string | null;
}): string | null {
  return selectOriginRemoteName(input.remoteNames);
}
