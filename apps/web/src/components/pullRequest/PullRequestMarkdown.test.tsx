import { EnvironmentId } from "@t3tools/contracts";
import type { ReactTestRenderer } from "react-test-renderer";
import { act } from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ChatMarkdown", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-chat-markdown data-surface-id={props.surfaceId} data-text={props.text} />
  ),
}));

import { PullRequestMarkdown } from "./PullRequestMarkdown";

describe("PullRequestMarkdown", () => {
  it("appends each stable parser segment id to its parent surface", async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <PullRequestMarkdown
          surfaceId="pull-request:environment:project:repository:42:comment:comment-42"
          text={"First\n\nhttps://github.com/user-attachments/assets/asset-one\n\nSecond"}
          cwd="/workspace/project"
          environmentId={EnvironmentId.make("environment")}
        />,
      );
    });

    expect(
      renderer?.root
        .findAllByProps({ "data-chat-markdown": true })
        .map((node) => node.props["data-surface-id"]),
    ).toEqual([
      "pull-request:environment:project:repository:42:comment:comment-42:segment:markdown%3A0",
      "pull-request:environment:project:repository:42:comment:comment-42:segment:markdown%3A2",
    ]);

    await act(async () => renderer?.unmount());
  });
});
