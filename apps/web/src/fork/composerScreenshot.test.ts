import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { useComposerDraftStore } from "../composerDraftStore";
import {
  attachDesktopScreenshotToComposerDraft,
  composerImageFromDesktopScreenshot,
} from "./composerScreenshot";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);
const PNG_DATA_URL = `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`;

function resetComposerDraftStore() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
}

describe("composerImageFromDesktopScreenshot", () => {
  it("turns a desktop screenshot capture into a draft image attachment", async () => {
    const image = composerImageFromDesktopScreenshot(
      {
        name: "selection.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        dataUrl: PNG_DATA_URL,
      },
      "image-selection",
    );

    expect(image).toMatchObject({
      type: "image",
      id: "image-selection",
      name: "selection.png",
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      previewUrl: PNG_DATA_URL,
    });
    expect(image.file).toBeInstanceOf(File);
    expect(image.file.name).toBe("selection.png");
    expect(image.file.type).toBe("image/png");
    expect(new Uint8Array(await image.file.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("rejects non PNG data URLs before adding them to the draft", () => {
    expect(() =>
      composerImageFromDesktopScreenshot(
        {
          name: "selection.png",
          mimeType: "image/png",
          sizeBytes: 4,
          dataUrl: "data:text/plain;base64,dGVzdA==",
        },
        "image-selection",
      ),
    ).toThrow("Desktop screenshot data must be a PNG data URL.");
  });
});

describe("attachDesktopScreenshotToComposerDraft", () => {
  it("adds one screenshot attachment through the draft store without touching the prompt", async () => {
    resetComposerDraftStore();
    const threadRef = scopeThreadRef(
      EnvironmentId.make("environment-local"),
      ThreadId.make("thread-screenshot"),
    );
    const store = useComposerDraftStore.getState();
    store.setPrompt(threadRef, "Explain the visible error");
    const captureScreenshot = vi.fn().mockResolvedValue({
      name: "desktop.png",
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      dataUrl: PNG_DATA_URL,
    });

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage: (image) => useComposerDraftStore.getState().addImage(threadRef, image),
      bridge: { captureScreenshot },
      createImageId: () => "image-desktop",
      currentImageCount: 0,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });
    const draft = useComposerDraftStore.getState().getComposerDraft(threadRef);

    expect(result.status).toBe("attached");
    expect(draft?.prompt).toBe("Explain the visible error");
    expect(draft?.images).toHaveLength(1);
    expect(draft?.images[0]).toMatchObject({
      id: "image-desktop",
      name: "desktop.png",
      mimeType: "image/png",
      previewUrl: PNG_DATA_URL,
    });
  });

  it("adds one screenshot attachment through the callback contract", async () => {
    const addImage = vi.fn();
    const captureScreenshot = vi.fn().mockResolvedValue({
      name: "desktop.png",
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      dataUrl: PNG_DATA_URL,
    });

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage,
      bridge: { captureScreenshot },
      createImageId: () => "image-desktop",
      currentImageCount: 0,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });

    expect(result.status).toBe("attached");
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(addImage).toHaveBeenCalledTimes(1);
    expect(addImage.mock.calls[0]?.[0]).toMatchObject({
      id: "image-desktop",
      name: "desktop.png",
      mimeType: "image/png",
      previewUrl: PNG_DATA_URL,
    });
  });

  it("does not mutate the draft when the user cancels capture", async () => {
    const addImage = vi.fn();
    const captureScreenshot = vi.fn().mockResolvedValue(null);

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage,
      bridge: { captureScreenshot },
      createImageId: () => "unused-image",
      currentImageCount: 0,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });

    expect(result).toEqual({ status: "cancelled" });
    expect(addImage).not.toHaveBeenCalled();
  });

  it("blocks capture before opening the desktop picker when the draft is full", async () => {
    const addImage = vi.fn();
    const captureScreenshot = vi.fn();

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage,
      bridge: { captureScreenshot },
      createImageId: () => "unused-image",
      currentImageCount: 4,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });

    expect(result).toEqual({ status: "too-many", maxAttachments: 4 });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(addImage).not.toHaveBeenCalled();
  });

  it("rejects oversized screenshots after capture without mutating the draft", async () => {
    const addImage = vi.fn();
    const captureScreenshot = vi.fn().mockResolvedValue({
      name: "large.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      dataUrl: PNG_DATA_URL,
    });

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage,
      bridge: { captureScreenshot },
      createImageId: () => "unused-image",
      currentImageCount: 0,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });

    expect(result).toEqual({
      status: "too-large",
      maxBytes: 1024,
      sizeBytes: 2048,
      name: "large.png",
    });
    expect(addImage).not.toHaveBeenCalled();
  });

  it("reports unavailable when no desktop screenshot bridge exists", async () => {
    const addImage = vi.fn();

    const result = await attachDesktopScreenshotToComposerDraft({
      addImage,
      bridge: null,
      createImageId: () => "unused-image",
      currentImageCount: 0,
      maxAttachments: 4,
      maxImageBytes: 1024,
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(addImage).not.toHaveBeenCalled();
  });
});
