import {
  type ContextMenuItem,
  type GitActionProgressEvent,
  type NativeApi,
} from "@t3tools/contracts";

import { resetGitStatusStateForTests } from "./lib/gitStatusState";
import { showContextMenuFallback } from "./contextMenuFallback";
import { createRpcGitApi, createRpcGitHubApi } from "./forkNativeApiAdapter";
import { __resetWsRpcAtomClientForTests } from "./rpc/client";
import { resetRequestLatencyStateForTests } from "./rpc/requestLatencyState";
import { resetServerStateForTests } from "./rpc/serverState";
import { resetWsConnectionStateForTests } from "./rpc/wsConnectionState";
import { __resetWsRpcClientForTests, getWsRpcClient } from "./wsRpcClient";

let instance: { api: NativeApi } | null = null;
const gitActionProgressListeners = new Set<(event: GitActionProgressEvent) => void>();

export async function __resetWsNativeApiForTests() {
  instance = null;
  await __resetWsRpcAtomClientForTests();
  await __resetWsRpcClientForTests();
  resetGitStatusStateForTests();
  resetRequestLatencyStateForTests();
  resetServerStateForTests();
  resetWsConnectionStateForTests();
}

export function createWsNativeApi(): NativeApi {
  if (instance) {
    return instance.api;
  }

  const rpcClient = getWsRpcClient();

  const api: NativeApi = {
    dialogs: {
      pickFolder: async () => {
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder();
      },
      confirm: async (message) => {
        if (window.desktopBridge) {
          return window.desktopBridge.confirm(message);
        }
        return window.confirm(message);
      },
    },
    terminal: {
      open: (input) => rpcClient.terminal.open(input as never),
      write: (input) => rpcClient.terminal.write(input as never),
      resize: (input) => rpcClient.terminal.resize(input as never),
      clear: (input) => rpcClient.terminal.clear(input as never),
      restart: (input) => rpcClient.terminal.restart(input as never),
      close: (input) => rpcClient.terminal.close(input as never),
      onEvent: (callback) => rpcClient.terminal.onEvent(callback),
    },
    projects: {
      listDirectory: rpcClient.projects.listDirectory,
      readFile: rpcClient.projects.readFile,
      searchEntries: rpcClient.projects.searchEntries,
      writeFile: rpcClient.projects.writeFile,
    },
    shell: {
      openInEditor: (cwd, editor) => rpcClient.shell.openInEditor({ cwd, editor }),
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    git: createRpcGitApi({ rpcClient, gitActionProgressListeners }),
    github: createRpcGitHubApi(rpcClient),
    sourceControl: {
      lookupRepository: rpcClient.sourceControl.lookupRepository,
      cloneRepository: rpcClient.sourceControl.cloneRepository,
      publishRepository: rpcClient.sourceControl.publishRepository,
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          return window.desktopBridge.showContextMenu(items, position) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position);
      },
    },
    server: {
      getConfig: rpcClient.server.getConfig,
      refreshProviders: rpcClient.server.refreshProviders,
      upsertKeybinding: rpcClient.server.upsertKeybinding,
      getSettings: rpcClient.server.getSettings,
      updateSettings: rpcClient.server.updateSettings,
      discoverSourceControl: rpcClient.server.discoverSourceControl,
    },
    orchestration: {
      getSnapshot: rpcClient.orchestration.getSnapshot,
      dispatchCommand: rpcClient.orchestration.dispatchCommand,
      getTurnDiff: rpcClient.orchestration.getTurnDiff,
      getFullThreadDiff: rpcClient.orchestration.getFullThreadDiff,
      getCheckpointFile: rpcClient.orchestration.getCheckpointFile,
      replayEvents: (fromSequenceExclusive) =>
        rpcClient.orchestration
          .replayEvents({ fromSequenceExclusive })
          .then((events) => [...events]),
      onDomainEvent: (callback, options) =>
        rpcClient.orchestration.onDomainEvent(callback, options),
    },
  };

  instance = { api };
  return api;
}
