import { describe, expect, it } from "@effect/vitest";

import { buildComposerRichDraftEdit } from "./composerRichDraft";

describe("buildComposerRichDraftEdit", () => {
  it("wraps a selected range in bold markdown", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "fix this error",
        selectionStart: 4,
        selectionEnd: 8,
        format: "bold",
      }),
    ).toEqual({
      rangeStart: 4,
      rangeEnd: 8,
      replacement: "**this**",
      nextExpandedCursor: 12,
    });
  });

  it("wraps a reversed selected range in italic markdown", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "draft text",
        selectionStart: 10,
        selectionEnd: 6,
        format: "italic",
      }),
    ).toEqual({
      rangeStart: 6,
      rangeEnd: 10,
      replacement: "_text_",
      nextExpandedCursor: 12,
    });
  });

  it("inserts an empty italic pair at the cursor", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "draft",
        selectionStart: 2,
        selectionEnd: 2,
        format: "italic",
      }),
    ).toEqual({
      rangeStart: 2,
      rangeEnd: 2,
      replacement: "__",
      nextExpandedCursor: 3,
    });
  });

  it("toggles bullet prefixes across selected lines", () => {
    const edit = buildComposerRichDraftEdit({
      text: "alpha\nbeta\ngamma",
      selectionStart: 2,
      selectionEnd: 9,
      format: "bullet-list",
    });

    expect(edit).toEqual({
      rangeStart: 0,
      rangeEnd: "alpha\nbeta".length,
      replacement: "- alpha\n- beta",
      nextExpandedCursor: "- alpha\n- beta".length,
    });

    expect(
      buildComposerRichDraftEdit({
        text: edit.replacement,
        selectionStart: 0,
        selectionEnd: edit.replacement.length,
        format: "bullet-list",
      }).replacement,
    ).toBe("alpha\nbeta");
  });

  it("creates link markup and leaves the cursor in the URL", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "docs",
        selectionStart: 0,
        selectionEnd: 4,
        format: "link",
      }),
    ).toEqual({
      rangeStart: 0,
      rangeEnd: 4,
      replacement: "[docs](https://)",
      nextExpandedCursor: "[docs](https://".length,
    });
  });

  it("uses inline code for a single line selection", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "run pnpm test now",
        selectionStart: 4,
        selectionEnd: 13,
        format: "code",
      }),
    ).toEqual({
      rangeStart: 4,
      rangeEnd: 13,
      replacement: "`pnpm test`",
      nextExpandedCursor: 15,
    });
  });

  it("uses fenced code for multiline selections", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "one\ntwo",
        selectionStart: 0,
        selectionEnd: 7,
        format: "code",
      }),
    ).toEqual({
      rangeStart: 0,
      rangeEnd: 7,
      replacement: "```\none\ntwo\n```",
      nextExpandedCursor: 15,
    });
  });

  it("clamps out of bounds selections before formatting", () => {
    expect(
      buildComposerRichDraftEdit({
        text: "draft",
        selectionStart: -10,
        selectionEnd: 99,
        format: "bold",
      }),
    ).toEqual({
      rangeStart: 0,
      rangeEnd: 5,
      replacement: "**draft**",
      nextExpandedCursor: 9,
    });
  });
});
