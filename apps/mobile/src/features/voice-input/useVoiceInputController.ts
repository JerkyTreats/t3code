import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioRecorder,
  type RecordingStatus,
} from "expo-audio";
import { File } from "expo-file-system";
import { stopMobileVoicePlayback } from "../voice-output/coordination";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { ComposerEditorSelection } from "../../components/ComposerEditor";
import { getLocalVoiceTranscriber } from "../../native/voiceTranscription";
import {
  createAndroidVoiceInput,
  isAndroidLiveVoiceRecording,
} from "../../native/voiceTranscription.android";
import { getNativeShowcaseScene } from "../showcase/nativeShowcaseScene";
import {
  VoiceInputController,
  VOICE_RECORDING_LIMIT_SECONDS,
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceDraftSnapshot,
  type VoiceRecorderStatus,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import {
  normalizeSpeechRecognitionVolume,
  normalizeVoiceInputDecibels,
  VOICE_WAVEFORM_SAMPLE_COUNT,
} from "./voiceInputMetering";

const INITIAL_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };
const VOICE_METERING_INTERVAL_MS = 80;
const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

async function releaseVoiceRecordingAudio(): Promise<void> {
  try {
    await setAudioModeAsync({ allowsRecording: false });
  } finally {
    // Expo does not deactivate AVAudioSession when recording stops or its
    // category changes. Explicit deactivation resumes interrupted app audio.
    await setIsAudioActiveAsync(false);
  }
}

async function configureVoiceRecordingAudio(): Promise<void> {
  await stopMobileVoicePlayback();
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      interruptionMode: "doNotMix",
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
    await setIsAudioActiveAsync(true);
  } catch (error) {
    try {
      await releaseVoiceRecordingAudio();
    } catch {
      // Keep the setup error. The controller has not started a recorder yet.
    }
    throw error;
  }
}

export function useVoiceInputController(input: {
  readonly ownerKey: string | null;
  readonly draftMessage: string;
  readonly selection: ComposerEditorSelection;
  readonly disabled?: boolean;
  readonly onChangeDraftMessage: (value: string) => void;
  readonly onChangeSelection: (selection: ComposerEditorSelection) => void;
}) {
  const [state, setState] = useState<VoiceInputState>(INITIAL_STATE);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef(0);
  const audioLevelsRef = useRef(Array<number>(VOICE_WAVEFORM_SAMPLE_COUNT).fill(0));
  const audioLevels = useSharedValue(audioLevelsRef.current);
  const controllerRef = useRef<VoiceInputController | null>(null);
  const previousDraftRef = useRef({ ownerKey: input.ownerKey, text: input.draftMessage });
  const revisionRef = useRef(0);
  if (
    previousDraftRef.current.ownerKey !== input.ownerKey ||
    previousDraftRef.current.text !== input.draftMessage
  ) {
    previousDraftRef.current = { ownerKey: input.ownerKey, text: input.draftMessage };
    revisionRef.current += 1;
  }
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  const handleVoiceRecorderStatus = useCallback((status: VoiceRecorderStatus) => {
    controllerRef.current?.handleRecorderStatus(status);
  }, []);
  const appendAudioLevel = useCallback(
    (level: number) => {
      if (controllerRef.current?.currentState.phase !== "recording") return;
      const history = audioLevelsRef.current;
      if (level === 0 && history.every((sample) => sample === 0)) return;
      const nextLevels = [...history.slice(1), level];
      audioLevelsRef.current = nextLevels;
      audioLevels.value = nextLevels;
    },
    [audioLevels],
  );
  const handleAndroidVolumeChange = useCallback(
    (volume: number) => appendAudioLevel(normalizeSpeechRecognitionVolume(volume)),
    [appendAudioLevel],
  );
  const handleRecorderStatus = useCallback(
    (status: RecordingStatus) => {
      handleVoiceRecorderStatus({
        isFinished: status.isFinished,
        hasError: status.hasError || status.mediaServicesDidReset === true,
        error: status.error,
        url: status.url,
      });
    },
    [handleVoiceRecorderStatus],
  );
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS, handleRecorderStatus);
  const androidVoiceInputRef = useRef<ReturnType<typeof createAndroidVoiceInput> | null>(null);
  if (Platform.OS === "android" && !androidVoiceInputRef.current) {
    androidVoiceInputRef.current = createAndroidVoiceInput(
      handleVoiceRecorderStatus,
      handleAndroidVolumeChange,
    );
  }
  const androidVoiceInput = androidVoiceInputRef.current;
  const recorder = androidVoiceInput?.recorder ?? audioRecorder;
  const getTranscriber = androidVoiceInput?.getTranscriber ?? getLocalVoiceTranscriber;

  if (!controllerRef.current) {
    controllerRef.current = new VoiceInputController({
      recorder,
      getTranscriber,
      requestPermission: async () => {
        const permission = await requestRecordingPermissionsAsync();
        return { granted: permission.granted, canAskAgain: permission.canAskAgain };
      },
      configureRecording: configureVoiceRecordingAudio,
      releaseRecording: releaseVoiceRecordingAudio,
      deleteRecording: (uri) => {
        if (isAndroidLiveVoiceRecording(uri)) {
          androidVoiceInput?.abort();
          return;
        }
        return new File(uri).delete();
      },
      readDraft: (): VoiceDraftSnapshot | null => {
        const current = latestInputRef.current;
        if (!current.ownerKey) return null;
        return {
          ownerKey: current.ownerKey,
          text: current.draftMessage,
          selection: current.selection,
          revision: revisionRef.current,
        };
      },
      commitDraft: (text, selection) => {
        const current = latestInputRef.current;
        current.onChangeSelection(selection);
        current.onChangeDraftMessage(text);
      },
      onStateChange: setState,
    });
  }

  const controller = controllerRef.current;
  const previousOwnerRef = useRef(input.ownerKey);
  useEffect(() => {
    if (previousOwnerRef.current === input.ownerKey) return;
    previousOwnerRef.current = input.ownerKey;
    controller.ownerChanged();
  }, [controller, input.ownerKey]);

  useFocusEffect(
    useCallback(
      () => () => {
        controller.dispose();
      },
      [controller],
    ),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      // iOS reports `inactive` while its permission dialog is open. Only the
      // real background state cancels preparation; recorder status handles
      // calls and route interruptions during capture.
      if (nextState === "background") controller.appMovedToBackground();
    });
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (state.phase !== "preparing" && state.phase !== "recording") return;

    if (audioLevelsRef.current.some((level) => level !== 0)) {
      audioLevelsRef.current = Array<number>(VOICE_WAVEFORM_SAMPLE_COUNT).fill(0);
      audioLevels.value = audioLevelsRef.current;
    }
    if (elapsedSecondsRef.current !== 0) {
      elapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
    }
    if (state.phase !== "recording") return;

    if (androidVoiceInput) {
      const recordingStartedAt = Date.now();
      const updateElapsed = () => {
        if (controller.currentState.phase !== "recording") return;
        const nextElapsedSeconds = Math.min(
          VOICE_RECORDING_LIMIT_SECONDS,
          Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1_000)),
        );
        if (nextElapsedSeconds !== elapsedSecondsRef.current) {
          elapsedSecondsRef.current = nextElapsedSeconds;
          setElapsedSeconds(nextElapsedSeconds);
        }
      };

      updateElapsed();
      const intervalId = setInterval(updateElapsed, VOICE_METERING_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }

    const sampleRecording = () => {
      if (controller.currentState.phase !== "recording") return;
      const status = audioRecorder.getStatus();
      if (!status.isRecording) return;

      appendAudioLevel(normalizeVoiceInputDecibels(status.metering));

      const nextElapsedSeconds = Math.min(
        VOICE_RECORDING_LIMIT_SECONDS,
        Math.max(0, Math.floor(status.durationMillis / 1_000)),
      );
      if (nextElapsedSeconds !== elapsedSecondsRef.current) {
        elapsedSecondsRef.current = nextElapsedSeconds;
        setElapsedSeconds(nextElapsedSeconds);
      }
    };

    sampleRecording();
    const intervalId = setInterval(sampleRecording, VOICE_METERING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [androidVoiceInput, appendAudioLevel, audioLevels, audioRecorder, controller, state.phase]);

  const start = useCallback(() => {
    if (!latestInputRef.current.disabled) void controller.start();
  }, [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const cancel = useCallback(() => controller.cancel(), [controller]);

  return {
    // Store screenshots show the dictation button even on simulators, whose
    // on-device transcription is unavailable.
    isAvailable: getTranscriber() !== null || getNativeShowcaseScene() !== null,
    state,
    audioLevels,
    elapsedSeconds,
    isBusy: voiceInputBlocksSubmission(state),
    freezesEditor: voiceInputFreezesEditor(state),
    blocksSubmission: voiceInputBlocksSubmission(state),
    start,
    stop,
    cancel,
  };
}
