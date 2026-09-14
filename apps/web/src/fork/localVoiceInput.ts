import { resolveTranscriptCommit } from "@t3tools/client-runtime/voice-input";

export type LocalVoiceInputPhase = "idle" | "preparing" | "recording" | "transcribing" | "error";

export type LocalVoiceInputState = {
  readonly phase: LocalVoiceInputPhase;
  readonly error: string | null;
};

export function shouldKeepLocalVoiceActionVisible(input: {
  readonly isRunning: boolean;
  readonly hasPendingAction: boolean;
  readonly showPlanFollowUpPrompt: boolean;
  readonly hasSendableContent: boolean;
}): boolean {
  return (
    !input.isRunning &&
    !input.hasPendingAction &&
    !input.showPlanFollowUpPrompt &&
    !input.hasSendableContent
  );
}

export function resolveLocalVoicePrimaryAction(input: {
  readonly isVoiceActionVisible: boolean;
  readonly isVoiceAvailable: boolean;
}): "send" | "voice" {
  return input.isVoiceActionVisible && input.isVoiceAvailable ? "voice" : "send";
}

export function cancelLocalVoiceInputWhenHidden(input: {
  readonly visible: boolean;
  readonly cancel: () => void;
}): void {
  if (!input.visible) input.cancel();
}

export type LocalVoiceDraftSnapshot = {
  readonly ownerKey: string;
  readonly text: string;
  readonly selection: { readonly start: number; readonly end: number };
  readonly revision: number;
};

type LocalRecognitionResult = {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string } | undefined;
};

type LocalRecognitionResultList = {
  readonly length: number;
  readonly [index: number]: LocalRecognitionResult | undefined;
};

type LocalRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult:
    | ((event: {
        readonly resultIndex: number;
        readonly results: LocalRecognitionResultList;
      }) => void)
    | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type LocalSpeechRecognition = {
  new (): LocalRecognition;
  available: (options: {
    readonly langs: readonly string[];
    readonly processLocally: true;
  }) => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  install: (options: {
    readonly langs: readonly string[];
    readonly processLocally: true;
  }) => Promise<boolean>;
};

export function browserLocalSpeechRecognition(): LocalSpeechRecognition | null {
  if (typeof window === "undefined") return null;
  // Chromium currently exposes the local recognition API shape inside Electron
  // even when Electron has not installed the browser-side Mojo binder. Calling
  // the static availability method then terminates the renderer as bad IPC.
  // Both desktop shells must fail closed before touching any recognition API.
  if (window.desktopBridge !== undefined || window.t3ThreadBridge !== undefined) return null;
  const browser = window as Window & {
    SpeechRecognition?: LocalSpeechRecognition;
    webkitSpeechRecognition?: LocalSpeechRecognition;
  };
  const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (
    !Recognition ||
    typeof Recognition.available !== "function" ||
    typeof Recognition.install !== "function"
  ) {
    return null;
  }
  try {
    return "processLocally" in new Recognition() ? Recognition : null;
  } catch {
    return null;
  }
}

export async function browserLocalSpeechRecognitionIsAvailable(
  Recognition: LocalSpeechRecognition | null,
  locale: string,
): Promise<boolean> {
  if (!Recognition) return false;
  try {
    return (
      (await Recognition.available({ langs: [locale], processLocally: true })) !== "unavailable"
    );
  } catch {
    return false;
  }
}

const IDLE_STATE: LocalVoiceInputState = { phase: "idle", error: null };

function sameDraft(
  captured: LocalVoiceDraftSnapshot,
  current: LocalVoiceDraftSnapshot | null,
): boolean {
  return (
    current !== null &&
    current.ownerKey === captured.ownerKey &&
    current.text === captured.text &&
    current.revision === captured.revision
  );
}

export class LocalVoiceInputOwner {
  private state: LocalVoiceInputState = IDLE_STATE;
  private recognition: LocalRecognition | null = null;
  private operation = 0;
  private capturedDraft: LocalVoiceDraftSnapshot | null = null;
  private locale = "en-US";

  constructor(
    private readonly dependencies: {
      readonly getRecognition: () => LocalSpeechRecognition | null;
      readonly locale: () => string;
      readonly readDraft: () => LocalVoiceDraftSnapshot | null;
      readonly commitDraft: (
        text: string,
        selection: { readonly start: number; readonly end: number },
      ) => void;
      readonly onStateChange: (state: LocalVoiceInputState) => void;
    },
  ) {}

  get currentState(): LocalVoiceInputState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state.phase !== "idle" && this.state.phase !== "error") return;
    const Recognition = this.dependencies.getRecognition();
    const capturedDraft = this.dependencies.readDraft();
    if (!Recognition || !capturedDraft) {
      this.setState({ phase: "error", error: "Voice input is not available in this browser." });
      return;
    }

    const operation = ++this.operation;
    const locale = this.dependencies.locale();
    this.locale = locale;
    this.capturedDraft = capturedDraft;
    this.setState({ phase: "preparing", error: null });

    try {
      const availability = await Recognition.available({ langs: [locale], processLocally: true });
      if (!this.isCurrent(operation)) return;
      if (availability !== "available") {
        if (availability === "unavailable") {
          this.fail(operation, "On-device speech recognition is not available for this language.");
          return;
        }
        const installed = await Recognition.install({ langs: [locale], processLocally: true });
        if (!this.isCurrent(operation)) return;
        if (!installed) {
          this.fail(operation, "Could not install on-device speech recognition.");
          return;
        }
      }
      if (!this.isCurrent(operation) || !sameDraft(capturedDraft, this.dependencies.readDraft())) {
        this.fail(operation, "The draft changed while voice input was preparing.");
        return;
      }

      const recognition = new Recognition();
      recognition.lang = locale;
      recognition.continuous = false;
      recognition.interimResults = false;
      // This must stay true: false permits browser-selected remote recognition.
      recognition.processLocally = true;
      recognition.onresult = (event) => {
        if (!this.isCurrent(operation)) return;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal) this.commitFinal(operation, result[0]?.transcript ?? "");
        }
      };
      recognition.onerror = (event) => {
        if (!this.isCurrent(operation)) return;
        this.fail(
          operation,
          event.error === "no-speech"
            ? "No speech was detected."
            : "Could not recognize this recording.",
        );
      };
      recognition.onend = () => {
        if (!this.isCurrent(operation)) return;
        this.fail(operation, "No speech was detected.");
      };
      this.recognition = recognition;
      recognition.start();
      if (!this.isCurrent(operation) || this.recognition !== recognition) return;
      this.setState({ phase: "recording", error: null });
    } catch {
      this.fail(operation, "Could not prepare on-device speech recognition.");
    }
  }

  stop(): void {
    if (this.state.phase !== "recording" || !this.recognition) return;
    this.setState({ phase: "transcribing", error: null });
    try {
      this.recognition.stop();
    } catch {
      this.fail(this.operation, "Could not stop voice input.");
    }
  }

  cancel(): void {
    if (this.state.phase === "idle") return;
    this.operation += 1;
    const recognition = this.releaseRecognition();
    try {
      recognition?.abort();
    } catch {
      // Recognition may have already ended before cancellation reached it.
    }
    this.capturedDraft = null;
    this.setState(IDLE_STATE);
  }

  ownerChanged(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
  }

  private commitFinal(operation: number, transcript: string): void {
    const capturedDraft = this.capturedDraft;
    if (!capturedDraft || !this.isCurrent(operation)) return;
    const result = resolveTranscriptCommit(
      capturedDraft,
      this.dependencies.readDraft(),
      transcript,
      this.locale,
    );
    if (result.kind === "empty") {
      this.fail(operation, "No speech was detected.");
      return;
    }
    if (result.kind === "stale") {
      this.fail(operation, "The draft changed while voice input was recording.");
      return;
    }
    this.operation += 1;
    const recognition = this.releaseRecognition();
    try {
      recognition?.stop();
    } catch {
      // A final result can arrive after the browser has already ended recognition.
    }
    this.capturedDraft = null;
    this.locale = "en-US";
    this.dependencies.commitDraft(result.text, result.selection);
    this.setState(IDLE_STATE);
  }

  private fail(operation: number, error: string): void {
    if (!this.isCurrent(operation)) return;
    this.operation += 1;
    const recognition = this.releaseRecognition();
    try {
      recognition?.abort();
    } catch {
      // Recognition may have already ended before its terminal event reached us.
    }
    this.capturedDraft = null;
    this.locale = "en-US";
    this.setState({ phase: "error", error });
  }

  private releaseRecognition(): LocalRecognition | null {
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
    return recognition;
  }

  private isCurrent(operation: number): boolean {
    return operation === this.operation;
  }

  private setState(state: LocalVoiceInputState): void {
    this.state = state;
    this.dependencies.onStateChange(state);
  }
}
