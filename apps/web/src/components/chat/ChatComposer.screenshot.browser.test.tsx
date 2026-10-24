import {
  EnvironmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  ProjectId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render, type Screen } from "../../../test/render";
import {
  attachment,
  deferred,
  environmentId,
  image,
  pngCapture,
  props,
  target,
  threadId,
} from "../../../test/fixtures/chatComposer";

// Mounted-host evidence for F03 desktop screenshot capture; owner rules live in
// fork/composerAttachmentAdmission.test.ts and fork/composerScreenshot.test.ts.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  capture: vi.fn(),
  toast: vi.fn(),
  editor: null as null | { onPaste: (event: unknown) => void },
}));
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
  ComposerPromptEditor: ((editorProps: { onPaste: (event: unknown) => void }) => {
    mocks.editor = editorProps;
    return null;
  }) as never,
}));

import { ChatComposer } from "./ChatComposer";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { ComposerAttachmentAdmission } from "../../fork/composerAttachmentAdmission";
import {
  questionAttachmentDraftId,
  useQuestionAttachmentPreparation,
} from "../../questionAttachments";

const initialStore = useComposerDraftStore.getState();
const draft = () => useComposerDraftStore.getState().getComposerDraft(target);
const bridgeWindow = window as unknown as { desktopBridge?: unknown };

function setup({ desktopCapture = true } = {}) {
  useComposerDraftStore.setState(initialStore, true);
  mocks.capture.mockReset();
  mocks.toast.mockClear();
  mocks.prepare.mockReset();
  mocks.prepare.mockImplementation(async (file: File) => ({ ok: true, file }));
  mocks.editor = null;
  useQuestionAttachmentPreparation.setState({ counts: {} });
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

// A synchronous DOM click, so a test can interleave it with other admissions in one act.
function capture(screen: Screen) {
  (screen.getByRole("button", { name: "Capture screenshot" }).element() as HTMLElement).click();
}
function fill(count: number) {
  useComposerDraftStore.getState().addImages(
    target,
    Array.from({ length: count }, (_, i) => attachment(`a${i}`)),
  );
}
// Its accessible name is its status, such as "Preparing attachments" while disabled.
function sendButton(screen: Screen) {
  return screen.container.querySelector<HTMLButtonElement>("button[type='submit']")!;
}
function submit(screen: Screen) {
  screen.container.querySelector("form")!.requestSubmit();
}
function urlSpies() {
  return {
    create: vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prepared"),
    revoke: vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
  };
}

describe("ChatComposer screenshot admission", () => {
  it("shares paste capacity with a single native capture and transfers without double counting", async () => {
    using _fixture = setup();
    fill(PROVIDER_SEND_TURN_MAX_ATTACHMENTS - 2);
    const native = deferred<typeof pngCapture | null>();
    const pastePreparation = deferred<{ ok: true; file: File }>();
    mocks.capture.mockReturnValue(native.promise);
    mocks.prepare.mockImplementationOnce(() => pastePreparation.promise);
    await using screen = await render(<ChatComposer {...props()} />);
    const preventDefault = vi.fn();
    await act(() => {
      capture(screen);
      mocks.editor!.onPaste({
        clipboardData: { files: [image("first.png"), image("overflow.png")], getData: () => "" },
        preventDefault,
        stopPropagation: vi.fn(),
      });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    await act(() => native.resolve(pngCapture));
    await expect.poll(() => draft()?.images).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS - 1);
    expect(draft()?.images.at(-1)?.name).toBe("capture.png");
    await act(() => pastePreparation.resolve({ ok: true, file: image("first.png") }));
    await expect.poll(() => draft()?.images).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
    expect(draft()?.images.map((value) => value.name)).toContain("first.png");
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it("refuses capture when an ordinary paste already reserved the last slot", async () => {
    using _fixture = setup();
    fill(PROVIDER_SEND_TURN_MAX_ATTACHMENTS - 1);
    const pending = deferred<{ ok: true; file: File }>();
    mocks.prepare.mockReturnValue(pending.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await act(() => {
      input.composerRef.current!.addDroppedFiles([image()]);
      capture(screen);
    });
    expect(mocks.capture).not.toHaveBeenCalled();
    await act(() => pending.resolve({ ok: true, file: image() }));
    await expect.poll(() => draft()?.images).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
  });

  it.each(["cancel", "native-error", "compression-error"] as const)(
    "releases capacity after %s and allows a fresh capture",
    async (outcome) => {
      using _fixture = setup();
      const native = deferred<typeof pngCapture | null>();
      mocks.capture.mockReturnValueOnce(native.promise).mockResolvedValueOnce(pngCapture);
      if (outcome === "compression-error")
        mocks.prepare.mockRejectedValueOnce(new Error("preparation failed"));
      const input = props();
      await using screen = await render(<ChatComposer {...input} />);
      const button = screen.getByRole("button", { name: "Capture screenshot" });
      await button.click();
      await act(() => {
        if (outcome === "native-error") native.reject(new Error("native failed"));
        else native.resolve(outcome === "cancel" ? null : pngCapture);
      });
      await expect.element(button).toBeEnabled();
      expect(draft()?.images ?? []).toHaveLength(0);
      if (outcome !== "cancel")
        expect(input.setThreadError).toHaveBeenCalledWith(
          threadId,
          outcome === "native-error" ? "native failed" : "preparation failed",
        );
      await button.click();
      expect(mocks.capture).toHaveBeenCalledTimes(2);
      await expect.poll(() => draft()?.images).toHaveLength(1);
    },
  );

  it.each(["unreadable", "too-large"] as const)(
    "releases an image rejected as %s by ordinary preparation",
    async (reason) => {
      using _fixture = setup();
      mocks.capture.mockResolvedValue(pngCapture);
      mocks.prepare.mockResolvedValueOnce({ ok: false, reason });
      const input = props();
      await using screen = await render(<ChatComposer {...input} />);
      const button = screen.getByRole("button", { name: "Capture screenshot" });
      await button.click();
      await expect
        .poll(() => input.setThreadError)
        .toHaveBeenCalledWith(
          threadId,
          expect.stringContaining(reason === "unreadable" ? "could not be read" : "too large"),
        );
      expect(draft()?.images ?? []).toHaveLength(0);
      await expect.element(button).toBeEnabled();
      await button.click();
      await expect.poll(() => draft()?.images).toHaveLength(1);
    },
  );

  it("blocks synchronous send and compact commands throughout capture and image preparation", async () => {
    using _fixture = setup();
    useComposerDraftStore.getState().setPrompt(target, "Keep this prompt");
    const native = deferred<typeof pngCapture | null>();
    const preparation = deferred<{ ok: true; file: File }>();
    mocks.capture.mockReturnValue(native.promise);
    mocks.prepare.mockReturnValue(preparation.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await act(() => {
      capture(screen);
      submit(screen);
      input.composerRef.current!.compactContext();
    });
    expect(input.onSend).not.toHaveBeenCalled();
    expect(input.onCompactContext).not.toHaveBeenCalled();
    expect(draft()?.prompt).toBe("Keep this prompt");
    await expect.element(sendButton(screen)).toBeDisabled();
    await act(() => native.resolve(pngCapture));
    await act(() => {
      submit(screen);
      input.composerRef.current!.compactContext();
    });
    expect(input.onSend).not.toHaveBeenCalled();
    expect(input.onCompactContext).not.toHaveBeenCalled();
    await act(() => preparation.resolve({ ok: true, file: image("capture.png") }));
    await expect.element(sendButton(screen)).toBeEnabled();
    await act(() => submit(screen));
    expect(input.onSend).toHaveBeenCalledOnce();
    expect(input.composerRef.current!.getSendContext().images).toHaveLength(1);
  });

  it("drops a native result after switching environments with the same ThreadId, even after returning", async () => {
    using _fixture = setup();
    const native = deferred<typeof pngCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await act(() => capture(screen));
    const otherEnvironment = EnvironmentId.make("environment-two");
    const otherTarget = { environmentId: otherEnvironment, threadId };
    await screen.rerender(
      <ChatComposer
        {...input}
        environmentId={otherEnvironment}
        activeThreadEnvironmentId={otherEnvironment}
        composerDraftTarget={otherTarget}
        routeThreadRef={otherTarget}
      />,
    );
    await screen.rerender(<ChatComposer {...input} />);
    await act(() => native.resolve(pngCapture));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(draft()?.images ?? []).toHaveLength(0);
    expect(
      useComposerDraftStore.getState().getComposerDraft(otherTarget)?.images ?? [],
    ).toHaveLength(0);
    expect(input.setThreadError).not.toHaveBeenCalledWith(threadId, expect.any(String));
  });

  it("drops capture when an unsaved draft is retargeted to another project", async () => {
    using _fixture = setup();
    const draftId = DraftId.make("unsaved-draft");
    const firstProject = { environmentId, projectId: ProjectId.make("first-project") };
    useComposerDraftStore.getState().setLogicalProjectDraftThreadId("first", firstProject, draftId);
    const native = deferred<typeof pngCapture | null>();
    mocks.capture.mockReturnValue(native.promise);
    await using screen = await render(
      <ChatComposer {...props({ composerDraftTarget: draftId, draftId, routeKind: "draft" })} />,
    );
    await act(() => capture(screen));
    expect(mocks.capture).toHaveBeenCalledOnce();
    await act(() =>
      useComposerDraftStore
        .getState()
        .setLogicalProjectDraftThreadId(
          "second",
          { environmentId, projectId: ProjectId.make("second-project") },
          draftId,
        ),
    );
    await act(() => native.resolve(pngCapture));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.images ?? []).toHaveLength(
      0,
    );
  });

  it("releases ordinary preparation and revokes partial previews when the scoped destination changes", async () => {
    using _fixture = setup();
    const urls = urlSpies();
    const pending = deferred<{ ok: true; file: File }>();
    mocks.prepare
      .mockResolvedValueOnce({ ok: true, file: image("first.png") })
      .mockReturnValueOnce(pending.promise);
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    await act(() =>
      input.composerRef.current!.addDroppedFiles([image("first.png"), image("second.png")]),
    );
    await expect.poll(() => urls.create).toHaveBeenCalledOnce();
    const otherTarget = { environmentId, threadId: ThreadId.make("other-thread") };
    await screen.rerender(
      <ChatComposer
        {...input}
        activeThreadId={otherTarget.threadId}
        composerDraftTarget={otherTarget}
        routeThreadRef={otherTarget}
      />,
    );
    await act(() => pending.resolve({ ok: true, file: image("second.png") }));
    await expect.poll(() => urls.revoke).toHaveBeenCalledWith("blob:prepared");
    expect(draft()?.images ?? []).toHaveLength(0);
    expect(
      useComposerDraftStore.getState().getComposerDraft(otherTarget)?.images ?? [],
    ).toHaveLength(0);
  });

  it("preserves the generic picker and replaces a reattachment marker at the cap", async () => {
    using _fixture = setup();
    fill(PROVIDER_SEND_TURN_MAX_ATTACHMENTS - 1);
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
    await using screen = await render(
      <ChatComposer
        {...props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 })}
      />,
    );
    await expect.element(screen.getByRole("button", { name: "Attach files" })).toBeVisible();
    await act(() => capture(screen));
    expect(mocks.capture).not.toHaveBeenCalled();
    const picker = screen.container.querySelector<HTMLInputElement>("input[type='file']")!;
    await userEvent.upload(picker, file);
    await expect.poll(() => draft()?.files[0]?.file?.name).toBe("report.txt");
    expect(draft()?.files).toHaveLength(1);
    expect(draft()?.images).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS - 1);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("keeps ordinary classification and supported-image errors", async () => {
    using _fixture = setup();
    const input = props({ supportsAttachmentUploads: true, maxFileAttachmentBytes: 1024 });
    await using _screen = await render(<ChatComposer {...input} />);
    await act(() =>
      input.composerRef.current!.addDroppedFiles([
        new File(["body"], "notes.txt", { type: "text/plain" }),
        new File(["svg"], "vector.svg", { type: "image/svg+xml" }),
        image(),
      ]),
    );
    await expect.poll(() => draft()?.images).toHaveLength(1);
    expect(draft()?.files[0]?.mimeType).toBe("text/plain");
    expect(input.setThreadError).toHaveBeenCalledWith(
      threadId,
      expect.stringContaining("not a supported image type"),
    );
  });
});

describe("ChatComposer question attachment reservations", () => {
  const requestId = RuntimeRequestId.make("synthetic-request");
  function questionProps(questionId = "one", base = props()) {
    return {
      ...base,
      supportsQuestionAttachments: true,
      pendingUserInputs: [
        {
          requestId,
          createdAt: "2026-01-01T00:00:00.000Z",
          responseCapability: "live" as const,
          dismissible: true,
          questions: ["one", "two"].map((id) => ({
            id,
            header: "Question",
            question: "Synthetic question",
            options: [],
            multiSelect: false,
            allowCustomAnswer: true,
          })),
        },
      ],
      activePendingProgress: {
        questionIndex: questionId === "one" ? 0 : 1,
        isLastQuestion: questionId === "two",
        canAdvance: false,
        customAnswer: "",
        activeQuestion: { id: questionId, allowCustomAnswer: true },
      },
    } as ComponentProps<typeof ChatComposer>;
  }
  const answerDraft = (questionId: string) =>
    useComposerDraftStore
      .getState()
      .getComposerDraft(questionAttachmentDraftId(environmentId, threadId, requestId, questionId));

  it("admits an ordinary question image when the preserved thread draft is full", async () => {
    using _fixture = setup();
    fill(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
    const input = questionProps();
    await using _screen = await render(<ChatComposer {...input} />);
    await act(() => input.composerRef.current!.addDroppedFiles([image("answer.png")]));
    await expect.poll(() => answerDraft("one")?.images).toHaveLength(1);
    expect(draft()?.images).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("drops image preparation when the active question changes", async () => {
    using _fixture = setup();
    const urls = urlSpies();
    const preparation = deferred<{ ok: true; file: File }>();
    mocks.prepare.mockReturnValue(preparation.promise);
    const input = questionProps();
    await using screen = await render(<ChatComposer {...input} />);
    await act(() => input.composerRef.current!.addDroppedFiles([image("first.png")]));
    await screen.rerender(<ChatComposer {...questionProps("two", input)} />);
    await act(() => preparation.resolve({ ok: true, file: image("first.png") }));
    for (const id of ["one", "two"]) expect(answerDraft(id)?.images ?? []).toHaveLength(0);
    expect(urls.create).not.toHaveBeenCalled();
  });
});
