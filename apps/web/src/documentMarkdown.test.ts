import { describe, expect, it } from "vite-plus/test";

import {
  documentMarkdownLinkCwd,
  extractDocumentMarkdownOutline,
  slugDocumentMarkdownHeading,
} from "./documentMarkdown";

describe("slugDocumentMarkdownHeading", () => {
  it("creates stable readable heading ids", () => {
    expect(slugDocumentMarkdownHeading("API & Runtime <code>Notes</code>")).toBe(
      "api-runtime-notes",
    );
    expect(slugDocumentMarkdownHeading("   ")).toBe("section");
  });
});

describe("extractDocumentMarkdownOutline", () => {
  it("extracts headings with duplicate-safe ids", () => {
    expect(extractDocumentMarkdownOutline("# Intro\n\n## Setup\n\n## Setup\n\n### Done")).toEqual([
      { id: "intro", level: 1, title: "Intro" },
      { id: "setup", level: 2, title: "Setup" },
      { id: "setup-2", level: 2, title: "Setup" },
      { id: "done", level: 3, title: "Done" },
    ]);
  });

  it("ignores fenced code headings", () => {
    expect(
      extractDocumentMarkdownOutline("# Real\n\n```md\n# Not a heading\n```\n\n## Next"),
    ).toEqual([
      { id: "real", level: 1, title: "Real" },
      { id: "next", level: 2, title: "Next" },
    ]);
  });
});

describe("documentMarkdownLinkCwd", () => {
  it("resolves relative links from the document directory", () => {
    expect(documentMarkdownLinkCwd("/repo", "docs/guide/readme.md")).toBe("/repo/docs/guide");
    expect(documentMarkdownLinkCwd("/repo/", "README.md")).toBe("/repo/");
    expect(documentMarkdownLinkCwd(undefined, "docs/readme.md")).toBeUndefined();
  });
});
