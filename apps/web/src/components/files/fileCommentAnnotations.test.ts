import { describe, expect, it } from "vite-plus/test";

import { restoreFileCommentAnnotations } from "./fileCommentAnnotations";

describe("restoreFileCommentAnnotations", () => {
  it("restores persisted review ranges and groups comments by ending line", () => {
    expect(
      restoreFileCommentAnnotations([
        { id: "one", startIndex: 1, endIndex: 3, text: "First" },
        { id: "two", startIndex: 3, endIndex: 3, text: "Second" },
      ]),
    ).toEqual([
      {
        lineNumber: 4,
        metadata: {
          entries: [
            {
              id: "one",
              kind: "comment",
              startLine: 2,
              endLine: 4,
              text: "First",
            },
            {
              id: "two",
              kind: "comment",
              startLine: 4,
              endLine: 4,
              text: "Second",
            },
          ],
        },
      },
    ]);
  });
});
