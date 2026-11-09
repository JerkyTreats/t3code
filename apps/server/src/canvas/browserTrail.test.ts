import { describe, expect, it } from "vite-plus/test";

import { appendTrailFrame, hasBrowserCard } from "./browserTrail.ts";

const frame = (n: number) => ({
  attachmentId: `a-${n}`,
  url: `https://example.test/${n}`,
  title: `Page ${n}`,
  at: `2026-01-01T00:00:0${n}Z`,
});

describe("browser trail", () => {
  it("records a tab only while a live browser card shows it", () => {
    const card = {
      id: "card",
      customData: { t3Card: { kind: "surface", surface: { kind: "preview", tabId: "tab-1" } } },
    };
    expect(hasBrowserCard([card], "tab-1")).toBe(true);
    expect(hasBrowserCard([card], "tab-2")).toBe(false);
    expect(hasBrowserCard([{ ...card, isDeleted: true }], "tab-1")).toBe(false);
  });

  it("keeps the newest frames and hands back the ones that fell off", () => {
    const full = { frames: [frame(1), frame(2), frame(3)] };
    const { trail, dropped } = appendTrailFrame(full, frame(4), 3);
    expect(trail.frames.map((f) => f.attachmentId)).toEqual(["a-2", "a-3", "a-4"]);
    expect(dropped.map((f) => f.attachmentId)).toEqual(["a-1"]);
  });
});
