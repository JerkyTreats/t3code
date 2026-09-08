import {
  VOICE_OUTPUT_VOICE_IDS,
  VOICE_OUTPUT_VOICE_LABELS,
  type VoiceOutputVoiceId,
} from "@t3tools/contracts";

export function resolveVoiceOutputVoiceId(
  value: { readonly voiceOutputVoiceId?: VoiceOutputVoiceId } | null,
): VoiceOutputVoiceId | null {
  return value?.voiceOutputVoiceId ?? null;
}

export function voiceOutputVoiceLabel(voiceId: VoiceOutputVoiceId | null): string {
  return voiceId === null ? "Server default" : VOICE_OUTPUT_VOICE_LABELS[voiceId];
}

export function isVoiceOutputVoiceId(value: unknown): value is VoiceOutputVoiceId {
  return typeof value === "string" && (VOICE_OUTPUT_VOICE_IDS as readonly string[]).includes(value);
}
