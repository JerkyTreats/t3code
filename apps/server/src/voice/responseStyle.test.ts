import { describe, expect, it } from "vite-plus/test";
import { Schema } from "effect";
import { ThreadTurnStartRequestedPayload } from "@t3tools/contracts";
import { applyResponseStyle } from "./responseStyle.ts";

describe("per-turn response style", () => {
  it("keeps ordinary input unchanged and injects a single verbatim speech instruction", () => {
    expect(applyResponseStyle("Explain this.")).toBe("Explain this.");
    const voice = applyResponseStyle("Explain this.", "voice");
    expect(voice).toContain("spoken verbatim");
    expect(voice).toContain("This applies only to this turn");
    expect(voice.startsWith("Explain this.\n\n")).toBe(true);
    expect(applyResponseStyle("Explain this.", "text")).toContain("no longer applies");
  });
  it.each(["/compact", "/model example", "/login", " /custom exact args"])(
    "preserves slash grammar for %s",
    (text) => {
      expect(applyResponseStyle(text, "voice")).toBe(text);
      expect(applyResponseStyle(text, "text")).toBe(text);
    },
  );
  it("persists optional style and accepts historical events", () => {
    const payload = {
      threadId: "thread-1",
      messageId: "message-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const decode = Schema.decodeUnknownSync(ThreadTurnStartRequestedPayload);
    expect(decode(payload).responseStyle).toBeUndefined();
    expect(decode({ ...payload, responseStyle: "voice" }).responseStyle).toBe("voice");
    expect(() => decode({ ...payload, responseStyle: "other" })).toThrow();
  });
});
