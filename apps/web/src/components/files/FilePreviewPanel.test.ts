import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatFileCommentRange,
  normalizeFileCommentRange,
  remapFileCommentAnnotations,
} from "./fileCommentAnnotations";
import {
  clampFileLine,
  centeredFileRevealScrollTop,
  createFileRevealIncarnation,
  FILE_LINK_REVEAL_ATTRIBUTE,
  type FileRevealIncarnation,
  ownsFileRevealIncarnation,
  updateFileLinkReveal,
} from "./fileLineReveal";
import {
  isMarkdownPreviewFile,
  markdownLineRevealRequestKey,
  markdownLineRevealSourcePath,
  resolveFilePreviewMode,
  setMarkdownTaskChecked,
} from "./filePreviewMode";

describe("file comment annotations", () => {
  it("normalizes and formats selected line ranges", () => {
    expect(normalizeFileCommentRange({ start: 16, end: 7 })).toEqual({
      startLine: 7,
      endLine: 16,
    });
    expect(formatFileCommentRange(7, 7)).toBe("L7");
    expect(formatFileCommentRange(7, 16)).toBe("L7 to L16");
  });

  it("keeps an annotation range attached when Pierre remaps its anchor line", () => {
    expect(
      remapFileCommentAnnotations([
        {
          lineNumber: 20,
          metadata: {
            entries: [
              {
                id: "comment-1",
                kind: "comment",
                startLine: 7,
                endLine: 16,
                text: "Keep this guarded.",
              },
            ],
          },
        },
      ]),
    ).toEqual([
      {
        lineNumber: 20,
        metadata: {
          entries: [
            {
              id: "comment-1",
              kind: "comment",
              startLine: 11,
              endLine: 20,
              text: "Keep this guarded.",
            },
          ],
        },
      },
    ]);
  });
});

describe("isMarkdownPreviewFile", () => {
  it("recognizes markdown and MDX files case-insensitively", () => {
    expect(isMarkdownPreviewFile("README.md")).toBe(true);
    expect(isMarkdownPreviewFile("docs/guide.MDX")).toBe(true);
  });

  it("does not treat other text files as markdown", () => {
    expect(isMarkdownPreviewFile("docs/guide.txt")).toBe(false);
    expect(isMarkdownPreviewFile("docs/markdown.ts")).toBe(false);
  });
});

describe("resolveFilePreviewMode", () => {
  it("renders markdown by default and keeps source mode scoped to the selected file", () => {
    expect(resolveFilePreviewMode("docs/guide.md", null)).toBe("rendered-markdown");
    expect(resolveFilePreviewMode("docs/guide.md", "docs/guide.md")).toBe("source");
    expect(resolveFilePreviewMode("docs/other.md", "docs/guide.md")).toBe("rendered-markdown");
  });

  it("classifies non-markdown files as code previews", () => {
    expect(resolveFilePreviewMode("src/index.ts", null)).toBe("code");
    expect(resolveFilePreviewMode(null, null)).toBe("code");
  });

  it("opens line-qualified markdown links in source mode until that request is dismissed", () => {
    const requestKey = markdownLineRevealRequestKey("local:thread-one", "README.md", 42, 7);
    const sourcePath = markdownLineRevealSourcePath("local:thread-one", "README.md", 42, 7, null);

    expect(sourcePath).toBe("README.md");
    expect(resolveFilePreviewMode("README.md", sourcePath)).toBe("source");
    expect(
      markdownLineRevealSourcePath("local:thread-one", "README.md", 42, 7, requestKey),
    ).toBeNull();
    expect(resolveFilePreviewMode("README.md", null)).toBe("rendered-markdown");
  });

  it("starts a fresh markdown source reveal when the same target is requested again", () => {
    const dismissedRequestKey = markdownLineRevealRequestKey(
      "local:thread-one",
      "README.md",
      42,
      7,
    );

    expect(
      markdownLineRevealSourcePath("local:thread-one", "README.md", 42, 8, dismissedRequestKey),
    ).toBe("README.md");
    expect(
      markdownLineRevealSourcePath("local:thread-one", "README.md", null, 8, dismissedRequestKey),
    ).toBeNull();
    expect(
      markdownLineRevealSourcePath("local:thread-one", "src/index.ts", 42, 8, dismissedRequestKey),
    ).toBeNull();
  });

  it("does not carry a dismissed reveal across same-project thread switches", () => {
    const dismissedRequestKey = markdownLineRevealRequestKey(
      "local:thread-one",
      "README.md",
      42,
      1,
    );

    expect(
      markdownLineRevealSourcePath("local:thread-two", "README.md", 42, 1, dismissedRequestKey),
    ).toBe("README.md");
  });
});

describe("file line reveal", () => {
  const runRevealCallback = (
    current: FileRevealIncarnation | null,
    candidate: FileRevealIncarnation,
    applyRevealSideEffects: () => void,
  ) => {
    if (!ownsFileRevealIncarnation(current, candidate)) return;
    applyRevealSideEffects();
  };

  it("accepts request one after close and reopen while the old request stays inert", () => {
    const applyOldRevealSideEffects = vi.fn();
    const applyReopenedRevealSideEffects = vi.fn();
    const oldIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 8,
    });
    const reopenedIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });

    runRevealCallback(reopenedIncarnation, oldIncarnation, applyOldRevealSideEffects);
    runRevealCallback(reopenedIncarnation, reopenedIncarnation, applyReopenedRevealSideEffects);

    expect(applyOldRevealSideEffects).not.toHaveBeenCalled();
    expect(applyReopenedRevealSideEffects).toHaveBeenCalledExactlyOnceWith();
  });

  it("rejects old callbacks when switching threads inside the same project", () => {
    const applyOldThreadSideEffects = vi.fn();
    const applyCurrentThreadSideEffects = vi.fn();
    const oldThreadIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 4,
    });
    const currentThreadIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-two",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });

    runRevealCallback(currentThreadIncarnation, oldThreadIncarnation, applyOldThreadSideEffects);
    runRevealCallback(
      currentThreadIncarnation,
      currentThreadIncarnation,
      applyCurrentThreadSideEffects,
    );

    expect(applyOldThreadSideEffects).not.toHaveBeenCalled();
    expect(applyCurrentThreadSideEffects).toHaveBeenCalledExactlyOnceWith();
  });

  it("distinguishes repeated lifetimes even when every persisted field matches", () => {
    const firstIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });
    const reopenedIncarnation = createFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });

    expect(ownsFileRevealIncarnation(reopenedIncarnation, firstIncarnation)).toBe(false);
    expect(ownsFileRevealIncarnation(reopenedIncarnation, reopenedIncarnation)).toBe(true);
  });

  it("clamps requested lines across Unix and Windows line endings", () => {
    expect(clampFileLine("one\ntwo\r\nthree\rfour", -4)).toBe(1);
    expect(clampFileLine("one\ntwo\r\nthree\rfour", 3)).toBe(3);
    expect(clampFileLine("one\ntwo\r\nthree\rfour", 99)).toBe(4);
  });

  it("centers a requested line and clamps the result to the scroll range", () => {
    expect(
      centeredFileRevealScrollTop({
        scrollTop: 0,
        scrollHeight: 2_000,
        viewportHeight: 400,
        fileTop: 100,
        lineTop: 700,
        lineHeight: 20,
      }),
    ).toBe(610);
    expect(
      centeredFileRevealScrollTop({
        scrollTop: 0,
        scrollHeight: 900,
        viewportHeight: 400,
        fileTop: 100,
        lineTop: 700,
        lineHeight: 20,
      }),
    ).toBe(500);
  });

  it("clears stale highlights before applying the current line reveal", () => {
    const staleLine = { removeAttribute: vi.fn() };
    const staleColumn = { removeAttribute: vi.fn() };
    const nextLine = { setAttribute: vi.fn() };
    const nextColumn = { setAttribute: vi.fn() };
    const root = {
      querySelectorAll: vi.fn(() => [staleLine, staleColumn]),
      querySelector: vi.fn((selector: string) =>
        selector === '[data-line="42"]' ? nextLine : nextColumn,
      ),
    };
    const container = {
      shadowRoot: root,
    } as unknown as HTMLElement;

    updateFileLinkReveal(container, 42);

    expect(staleLine.removeAttribute).toHaveBeenCalledWith(FILE_LINK_REVEAL_ATTRIBUTE);
    expect(staleColumn.removeAttribute).toHaveBeenCalledWith(FILE_LINK_REVEAL_ATTRIBUTE);
    expect(nextLine.setAttribute).toHaveBeenCalledWith(FILE_LINK_REVEAL_ATTRIBUTE, "");
    expect(nextColumn.setAttribute).toHaveBeenCalledWith(FILE_LINK_REVEAL_ATTRIBUTE, "");
  });
});

describe("setMarkdownTaskChecked", () => {
  const markdown = "- [ ] First\n- [x] Second\n";

  it("checks and unchecks the task marker at the supplied offset", () => {
    expect(setMarkdownTaskChecked(markdown, 2, true)).toBe("- [x] First\n- [x] Second\n");
    expect(setMarkdownTaskChecked(markdown, 14, false)).toBe("- [ ] First\n- [ ] Second\n");
    expect(setMarkdownTaskChecked("1. [X] Ordered\n", 3, false)).toBe("1. [ ] Ordered\n");
  });

  it("leaves the document unchanged for a stale or invalid marker offset", () => {
    expect(setMarkdownTaskChecked(markdown, 0, true)).toBe(markdown);
    expect(setMarkdownTaskChecked(markdown, 200, true)).toBe(markdown);
  });
});
