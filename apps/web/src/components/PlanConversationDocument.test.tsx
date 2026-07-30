import type { LatestProposedPlanState } from "~/session-logic";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/state/projects", () => ({
  projectEnvironment: { writeFile: Symbol("writeFile") },
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

vi.mock("./DocumentMarkdownRenderer", () => ({
  DocumentMarkdownRenderer: (props: {
    filePath: string;
    markdown: string;
    workspaceCwd: string | undefined;
    showSourceFooter?: boolean;
  }) => (
    <article
      data-testid="document-markdown"
      data-file-path={props.filePath}
      data-workspace-cwd={props.workspaceCwd}
      data-show-source-footer={String(props.showSourceFooter)}
    >
      {props.markdown}
    </article>
  ),
}));

vi.mock("./ui/menu", () => ({
  Menu: (props: { children: ReactNode }) => <>{props.children}</>,
  MenuTrigger: (props: { render: ReactElement; children: ReactNode }) => (
    <>
      {props.render}
      {props.children}
    </>
  ),
  MenuPopup: (props: { children: ReactNode }) => <div role="menu">{props.children}</div>,
  MenuItem: (props: { children: ReactNode; disabled?: boolean }) => (
    <div role="menuitem" aria-disabled={props.disabled}>
      {props.children}
    </div>
  ),
}));

import { PlanConversationDocument } from "./PlanConversationDocument";

const proposedPlan = {
  id: "plan:thread-one:turn:turn-one",
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z",
  turnId: null,
  planMarkdown: "# Durable Preview\n\n## Scope\n\n- preserve virtual state\n",
  implementedAt: null,
  implementationThreadId: null,
} as LatestProposedPlanState;

describe("PlanConversationDocument", () => {
  it("renders an in-memory plan with copy, download, save, close, and return actions", () => {
    const markup = renderToStaticMarkup(
      <PlanConversationDocument
        environmentId={"local" as never}
        proposedPlan={proposedPlan}
        workspaceCwd="/workspace/project"
        onCollapse={() => undefined}
      />,
    );

    expect(markup).toContain("Durable Preview");
    expect(markup).toContain("durable-preview.md");
    expect(markup).toContain('aria-label="Return to chat"');
    expect(markup).toContain('aria-label="Copy plan"');
    expect(markup).toContain("Download as markdown");
    expect(markup).toContain("Save to workspace");
    expect(markup).toContain('aria-label="Close preview"');
    expect(markup).toContain('data-file-path="durable-preview.md"');
    expect(markup).toContain('data-workspace-cwd="/workspace/project"');
    expect(markup).toContain('data-show-source-footer="false"');
    expect(markup).toContain("## Scope");
    expect(markup).not.toContain("# Durable Preview\n");
  });

  it("keeps workspace save explicit and disabled when no workspace is available", () => {
    const markup = renderToStaticMarkup(
      <PlanConversationDocument
        environmentId={"remote" as never}
        proposedPlan={proposedPlan}
        workspaceCwd={undefined}
        onCollapse={() => undefined}
      />,
    );

    expect(markup).toMatch(
      /<div[^>]*role="menuitem"[^>]*aria-disabled="true"[^>]*>Save to workspace/,
    );
    expect(markup).toContain('data-show-source-footer="false"');
  });

  it("returns a safe missing-plan surface without rendering stale document content", () => {
    const markup = renderToStaticMarkup(
      <PlanConversationDocument
        environmentId={"local" as never}
        proposedPlan={null}
        workspaceCwd="/workspace/project"
        onCollapse={() => undefined}
      />,
    );

    expect(markup).toContain("Plan preview unavailable");
    expect(markup).toContain("Plan not found");
    expect(markup).toContain("Return to chat");
    expect(markup).not.toContain('data-testid="document-markdown"');
  });
});
