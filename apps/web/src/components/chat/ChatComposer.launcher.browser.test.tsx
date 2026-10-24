import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, type Screen } from "../../../test/render";
import {
  deferred,
  environmentId,
  image,
  pngCapture,
  props,
  threadId,
} from "../../../test/fixtures/chatComposer";

// Mounted-host evidence for F16 launcher submission: a queued launcher prompt dispatches only
// through ordinary send admission, after the composer has committed the exact prompt and
// every attachment it is still preparing.
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), capture: vi.fn() }));
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
vi.mock(import("../ComposerPromptEditor"), async (original) => ({
  ...(await original()),
  ComposerPromptEditor: (() => null) as never,
}));

import { ChatComposer, type ChatComposerProps } from "./ChatComposer";
import {
  DraftId,
  useComposerDraftStore,
  type ComposerImageAttachment,
} from "../../composerDraftStore";
import { DesktopLauncherActivationOwner } from "../../fork/desktopLauncherActivation";
import { useDesktopLauncherSubmitAdmission } from "../desktop/DesktopLauncherActivationCoordinator";

const initialStore = useComposerDraftStore.getState();
const activationId = "12345678-1234-4234-8234-1234567890ab";
const bridgeWindow = window as unknown as { desktopBridge?: unknown };

function setup() {
  useComposerDraftStore.setState(initialStore, true);
  mocks.capture.mockReset();
  mocks.prepare.mockReset();
  mocks.prepare.mockImplementation(async (file: File) => ({ ok: true, file }));
  bridgeWindow.desktopBridge = { captureDesktopScreenshot: mocks.capture };
  return {
    [Symbol.dispose]() {
      delete bridgeWindow.desktopBridge;
      vi.restoreAllMocks();
    },
  };
}

function draftProps(draftId: DraftId) {
  return props({
    composerDraftTarget: draftId,
    draftId,
    routeKind: "draft",
    isLocalDraftThread: true,
    isServerThread: false,
  });
}

/** The ChatView seam: launcher admission reads the composer's committed refs. */
function LauncherHost({
  input,
  owner,
  attempt,
  available = true,
  onCommitted,
}: {
  input: ChatComposerProps;
  owner: DesktopLauncherActivationOwner;
  attempt: () => Promise<void | boolean>;
  available?: boolean;
  onCommitted?: () => void;
}) {
  const notify = useDesktopLauncherSubmitAdmission(
    input.draftId,
    attempt,
    () => ({
      prompt: input.promptRef.current,
      ready: input.composerRef.current?.getSendContext().submissionReady === true,
    }),
    owner,
  );
  return (
    <ChatComposer
      {...input}
      providerStatuses={available ? input.providerStatuses : []}
      onSendContextCommitted={() => {
        onCommitted?.();
        notify();
      }}
    />
  );
}

function capture(screen: Screen) {
  (screen.getByRole("button", { name: "Capture screenshot" }).element() as HTMLElement).click();
}
function sendButton(screen: Screen) {
  return screen.container.querySelector<HTMLButtonElement>("button[type='submit']")!;
}

describe("ChatComposer committed launcher notification", () => {
  it("notifies only after real prompt refs synchronize and admits a reused mounted draft once", async () => {
    using _fixture = setup();
    const owner = new DesktopLauncherActivationOwner();
    const draftId = DraftId.make("launcher-committed-draft");
    const prompt = "  actual composer\n\tlauncher bytes  ";
    const input = draftProps(draftId);
    const attempts: string[] = [];
    const notifications: string[] = [];
    const complete = vi.fn(async () => true);
    const attempt = async () => {
      const outgoing = input.promptRef.current;
      attempts.push(outgoing);
      if (!outgoing.trim()) return false;
      await owner.completeAdmittedSubmit(draftId, outgoing);
    };
    await using _screen = await render(
      <LauncherHost
        input={input}
        owner={owner}
        attempt={attempt}
        onCommitted={() => notifications.push(input.promptRef.current)}
      />,
    );
    expect(input.promptRef.current).toBe("");
    await act(() => {
      useComposerDraftStore.getState().setPrompt(draftId, prompt);
      owner.queueSubmit({ activationId, draftId, prompt, complete });
      expect(attempts).toEqual([]);
    });
    await expect.poll(() => attempts).toEqual([prompt]);
    expect(notifications).toContain(prompt);
    expect(complete).toHaveBeenCalledOnce();
    expect(owner.getSubmitState()).toBeNull();
  });

  it("preserves staged content through provider unavailability and dispatches only when actual send context becomes ready", async () => {
    using _fixture = setup();
    const owner = new DesktopLauncherActivationOwner();
    const draftId = DraftId.make("launcher-provider-wait");
    const prompt = "wait for provider";
    const input = draftProps(draftId);
    const complete = vi.fn(async () => true);
    const attempt = vi.fn(async () => {
      await owner.completeAdmittedSubmit(draftId, input.promptRef.current);
    });
    const host = (available: boolean) => (
      <LauncherHost input={input} owner={owner} attempt={attempt} available={available} />
    );
    await using screen = await render(host(false));
    await act(() => {
      useComposerDraftStore.getState().setPrompt(draftId, prompt);
      owner.queueSubmit({ activationId, draftId, prompt, complete });
    });
    expect(attempt).not.toHaveBeenCalled();
    expect(input.promptRef.current).toBe(prompt);
    expect(owner.getSubmitState()).toBe("waiting");
    await screen.rerender(host(true));
    await expect.poll(() => attempt).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe("ChatComposer launcher attachment admission", () => {
  async function mountLauncher(available = true) {
    const owner = new DesktopLauncherActivationOwner();
    const draftId = DraftId.make("launcher-attachment-wait");
    const prompt = "  attach before launch\n\tkeep these bytes  ";
    useComposerDraftStore
      .getState()
      .setLogicalProjectDraftThreadId(
        "launcher-project",
        { environmentId, projectId: ProjectId.make("launcher-project") },
        draftId,
        { threadId },
      );
    useComposerDraftStore.getState().setPrompt(draftId, prompt);
    const input = draftProps(draftId);
    const sent: Array<{ prompt: string; images: ComposerImageAttachment[] }> = [];
    const complete = vi.fn(async () => true);
    const attempt = vi.fn(async () => {
      sent.push({ prompt: input.promptRef.current, images: [...input.composerImagesRef.current] });
      await owner.completeAdmittedSubmit(draftId, input.promptRef.current);
    });
    const host = (isAvailable: boolean) => (
      <LauncherHost input={input} owner={owner} attempt={attempt} available={isAvailable} />
    );
    const screen = await render(host(available));
    return {
      screen,
      owner,
      input,
      prompt,
      sent,
      attempt,
      complete,
      queue: () => owner.queueSubmit({ activationId, draftId, prompt, complete }),
      enableProvider: () => screen.rerender(host(true)),
    };
  }

  it.each(["capture", "paste"] as const)(
    "keeps launcher pending through provider readiness while %s is preparing",
    async (source) => {
      using _fixture = setup();
      const native = deferred<typeof pngCapture | null>();
      const preparation = deferred<{ ok: true; file: File }>();
      mocks.capture.mockReturnValue(native.promise);
      mocks.prepare.mockReturnValue(preparation.promise);
      const fixture = await mountLauncher(false);
      await using screen = fixture.screen;
      await act(() => {
        fixture.queue();
      });
      await act(() => {
        if (source === "capture") capture(screen);
        else fixture.input.composerRef.current!.addDroppedFiles([image()]);
      });
      await fixture.enableProvider();
      expect(fixture.attempt).not.toHaveBeenCalled();
      expect(fixture.owner.getSubmitState()).toBe("waiting");
      expect(fixture.input.promptRef.current).toBe(fixture.prompt);
      await expect.element(sendButton(screen)).toBeDisabled();
      await act(() => screen.container.querySelector("form")!.requestSubmit());
      expect(fixture.input.onSend).not.toHaveBeenCalled();
      if (source === "capture") {
        await act(() => native.resolve(pngCapture));
        expect(fixture.attempt).not.toHaveBeenCalled();
      }
      const prepared = image("prepared.png");
      await act(() => preparation.resolve({ ok: true, file: prepared }));
      await expect.poll(() => fixture.attempt).toHaveBeenCalledOnce();
      expect(fixture.sent).toEqual([
        {
          prompt: expect.stringContaining(fixture.prompt),
          images: [expect.objectContaining({ file: prepared })],
        },
      ]);
      expect(fixture.complete).toHaveBeenCalledOnce();
      expect(fixture.owner.getSubmitState()).toBeNull();
      await fixture.enableProvider();
      expect(fixture.attempt).toHaveBeenCalledOnce();
    },
  );

  it.each(["capture", "paste"] as const)(
    "reads the synchronous %s reservation before React commits disabled state",
    async (source) => {
      using _fixture = setup();
      const native = deferred<typeof pngCapture | null>();
      const preparation = deferred<{ ok: true; file: File }>();
      mocks.capture.mockReturnValue(native.promise);
      mocks.prepare.mockReturnValue(preparation.promise);
      const fixture = await mountLauncher();
      await using screen = fixture.screen;
      await expect.element(sendButton(screen)).toBeEnabled();
      await act(() => {
        if (source === "capture") capture(screen);
        else fixture.input.composerRef.current!.addDroppedFiles([image()]);
        expect(sendButton(screen).disabled).toBe(false);
        fixture.queue();
        expect(fixture.attempt).not.toHaveBeenCalled();
        expect(fixture.owner.getSubmitState()).toBe("waiting");
      });
      if (source === "capture") await act(() => native.resolve(pngCapture));
      expect(fixture.attempt).not.toHaveBeenCalled();
      const prepared = image("race.png");
      await act(() => preparation.resolve({ ok: true, file: prepared }));
      await expect.poll(() => fixture.attempt).toHaveBeenCalledOnce();
      expect(fixture.sent).toEqual([
        {
          prompt: expect.stringContaining(fixture.prompt),
          images: [expect.objectContaining({ file: prepared })],
        },
      ]);
      expect(fixture.complete).toHaveBeenCalledOnce();
    },
  );

  it.each(["cancel", "native-error", "preparation-error"] as const)(
    "releases the waiting launcher after %s without attaching a partial result",
    async (outcome) => {
      using _fixture = setup();
      const native = deferred<typeof pngCapture | null>();
      const preparation = deferred<{ ok: true; file: File }>();
      mocks.capture.mockReturnValue(native.promise);
      mocks.prepare.mockReturnValue(preparation.promise);
      const fixture = await mountLauncher();
      await using screen = fixture.screen;
      await expect.element(sendButton(screen)).toBeEnabled();
      await act(() => {
        capture(screen);
        fixture.queue();
      });
      expect(fixture.attempt).not.toHaveBeenCalled();
      if (outcome === "preparation-error") {
        await act(() => native.resolve(pngCapture));
        expect(fixture.attempt).not.toHaveBeenCalled();
        await act(() => preparation.reject(new Error("preparation failed")));
      } else if (outcome === "native-error") {
        await act(() => native.reject(new Error("capture failed")));
      } else {
        await act(() => native.resolve(null));
      }
      await expect.poll(() => fixture.attempt).toHaveBeenCalledOnce();
      expect(fixture.sent).toEqual([{ prompt: fixture.prompt, images: [] }]);
      expect(fixture.complete).toHaveBeenCalledOnce();
      expect(fixture.owner.getSubmitState()).toBeNull();
    },
  );
});
