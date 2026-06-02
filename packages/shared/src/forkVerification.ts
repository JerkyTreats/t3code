export type ForkFeatureId =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12"
  | "F13"
  | "F14";

export type ForkVerificationLevel = "unit" | "integration" | "browser" | "manual";

export type ForkVerificationScenario = {
  readonly id: string;
  readonly outcome: string;
  readonly levels: readonly ForkVerificationLevel[];
};

export type ForkFeatureContract = {
  readonly id: ForkFeatureId;
  readonly title: string;
  readonly ownerModules: readonly string[];
  readonly scenarios: readonly ForkVerificationScenario[];
};

export const FORK_FEATURE_IDS = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "F13",
  "F14",
] as const satisfies readonly ForkFeatureId[];

export const FORK_FEATURE_CONTRACTS = [
  {
    id: "F1",
    title: "Branding and release identity",
    ownerModules: [
      "packages/shared/src/productIdentity.ts",
      "apps/desktop/package.json",
      "apps/desktop/src/app/DesktopEnvironment.ts",
      "apps/desktop/scripts/electron-launcher.mjs",
      "apps/web/src/branding.ts",
      "scripts/build-desktop-artifact.ts",
      "scripts/resolve-nightly-release.ts",
      "scripts/notify-discord-release.ts",
    ],
    scenarios: [
      {
        id: "f1-web-brand-name",
        outcome: "Web visible product identity resolves to the Omarchy brand.",
        levels: ["unit"],
      },
      {
        id: "f1-desktop-brand-name",
        outcome: "Desktop package and window identity keep the Omarchy brand.",
        levels: ["unit", "manual"],
      },
    ],
  },
  {
    id: "F2",
    title: "Omarchy system theme projection",
    ownerModules: [
      "apps/desktop/src/omarchyTheme.ts",
      "apps/desktop/src/main.ts",
      "apps/desktop/src/preload.ts",
      "apps/web/src/index.css",
    ],
    scenarios: [
      {
        id: "f2-read-omarchy-theme-state",
        outcome: "Desktop theme discovery reads Omarchy state and reports Omarchy as the source.",
        levels: ["unit"],
      },
      {
        id: "f2-project-web-theme-values",
        outcome:
          "Web theme variables receive Omarchy accent, foreground, background, selection, and terminal colors.",
        levels: ["browser", "manual"],
      },
    ],
  },
  {
    id: "F3",
    title: "Omarchy screenshot capture and attach flow",
    ownerModules: [
      "apps/desktop/src/fork/OmarchyScreenshotCapture.ts",
      "apps/desktop/src/main.ts",
      "apps/desktop/src/preload.ts",
      "apps/desktop/src/ipc/channels.ts",
      "apps/desktop/src/ipc/methods/window.ts",
      "apps/web/src/fork/composerScreenshot.ts",
      "apps/web/src/components/chat/ChatComposer.tsx",
    ],
    scenarios: [
      {
        id: "f3-prefer-omarchy-capture",
        outcome:
          "Screenshot capture prefers Omarchy tooling and waits for a complete PNG artifact.",
        levels: ["unit", "manual"],
      },
      {
        id: "f3-attach-capture-to-active-draft",
        outcome:
          "Captured screenshots attach to the active composer draft without replacing draft text.",
        levels: ["browser", "manual"],
      },
    ],
  },
  {
    id: "F4",
    title: "Composer draft autonomy and chrome",
    ownerModules: [
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/fork/composerScreenshot.ts",
      "apps/web/src/fork/composerRichDraft.ts",
      "apps/web/src/components/chat/ChatComposer.tsx",
      "apps/web/src/components/chat/ComposerRichDraftToolbar.tsx",
      "apps/web/src/composerDraftStore.ts",
    ],
    scenarios: [
      {
        id: "f4-draft-survives-ui-actions",
        outcome:
          "Draft text, images, terminal contexts, and attachments survive nearby UI interactions.",
        levels: ["unit", "browser"],
      },
      {
        id: "f4-fork-chrome-actions-visible",
        outcome:
          "Runtime access and screenshot controls remain available in the fork composer chrome.",
        levels: ["browser"],
      },
      {
        id: "f4-rich-draft-controls-format-active-draft",
        outcome:
          "Rich draft mode keeps Enter from sending and formatting controls update the active draft.",
        levels: ["unit", "browser"],
      },
    ],
  },
  {
    id: "F5",
    title: "Git panel isolation from draft ownership",
    ownerModules: [
      "apps/web/src/components/GitActionsControl.tsx",
      "apps/web/src/components/GitActionsControl.logic.ts",
      "apps/web/src/composerDraftStore.ts",
      "apps/web/src/components/ChatView.browser.tsx",
      "apps/web/src/lib/threadDeletionWorkflow.ts",
    ],
    scenarios: [
      {
        id: "f5-git-panel-does-not-clear-draft",
        outcome: "Git panel actions do not claim, clear, or mutate unrelated active draft content.",
        levels: ["unit", "browser"],
      },
      {
        id: "f5-worktree-discard-routes-after-teardown",
        outcome:
          "Worktree discard completes teardown before returning to primary workspace draft routing.",
        levels: ["unit", "integration"],
      },
    ],
  },
  {
    id: "F6",
    title: "Fork first GitHub identity resolution",
    ownerModules: [
      "apps/server/src/git/Layers/GitHubCli.ts",
      "apps/server/src/git/Layers/GitManager.ts",
    ],
    scenarios: [
      {
        id: "f6-resolve-fork-remote-first",
        outcome:
          "Repository, issue, pull request, and panel context target the fork remote by default.",
        levels: ["unit", "integration"],
      },
      {
        id: "f6-cross-repo-head-does-not-replace-fork",
        outcome: "Cross repository pull request head remotes do not replace fork first identity.",
        levels: ["integration"],
      },
    ],
  },
  {
    id: "F7",
    title: "Local branch, worktree, and promotion workflow",
    ownerModules: [
      "apps/server/src/git/Layers/GitManager.ts",
      "apps/web/src/components/GitActionsControl.tsx",
    ],
    scenarios: [
      {
        id: "f7-promotion-creates-backup",
        outcome: "Promotion creates a backup branch before merge, push, and source cleanup.",
        levels: ["integration"],
      },
      {
        id: "f7-close-and-discard-clean-runtime",
        outcome:
          "Worktree close and discard leave no stale runtime, terminal, worktree, or thread state.",
        levels: ["unit", "integration"],
      },
    ],
  },
  {
    id: "F8",
    title: "Plan aware sidebar and activity status cues",
    ownerModules: [
      "apps/web/src/components/Sidebar.logic.ts",
      "apps/web/src/components/Sidebar.tsx",
      "apps/web/src/components/PlanSidebar.tsx",
      "apps/web/src/components/ChatView.tsx",
    ],
    scenarios: [
      {
        id: "f8-sidebar-shows-plan-progress",
        outcome:
          "Sidebar and activity surfaces show fractional plan progress when plan data exists.",
        levels: ["unit", "browser"],
      },
      {
        id: "f8-project-grouping-keeps-row-ownership",
        outcome:
          "Logical group labels never replace concrete project, thread, path, or plan cue ownership.",
        levels: ["unit", "browser"],
      },
    ],
  },
  {
    id: "F9",
    title: "Plan markdown preview and markdown rendering behavior",
    ownerModules: [
      "apps/web/src/components/ChatMarkdown.tsx",
      "apps/web/src/components/DocumentMarkdownRenderer.tsx",
      "apps/web/src/components/PlanConversationDocument.tsx",
      "apps/web/src/components/chat/ProposedPlanCard.tsx",
      "apps/web/src/components/PlanSidebar.tsx",
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/routes/_chat.$threadId.tsx",
      "apps/web/src/index.css",
    ],
    scenarios: [
      {
        id: "f9-preview-plan-without-file-write",
        outcome:
          "A proposed plan opens in fullscreen markdown preview without requiring a workspace file write.",
        levels: ["unit", "browser"],
      },
      {
        id: "f9-wide-markdown-scrolls",
        outcome:
          "Wide markdown tables and code blocks scroll horizontally instead of clipping or stretching layout.",
        levels: ["browser"],
      },
    ],
  },
  {
    id: "F10",
    title: "Codex model and binary selection",
    ownerModules: [
      "apps/desktop/scripts/electron-launcher.mjs",
      "apps/desktop/src/main.ts",
      "apps/server/src/codexAppServerManager.ts",
      "apps/server/src/provider/Layers/CodexProvider.ts",
      "apps/server/src/provider/codexAppServer.ts",
      "apps/server/src/provider/codexCliBinary.ts",
      "apps/server/src/provider/providerSnapshot.ts",
      "apps/web/src/components/settings/SettingsPanels.tsx",
      "packages/contracts/src/server.ts",
    ],
    scenarios: [
      {
        id: "f10-model-list-from-app-server",
        outcome:
          "Codex model and skill selectors prefer app server discovery over built in fallback data.",
        levels: ["unit", "integration"],
      },
      {
        id: "f10-explicit-binary-path-stays-pinned",
        outcome:
          "An explicit Codex binary path remains selected across backend and desktop restarts.",
        levels: ["unit", "manual"],
      },
    ],
  },
  {
    id: "F11",
    title: "Source control provider lane and publish workflow",
    ownerModules: [
      "packages/contracts/src/rpc.ts",
      "packages/contracts/src/ipc.ts",
      "apps/server/src/sourceControl",
      "apps/server/src/git/Layers/GitCore.ts",
      "apps/server/src/git/Layers/GitHubCli.ts",
      "apps/server/src/git/Layers/GitManager.ts",
      "apps/server/src/server.ts",
      "apps/server/src/ws.ts",
      "apps/web/src/lib/sourceControlReactQuery.ts",
      "apps/web/src/wsRpcClient.ts",
      "apps/web/src/wsNativeApi.ts",
      "apps/web/src/forkNativeApiAdapter.ts",
      "apps/web/src/components/Sidebar.tsx",
      "apps/web/src/components/GitActionsControl.tsx",
      "apps/web/src/sourceControlPresentation.ts",
    ],
    scenarios: [
      {
        id: "f11-publish-pushes-ensured-remote",
        outcome:
          "Repository publish creates or wires the remote and pushes to the actual ensured remote when commits exist.",
        levels: ["unit", "integration"],
      },
      {
        id: "f11-empty-publish-adds-remote-only",
        outcome:
          "Publishing an empty repository wires the remote and reports remote added without pushing.",
        levels: ["unit", "integration"],
      },
    ],
  },
  {
    id: "F12",
    title: "Provider instance identity seam",
    ownerModules: [
      "packages/contracts/src/providerInstance.ts",
      "packages/contracts/src/orchestration.ts",
      "packages/contracts/src/server.ts",
      "packages/contracts/src/settings.ts",
      "packages/shared/src/model.ts",
      "apps/server/src/provider/providerSnapshot.ts",
      "apps/server/src/provider/providerStatusCache.ts",
      "apps/server/src/provider/providerInstanceSettings.ts",
      "apps/server/src/provider/Services/ProviderAdapterRegistry.ts",
      "apps/server/src/provider/Services/ProviderSessionDirectory.ts",
      "apps/web/src/providerInstances.ts",
      "apps/web/src/providerModels.ts",
      "apps/web/src/modelSelection.ts",
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/components/chat/ComposerCommandMenu.tsx",
      "apps/web/src/components/settings/SettingsPanels.tsx",
    ],
    scenarios: [
      {
        id: "f12-snapshots-key-by-instance",
        outcome:
          "Provider status and runtime routing keep distinct provider instances with the same driver separate.",
        levels: ["unit", "integration"],
      },
      {
        id: "f12-composer-uses-active-instance-capabilities",
        outcome:
          "Composer model, slash command, and skill controls read capabilities from the active provider instance.",
        levels: ["unit", "browser"],
      },
    ],
  },
  {
    id: "F13",
    title: "Auth access management",
    ownerModules: [
      "packages/contracts/src/auth.ts",
      "packages/contracts/src/rpc.ts",
      "apps/server/src/auth",
      "apps/server/src/ws.ts",
      "apps/web/src/forkNativeApiAdapter.ts",
      "apps/web/src/components/settings/ConnectionsSettings.tsx",
    ],
    scenarios: [
      {
        id: "f13-manage-pairing-links",
        outcome:
          "Connections settings can create, list, and revoke temporary pairing links through native API capability checks.",
        levels: ["unit", "browser"],
      },
      {
        id: "f13-current-session-is-not-revocable",
        outcome:
          "Client session management can revoke other sessions while keeping current session revocation disabled.",
        levels: ["unit", "browser"],
      },
    ],
  },
  {
    id: "F14",
    title: "Project management and inference dashboard",
    ownerModules: [
      "apps/web/src/routes/_chat.projects.$environmentId.$projectId.tsx",
      "apps/web/src/components/project-management/ProjectManagementRoute.tsx",
      "apps/web/src/components/project-management/ProjectManagementPage.tsx",
      "apps/web/src/components/project-management/ProjectInferenceDashboardPage.tsx",
      "apps/web/src/project-management/projectManagementRoute.ts",
      "apps/web/src/project-management/projectManagementOverview.ts",
      "apps/web/src/project-management/projectManagementInference.ts",
      "apps/web/src/project-management/adapters/projectManagementStoreAdapter.ts",
      "apps/web/src/components/project-management/ProjectScopedGitPanel.tsx",
      "apps/web/src/components/Sidebar.tsx",
      "apps/web/src/components/CommandPalette.tsx",
    ],
    scenarios: [
      {
        id: "f14-project-management-targets-concrete-project",
        outcome:
          "Sidebar and command palette project management actions target concrete environment scoped projects.",
        levels: ["unit", "browser"],
      },
      {
        id: "f14-inference-dashboard-uses-latest-usage",
        outcome:
          "Project inference dashboard totals use the latest usage snapshot per turn and preserve provider processed token totals.",
        levels: ["unit", "browser"],
      },
      {
        id: "f14-project-git-does-not-claim-draft",
        outcome:
          "Project scoped Git management renders repository state without clearing unrelated active composer drafts.",
        levels: ["unit", "browser"],
      },
    ],
  },
] as const satisfies readonly ForkFeatureContract[];

export function getForkFeatureContract(id: ForkFeatureId): ForkFeatureContract {
  const contract = FORK_FEATURE_CONTRACTS.find((feature) => feature.id === id);
  if (!contract) {
    throw new Error(`Unknown fork feature contract ${id}`);
  }
  return contract;
}
