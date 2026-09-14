import { describe, expect, it } from "vite-plus/test";
import { threadComposerPresentation } from "./threadComposerPresentation";

describe("Thread composer presentation owner", () => {
  it.each([true, false])(
    "preserves model identity in strip=%s independently of the chat host",
    (strip) => {
      const presentation = threadComposerPresentation(true, strip);
      expect(presentation.modelLabelMode).toBe("identifier");
      expect(presentation.runtimeIconOnly).toBe(true);
      expect(presentation.modelTriggerClassName).toContain("whitespace-normal");
      expect(presentation.modelTriggerClassName).not.toContain(":w-0");
    },
  );
  it("retains ordinary chat display labels and responsive compaction", () => {
    expect(threadComposerPresentation(false, true).modelTriggerClassName).toContain(":w-0");
    expect(threadComposerPresentation(false, false)).toEqual({
      modelTriggerClassName: "-ms-2.5",
      modelLabelMode: "display",
      runtimeIconOnly: false,
      keepControlsExpanded: false,
      controlsClassName: undefined,
    });
  });
});
