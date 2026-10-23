import {
  EnvironmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";

// Mounted-host evidence for F03 desktop screenshot capture; owner rules live in
// fork/composerAttachmentAdmission.test.ts and fork/composerScreenshot.test.ts.
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), capture: vi.fn(), toast: vi.fn() }));
vi.mock(import("../../lib/imageCompression"), async (original) => ({
  ...(await original()),
  prepareImageForAttachment: mocks.prepare,
}));
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));
vi.mock(import("../../lib/openPullRequestLink"), async (original) => ({
  ...(await original()),
  useOpenPrLink: () => () => false,
}));
vi.mock(import("../../hooks/useMediaQuery"), async (original) => ({
  ...(await original()),
  useMediaQuery: () => false,
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: mocks.toast } };
});
vi.mock(import("../ComposerPromptEditor"), async (original) => ({
  ...(await original()),
  ComposerPromptEditor: (() => null) as never,
}));

import { ChatComposer, type ChatComposerProps } from "./ChatComposer";
import { useComposerDraftStore, type ComposerImageAttachment } from "../../composerDraftStore";
import { ComposerAttachmentAdmission } from "../../fork/composerAttachmentAdmission";

const initialStore = useComposerDraftStore.getState();
const environmentId = EnvironmentId.make("environment-one");
const threadId = ThreadId.make("synthetic-thread");
const target = { environmentId, threadId };
const pngCapture = {
  name: "capture.png",
  mimeType: "image/png",
  data: new Uint8Array([1, 2, 3]),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function attachment(id: string): ComposerImageAttachment {
  const file = new File(["image"], `${id}.png`, { type: "image/png" });
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
const draft = () => useComposerDraftStore.getState().getComposerDraft(target);
const bridgeWindow = window as unknown as { desktopBridge?: unknown };

function props(overrides: Partial<ChatComposerProps> = {}): ChatComposerProps {
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
    onSend: vi.fn(),
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

function setup({ desktopCapture = true } = {}) {
  useComposerDraftStore.setState(initialStore, true);
  mocks.capture.mockReset();
  mocks.toast.mockClear();
  mocks.prepare.mockReset();
  mocks.prepare.mockImplementation(async (file: File) => ({ ok: true, file }));
  if (desktopCapture) bridgeWindow.desktopBridge = { captureDesktopScreenshot: mocks.capture };
  return {
    [Symbol.dispose]() {
      delete bridgeWindow.desktopBridge;
      vi.restoreAllMocks();
    },
  };
}

describe("ChatComposer desktop screenshot capture", () => {
  it("omits capture without the desktop capability and keeps the ordinary picker", async () => {
    using _fixture = setup({ desktopCapture: false });
    await using screen = await render(
      <ChatComposer
        {...props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 })}
      />,
    );
    await expect.element(screen.getByRole("button", { name: "Attach files" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Capture screenshot" }).query()).toBeNull();
  });

  it("admits one capture through the ordinary image path, single flight", async () => {
    using _fixture = setup();
    const native = deferred<typeof pngCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    const button = screen.getByRole("button", { name: "Capture screenshot" });
    await button.click();
    await expect.element(button).toBeDisabled();
    expect(mocks.capture).toHaveBeenCalledOnce();
    await act(() => native.resolve(pngCapture));
    await expect.poll(() => draft()?.images.map((image) => image.name)).toEqual(["capture.png"]);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    await expect.element(button).toBeEnabled();
    expect(input.setThreadError).not.toHaveBeenCalledWith(threadId, expect.any(String));
  });

  it("refuses at the attachment cap before calling the desktop", async () => {
    using _fixture = setup();
    useComposerDraftStore.getState().addImages(
      target,
      Array.from({ length: PROVIDER_SEND_TURN_MAX_ATTACHMENTS }, (_, i) => attachment(`a${i}`)),
    );
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await screen.getByRole("button", { name: "Capture screenshot" }).click();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(input.setThreadError).toHaveBeenCalledWith(
      threadId,
      `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} files per message.`,
    );
  });

  it("releases its reservation on unmount and ignores a late result", async () => {
    using _fixture = setup();
    const reserve = vi.spyOn(ComposerAttachmentAdmission.prototype, "reserve");
    const native = deferred<typeof pngCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await screen.getByRole("button", { name: "Capture screenshot" }).click();
    const owner = reserve.mock.contexts[0] as ComposerAttachmentAdmission;
    expect(owner.pending).toBe(1);
    await screen.unmount();
    expect(owner.pending).toBe(0);
    await act(() => native.resolve(pngCapture));
    expect(draft()?.images ?? []).toHaveLength(0);
    expect(input.setThreadError).not.toHaveBeenCalled();
  });

  it("keeps the current focus when the capture control is pressed", async () => {
    using _fixture = setup();
    mocks.capture.mockResolvedValue(null);
    await using screen = await render(
      <>
        <input aria-label="Focused field" />
        <ChatComposer {...props()} />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "Focused field" });
    await field.click();
    await expect.element(field).toHaveFocus();
    await userEvent.click(page.getByRole("button", { name: "Capture screenshot" }));
    expect(mocks.capture).toHaveBeenCalledOnce();
    await expect.element(field).toHaveFocus();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
