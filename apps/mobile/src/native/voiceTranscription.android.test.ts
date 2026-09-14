import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: never) => void>();
  return {
    listeners,
    addListener: vi.fn((event: string, listener: (payload: never) => void) => {
      listeners.set(event, listener);
      return { remove: vi.fn(() => listeners.delete(event)) };
    }),
    abort: vi.fn(),
    androidTriggerOfflineModelDownload: vi.fn(),
    getSupportedLocales: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    supportsOnDeviceRecognition: vi.fn<() => boolean>(),
  };
});

vi.mock("react-native", () => ({ Platform: { Version: 33 } }));
vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: mocks,
}));

import { createAndroidVoiceInput, isAndroidLiveVoiceRecording } from "./voiceTranscription.android";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.supportsOnDeviceRecognition.mockReturnValue(true);
  mocks.getSupportedLocales.mockResolvedValue({
    installedLocales: ["en-US"],
    locales: ["en-US"],
  });
});

describe("Android local voice transcription", () => {
  it("admits a locale only after its local model is installed", async () => {
    const voiceInput = createAndroidVoiceInput(vi.fn());
    const transcriber = voiceInput.getTranscriber()!;

    await expect(
      transcriber.prepare({ signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      locale: "en-US",
    });
    expect(mocks.getSupportedLocales).toHaveBeenCalledWith({});
    expect(mocks.androidTriggerOfflineModelDownload).not.toHaveBeenCalled();
  });

  it("requests a missing supported local model and leaves voice input retryable", async () => {
    mocks.getSupportedLocales.mockResolvedValue({ installedLocales: [], locales: ["en-US"] });
    mocks.androidTriggerOfflineModelDownload.mockResolvedValue({
      status: "download_scheduled",
      message: "Scheduled",
    });
    const voiceInput = createAndroidVoiceInput(vi.fn());
    const transcriber = voiceInput.getTranscriber()!;

    await expect(
      transcriber.prepare({ signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: "preparation-failed",
    });
    expect(mocks.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({ locale: "en-US" });
  });

  it("admits a model that finishes downloading before preparation retries", async () => {
    mocks.getSupportedLocales
      .mockResolvedValueOnce({ installedLocales: [], locales: ["en-US"] })
      .mockResolvedValueOnce({ installedLocales: ["en-US"], locales: ["en-US"] });
    mocks.androidTriggerOfflineModelDownload.mockResolvedValue({
      status: "download_success",
      message: "Installed",
    });
    const voiceInput = createAndroidVoiceInput(vi.fn());
    const transcriber = voiceInput.getTranscriber()!;

    await expect(
      transcriber.prepare({ signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      locale: "en-US",
    });
    expect(mocks.getSupportedLocales).toHaveBeenCalledTimes(2);
  });

  it.each(["failed download", "unsupported locale"])(
    "rejects %s without selecting a network recognizer",
    async (scenario) => {
      if (scenario === "failed download") {
        mocks.getSupportedLocales.mockResolvedValue({ installedLocales: [], locales: ["en-US"] });
        mocks.androidTriggerOfflineModelDownload.mockRejectedValue(
          new Error("Download unavailable"),
        );
      } else {
        mocks.getSupportedLocales.mockResolvedValue({ installedLocales: [], locales: [] });
      }
      const voiceInput = createAndroidVoiceInput(vi.fn());
      const transcriber = voiceInput.getTranscriber()!;

      await expect(
        transcriber.prepare({ signal: new AbortController().signal }),
      ).rejects.toMatchObject({
        code: scenario === "unsupported locale" ? "unsupported-locale" : "preparation-failed",
      });
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );

  it("starts only a live on-device recognizer without streaming a recording file", async () => {
    const onVolumeChange = vi.fn();
    const voiceInput = createAndroidVoiceInput(vi.fn(), onVolumeChange);
    const transcriber = voiceInput.getTranscriber()!;
    const options = { signal: new AbortController().signal };
    const prepared = await transcriber.prepare(options);
    await voiceInput.recorder.prepareToRecordAsync();
    voiceInput.recorder.record({ forDuration: 300 });

    expect(mocks.start).toHaveBeenCalledWith({
      continuous: true,
      interimResults: false,
      lang: prepared.locale,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: true,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 80,
      },
    });

    mocks.listeners.get("volumechange")?.({ value: 6 } as never);
    expect(onVolumeChange).toHaveBeenCalledWith(6);

    mocks.listeners.get("result")?.({
      isFinal: true,
      results: [{ transcript: " Local transcript " }],
    } as never);
    const stopping = voiceInput.recorder.stop();
    expect(mocks.stop).toHaveBeenCalledOnce();
    mocks.listeners.get("end")?.(undefined as never);

    await stopping;
    await expect(prepared.transcribe("voice-input://android-live", options)).resolves.toBe(
      "Local transcript",
    );
    expect(isAndroidLiveVoiceRecording("voice-input://android-live")).toBe(true);
    expect(mocks.listeners.has("volumechange")).toBe(false);
  });

  it("waits for the recognizer to end after cancellation", async () => {
    const optionsController = new AbortController();
    const voiceInput = createAndroidVoiceInput(vi.fn());
    const transcriber = voiceInput.getTranscriber()!;
    const prepared = await transcriber.prepare({ signal: optionsController.signal });
    await voiceInput.recorder.prepareToRecordAsync();
    voiceInput.recorder.record({ forDuration: 300 });
    const result = prepared.transcribe("voice-input://android-live", {
      signal: optionsController.signal,
    });

    optionsController.abort();
    expect(mocks.abort).toHaveBeenCalledOnce();

    let settled = false;
    void result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    mocks.listeners.get("end")?.(undefined as never);

    await expect(result).rejects.toMatchObject({ code: "cancelled" });
  });

  it("reports a terminal native error once and clears the recording timer", async () => {
    vi.useFakeTimers();
    const onStatus = vi.fn();
    const voiceInput = createAndroidVoiceInput(onStatus);
    const transcriber = voiceInput.getTranscriber()!;
    await transcriber.prepare({ signal: new AbortController().signal });
    await voiceInput.recorder.prepareToRecordAsync();
    voiceInput.recorder.record({ forDuration: 300 });

    mocks.listeners.get("error")?.({ error: "audio-capture", message: "Microphone lost" } as never);
    mocks.listeners.get("end")?.(undefined as never);
    await Promise.resolve();

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({
      error: "Microphone lost",
      hasError: true,
      isFinished: false,
      url: "voice-input://android-live",
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mocks.stop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reports a natural end once and clears the recording timer", async () => {
    vi.useFakeTimers();
    const onStatus = vi.fn();
    const voiceInput = createAndroidVoiceInput(onStatus);
    const transcriber = voiceInput.getTranscriber()!;
    await transcriber.prepare({ signal: new AbortController().signal });
    await voiceInput.recorder.prepareToRecordAsync();
    voiceInput.recorder.record({ forDuration: 300 });

    mocks.listeners.get("end")?.(undefined as never);
    await Promise.resolve();

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({
      error: null,
      hasError: false,
      isFinished: true,
      url: "voice-input://android-live",
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mocks.stop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("stops once at the recording cap and lets the terminal event report completion", async () => {
    vi.useFakeTimers();
    const onStatus = vi.fn();
    const voiceInput = createAndroidVoiceInput(onStatus);
    const transcriber = voiceInput.getTranscriber()!;
    await transcriber.prepare({ signal: new AbortController().signal });
    await voiceInput.recorder.prepareToRecordAsync();
    voiceInput.recorder.record({ forDuration: 5 });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.stop).toHaveBeenCalledOnce();
    mocks.listeners.get("end")?.(undefined as never);
    await Promise.resolve();

    expect(onStatus).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("disposes a prepared session that never starts", async () => {
    const voiceInput = createAndroidVoiceInput(vi.fn());
    const transcriber = voiceInput.getTranscriber()!;
    await transcriber.prepare({ signal: new AbortController().signal });

    expect(mocks.listeners.size).toBe(3);
    voiceInput.abort();

    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });
});
