import {
  act,
  cloneElement,
  createElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  type DesktopScreenshotCapture,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), capture: vi.fn(), toast: vi.fn() }));
vi.mock("../../lib/imageCompression", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/imageCompression")>()),
  prepareImageForAttachment: mocks.prepare,
  compressImageForStash: vi.fn(),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: {} } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../../panelAnimations", () => ({
  usePanelAnimationSettings: () => ({ active: false, durationMs: 0 }),
  observeResponsiveBreakpointFade: () => () => {},
}));
vi.mock("../../lib/composerPathSearchState", () => ({
  useComposerPathSearch: () => ({ entries: [], isLoading: false }),
}));
vi.mock("../../lib/attachmentUploadQueue", () => ({
  useAttachmentUploadStore: (select: (state: unknown) => unknown) =>
    select({ uploadsByImageId: {} }),
  startAttachmentUpload: vi.fn(),
  releaseAttachmentUpload: vi.fn(),
  releaseDraftAttachment: vi.fn(),
  releasePersistedAttachmentUpload: vi.fn(),
  readAttachmentUpload: vi.fn(),
  retryAttachmentUpload: vi.fn(),
  verifyStashedAttachmentUpload: vi.fn(),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("../ui/button", () => ({
  Button: (props: ComponentProps<"button">) => createElement("button", props),
  buttonVariants: () => "",
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({
    render,
    children,
  }: {
    render: ReactElement<{ children?: ReactNode }>;
    children: ReactNode;
  }) => cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));
vi.mock("../ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: (props: ComponentProps<"button">) => createElement("button", props),
  SelectValue: ({ children }: { children: ReactNode }) => children,
  SelectItem: () => null,
  SelectPopup: () => null,
}));
vi.mock("../ComposerPromptEditor", () => ({ ComposerPromptEditor: () => null }));
vi.mock("./ProviderModelPicker", () => ({ ProviderModelPicker: () => null }));
vi.mock("./ComposerPrimaryActions", () => ({
  ComposerPrimaryActions: (props: { sendDisabledReason: string | null }) =>
    createElement("button", {
      type: "submit",
      disabled: props.sendDisabledReason !== null,
      "aria-label": "Send message",
    }),
}));
vi.mock("./ContextWindowMeter", () => ({ ContextWindowMeter: () => null }));
vi.mock("./ComposerStashBadge", () => ({ ComposerStashBadge: () => null }));
vi.mock("./ComposerStashMenu", () => ({ ComposerStashMenu: () => null }));
vi.mock("./ComposerActivityStatus", () => ({ ComposerActivityRow: () => null }));
vi.mock("./ComposerBannerStack", () => ({ ComposerBannerStack: () => null }));

import { ChatComposer, type ChatComposerProps } from "./ChatComposer";
import { ComposerPromptEditor } from "../ComposerPromptEditor";
import {
  useComposerDraftStore,
  DraftId,
  type ComposerImageAttachment,
} from "../../composerDraftStore";
import { ComposerAttachmentAdmission } from "../../fork/composerAttachmentAdmission";

let renderer: ReactTestRenderer | null = null;
const initialStore = useComposerDraftStore.getState();
const environmentId = EnvironmentId.make("environment-one");
const threadId = ThreadId.make("shared-thread");
const target = { environmentId, threadId };
const emptyCapture: DesktopScreenshotCapture = {
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

function image(name = "paste.png"): File {
  return new File(["image"], name, { type: "image/png" });
}
function attachment(id: string): ComposerImageAttachment {
  const file = image(id + ".png");
  return {
    type: "image",
    id,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    file,
    previewUrl: "blob:" + id,
  };
}
function props(overrides: Partial<ChatComposerProps> = {}): ChatComposerProps {
  return {
    composerDraftTarget: target,
    environmentId,
    attachmentUploadsCapabilityKnown: true,
    supportsAttachmentUploads: false,
    maxFileAttachmentBytes: null,
    routeKind: "server",
    routeThreadRef: target,
    draftId: null,
    activeThreadId: threadId,
    activeThreadEnvironmentId: environmentId,
    activeThread: undefined,
    promptHistoryMessages: [],
    isServerThread: true,
    isLocalDraftThread: false,
    forceExpandedOnMobile: false,
    projectSelectionRequired: false,
    phase: "ready",
    isConnecting: false,
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
    settings: { ...DEFAULT_UNIFIED_SETTINGS, composerCollapseOnBlur: false },
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
    composerElementContextsRef: { current: [] },
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
async function mount(input = props()) {
  await act(() => {
    renderer = create(<ChatComposer {...input} />);
  });
  return input;
}
function capture() {
  renderer!.root
    .findAllByType("button")
    .find((node) => node.props["aria-label"] === "Capture screenshot")!
    .props.onClick();
}
function draft() {
  return useComposerDraftStore.getState().getComposerDraft(target);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    desktopBridge: { captureDesktopScreenshot: mocks.capture },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn(),
    performance,
    getSelection: () => null,
    localStorage: { getItem: () => null },
  });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    activeElement: null,
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prepared");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  useComposerDraftStore.setState(initialStore, true);
  mocks.capture.mockReset();
  mocks.prepare.mockReset();
  mocks.toast.mockClear();
  mocks.prepare.mockImplementation(async (file: File) => ({ ok: true, file }));
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChatComposer screenshot admission", () => {
  it("refuses at cap before calling the desktop", async () => {
    useComposerDraftStore.getState().addImages(
      target,
      Array.from({ length: 8 }, (_, i) => attachment(String(i))),
    );
    const input = await mount();
    await act(() => capture());
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(input.setThreadError).toHaveBeenCalledWith(
      threadId,
      "You can attach up to 8 files per message.",
    );
  });
  it("shares paste capacity with a single native capture and transfers without double counting", async () => {
    useComposerDraftStore.getState().addImages(
      target,
      Array.from({ length: 6 }, (_, i) => attachment(String(i))),
    );
    const native = deferred<DesktopScreenshotCapture | null>();
    const pastePreparation = deferred<{ ok: true; file: File }>();
    mocks.capture.mockReturnValue(native.promise);
    mocks.prepare.mockImplementationOnce(() => pastePreparation.promise);
    await mount();
    const preventDefault = vi.fn();
    await act(() => {
      capture();
      capture();
      renderer!.root.findByType(ComposerPromptEditor).props.onPaste({
        clipboardData: { files: [image("first.png"), image("overflow.png")], getData: () => "" },
        preventDefault,
      });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    await act(() => native.resolve(emptyCapture));
    expect(draft()?.images).toHaveLength(7);
    expect(draft()?.images.at(-1)?.name).toBe("capture.png");
    await act(() => pastePreparation.resolve({ ok: true, file: image("first.png") }));
    expect(draft()?.images.map((value) => value.name)).toContain("first.png");
    expect(draft()?.images).toHaveLength(8);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it("refuses capture when an ordinary paste already reserved the last slot", async () => {
    useComposerDraftStore.getState().addImages(
      target,
      Array.from({ length: 7 }, (_, i) => attachment(String(i))),
    );
    const pending = deferred<{ ok: true; file: File }>();
    mocks.prepare.mockReturnValue(pending.promise);
    const input = await mount();
    await act(() => {
      input.composerRef.current!.addDroppedFiles([image()]);
      capture();
    });
    expect(mocks.capture).not.toHaveBeenCalled();
    await act(() => pending.resolve({ ok: true, file: image() }));
    expect(draft()?.images).toHaveLength(8);
  });

  it.each(["cancel", "native-error", "compression-error"])(
    "releases capacity after %s and allows a fresh capture",
    async (outcome) => {
      const native = deferred<DesktopScreenshotCapture | null>();
      mocks.capture.mockReturnValueOnce(native.promise).mockResolvedValueOnce(emptyCapture);
      if (outcome === "compression-error")
        mocks.prepare.mockRejectedValueOnce(new Error("preparation failed"));
      const input = await mount();
      await act(() => capture());
      await act(() => {
        if (outcome === "native-error") native.reject(new Error("native failed"));
        else native.resolve(outcome === "cancel" ? null : emptyCapture);
      });
      expect(draft()?.images ?? []).toHaveLength(0);
      if (outcome !== "cancel")
        expect(input.setThreadError).toHaveBeenCalledWith(
          threadId,
          outcome === "native-error" ? "native failed" : "preparation failed",
        );
      await act(() => capture());
      expect(mocks.capture).toHaveBeenCalledTimes(2);
      expect(draft()?.images).toHaveLength(1);
    },
  );

  it("blocks synchronous send and compact commands throughout capture and image preparation", async () => {
    useComposerDraftStore.getState().setPrompt(target, "Keep this prompt");
    const native = deferred<DesktopScreenshotCapture | null>();
    const preparation = deferred<{ ok: true; file: File }>();
    mocks.capture.mockReturnValue(native.promise);
    mocks.prepare.mockReturnValue(preparation.promise);
    const input = await mount();
    await act(() => {
      capture();
      renderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() });
      input.composerRef.current!.compactContext();
    });
    expect(input.onSend).not.toHaveBeenCalled();
    expect(draft()?.prompt).toBe("Keep this prompt");
    expect(
      renderer!.root
        .findAllByType("button")
        .find((node) => node.props["aria-label"] === "Send message")!.props.disabled,
    ).toBe(true);
    await act(() => native.resolve(emptyCapture));
    await act(() => input.composerRef.current!.compactContext());
    expect(input.onSend).not.toHaveBeenCalled();
    await act(() => preparation.resolve({ ok: true, file: image("capture.png") }));
    await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));
    expect(input.onSend).toHaveBeenCalledOnce();
    expect(input.composerRef.current!.getSendContext().images).toHaveLength(1);
  });

  it("drops a native result after switching environments with the same ThreadId, even after returning", async () => {
    const native = deferred<DesktopScreenshotCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    const input = await mount();
    await act(() => capture());
    const otherEnvironment = EnvironmentId.make("environment-two");
    const otherTarget = { environmentId: otherEnvironment, threadId };
    await act(() =>
      renderer!.update(
        <ChatComposer
          {...input}
          environmentId={otherEnvironment}
          composerDraftTarget={otherTarget}
          routeThreadRef={otherTarget}
        />,
      ),
    );
    await act(() => renderer!.update(<ChatComposer {...input} />));
    await act(() => native.resolve(emptyCapture));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(draft()?.images ?? []).toHaveLength(0);
    expect(
      useComposerDraftStore.getState().getComposerDraft(otherTarget)?.images ?? [],
    ).toHaveLength(0);
    expect(input.setThreadError).not.toHaveBeenCalled();
  });

  it("drops capture when an unsaved draft is retargeted to another project", async () => {
    const draftId = DraftId.make("unsaved-draft");
    const firstProject = { environmentId, projectId: ProjectId.make("first-project") };
    useComposerDraftStore.getState().setLogicalProjectDraftThreadId("first", firstProject, draftId);
    const native = deferred<DesktopScreenshotCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    await mount(props({ composerDraftTarget: draftId, draftId, routeKind: "draft" }));
    await act(() => capture());
    await act(() =>
      useComposerDraftStore
        .getState()
        .setLogicalProjectDraftThreadId(
          "second",
          { environmentId, projectId: ProjectId.make("second-project") },
          draftId,
        ),
    );
    await act(() => native.resolve(emptyCapture));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.images ?? []).toHaveLength(
      0,
    );
  });

  it("releases reservations on unmount and ignores late success and errors", async () => {
    const reserve = vi.spyOn(ComposerAttachmentAdmission.prototype, "reserve");
    const native = deferred<DesktopScreenshotCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    const input = await mount();
    await act(() => capture());
    const owner = reserve.mock.contexts[0] as ComposerAttachmentAdmission;
    expect(owner.pending).toBe(1);
    await act(() => renderer!.unmount());
    renderer = null;
    expect(owner.pending).toBe(0);
    await act(() => native.reject(new Error("late native failure")));
    expect(input.setThreadError).not.toHaveBeenCalled();
    expect(owner.pending).toBe(0);
  });

  it("releases ordinary preparation and revokes partial previews when the scoped destination changes", async () => {
    const pending = deferred<{ ok: true; file: File }>();
    mocks.prepare
      .mockResolvedValueOnce({ ok: true, file: image("first.png") })
      .mockReturnValueOnce(pending.promise);
    const input = await mount();
    await act(() =>
      input.composerRef.current!.addDroppedFiles([image("first.png"), image("second.png")]),
    );
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const otherTarget = { environmentId, threadId: ThreadId.make("other-thread") };
    await act(() =>
      renderer!.update(
        <ChatComposer
          {...input}
          activeThreadId={otherTarget.threadId}
          composerDraftTarget={otherTarget}
          routeThreadRef={otherTarget}
        />,
      ),
    );
    await act(() => pending.resolve({ ok: true, file: image("second.png") }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:prepared");
    expect(draft()?.images ?? []).toHaveLength(0);
    expect(
      useComposerDraftStore.getState().getComposerDraft(otherTarget)?.images ?? [],
    ).toHaveLength(0);
  });

  it("preserves the generic picker and replaces a reattachment marker at the cap", async () => {
    useComposerDraftStore.getState().addImages(
      target,
      Array.from({ length: 7 }, (_, i) => attachment(String(i))),
    );
    const file = new File(["report"], "report.txt", { type: "text/plain" });
    useComposerDraftStore.getState().addFiles(target, [
      {
        type: "file",
        id: "reattach",
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        file: null,
      },
    ]);
    await mount(props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 }));
    expect(
      renderer!.root
        .findAllByType("button")
        .some((node) => node.props["aria-label"] === "Attach files"),
    ).toBe(true);
    await act(() => capture());
    expect(mocks.capture).not.toHaveBeenCalled();
    const picker = renderer!.root.findByType("input");
    await act(() => picker.props.onChange({ currentTarget: { files: [file], value: "" } }));
    expect(draft()?.files).toHaveLength(1);
    expect(draft()?.files[0]?.file).toBe(file);
    expect(draft()?.images).toHaveLength(7);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("keeps ordinary classification and supported-image errors", async () => {
    const input = await mount(
      props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 }),
    );
    await act(() =>
      input.composerRef.current!.addDroppedFiles([
        new File(["body"], "notes.txt", { type: "text/plain" }),
        new File(["svg"], "vector.svg", { type: "image/svg+xml" }),
        image(),
      ]),
    );
    expect(draft()?.files[0]?.mimeType).toBe("text/plain");
    expect(draft()?.images).toHaveLength(1);
    expect(input.setThreadError).toHaveBeenCalledWith(
      threadId,
      expect.stringContaining("not a supported image type"),
    );
  });

  it("places the unchanged runtime choices in the floating lock control", async () => {
    const input = await mount();
    const floating = renderer!.root.findByProps({ "data-chat-composer-floating-runtime": "true" });
    expect(floating.props.className).toContain("-top-4");
    expect(
      floating.findAllByType("button").some((node) => node.props["aria-label"] === "Runtime mode"),
    ).toBe(true);
    const { Select } = await import("../ui/select");
    await act(() => floating.findByType(Select).props.onValueChange("approval-required"));
    expect(input.handleRuntimeModeChange).toHaveBeenCalledWith("approval-required");
    expect(
      renderer!.root.findByProps({ "data-chat-composer-main-surface": "true" }).props.className,
    ).toContain("rounded-[24px]");
  });
  it.each(["unreadable", "too-large"] as const)(
    "releases an image rejected as %s by ordinary preparation",
    async (reason) => {
      mocks.capture.mockResolvedValue(emptyCapture);
      mocks.prepare.mockResolvedValueOnce({ ok: false, reason });
      const input = await mount();
      await act(() => capture());
      expect(draft()?.images ?? []).toHaveLength(0);
      expect(input.setThreadError).toHaveBeenCalledWith(
        threadId,
        expect.stringContaining(reason === "unreadable" ? "could not be read" : "too large"),
      );
      await act(() => capture());
      expect(draft()?.images).toHaveLength(1);
    },
  );

  it("omits capture outside a capable desktop bridge while retaining the ordinary picker", async () => {
    delete window.desktopBridge;
    await mount(props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 }));
    const labels = renderer!.root.findAllByType("button").map((node) => node.props["aria-label"]);
    expect(labels).not.toContain("Capture screenshot");
    expect(labels).toContain("Attach files");
  });
});
