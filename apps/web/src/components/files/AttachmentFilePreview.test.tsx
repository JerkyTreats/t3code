import { EnvironmentId } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AttachmentFilePreview, attachmentMarkdownSurfaceId } from "./AttachmentFilePreview";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn<() => Promise<string | null>>() }));

vi.mock("~/assets/assetUrls", () => ({ useAssetUrlRefresh: () => refresh }));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { wordWrap: boolean }) => unknown) =>
    select({ wordWrap: false }),
  useUpdateClientSettings: () => vi.fn(),
}));
vi.mock("~/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), isCopied: false }),
}));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("~/components/ChatMarkdown", () => ({
  default: (props: { readonly surfaceId?: string; readonly text: string }) => (
    <div data-chat-markdown data-surface-id={props.surfaceId} data-text={props.text} />
  ),
}));
vi.mock("~/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./ReadOnlySourcePreview", () => ({
  default: ({ text }: { text: string }) => <pre>{text}</pre>,
}));
vi.mock("./fileSurfaceChrome", () => ({
  FILE_SURFACE_SUBHEADER_CLASS: "",
  FileSurfaceAction: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button aria-label={label} onClick={onPress} />
  ),
  FileSurfaceFailure: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  FileSurfaceLoading: () => <div role="status">Loading</div>,
  FileSurfaceNotice: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("attachment HTML preview recovery", () => {
  const originalUrl = "https://environment.test/original.html";
  const renewedUrl = "https://environment.test/renewed.html";
  let now = 0;
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    refresh.mockReset().mockResolvedValueOnce(originalUrl).mockResolvedValue(renewedUrl);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<p>Captured HTML</p>")),
    );
  });

  afterEach(async () => {
    if (renderer) await act(() => renderer.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const openRemote = async () => {
    await act(async () => {
      renderer = create(
        <AttachmentFilePreview
          name="document.html"
          mimeType="text/html"
          sizeBytes={100}
          asset={{ environmentId: EnvironmentId.make("test-environment"), attachmentId: "html" }}
        />,
      );
    });
  };

  const toggleMode = async (label: string) => {
    await act(async () => {
      renderer.root.findByProps({ "aria-label": label }).props.onClick();
    });
  };

  it("keeps a renewed URL for subsequent rendered and source views", async () => {
    await openRemote();
    now = 61 * 60_000;
    await toggleMode("Show HTML source");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(renewedUrl, expect.any(Object));

    await toggleMode("Show rendered page");
    expect(renderer.root.findByType("iframe").props.src).toBe(renewedUrl);
    await toggleMode("Show HTML source");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([renewedUrl, renewedUrl]);
  });

  it("does not fetch or mark an expired URL fresh when reauthorization is unavailable", async () => {
    await openRemote();
    now = 61 * 60_000;
    refresh.mockResolvedValue(null);
    await toggleMode("Show HTML source");
    expect(fetch).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ role: "alert" }).children).toEqual([
      "Reconnect to the environment and try again.",
    ]);

    await toggleMode("Show rendered page");
    await toggleMode("Show HTML source");
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("can return to rendered HTML after local source decoding fails", async () => {
    const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xe9]);
    const file = new Blob([bytes], { type: "text/html" });
    vi.spyOn(file, "stream").mockImplementation(
      () =>
        new ReadableStream({
          start: (controller) => {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
    );
    await act(async () => {
      renderer = create(
        <AttachmentFilePreview
          name="document.html"
          mimeType="text/html"
          sizeBytes={file.size}
          file={file}
        />,
      );
    });
    await toggleMode("Show HTML source");
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain("not UTF-8");

    await toggleMode("Show rendered page");
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    expect(renderer.root.findByType("iframe").props.title).toBe("document.html");
  });
});

describe("attachment markdown diagram identity", () => {
  it("distinguishes remote attachments by environment and id across signed URL changes", () => {
    const first = attachmentMarkdownSurfaceId({
      name: "notes.md",
      asset: { environmentId: EnvironmentId.make("environment-a"), attachmentId: "notes" },
    });
    expect(first).toBe(
      attachmentMarkdownSurfaceId({
        name: "renamed.md",
        asset: { environmentId: EnvironmentId.make("environment-a"), attachmentId: "notes" },
      }),
    );
    expect(first).not.toBe(
      attachmentMarkdownSurfaceId({
        name: "notes.md",
        asset: { environmentId: EnvironmentId.make("environment-b"), attachmentId: "notes" },
      }),
    );
  });

  it("keeps a local attachment identity through a remount and separates equal-named blobs", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-markdown");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const markdown = "# Diagram\n\n```mermaid\ngraph TD; A-->B\n```";
    const file = new Blob([markdown], { type: "text/markdown" });
    vi.spyOn(file, "stream").mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(markdown));
            controller.close();
          },
        }),
    );
    const render = async (blob: Blob) => {
      let mounted: ReactTestRenderer | undefined;
      await act(async () => {
        mounted = create(
          <AttachmentFilePreview
            name="notes.md"
            mimeType="text/markdown"
            sizeBytes={blob.size}
            file={blob}
          />,
        );
      });
      return mounted!;
    };
    try {
      const first = await render(file);
      const firstId = first.root.findByProps({ "data-chat-markdown": true }).props[
        "data-surface-id"
      ];
      await act(async () => first.unmount());
      const second = await render(file);
      expect(second.root.findByProps({ "data-chat-markdown": true }).props["data-surface-id"]).toBe(
        firstId,
      );
      await act(async () => second.unmount());
      expect(attachmentMarkdownSurfaceId({ name: "renamed.md", file })).toBe(firstId);
      expect(
        attachmentMarkdownSurfaceId({ name: "notes.md", file: new Blob(["different"]) }),
      ).not.toBe(firstId);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
