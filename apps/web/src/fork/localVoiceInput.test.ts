import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  browserLocalSpeechRecognition,
  browserLocalSpeechRecognitionIsAvailable,
  cancelLocalVoiceInputWhenHidden,
  LocalVoiceInputOwner,
  resolveLocalVoicePrimaryAction,
  shouldKeepLocalVoiceActionVisible,
  type LocalSpeechRecognition,
  type LocalVoiceDraftSnapshot,
} from "./localVoiceInput";

afterEach(() => vi.unstubAllGlobals());

type FakeRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult:
    | ((event: {
        readonly resultIndex: number;
        readonly results: {
          readonly length: number;
          readonly [index: number]:
            | { readonly isFinal: boolean; readonly 0: { readonly transcript: string } | undefined }
            | undefined;
        };
      }) => void)
    | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
};

function recognition(): FakeRecognition {
  return {
    lang: "",
    continuous: false,
    interimResults: false,
    processLocally: false,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

function createHarness(overrides?: {
  readonly availability?: "available" | "downloadable" | "downloading" | "unavailable";
  readonly installed?: boolean;
}) {
  const activeRecognition = recognition();
  const available = vi.fn(async () => overrides?.availability ?? "available");
  const install = vi.fn(async () => overrides?.installed ?? true);
  const Recognition = function () {
    return activeRecognition;
  } as unknown as LocalSpeechRecognition;
  Recognition.available = available;
  Recognition.install = install;
  let draft = {
    ownerKey: "environment:thread",
    text: "",
    selection: { start: 0, end: 0 },
    revision: 0,
  };
  let isDraftVisible = true;
  const commits: Array<{
    text: string;
    selection: { readonly start: number; readonly end: number };
  }> = [];
  const owner = new LocalVoiceInputOwner({
    getRecognition: () => Recognition,
    locale: () => "en-US",
    readDraft: () => (isDraftVisible ? draft : null),
    commitDraft: (text, selection) => commits.push({ text, selection }),
    onStateChange: () => {},
  });
  return {
    owner,
    ownerRecognition: Recognition,
    activeRecognition,
    available,
    install,
    commits,
    changeDraft: () => {
      draft = { ...draft, text: "edited", revision: draft.revision + 1 };
    },
    hideDraft: () => {
      isDraftVisible = false;
    },
  };
}

function finalTranscript(text: string) {
  return {
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
  };
}

describe("LocalVoiceInputOwner", () => {
  it.each(["desktopBridge", "t3ThreadBridge"] as const)(
    "does not inspect browser recognition inside the %s Electron shell",
    (bridge) => {
      const Recognition = vi.fn();
      vi.stubGlobal("window", {
        [bridge]: {},
        SpeechRecognition: Recognition,
      });

      expect(browserLocalSpeechRecognition()).toBeNull();
      expect(Recognition).not.toHaveBeenCalled();
    },
  );

  it("owns the empty composer microphone swap", () => {
    const emptyComposerVisible = shouldKeepLocalVoiceActionVisible({
      isRunning: false,
      hasPendingAction: false,
      showPlanFollowUpPrompt: false,
      hasSendableContent: false,
    });
    expect(
      resolveLocalVoicePrimaryAction({
        isVoiceActionVisible: emptyComposerVisible,
        isVoiceAvailable: true,
      }),
    ).toBe("voice");
    expect(
      resolveLocalVoicePrimaryAction({
        isVoiceActionVisible: false,
        isVoiceAvailable: true,
      }),
    ).toBe("send");
    expect(
      resolveLocalVoicePrimaryAction({
        isVoiceActionVisible: emptyComposerVisible,
        isVoiceAvailable: false,
      }),
    ).toBe("send");
  });

  it.each([
    {
      isRunning: true,
      hasPendingAction: false,
      showPlanFollowUpPrompt: false,
      hasSendableContent: false,
    },
    {
      isRunning: false,
      hasPendingAction: true,
      showPlanFollowUpPrompt: false,
      hasSendableContent: false,
    },
    {
      isRunning: false,
      hasPendingAction: false,
      showPlanFollowUpPrompt: true,
      hasSendableContent: false,
    },
    {
      isRunning: false,
      hasPendingAction: false,
      showPlanFollowUpPrompt: false,
      hasSendableContent: true,
    },
  ])("cancels local voice input when another composer action takes over", (input) => {
    const cancel = vi.fn();

    const visible = shouldKeepLocalVoiceActionVisible(input);
    cancelLocalVoiceInputWhenHidden({ visible, cancel });

    expect(visible).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("admits the microphone only when the current locale can stay local", async () => {
    const harness = createHarness({ availability: "unavailable" });

    await expect(
      browserLocalSpeechRecognitionIsAvailable(harness.ownerRecognition, "en-US"),
    ).resolves.toBe(false);
    expect(harness.available).toHaveBeenCalledWith({
      langs: ["en-US"],
      processLocally: true,
    });
  });
  it("requires local language-pack APIs and local-only options before recording", async () => {
    const harness = createHarness({ availability: "downloadable" });

    await harness.owner.start();

    expect(harness.available).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
    expect(harness.install).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
    expect(harness.activeRecognition.processLocally).toBe(true);
    expect(harness.activeRecognition.start).toHaveBeenCalledOnce();
  });

  it("stops a recording and cancels an active recognition without committing", async () => {
    const harness = createHarness();
    await harness.owner.start();

    harness.owner.stop();
    expect(harness.activeRecognition.stop).toHaveBeenCalledOnce();
    expect(harness.owner.currentState.phase).toBe("transcribing");

    harness.owner.cancel();
    expect(harness.activeRecognition.abort).toHaveBeenCalledOnce();
    expect(harness.owner.currentState.phase).toBe("idle");
    expect(harness.commits).toEqual([]);
  });

  it("commits a final transcript as draft text", async () => {
    const harness = createHarness();
    await harness.owner.start();

    harness.activeRecognition.onresult?.(finalTranscript("  local transcript  "));

    expect(harness.commits).toEqual([
      { text: "local transcript", selection: { start: 16, end: 16 } },
    ]);
    expect(harness.owner.currentState.phase).toBe("idle");
  });

  it("rejects a final transcript when the draft changed while recognition was active", async () => {
    const harness = createHarness();
    await harness.owner.start();
    harness.changeDraft();

    harness.activeRecognition.onresult?.(finalTranscript("late transcript"));

    expect(harness.commits).toEqual([]);
    expect(harness.owner.currentState).toEqual({
      phase: "error",
      error: "The draft changed while voice input was recording.",
    });
  });

  it("rejects a queued final transcript after the voice action becomes hidden", async () => {
    const harness = createHarness();
    await harness.owner.start();
    harness.hideDraft();

    harness.activeRecognition.onresult?.(finalTranscript("late transcript"));

    expect(harness.commits).toEqual([]);
    expect(harness.owner.currentState).toEqual({
      phase: "error",
      error: "The draft changed while voice input was recording.",
    });
  });

  it("does not start recognition when no on-device language pack is available", async () => {
    const harness = createHarness({ availability: "unavailable" });

    await harness.owner.start();

    expect(harness.activeRecognition.start).not.toHaveBeenCalled();
    expect(harness.owner.currentState.error).toContain("On-device");
  });

  it("fails closed when browser-local recognition capability is absent", async () => {
    const states: string[] = [];
    const owner = new LocalVoiceInputOwner({
      getRecognition: () => null,
      locale: () => "en-US",
      readDraft: (): LocalVoiceDraftSnapshot => ({
        ownerKey: "environment:thread",
        text: "",
        selection: { start: 0, end: 0 },
        revision: 0,
      }),
      commitDraft: () => {},
      onStateChange: (state) => states.push(state.phase),
    });

    await owner.start();

    expect(states).toEqual(["error"]);
    expect(owner.currentState.error).toContain("not available");
  });
});
