import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/components/ChatMarkdown", () => ({
  default: (props: { readonly surfaceId?: string; readonly children?: ReactNode }) => (
    <div data-chat-markdown data-surface-id={props.surfaceId}>
      {props.children}
    </div>
  ),
}));

import { FileMarkdownPreview, fileMarkdownSurfaceId } from "./FileMarkdownPreview";

const THREAD_REF = scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-1"));

function surfaceId(renderer: ReactTestRenderer): string {
  return renderer.root.findByProps({ "data-chat-markdown": true }).props["data-surface-id"];
}

describe("FileMarkdownPreview Mermaid identity", () => {
  it("keeps different file identities distinct even when tuple fields contain separators", () => {
    const first = fileMarkdownSurfaceId(
      scopeThreadRef(EnvironmentId.make("environment:a"), ThreadId.make("thread")),
      "b:guide.md",
    );
    const second = fileMarkdownSurfaceId(
      scopeThreadRef(EnvironmentId.make("environment"), ThreadId.make("a:thread")),
      "b:guide.md",
    );

    expect(first).not.toBe(second);
    expect(fileMarkdownSurfaceId(THREAD_REF, "docs:a/guide.md")).not.toBe(
      fileMarkdownSurfaceId(THREAD_REF, "docs/a:guide.md"),
    );
  });

  it("retains the same semantic identity across component remounts", async () => {
    let first: ReactTestRenderer | undefined;
    let second: ReactTestRenderer | undefined;

    await act(async () => {
      first = create(
        <FileMarkdownPreview
          cwd="/workspace/project"
          relativePath="docs/guide.md"
          text="First"
          threadRef={THREAD_REF}
        />,
      );
    });
    const firstId = surfaceId(first!);
    await act(async () => first?.unmount());

    await act(async () => {
      second = create(
        <FileMarkdownPreview
          cwd="/workspace/project"
          relativePath="docs/guide.md"
          text="Updated"
          threadRef={THREAD_REF}
        />,
      );
    });

    expect(surfaceId(second!)).toBe(firstId);
    expect(JSON.parse(firstId)).toEqual([
      "file-markdown",
      "environment-1",
      "thread-1",
      "docs/guide.md",
    ]);

    await act(async () => second?.unmount());
  });
});
