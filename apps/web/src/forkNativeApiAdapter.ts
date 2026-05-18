import type { GitActionProgressEvent, NativeApi } from "@t3tools/contracts";

import type { WsRpcClient } from "./wsRpcClient";

export interface NativeApiCapabilities {
  readonly git: {
    readonly runStackedAction: boolean;
    readonly actionProgress: boolean;
    readonly mergeBranches: boolean;
    readonly abortMerge: boolean;
    readonly repositoryContext: boolean;
  };
  readonly github: {
    readonly status: boolean;
    readonly login: boolean;
    readonly listIssues: boolean;
    readonly createIssue: boolean;
    readonly closeIssue: boolean;
    readonly reopenIssue: boolean;
  };
  readonly sourceControl: {
    readonly lookupRepository: boolean;
    readonly cloneRepository: boolean;
    readonly publishRepository: boolean;
  };
}

export type NativeApiFeature =
  | "git.runStackedAction"
  | "git.actionProgress"
  | "git.mergeBranches"
  | "git.abortMerge"
  | "git.repositoryContext"
  | "github.status"
  | "github.login"
  | "github.listIssues"
  | "github.createIssue"
  | "github.closeIssue"
  | "github.reopenIssue"
  | "sourceControl.lookupRepository"
  | "sourceControl.cloneRepository"
  | "sourceControl.publishRepository";

export const FULL_NATIVE_API_CAPABILITIES: NativeApiCapabilities = {
  git: {
    runStackedAction: true,
    actionProgress: true,
    mergeBranches: true,
    abortMerge: true,
    repositoryContext: true,
  },
  github: {
    status: true,
    login: true,
    listIssues: true,
    createIssue: true,
    closeIssue: true,
    reopenIssue: true,
  },
  sourceControl: {
    lookupRepository: true,
    cloneRepository: true,
    publishRepository: true,
  },
};

export const RPC_NATIVE_API_CAPABILITIES: NativeApiCapabilities = {
  git: {
    runStackedAction: true,
    actionProgress: true,
    mergeBranches: true,
    abortMerge: true,
    repositoryContext: true,
  },
  github: {
    status: true,
    login: true,
    listIssues: true,
    createIssue: true,
    closeIssue: true,
    reopenIssue: true,
  },
  sourceControl: {
    lookupRepository: true,
    cloneRepository: true,
    publishRepository: true,
  },
};

export function resolveNativeApiCapabilities(hasEmbeddedNativeApi: boolean): NativeApiCapabilities {
  if (!hasEmbeddedNativeApi) {
    return RPC_NATIVE_API_CAPABILITIES;
  }
  const embeddedSourceControl =
    typeof window === "undefined" ? undefined : window.nativeApi?.sourceControl;
  return {
    ...FULL_NATIVE_API_CAPABILITIES,
    sourceControl: {
      lookupRepository: Boolean(embeddedSourceControl?.lookupRepository),
      cloneRepository: Boolean(embeddedSourceControl?.cloneRepository),
      publishRepository: Boolean(embeddedSourceControl?.publishRepository),
    },
  };
}

const nativeApiFeatureSelectors: Record<
  NativeApiFeature,
  (capabilities: NativeApiCapabilities) => boolean
> = {
  "git.runStackedAction": (capabilities) => capabilities.git.runStackedAction,
  "git.actionProgress": (capabilities) => capabilities.git.actionProgress,
  "git.mergeBranches": (capabilities) => capabilities.git.mergeBranches,
  "git.abortMerge": (capabilities) => capabilities.git.abortMerge,
  "git.repositoryContext": (capabilities) => capabilities.git.repositoryContext,
  "github.status": (capabilities) => capabilities.github.status,
  "github.login": (capabilities) => capabilities.github.login,
  "github.listIssues": (capabilities) => capabilities.github.listIssues,
  "github.createIssue": (capabilities) => capabilities.github.createIssue,
  "github.closeIssue": (capabilities) => capabilities.github.closeIssue,
  "github.reopenIssue": (capabilities) => capabilities.github.reopenIssue,
  "sourceControl.lookupRepository": (capabilities) => capabilities.sourceControl.lookupRepository,
  "sourceControl.cloneRepository": (capabilities) => capabilities.sourceControl.cloneRepository,
  "sourceControl.publishRepository": (capabilities) => capabilities.sourceControl.publishRepository,
};

const nativeApiFeatureUnavailableMessages: Record<NativeApiFeature, string> = {
  "git.runStackedAction": "Git actions are unavailable on the current transport.",
  "git.actionProgress": "Git action progress is unavailable on the current transport.",
  "git.mergeBranches": "Git merge is unavailable on the current transport.",
  "git.abortMerge": "Git merge abort is unavailable on the current transport.",
  "git.repositoryContext": "Git repository context is unavailable on the current transport.",
  "github.status": "GitHub integration is unavailable on the current transport.",
  "github.login": "GitHub login is unavailable on the current transport.",
  "github.listIssues": "GitHub issue listing is unavailable on the current transport.",
  "github.createIssue": "Creating GitHub issues is unavailable on the current transport.",
  "github.closeIssue": "Closing GitHub issues is unavailable on the current transport.",
  "github.reopenIssue": "Reopening GitHub issues is unavailable on the current transport.",
  "sourceControl.lookupRepository":
    "Source control repository lookup is unavailable on the current transport.",
  "sourceControl.cloneRepository":
    "Source control repository clone is unavailable on the current transport.",
  "sourceControl.publishRepository":
    "Source control repository publish is unavailable on the current transport.",
};

export function hasNativeApiFeature(
  capabilities: NativeApiCapabilities,
  feature: NativeApiFeature,
): boolean {
  return nativeApiFeatureSelectors[feature](capabilities);
}

export function getNativeApiFeatureUnavailableMessage(feature: NativeApiFeature): string {
  return nativeApiFeatureUnavailableMessages[feature];
}

export function supportsNativeApiGitMerge(capabilities: NativeApiCapabilities): boolean {
  return (
    hasNativeApiFeature(capabilities, "git.mergeBranches") &&
    hasNativeApiFeature(capabilities, "git.abortMerge")
  );
}

export function supportsNativeApiGitHub(capabilities: NativeApiCapabilities): boolean {
  return (
    hasNativeApiFeature(capabilities, "github.status") &&
    hasNativeApiFeature(capabilities, "github.login") &&
    hasNativeApiFeature(capabilities, "github.listIssues") &&
    hasNativeApiFeature(capabilities, "github.createIssue") &&
    hasNativeApiFeature(capabilities, "github.closeIssue") &&
    hasNativeApiFeature(capabilities, "github.reopenIssue")
  );
}

export function supportsNativeApiSourceControl(capabilities: NativeApiCapabilities): boolean {
  return (
    hasNativeApiFeature(capabilities, "sourceControl.lookupRepository") &&
    hasNativeApiFeature(capabilities, "sourceControl.cloneRepository") &&
    hasNativeApiFeature(capabilities, "sourceControl.publishRepository")
  );
}

export class UnsupportedNativeApiFeatureError extends Error {
  readonly feature: string;

  constructor(feature: NativeApiFeature, message = getNativeApiFeatureUnavailableMessage(feature)) {
    super(message);
    this.feature = feature;
    this.name = "UnsupportedNativeApiFeatureError";
  }
}

export function assertNativeApiFeature(
  capabilities: NativeApiCapabilities,
  feature: NativeApiFeature,
): void {
  if (hasNativeApiFeature(capabilities, feature)) {
    return;
  }
  throw new UnsupportedNativeApiFeatureError(feature);
}

export function createRpcGitApi(input: {
  rpcClient: WsRpcClient;
  gitActionProgressListeners: Set<(event: GitActionProgressEvent) => void>;
}): NativeApi["git"] {
  const { rpcClient, gitActionProgressListeners } = input;

  return {
    pull: rpcClient.git.pull,
    status: rpcClient.git.refreshStatus,
    refreshStatus: rpcClient.git.refreshStatus,
    onStatus: (input, callback, options) => rpcClient.git.onStatus(input, callback, options),
    runStackedAction: (payload) =>
      rpcClient.git.runStackedAction(payload as never, {
        onProgress: (event) => {
          for (const listener of gitActionProgressListeners) {
            listener(event);
          }
        },
      }),
    listBranches: rpcClient.git.listBranches,
    createWorktree: rpcClient.git.createWorktree,
    removeWorktree: rpcClient.git.removeWorktree,
    createBranch: rpcClient.git.createBranch,
    mergeBranches: rpcClient.git.mergeBranches,
    abortMerge: rpcClient.git.abortMerge,
    checkout: rpcClient.git.checkout,
    init: rpcClient.git.init,
    resolvePullRequest: rpcClient.git.resolvePullRequest,
    preparePullRequestThread: rpcClient.git.preparePullRequestThread,
    repositoryContext: rpcClient.git.repositoryContext,
    onActionProgress: (callback) => {
      gitActionProgressListeners.add(callback);
      return () => {
        gitActionProgressListeners.delete(callback);
      };
    },
  };
}

export function createRpcGitHubApi(rpcClient: WsRpcClient): NativeApi["github"] {
  return {
    status: rpcClient.github.status,
    login: rpcClient.github.login,
    listIssues: rpcClient.github.listIssues,
    createIssue: rpcClient.github.createIssue,
    closeIssue: rpcClient.github.closeIssue,
    reopenIssue: rpcClient.github.reopenIssue,
  };
}
