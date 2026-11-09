import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";

vi.mock("../files/FilePreviewPanel", () => ({
  default: (props: {
    onOpenFile: (relativePath: string) => void;
    onNavigateFolder: (relativePath: string, folderTrail: string, keepSource: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => props.onNavigateFolder("src/app.ts", "src/app.ts", false)}
      >
        Open app
      </button>
      <button type="button" onClick={() => props.onNavigateFolder("", "src/app", true)}>
        Up from a file
      </button>
      <button type="button" onClick={() => props.onOpenFile("README.md")}>
        Open readme
      </button>
    </div>
  ),
}));

vi.mock("../pullRequest/ThreadPullRequestsPanel", () => ({
  ThreadPullRequestsPanel: (props: {
    onOpenPullRequest?: (target: { projectId: string; repository: string; number: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onOpenPullRequest?.({ projectId: "p", repository: "acme/app", number: 7 })
      }
    >
      Open row
    </button>
  ),
}));
vi.mock("../pullRequest/PullRequestDetailPanel", () => ({
  PullRequestDetailPanel: (props: { onBack?: () => void }) => (
    <button type="button" disabled={!props.onBack} onClick={() => props.onBack?.()}>
      Back
    </button>
  ),
}));

import { RightPanelSurfaceContent } from "./RightPanelSurfaceContent";
import type { RightPanelSurface } from "../../rightPanelStore";

const threadRef = {
  environmentId: EnvironmentId.make("surface-content-test"),
  threadId: ThreadId.make("thread"),
};

function renderSurface(
  surface: RightPanelSurface,
  card?: Parameters<typeof RightPanelSurfaceContent>[0]["card"],
) {
  return render(
    <RightPanelSurfaceContent
      surface={surface}
      card={card}
      activeSurfaceId="files"
      threadRef={threadRef}
      environmentId={threadRef.environmentId}
      visible
      composerDraftTarget={threadRef}
      keybindings={[]}
      configuredPreviewUrls={[]}
      workspaceMutationId={null}
      getShortcutContext={() => ({}) as never}
      onSendAnnotation={() => {}}
      onCloseSurface={() => {}}
      sideChatParentPanel={{} as never}
      terminal={{} as never}
      pullRequest={{
        capabilityKnown: true,
        supported: true,
        projectId: ProjectId.make("p"),
        pullRequests: [],
        linkedPullRequest: null,
        branchPullRequest: null,
        // The panel offers Back to the list when the thread links more than one pull request.
        onBack: () => useRightPanelStore.getState().open(threadRef, "pull-requests"),
      }}
      files={{
        projectName: "Project",
        workspaceRoot: "/workspace",
        availableEditors: [],
        pendingSurfaceIds: new Set(),
        onOpenFile: (relativePath) =>
          useRightPanelStore.getState().openFile(threadRef, relativePath),
        onPendingChange: () => {},
      }}
    />,
    { router: false }, // The stubbed panels have no links to route.
  );
}

const FILES = { id: "files", kind: "files" } as const;

const panel = () =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);

describe("RightPanelSurfaceContent in a canvas card", () => {
  it("navigates the card, never the panel tab that shares its surface id", async () => {
    useRightPanelStore.getState().removeThread(threadRef);
    useRightPanelStore.getState().open(threadRef, "files");
    const show = vi.fn();
    const place = vi.fn();
    {
      await using screen = await renderSurface(FILES, { show, place, close: vi.fn() });
      await screen.getByText("Open app").click();
      await screen.getByText("Up from a file").click();
      await screen.getByText("Open readme").click();
    }
    // A breadcrumb above a file moves the card too, where the panel would keep the file's tab.
    expect(show.mock.calls).toEqual([
      [{ kind: "file", relativePath: "src/app.ts" }],
      [{ kind: "files", folderTrail: "src/app" }],
      [{ kind: "file", relativePath: "README.md" }],
    ]);
    expect(place).not.toHaveBeenCalled();
    expect(panel().surfaces.map((surface) => surface.id)).toEqual(["files"]);

    // The panel itself moves its tab in place.
    await using screen = await renderSurface(FILES);
    await screen.getByText("Open app").click();
    expect(panel().activeSurfaceId).toBe("file:src/app.ts");
  });

  it("moves a card from the linked pull requests to one and back, leaving the panel alone", async () => {
    useRightPanelStore.getState().removeThread(threadRef);
    useRightPanelStore.getState().open(threadRef, "files");
    const show = vi.fn();
    const card = { show, place: vi.fn(), close: vi.fn() };
    {
      await using screen = await renderSurface(
        { id: "pull-requests", kind: "pull-requests" },
        card,
      );
      await screen.getByText("Open row").click();
    }
    expect(show).toHaveBeenLastCalledWith({
      kind: "pull-request",
      projectId: "p",
      repository: "acme/app",
      number: 7,
    });
    await using screen = await renderSurface(
      {
        id: "pull-request:p:acme%2Fapp:7",
        kind: "pull-request",
        projectId: "p",
        repository: "acme/app",
        number: 7,
      },
      card,
    );
    await screen.getByText("Back").click();
    expect(show).toHaveBeenLastCalledWith({ kind: "pull-requests" });
    expect(panel().surfaces.map((surface) => surface.id)).toEqual(["files"]);
  });
});
