import * as Schema from "effect/Schema";

export const VOICE_OUTPUT_VOICE_IDS = [
  "alba",
  "marius",
  "javert",
  "jean",
  "fantine",
  "cosette",
  "eponine",
  "azelma",
] as const;

export const VoiceOutputVoiceId = Schema.Literals(VOICE_OUTPUT_VOICE_IDS);
export type VoiceOutputVoiceId = typeof VoiceOutputVoiceId.Type;

export const VOICE_OUTPUT_VOICE_LABELS: Readonly<Record<VoiceOutputVoiceId, string>> = {
  alba: "Alba",
  marius: "Marius",
  javert: "Javert",
  jean: "Jean",
  fantine: "Fantine",
  cosette: "Cosette",
  eponine: "Eponine",
  azelma: "Azelma",
};
