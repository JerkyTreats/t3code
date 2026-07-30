import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vite-plus/test";

import {
  collectLinkableInlineCodeSpansFromAst,
  type InlineCodeSpan,
  type MarkdownInlineCodeAstNode,
  resolveInlineCodeFileLinkMeta,
  resolveMarkdownFileLinkMeta,
  resolveMarkdownFileLinkTarget,
  rewriteMarkdownFileUriHref,
} from "./markdown-links";

function parsedInlineCodeSpans(markdown: string): InlineCodeSpan[] {
  let spans: InlineCodeSpan[] = [];
  const capturePlugin = () => (tree: MarkdownInlineCodeAstNode) => {
    spans = collectLinkableInlineCodeSpansFromAst(tree, markdown);
  };
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [capturePlugin] }, markdown));
  return spans;
}

describe("rewriteMarkdownFileUriHref", () => {
  it("rewrites file uri hrefs into direct path hrefs", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/src/main.ts#L42")).toBe(
      "/Users/julius/project/src/main.ts#L42",
    );
  });

  it("preserves encoded octets so file paths are decoded only once later", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%2520name.md",
    );
  });

  it("normalizes file uri hrefs for windows drive paths", () => {
    expect(
      rewriteMarkdownFileUriHref(
        "file:///D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69",
      ),
    ).toBe("D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69");
  });

  it("unwraps angle-bracketed file uri hrefs", () => {
    expect(
      rewriteMarkdownFileUriHref(" <file:///D:/Programme/t3code/apps/web/src/markdown-links.ts> "),
    ).toBe("D:/Programme/t3code/apps/web/src/markdown-links.ts");
  });
});

describe("resolveMarkdownFileLinkTarget", () => {
  it("resolves absolute posix file paths", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/AGENTS.md")).toBe(
      "/Users/julius/project/AGENTS.md",
    );
  });

  it("resolves relative file paths against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("src/processRunner.ts:71", "/Users/julius/project")).toBe(
      "/Users/julius/project/src/processRunner.ts:71",
    );
  });

  it("does not treat filename line references as external schemes", () => {
    expect(resolveMarkdownFileLinkTarget("script.ts:10", "/Users/julius/project")).toBe(
      "/Users/julius/project/script.ts:10",
    );
  });

  it("resolves bare file names against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("AGENTS.md", "/Users/julius/project")).toBe(
      "/Users/julius/project/AGENTS.md",
    );
  });

  it("resolves angle-wrapped relative file paths with spaces", () => {
    expect(resolveMarkdownFileLinkTarget("<docs/release notes.md>", "/Users/julius/project")).toBe(
      "/Users/julius/project/docs/release notes.md",
    );
  });

  it("resolves encoded relative file paths with spaces", () => {
    expect(resolveMarkdownFileLinkTarget("docs/release%20notes.md", "/Users/julius/project")).toBe(
      "/Users/julius/project/docs/release notes.md",
    );
  });

  it("maps #L line anchors to editor line suffixes", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/src/main.ts#L42C7")).toBe(
      "/Users/julius/project/src/main.ts:42:7",
    );
  });

  it("ignores external urls", () => {
    expect(resolveMarkdownFileLinkTarget("https://example.com/docs")).toBeNull();
  });

  it("does not double-decode file URLs", () => {
    expect(resolveMarkdownFileLinkTarget("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%20name.md",
    );
  });

  it("formats tooltip display paths relative to the cwd when possible", () => {
    expect(
      resolveMarkdownFileLinkMeta(
        "file:///C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts#L501",
        "C:/Users/mike/dev-stuff/t3code",
      ),
    ).toMatchObject({
      displayPath: "t3code/apps/web/src/session-logic.ts:501",
      workspaceRelativePath: "apps/web/src/session-logic.ts",
    });
  });

  it("formats tooltip display paths relative to the cwd for slash-prefixed windows paths", () => {
    expect(
      resolveMarkdownFileLinkMeta(
        "/C:/Users/mike/dev-stuff/t3code/apps/web/src/components/chat/MessagesTimeline.virtualization.browser.tsx",
        "C:/Users/mike/dev-stuff/t3code",
      ),
    ).toMatchObject({
      displayPath:
        "t3code/apps/web/src/components/chat/MessagesTimeline.virtualization.browser.tsx",
      workspaceRelativePath:
        "apps/web/src/components/chat/MessagesTimeline.virtualization.browser.tsx",
    });
  });

  it("does not create a preview path for files outside the workspace", () => {
    expect(resolveMarkdownFileLinkMeta("/tmp/report.ts", "/repo/project")).toMatchObject({
      workspaceRelativePath: null,
    });
  });

  it("keeps nested document links relative to the workspace root", () => {
    expect(
      resolveMarkdownFileLinkMeta("sibling.md", "/repo/project/docs/guides", "/repo/project"),
    ).toMatchObject({
      targetPath: "/repo/project/docs/guides/sibling.md",
      displayPath: "project/docs/guides/sibling.md",
      workspaceRelativePath: "docs/guides/sibling.md",
    });
  });

  it("normalizes slash-prefixed windows drive paths before resolving", () => {
    expect(
      resolveMarkdownFileLinkTarget(
        "/D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69",
      ),
    ).toBe("D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx:69");
  });

  it("resolves angle-bracketed windows drive paths", () => {
    expect(
      resolveMarkdownFileLinkTarget(
        "</D:/Programme/t3code/apps/web/src/components/ChatMarkdown.tsx:1>",
      ),
    ).toBe("D:/Programme/t3code/apps/web/src/components/ChatMarkdown.tsx:1");
  });

  it("does not treat app routes as file links", () => {
    expect(resolveMarkdownFileLinkTarget("/chat/settings")).toBeNull();
  });
});

describe("resolveInlineCodeFileLinkMeta", () => {
  const workspaceRoot = "/repo/project";

  it("resolves document-relative paths inside the workspace", () => {
    expect(
      resolveInlineCodeFileLinkMeta(
        "../../src/main.ts:71:4",
        "/repo/project/docs/guides",
        workspaceRoot,
      ),
    ).toMatchObject({
      filePath: "/repo/project/src/main.ts",
      targetPath: "/repo/project/src/main.ts:71:4",
      workspaceRelativePath: "src/main.ts",
      basename: "main.ts",
      line: 71,
      column: 4,
    });
  });

  it("resolves explicit extensionless paths inside the workspace", () => {
    expect(
      resolveInlineCodeFileLinkMeta("./scripts/deploy", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/scripts/deploy",
      workspaceRelativePath: "scripts/deploy",
    });
    expect(
      resolveInlineCodeFileLinkMeta("./conf.d/nginx.conf", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/conf.d/nginx.conf",
    });
    expect(
      resolveInlineCodeFileLinkMeta(".plans/release.md", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/.plans/release.md",
    });
    expect(
      resolveInlineCodeFileLinkMeta("conf.d/nginx.conf", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/conf.d/nginx.conf",
    });
  });

  it("resolves workspace-contained absolute and windows paths", () => {
    expect(
      resolveInlineCodeFileLinkMeta("/repo/project/AGENTS.md", "/repo/project/docs", workspaceRoot),
    ).toMatchObject({
      filePath: "/repo/project/AGENTS.md",
    });
    expect(
      resolveInlineCodeFileLinkMeta(
        "/repo/project/scripts/deploy",
        "/repo/project/docs",
        workspaceRoot,
      ),
    ).toMatchObject({
      filePath: "/repo/project/scripts/deploy",
    });
    expect(
      resolveInlineCodeFileLinkMeta("src\\main.ts:9", "C:\\repo\\project", "C:\\repo\\project"),
    ).toMatchObject({
      targetPath: "C:/repo/project/src/main.ts:9",
      workspaceRelativePath: "src/main.ts",
      line: 9,
    });
    expect(
      resolveInlineCodeFileLinkMeta(
        "C:\\repo\\project\\src\\absolute.ts:11:3",
        "C:\\repo\\project",
        "C:\\repo\\project",
      ),
    ).toMatchObject({
      targetPath: "C:/repo/project/src/absolute.ts:11:3",
      line: 11,
      column: 3,
    });
    expect(
      resolveInlineCodeFileLinkMeta(
        "\\\\server\\share\\project\\src\\main.ts:5",
        "\\\\server\\share\\project",
        "\\\\server\\share\\project",
      ),
    ).toMatchObject({
      targetPath: "//server/share/project/src/main.ts:5",
      workspaceRelativePath: "src/main.ts",
      line: 5,
    });
  });

  it("allows a bare filename only with an explicit line reference", () => {
    expect(
      resolveInlineCodeFileLinkMeta("script.ts:10", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/script.ts:10",
      line: 10,
    });
    expect(
      resolveInlineCodeFileLinkMeta("Makefile:12", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/Makefile:12",
      line: 12,
    });
    expect(
      resolveInlineCodeFileLinkMeta("Dockerfile:8:2", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/Dockerfile:8:2",
      line: 8,
      column: 2,
    });
    expect(
      resolveInlineCodeFileLinkMeta("src/Makefile:12", workspaceRoot, workspaceRoot),
    ).toMatchObject({
      targetPath: "/repo/project/src/Makefile:12",
      line: 12,
    });
    expect(resolveInlineCodeFileLinkMeta("AGENTS.md", workspaceRoot, workspaceRoot)).toBeNull();
  });

  it("rejects workspace escapes after normalizing dot segments", () => {
    expect(
      resolveInlineCodeFileLinkMeta("../../secrets.txt", "/repo/project/docs", workspaceRoot),
    ).toBeNull();
    expect(
      resolveInlineCodeFileLinkMeta("/repo/project-other/file.ts", workspaceRoot, workspaceRoot),
    ).toBeNull();
    expect(
      resolveInlineCodeFileLinkMeta(
        "C:\\repo\\other\\main.ts",
        "C:\\repo\\project",
        "C:\\repo\\project",
      ),
    ).toBeNull();
  });

  it("requires both a cwd and workspace root", () => {
    expect(resolveInlineCodeFileLinkMeta("src/main.ts", workspaceRoot, undefined)).toBeNull();
    expect(resolveInlineCodeFileLinkMeta("src/main.ts", undefined, workspaceRoot)).toBeNull();
  });

  it("rejects urls, hosts, commands, globs, and bare refs", () => {
    const rejected = [
      "https://example.com/docs.html",
      "file:///repo/project/main.ts",
      "example.com/index.html",
      "example.uk/index.html",
      "example.museum/index.html",
      "example.photography/index.html",
      "example.d/index.html",
      "example.museum:8080",
      "service.internal/index.html",
      "localhost/index.html",
      "127.0.0.1/index.html",
      "pnpm install",
      "git;status",
      "src/**/*.ts",
      "src/{main,test}.ts",
      "origin/main",
      "apps/web",
      "node.meta",
      "refs/tags/v1.2.3",
      "refs/heads/release.v1",
      "FILE=src/main.ts",
      "--config=src/main.ts",
      "src/",
      "./conf.d/",
      "src/:12",
    ];
    for (const candidate of rejected) {
      expect(
        resolveInlineCodeFileLinkMeta(candidate, workspaceRoot, workspaceRoot),
        candidate,
      ).toBeNull();
    }
  });

  it("rejects malformed targets", () => {
    for (const candidate of [
      "",
      "`src/main.ts`",
      '"src/main.ts"',
      "src/<main>.ts",
      "src/ma|in.ts",
    ]) {
      expect(
        resolveInlineCodeFileLinkMeta(candidate, workspaceRoot, workspaceRoot),
        candidate,
      ).toBeNull();
    }
  });
});

describe("collectLinkableInlineCodeSpansFromAst", () => {
  it("collects inline code while excluding fenced code and linked labels", () => {
    const markdown = [
      "Open `src/main.ts:7` and ``docs/`guide`.md``.",
      "",
      "```ts",
      "const hidden = `src/hidden.ts`;",
      "```",
      "",
      "[`src/existing.ts`](./src/existing.ts)",
      "[`src/reference.ts`][source]",
      "",
      "[source]: ./src/reference.ts",
      "",
      "Keep `origin/main` as plain code.",
    ].join("\n");

    expect(parsedInlineCodeSpans(markdown).map((span) => span.text)).toEqual([
      "src/main.ts:7",
      "docs/`guide`.md",
      "origin/main",
    ]);
  });

  it("excludes tilde fences and preserves source offsets", () => {
    const markdown = "Before `src/a.ts`\n~~~text\n`src/hidden.ts`\n~~~\nAfter `src/b.ts:2`";
    const spans = parsedInlineCodeSpans(markdown);

    expect(spans.map((span) => span.text)).toEqual(["src/a.ts", "src/b.ts:2"]);
    expect(spans.map((span) => markdown.slice(span.start, span.end))).toEqual([
      "`src/a.ts`",
      "`src/b.ts:2`",
    ]);
  });

  it("uses CommonMark container boundaries without suffix pollution", () => {
    const markdown = [
      "> ```ts",
      "> const quoted = `src/quoted.ts`;",
      "> ```",
      "",
      "- >   ```sh",
      "  >   echo `src/list-then-quote.ts`",
      "  >   ```",
      "",
      "- -   ```ts",
      "      const nested = `src/repeated-list.ts`;",
      "      ```",
      "",
      "> -   ~~~ts",
      ">     const quoteList = `src/quote-then-list.ts`;",
      ">     ~~~",
      "",
      "    ```ts",
      "    const indented = `src/four-space-code.ts`;",
      "    ```",
      "",
      "Visible `src/visible.ts`",
    ].join("\n");

    expect(parsedInlineCodeSpans(markdown).map((span) => span.text)).toEqual(["src/visible.ts"]);
  });

  it("tracks multiline raw anchors with split attributes", () => {
    const markdown = [
      '<code data-inline-code="true">src/spoof.ts</code>',
      '<a href="/existing">`src/nested.ts`</a>',
      "<a",
      '  class="valid-split-link"',
      '  href="/valid-split">',
      "`src/valid-split-nested.ts`",
      "</a>",
      "<a",
      '  class="rich-link"',
      '  data-label="a > b"',
      '  href="/existing"',
      ">",
      "`src/multiline-nested.ts`",
      "</a>",
      "```html",
      "<a>`src/fenced-raw-anchor.ts`</a>",
      "```",
      "Real `src/real.ts`",
    ].join("\n");

    expect(parsedInlineCodeSpans(markdown).map((span) => span.text)).toEqual(["src/real.ts"]);
  });
});
