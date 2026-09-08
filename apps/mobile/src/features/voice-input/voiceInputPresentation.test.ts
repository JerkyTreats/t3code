import { describe, expect, it } from "vite-plus/test";
import { voiceInputFreezesEditor } from "@t3tools/client-runtime/voice-input";

import { resolveVoiceComposerPresentation } from "./voiceInputPresentation";

describe("resolveVoiceComposerPresentation", () => {
  it("swaps only an empty draft's disabled Send action for the primary microphone", () => {
    const state = { phase: "idle", error: null, errorAction: null } as const;

    expect(resolveVoiceComposerPresentation(state, 0, false)).toMatchObject({
      trailingAction: "mic",
      showsSend: false,
    });
    expect(resolveVoiceComposerPresentation(state, 0, true)).toMatchObject({
      trailingAction: "mic",
      showsSend: true,
    });
  });

  it("keeps the ordinary disabled Send action when local voice input is unavailable", () => {
    expect(
      resolveVoiceComposerPresentation(
        { phase: "idle", error: null, errorAction: null },
        0,
        false,
        false,
      ),
    ).toMatchObject({
      trailingAction: "mic",
      showsSend: true,
    });
  });

  it.each(["model unavailable", "submit busy"])(
    "keeps Send visible for text while %s",
    (transientBlocker) => {
      const draft =
        transientBlocker === "model unavailable"
          ? { text: "Fix this", modelUnavailable: true }
          : { text: "Fix this", submitting: true };
      const textDraft = resolveVoiceComposerPresentation(
        { phase: "idle", error: null, errorAction: null },
        0,
        draft.text.trim().length > 0,
      );

      expect(textDraft.showsSend).toBe(true);
    },
  );

  it("maps voice states to stable composer actions and editor read-only state", () => {
    expect(
      resolveVoiceComposerPresentation({ phase: "idle", error: null, errorAction: null }, 0),
    ).toEqual({
      leadingAction: null,
      trailingAction: "mic",
      showsSend: true,
      statusKind: null,
      statusLabel: null,
      confirmationEnabled: false,
    });
    expect(
      resolveVoiceComposerPresentation({ phase: "preparing", error: null, errorAction: null }, 0),
    ).toMatchObject({
      leadingAction: "cancel",
      trailingAction: "confirm",
      showsSend: false,
      statusLabel: "Preparing",
      confirmationEnabled: false,
    });
    expect(
      resolveVoiceComposerPresentation({ phase: "recording", error: null, errorAction: null }, 64),
    ).toMatchObject({
      leadingAction: "cancel",
      trailingAction: "confirm",
      showsSend: false,
      statusLabel: "Recording 1:04",
      confirmationEnabled: true,
    });
    expect(
      resolveVoiceComposerPresentation(
        { phase: "transcribing", error: null, errorAction: null },
        0,
      ),
    ).toMatchObject({
      statusLabel: "Transcribing",
      confirmationEnabled: false,
    });
    expect(
      resolveVoiceComposerPresentation(
        { phase: "error", error: "Microphone unavailable", errorAction: "retry" },
        0,
      ),
    ).toMatchObject({
      leadingAction: null,
      trailingAction: "mic",
      showsSend: true,
      statusKind: "error",
      statusLabel: "Microphone unavailable",
    });

    expect(voiceInputFreezesEditor({ phase: "preparing", error: null, errorAction: null })).toBe(
      true,
    );
    expect(voiceInputFreezesEditor({ phase: "recording", error: null, errorAction: null })).toBe(
      true,
    );
    expect(voiceInputFreezesEditor({ phase: "transcribing", error: null, errorAction: null })).toBe(
      true,
    );
    expect(voiceInputFreezesEditor({ phase: "idle", error: null, errorAction: null })).toBe(false);
  });
});
