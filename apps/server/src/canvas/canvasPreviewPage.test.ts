import type { ThreadCanvasScene } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { canvasPreviewPage, previewRegion } from "./canvasPreviewPage.ts";

const scene: ThreadCanvasScene = {
  revision: 1,
  elements: [
    {
      id: "turn-old",
      type: "rectangle",
      x: -400,
      y: 0,
      width: 800,
      height: 300,
      customData: { t3Turn: "a", t3TurnTitle: "Old" },
    },
    {
      id: "turn-new",
      type: "rectangle",
      x: -400,
      y: 9000,
      width: 800,
      height: 400,
      customData: { t3Turn: "b", t3TurnTitle: "Latest <turn>" },
    },
    {
      id: "map/asks",
      type: "rectangle",
      x: -400,
      y: 9500,
      width: 600,
      height: 200,
      customData: {
        t3Drawing: { id: "map" },
        t3Card: {
          kind: "markdown",
          text: "## Asks\n\n| Due | Ask |\n|---|---|\n| Mon | PENG-274 <script>alert(1)</script> |",
        },
      },
    },
    { id: "far", type: "text", x: 0, y: 40_000, width: 50, height: 20, text: "far away" },
    { id: "note", type: "text", x: 300, y: 9050, width: 80, height: 25, text: "cite?" },
    {
      id: "gone",
      type: "text",
      x: 0,
      y: 9100,
      width: 80,
      height: 25,
      text: "deleted",
      isDeleted: true,
    },
  ],
};

describe("previewRegion", () => {
  it("frames the latest turn and what lies near it by default", () => {
    const region = previewRegion(scene, {})!;
    expect(region.y).toBeLessThan(9000);
    expect(region.y + region.height).toBeGreaterThanOrEqual(9700);
    expect(region.y + region.height).toBeLessThan(40_000);
  });

  it("frames one drawing when asked", () => {
    expect(previewRegion(scene, { drawingId: "map" })).toEqual({
      x: -480,
      y: 9420,
      width: 760,
      height: 360,
    });
    expect(previewRegion(scene, { drawingId: "nope" })).toBeNull();
  });
});

describe("canvasPreviewPage", () => {
  it("renders turns, cards as sanitized markdown, and the user's marks, and skips what is out of view", () => {
    const region = previewRegion(scene, {})!;
    const { html, scale } = canvasPreviewPage({ scene, region, htmlOf: () => null });
    expect(scale).toBe(1);
    expect(html).toContain("Turn: Latest &lt;turn&gt;");
    expect(html).toContain("<h2>Asks</h2>");
    expect(html).toContain("<td>PENG-274");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain('class="text user"');
    expect(html).toContain("cite?");
    expect(html).not.toContain("far away");
    expect(html).not.toContain("deleted");
    expect(html).not.toContain("Turn: Old");
  });

  it("styles markdown cards with the app stylesheet when it has one", () => {
    const region = previewRegion(scene, {})!;
    const approximate = canvasPreviewPage({ scene, region, htmlOf: () => null }).html;
    expect(approximate).toContain(".card table");
    const { html } = canvasPreviewPage({
      scene,
      region,
      htmlOf: () => null,
      appStylesheet: ".chat-markdown{font-size:14px}",
    });
    expect(html).toContain("<style>.chat-markdown{font-size:14px}</style>");
    expect(html).not.toContain(".card table");
    expect(html).toContain('data-card="map/asks"');
    expect(html).toContain('class="chat-markdown w-full min-w-0');
  });

  it("shrinks a wide region to the page width", () => {
    const { scale, width } = canvasPreviewPage({
      scene,
      region: { x: 0, y: 0, width: 3200, height: 800 },
      htmlOf: () => null,
    });
    expect(scale).toBe(0.5);
    expect(width).toBe(1600);
  });

  it("puts a label where Excalidraw aligns it, a user's frame title at the top left", () => {
    const { html } = canvasPreviewPage({
      scene: {
        revision: 1,
        elements: [
          { id: "frame", type: "rectangle", x: 0, y: 0, width: 600, height: 400 },
          {
            id: "frame-title",
            type: "text",
            x: 10,
            y: 10,
            width: 200,
            height: 25,
            text: "Org structure",
            containerId: "frame",
            textAlign: "left",
            verticalAlign: "top",
          },
        ],
      },
      region: { x: -50, y: -50, width: 700, height: 500 },
      appStylesheet: null,
      htmlOf: () => null,
    });
    expect(html).toContain(
      'justify-content:flex-start;align-items:flex-start;text-align:left">Org structure',
    );
  });
});
