import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

import {
  VoiceTranscriptionError,
  throwIfVoiceTranscriptionAborted,
  type PreparedVoiceTranscription,
  type VoiceRecorder,
  type VoiceRecorderStatus,
  type VoiceTranscriber,
  type VoiceTranscriptionOptions,
} from "@t3tools/client-runtime/voice-input";

const ANDROID_ON_DEVICE_RECOGNITION_API_LEVEL = 33;
const LIVE_RECORDING_URI = "voice-input://android-live";

type AndroidVoiceInput = {
  readonly abort: () => void;
  readonly recorder: VoiceRecorder;
  readonly getTranscriber: () => VoiceTranscriber | null;
};

type RecognitionSession = {
  readonly abort: () => void;
  readonly start: () => void;
  readonly stop: () => Promise<void>;
  readonly transcribe: (options: VoiceTranscriptionOptions) => Promise<string>;
};

function getDeviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

function supportsAndroidOnDeviceRecognition(): boolean {
  const version = Platform.Version;
  const apiLevel = typeof version === "number" ? version : Number.parseInt(version, 10);
  return (
    apiLevel >= ANDROID_ON_DEVICE_RECOGNITION_API_LEVEL &&
    ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
  );
}

function includesLocale(locales: readonly string[], locale: string): boolean {
  return locales.some((candidate) => candidate.toLowerCase() === locale.toLowerCase());
}

async function ensureOfflineLocale(locale: string, signal: AbortSignal): Promise<void> {
  const supported = await ExpoSpeechRecognitionModule.getSupportedLocales({});
  throwIfVoiceTranscriptionAborted(signal);
  if (!includesLocale(supported.locales, locale)) {
    throw new VoiceTranscriptionError(
      "unsupported-locale",
      "Voice transcription does not support this device language.",
    );
  }
  if (includesLocale(supported.installedLocales, locale)) return;

  try {
    const download = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
      locale,
    });
    throwIfVoiceTranscriptionAborted(signal);
    if (download.status === "download_success") {
      const refreshed = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      throwIfVoiceTranscriptionAborted(signal);
      if (includesLocale(refreshed.installedLocales, locale)) return;
    }
  } catch (error) {
    if (error instanceof VoiceTranscriptionError) throw error;
    throw new VoiceTranscriptionError(
      "preparation-failed",
      "Could not request the on-device language model. Try again after installing it.",
      { cause: error },
    );
  }

  throw new VoiceTranscriptionError(
    "preparation-failed",
    "The on-device language model is downloading. Try voice input again when it is installed.",
  );
}

export function isAndroidLiveVoiceRecording(uri: string): boolean {
  return uri === LIVE_RECORDING_URI;
}

export function getLocalVoiceTranscriber(): VoiceTranscriber | null {
  return null;
}

/** Creates one foreground-only live recognizer that still satisfies the shared recorder contract. */
export function createAndroidVoiceInput(
  onStatus: (status: VoiceRecorderStatus) => void,
): AndroidVoiceInput {
  let session: RecognitionSession | null = null;
  let recordingTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRecordingTimer = () => {
    if (!recordingTimer) return;
    clearTimeout(recordingTimer);
    recordingTimer = null;
  };

  const recorder: VoiceRecorder = {
    get uri() {
      return session ? LIVE_RECORDING_URI : null;
    },
    prepareToRecordAsync: async () => {
      if (!session) throw new Error("Voice transcription is not prepared.");
    },
    record: ({ forDuration }) => {
      if (!session) return;
      session.start();
      recordingTimer = setTimeout(() => {
        void recorder.stop();
      }, forDuration * 1_000);
    },
    stop: async () => {
      clearRecordingTimer();
      await session?.stop();
    },
  };

  return {
    abort: () => {
      clearRecordingTimer();
      session?.abort();
      session = null;
    },
    recorder,
    getTranscriber: () => {
      if (!supportsAndroidOnDeviceRecognition()) return null;
      const locale = getDeviceLocale();
      return {
        prepare: async (options) => {
          throwIfVoiceTranscriptionAborted(options.signal);
          if (!supportsAndroidOnDeviceRecognition()) {
            throw new VoiceTranscriptionError(
              "unavailable",
              "Voice transcription requires Android 13 or later with on-device recognition.",
            );
          }
          await ensureOfflineLocale(locale, options.signal);
          const nextSession = createRecognitionSession(locale, options.signal, (status) => {
            if (session !== nextSession) return;
            clearRecordingTimer();
            onStatus(status);
          });
          session?.abort();
          session = nextSession;
          return {
            locale,
            transcribe: (_uri, transcriptionOptions) =>
              nextSession.transcribe(transcriptionOptions),
          } satisfies PreparedVoiceTranscription;
        },
      } satisfies VoiceTranscriber;
    },
  };
}

function transcriptionError(event: ExpoSpeechRecognitionErrorEvent): VoiceTranscriptionError {
  if (event.error === "language-not-supported" || event.error === "service-not-allowed") {
    return new VoiceTranscriptionError(
      "unsupported-locale",
      "Voice transcription does not support this device language.",
    );
  }

  return new VoiceTranscriptionError(
    "transcription-failed",
    event.message || "Voice transcription failed.",
  );
}

function createRecognitionSession(
  locale: string,
  signal: AbortSignal,
  onTerminalStatus: (status: VoiceRecorderStatus) => void,
): RecognitionSession {
  let started = false;
  let ended = false;
  let transcript = "";
  let completionError: Error | null = null;
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  const finish = () => {
    if (ended) return;
    ended = true;
    resultSubscription.remove();
    errorSubscription.remove();
    endSubscription.remove();
    signal.removeEventListener("abort", abort);
    if (started) {
      onTerminalStatus({
        error: completionError?.message ?? null,
        hasError: completionError !== null,
        isFinished: completionError === null,
        url: LIVE_RECORDING_URI,
      });
    }
    resolveCompletion();
  };
  const resultSubscription = ExpoSpeechRecognitionModule.addListener(
    "result",
    (event: ExpoSpeechRecognitionResultEvent) => {
      if (!event.isFinal) return;
      const segment = event.results[0]?.transcript.trim() ?? "";
      if (segment) transcript = transcript ? `${transcript} ${segment}` : segment;
    },
  );
  const errorSubscription = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    completionError = transcriptionError(event);
  });
  const endSubscription = ExpoSpeechRecognitionModule.addListener("end", finish);
  const abort = () => {
    if (ended) return;
    if (!started) {
      finish();
      return;
    }
    ExpoSpeechRecognitionModule.abort();
  };

  signal.addEventListener("abort", abort, { once: true });
  return {
    abort,
    start: () => {
      throwIfVoiceTranscriptionAborted(signal);
      if (started) return;
      started = true;
      // The package creates Android's on-device recognizer for this option.
      // No audio file is streamed, so AAC recorder output cannot reach a recognizer.
      // Continuous recognition lasts only for this explicit foreground recording,
      // until the user finishes it or foreground lifecycle cancels it. It is not
      // background capture, wake-word listening, or conversational continuation.
      try {
        ExpoSpeechRecognitionModule.start({
          continuous: true,
          interimResults: false,
          lang: locale,
          maxAlternatives: 1,
          requiresOnDeviceRecognition: true,
        });
      } catch (error) {
        completionError =
          error instanceof Error
            ? new VoiceTranscriptionError("transcription-failed", error.message, { cause: error })
            : new VoiceTranscriptionError("transcription-failed", "Voice transcription failed.");
        finish();
        throw completionError;
      }
    },
    stop: async () => {
      if (!started || ended) return;
      if (signal.aborted) {
        await completion;
        return;
      }
      ExpoSpeechRecognitionModule.stop();
      await completion;
    },
    transcribe: async (transcriptionOptions) => {
      if (!ended) await completion;
      throwIfVoiceTranscriptionAborted(transcriptionOptions.signal);
      if (completionError) throw completionError;
      return transcript;
    },
  };
}
