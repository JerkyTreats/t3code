import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../PullRequestMarkdown", () => ({
  PullRequestMarkdown: (props: { surfaceId: string; text: string }) => (
    <div data-surface={props.surfaceId}>{props.text}</div>
  ),
}));
import { GuideProse, GuideProseContext } from "./GuideProse";

describe("guide prose Markdown adapter", () => {
  it("keeps repository and stop identity across content changes and separate prose slots", () => {
    const render = (text: string, surfaceKey: string) =>
      renderToStaticMarkup(
        <GuideProseContext
          value={{
            environmentId: EnvironmentId.make("synthetic-environment"),
            cwd: "/workspace/project",
            surfaceId: "synthetic-repository:guide",
          }}
        >
          <GuideProse surfaceKey={surfaceKey} text={text} />
        </GuideProseContext>,
      );
    expect(render("```mermaid\ngraph TD; A-->B\n```", "stop:1:summary")).toContain(
      'data-surface="synthetic-repository:guide:stop:1:summary"',
    );
    expect(render("Updated source", "stop:1:summary")).toContain(
      'data-surface="synthetic-repository:guide:stop:1:summary"',
    );
    expect(render("Updated source", "stop:1:attention")).toContain(
      'data-surface="synthetic-repository:guide:stop:1:attention"',
    );
  });
});
