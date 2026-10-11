import { describe, expect, it } from "vite-plus/test";
import {
  threadComposerPresentation,
  threadModelIdentifierPresentation,
} from "./threadComposerPresentation";
import { ANTIGRAVITY_DEFAULT_MODEL } from "@t3tools/contracts";

describe("Thread composer presentation owner", () => {
  it("keeps exact identity and accessible labels without the picker host", () => {
    expect(
      threadModelIdentifierPresentation({
        labelMode: "identifier",
        model: "custom-version",
        selectedModel: { slug: "unrelated", isUnavailable: true },
      }),
    ).toEqual({
      title: "custom-version",
      label: "custom-version (Unavailable)",
      ariaLabel: "Model: custom-version",
    });
    expect(
      threadModelIdentifierPresentation({
        labelMode: "identifier",
        model: ANTIGRAVITY_DEFAULT_MODEL,
        selectedModel: { slug: "account-version" },
      })?.title,
    ).toBe("account-version");
    expect(
      threadModelIdentifierPresentation({
        labelMode: "identifier",
        model: ANTIGRAVITY_DEFAULT_MODEL,
        selectedModel: undefined,
      })?.title,
    ).toBe("Choose model");
    expect(
      threadModelIdentifierPresentation({
        labelMode: "display",
        model: "custom-version",
        selectedModel: undefined,
      }),
    ).toBeNull();
  });
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
