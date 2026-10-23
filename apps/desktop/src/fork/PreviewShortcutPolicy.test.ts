import { describe, expect, it } from "vite-plus/test";
import * as PreviewShortcutPolicy from "./PreviewShortcutPolicy.ts";

describe("isPreviewRefreshShortcut", () => {
  const input = (overrides: Partial<Electron.Input> = {}) =>
    ({
      type: "keyDown",
      key: "r",
      meta: true,
      control: false,
      shift: false,
      alt: false,
      ...overrides,
    }) as Electron.Input;

  it("recognizes the platform refresh chord without matching modified variants", () => {
    expect(PreviewShortcutPolicy.isPreviewRefreshShortcut(input(), "darwin")).toBe(true);
    expect(
      PreviewShortcutPolicy.isPreviewRefreshShortcut(
        input({ meta: false, control: true }),
        "linux",
      ),
    ).toBe(true);
    expect(PreviewShortcutPolicy.isPreviewRefreshShortcut(input({ shift: true }), "darwin")).toBe(
      false,
    );
    expect(PreviewShortcutPolicy.isPreviewRefreshShortcut(input({ type: "keyUp" }), "darwin")).toBe(
      false,
    );
  });
});

describe("exact platform browser chords", () => {
  it.each(["darwin", "linux", "win32"] as const)("admits only exact %s modifiers", (platform) => {
    for (const [key, shift, action] of [
      ["t", false, "preview.new"],
      ["w", false, "preview.close"],
      ["t", true, "preview.reopenClosed"],
      ["l", false, "preview.focusUrl"],
    ] as const) {
      const input = {
        type: "keyDown",
        key,
        shift,
        alt: false,
        meta: platform === "darwin",
        control: platform !== "darwin",
      } as Electron.Input;
      expect(PreviewShortcutPolicy.previewBrowserActionForShortcut(input, platform)).toBe(action);
      for (const override of [
        { type: "keyUp" },
        { alt: true },
        { meta: !input.meta },
        { control: !input.control },
      ]) {
        expect(
          PreviewShortcutPolicy.previewBrowserActionForShortcut(
            { ...input, ...override } as Electron.Input,
            platform,
          ),
        ).toBeNull();
      }
    }
    const refresh = {
      type: "keyDown",
      key: "r",
      shift: false,
      alt: false,
      meta: platform === "darwin",
      control: platform !== "darwin",
    } as Electron.Input;
    expect(PreviewShortcutPolicy.isPreviewRefreshShortcut(refresh, platform)).toBe(true);
    expect(
      PreviewShortcutPolicy.isPreviewRefreshShortcut(
        { ...refresh, meta: true, control: true },
        platform,
      ),
    ).toBe(false);
    expect(
      PreviewShortcutPolicy.isPreviewRefreshShortcut(
        { ...refresh, meta: !refresh.meta, control: !refresh.control },
        platform,
      ),
    ).toBe(false);
  });
});
