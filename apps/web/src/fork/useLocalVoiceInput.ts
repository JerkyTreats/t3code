import { useEffect, useRef, useState } from "react";

import {
  browserLocalSpeechRecognitionIsAvailable,
  browserLocalSpeechRecognition,
  cancelLocalVoiceInputWhenHidden,
  LocalVoiceInputOwner,
  resolveLocalVoicePrimaryAction,
  type LocalVoiceInputState,
} from "./localVoiceInput";

const IDLE_STATE: LocalVoiceInputState = { phase: "idle", error: null };

export function useLocalVoiceInput(input: {
  readonly ownerKey: string;
  readonly text: string;
  readonly selection: { readonly start: number; readonly end: number };
  readonly visible: boolean;
  readonly onCommit: (
    text: string,
    selection: { readonly start: number; readonly end: number },
  ) => void;
}) {
  const [state, setState] = useState<LocalVoiceInputState>(IDLE_STATE);
  const [isAvailable, setIsAvailable] = useState(false);
  const locale = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US";
  const latestInputRef = useRef(input);
  latestInputRef.current = input;
  const previousDraftRef = useRef({ ownerKey: input.ownerKey, text: input.text });
  const revisionRef = useRef(0);
  if (
    previousDraftRef.current.ownerKey !== input.ownerKey ||
    previousDraftRef.current.text !== input.text
  ) {
    previousDraftRef.current = { ownerKey: input.ownerKey, text: input.text };
    revisionRef.current += 1;
  }

  const ownerRef = useRef<LocalVoiceInputOwner | null>(null);
  if (!ownerRef.current) {
    ownerRef.current = new LocalVoiceInputOwner({
      getRecognition: browserLocalSpeechRecognition,
      locale: () => (typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US"),
      readDraft: () => {
        const current = latestInputRef.current;
        if (!current.visible) return null;
        return {
          ownerKey: current.ownerKey,
          text: current.text,
          selection: current.selection,
          revision: revisionRef.current,
        };
      },
      commitDraft: (text, selection) => latestInputRef.current.onCommit(text, selection),
      onStateChange: setState,
    });
  }

  const owner = ownerRef.current;
  useEffect(() => {
    let cancelled = false;
    void browserLocalSpeechRecognitionIsAvailable(browserLocalSpeechRecognition(), locale).then(
      (available) => {
        if (!cancelled) setIsAvailable(available);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [locale]);
  const previousOwnerRef = useRef(input.ownerKey);
  useEffect(() => {
    if (previousOwnerRef.current === input.ownerKey) return;
    previousOwnerRef.current = input.ownerKey;
    owner.ownerChanged();
  }, [input.ownerKey, owner]);
  useEffect(() => {
    cancelLocalVoiceInputWhenHidden({ visible: input.visible, cancel: () => owner.cancel() });
  }, [input.visible, owner]);
  useEffect(() => () => owner.dispose(), [owner]);

  return {
    primaryAction: resolveLocalVoicePrimaryAction({
      isVoiceActionVisible: input.visible,
      isVoiceAvailable: isAvailable,
    }),
    state,
    start: () => void owner.start(),
    stop: () => owner.stop(),
    cancel: () => owner.cancel(),
  };
}
