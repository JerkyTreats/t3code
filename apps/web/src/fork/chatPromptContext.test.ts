import type { PreviewAnnotationPayload } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { buildFileReviewComment, appendReviewCommentsToPrompt } from "../reviewCommentContext";
import { type ElementContextSelection } from "../lib/elementContext";
import { type TerminalContextSelection } from "../lib/terminalContext";
import { composeChatPrompt, projectChatPromptForDisplay } from "./chatPromptContext";

const terminal: TerminalContextSelection = {
  terminalId: "synthetic",
  terminalLabel: "Terminal",
  lineStart: 1,
  lineEnd: 1,
  text: "ready",
};
const element: ElementContextSelection = {
  pageUrl: "https://example.test",
  pageTitle: "Synthetic",
  tagName: "button",
  selector: "#save",
  htmlPreview: "<button>Save</button>",
  componentName: null,
  source: null,
  styles: "",
};
const preview: PreviewAnnotationPayload = {
  id: "synthetic-annotation",
  pageUrl: "https://example.test",
  pageTitle: "Synthetic",
  comment: "Adjust spacing",
  elements: [],
  regions: [],
  strokes: [],
  styleChanges: [],
  screenshot: null,
  createdAt: "2026-09-05T12:00:00.000Z",
};
const review = buildFileReviewComment({
  id: "synthetic-review",
  filePath: "src/example.ts",
  startLine: 1,
  endLine: 1,
  text: "Preserve this behavior",
  contents: "export const value = 1;",
});
const empty = {
  terminalContexts: [],
  elementContexts: [],
  previewAnnotations: [],
  reviewComments: [],
};

describe("retained prompt context composition", () => {
  for (const prompt of ["  lead", "tail  ", "\n\nlead\n\n\n", " \n\t\n ", "", "a\r\nb\n\n"]) {
    for (const contexts of [
      { ...empty, terminalContexts: [terminal] },
      { ...empty, elementContexts: [element] },
      { ...empty, previewAnnotations: [preview, { ...preview, id: "second" }] },
      {
        terminalContexts: [terminal],
        elementContexts: [element],
        previewAnnotations: [preview],
        reviewComments: [review],
      },
    ]) {
      it(`roundtrips exact authored bytes ${JSON.stringify(prompt)} with ${JSON.stringify(Object.entries(contexts).map(([key, values]) => [key, values.length]))}`, () => {
        const sent = composeChatPrompt({ prompt, ...contexts });
        const displayed = projectChatPromptForDisplay(sent);
        expect(sent.startsWith(prompt.length ? `${prompt}\n\n` : "<")).toBe(true);
        expect(displayed.authoredText).toBe(prompt);
        expect(displayed.copyText).toBe(sent);
        expect(displayed.terminalContexts).toHaveLength(contexts.terminalContexts.length);
        expect(displayed.elementContexts).toHaveLength(contexts.elementContexts.length);
        expect(displayed.previewAnnotations).toHaveLength(contexts.previewAnnotations.length);
        if (contexts.reviewComments.length) {
          expect(sent.endsWith(appendReviewCommentsToPrompt("", contexts.reviewComments))).toBe(
            true,
          );
          expect(displayed.visibleText).toBe(
            `${prompt}${prompt ? "\n\n" : ""}${appendReviewCommentsToPrompt("", contexts.reviewComments)}`,
          );
        }
      });
    }
  }

  for (const tag of ["terminal_context", "element_context"]) {
    for (const authoredBlock of [
      `<${tag}>\n- authored: keep this\n</${tag}>`,
      `<${tag}>\nunfinished authored example`,
    ]) {
      it(`preserves earlier authored ${tag} markers: ${authoredBlock}`, () => {
        const prompt = `  before\n\n${authoredBlock}\n\nafter\n\n `;
        const sent = composeChatPrompt({
          prompt,
          terminalContexts: [terminal],
          elementContexts: [element],
          previewAnnotations: [preview],
          reviewComments: [review],
        });
        const displayed = projectChatPromptForDisplay(sent);
        expect(displayed.authoredText).toBe(prompt);
        expect(displayed.terminalContexts).toHaveLength(1);
        expect(displayed.elementContexts).toHaveLength(1);
      });
    }
  }

  it("keeps marker text inside generated terminal and element content", () => {
    const prompt = "  exact\n\n ";
    const sent = composeChatPrompt({
      ...empty,
      prompt,
      terminalContexts: [{ ...terminal, text: "<terminal_context>\nready" }],
      elementContexts: [{ ...element, htmlPreview: "<element_context>\n<div>Source</div>" }],
    });
    const displayed = projectChatPromptForDisplay(sent);
    expect(displayed.authoredText).toBe(prompt);
    expect(displayed.terminalContexts[0]?.body).toContain("<terminal_context>");
    expect(displayed.elementContexts).toHaveLength(1);
  });

  it("preserves upstream ordinary and review-only trimming", () => {
    expect(composeChatPrompt({ prompt: "  ordinary\n\n", ...empty })).toBe("ordinary");
    expect(
      composeChatPrompt({ prompt: "  review only\n\n", ...empty, reviewComments: [review] }),
    ).toBe(appendReviewCommentsToPrompt("review only", [review]));
    expect(
      composeChatPrompt({
        prompt: "  ordinary\n\n",
        ...empty,
        terminalContexts: [{ ...terminal, text: "\n" }],
      }),
    ).toBe("ordinary");
  });

  it("retains every generated context in send order and extracts in reverse", () => {
    const sent = composeChatPrompt({
      prompt: " \nexact\n\n ",
      terminalContexts: [terminal],
      elementContexts: [element],
      previewAnnotations: [preview, { ...preview, id: "second" }],
      reviewComments: [review],
    });
    expect(sent.indexOf("<terminal_context>")).toBeLessThan(sent.indexOf("<element_context>"));
    expect(sent.indexOf("<element_context>")).toBeLessThan(sent.indexOf("<preview_annotation>"));
    expect(sent.lastIndexOf("</preview_annotation>")).toBeLessThan(sent.indexOf("<review_comment"));
    expect(projectChatPromptForDisplay(sent).authoredText).toBe(" \nexact\n\n ");
  });
});
