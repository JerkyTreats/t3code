import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { vi } from "vite-plus/test";

import type { ChatComposerProps } from "../../src/components/chat/ChatComposer";
import type { ComposerImageAttachment } from "../../src/composerDraftStore";

// Synthetic ChatComposer host props for mounted composer browser tests.
export const environmentId = EnvironmentId.make("environment-one");
export const threadId = ThreadId.make("synthetic-thread");
export const target = { environmentId, threadId };
export const pngCapture = {
  name: "capture.png",
  mimeType: "image/png",
  data: new Uint8Array([1, 2, 3]),
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function image(name = "paste.png"): File {
  return new File(["image"], name, { type: "image/png" });
}

export function attachment(id: string): ComposerImageAttachment {
  const file = image(`${id}.png`);
  return {
    type: "image",
    id,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    file,
    previewUrl: `blob:${id}`,
  };
}

export function props(overrides: Partial<ChatComposerProps> = {}): ChatComposerProps {
  return {
    canOperateThread: true,
    activeProjectId: null,
    threadPullRequests: undefined,
    resumeCompactionTokens: null,
    keepFullHistory: false,
    onToggleKeepFullHistory: vi.fn(),
    supportsQuestionAttachments: false,
    composerDraftTarget: target,
    environmentId,
    attachmentUploadsCapabilityKnown: true,
    supportsAttachmentUploads: false,
    maxFileAttachmentBytes: null,
    routeKind: "server",
    routeThreadRef: target,
    draftId: null,
    multipleModelSelections: null,
    supportsMultipleModels: false,
    onMultipleModelSelectionsChange: vi.fn(),
    activeThreadShell: null,
    providerCatalogKnown: true,
    pullRequestProjectId: null,
    pullRequestRepository: null,
    onCompactContext: vi.fn(),
    activeThreadId: threadId,
    activeThreadEnvironmentId: environmentId,
    activeThread: undefined,
    promptHistoryMessages: [],
    isServerThread: true,
    isLocalDraftThread: false,
    forceExpandedOnMobile: false,
    projectSelectionRequired: false,
    phase: "ready",
    canInterrupt: false,
    canResume: false,
    queuedRunsControl: null,
    editingQueuedAttachments: null,
    onRemoveEditingQueuedAttachment: vi.fn(),
    onResume: vi.fn(),
    isConnecting: false,
    isCompacting: false,
    isSendBusy: false,
    sendDisabledReason: null,
    isPreparingWorktree: false,
    bannerItems: [],
    environmentUnavailable: null,
    activePendingApproval: null,
    pendingApprovals: [],
    pendingUserInputs: [],
    activePendingProgress: null,
    activePendingResolvedAnswers: null,
    activePendingIsResponding: false,
    activePendingDraftAnswers: {},
    activePendingQuestionIndex: 0,
    respondingRequestIds: [],
    showPlanFollowUpPrompt: false,
    activeProposedPlan: null,
    activeTasksProgress: null,
    activeTaskSteps: null,
    threadSyncPhase: null,
    runtimeMode: "full-access",
    interactionMode: "default",
    lockedProvider: null,
    providerStatuses: [
      {
        instanceId: ProviderInstanceId.make("codex"),
        driver: ProviderDriverKind.make("codex"),
        enabled: true,
        installed: true,
        version: null,
        status: "ready",
        auth: { status: "authenticated" },
        checkedAt: "2026-01-01T00:00:00.000Z",
        models: [
          { slug: "test", name: "Test", isDefault: true, isCustom: false, capabilities: {} },
        ],
        slashCommands: [],
        skills: [],
      },
    ],
    activeProjectDefaultModelSelection: null,
    activeThreadModelSelection: null,
    activeContextWindow: null,
    compactThreadUnavailable: false,
    compactDisabled: false,
    compactDisabledReason: null,
    resolvedTheme: "light",
    settings: { ...DEFAULT_UNIFIED_SETTINGS, composerCollapseOnScroll: false },
    keybindings: [],
    terminalOpen: false,
    gitCwd: null,
    restingControlsHost: null,
    restingControlsHaveLeadingContext: false,
    onRestingControlsVisibilityChange: vi.fn(),
    getTimelineScrollableNode: () => null,
    isTimelineAtLogicalEnd: () => true,
    timelineOverflows: false,
    onComposerOverlayHeightChange: vi.fn(),
    onRestingChange: vi.fn(),
    promptRef: { current: "" },
    composerImagesRef: { current: [] },
    composerFilesRef: { current: [] },
    composerTerminalContextsRef: { current: [] },
    composerRef: { current: null },
    onPageScrollKeyDown: vi.fn(),
    onPageScrollKeyUp: vi.fn(),
    onPageScrollRelease: vi.fn(),
    // The real send handler keeps a submitted form from navigating the test page.
    onSend: vi.fn((event?: { preventDefault: () => void }) => event?.preventDefault()),
    onInterrupt: vi.fn(),
    onImplementPlanInNewThread: vi.fn(),
    onRespondToApproval: vi.fn(),
    onSelectActivePendingUserInputOption: vi.fn(),
    onAdvanceActivePendingUserInput: vi.fn(),
    onDismissActivePendingUserInput: vi.fn(),
    onPreviousActivePendingUserInputQuestion: vi.fn(),
    onChangeActivePendingUserInputCustomAnswer: vi.fn(),
    onProviderModelSelect: vi.fn(),
    onOpenProviderSetup: vi.fn(),
    getModelDisabledReason: () => null,
    toggleInteractionMode: vi.fn(),
    handleRuntimeModeChange: vi.fn(),
    handleInteractionModeChange: vi.fn(),
    focusComposer: vi.fn(),
    scheduleComposerFocus: vi.fn(),
    setThreadError: vi.fn(),
    onExpandImage: vi.fn(),
    onFileOpen: vi.fn(),
    ...overrides,
  };
}
