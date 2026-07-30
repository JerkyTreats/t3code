import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatFileCommentRange,
  normalizeFileCommentRange,
  remapFileCommentAnnotations,
} from "./fileCommentAnnotations";
import {
  clampFileLine,
  centeredFileRevealScrollTop,
  FILE_LINK_REVEAL_ATTRIBUTE,
  updateFileLinkReveal,
} from "./fileLineReveal";
import {
  isMarkdownPreviewFile,
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
});

describe("file line reveal", () => {
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
