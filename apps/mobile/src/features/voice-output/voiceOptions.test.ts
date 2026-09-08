import { describe, expect, it } from "vite-plus/test";
import {
  isVoiceOutputVoiceId,
  resolveVoiceOutputVoiceId,
  voiceOutputVoiceLabel,
} from "./voiceOptions";

describe("mobile voice preferences", () => {
  it("uses the server default until this device chooses a voice", () => {
    expect(resolveVoiceOutputVoiceId(null)).toBeNull();
    expect(resolveVoiceOutputVoiceId({})).toBeNull();
    expect(resolveVoiceOutputVoiceId({ voiceOutputVoiceId: "marius" })).toBe("marius");
    expect(voiceOutputVoiceLabel(null)).toBe("Server default");
    expect(voiceOutputVoiceLabel("marius")).toBe("Marius");
  });

  it("recognizes only supported named voices", () => {
    expect(isVoiceOutputVoiceId("alba")).toBe(true);
    expect(isVoiceOutputVoiceId("unsupported")).toBe(false);
    expect(isVoiceOutputVoiceId(null)).toBe(false);
  });
});
