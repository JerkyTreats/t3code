import { EnvironmentId, ThreadId } from "@t3tools/contracts";
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
        Up beside
      </button>
      <button type="button" onClick={() => props.onOpenFile("README.md")}>
        Open readme
      </button>
    </div>
  ),
}));

import { RightPanelSurfaceContent } from "./RightPanelSurfaceContent";

const threadRef = {
  environmentId: EnvironmentId.make("surface-content-test"),
  threadId: ThreadId.make("thread"),
};

function renderFiles(card?: Parameters<typeof RightPanelSurfaceContent>[0]["card"]) {
  return render(
    <RightPanelSurfaceContent
      surface={{ id: "files", kind: "files" }}
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
      pullRequest={{} as never}
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
    { router: false }, // The stubbed file panel has no links to route.
  );
}

const panel = () =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);

describe("RightPanelSurfaceContent in a canvas card", () => {
  it("navigates the card, never the panel tab that shares its surface id", async () => {
    useRightPanelStore.getState().removeThread(threadRef);
    useRightPanelStore.getState().open(threadRef, "files");
    const show = vi.fn();
    const place = vi.fn();
    {
      await using screen = await renderFiles({ show, place, close: vi.fn() });
      await screen.getByText("Open app").click();
      await screen.getByText("Up beside").click();
      await screen.getByText("Open readme").click();
    }
    expect(show.mock.calls).toEqual([
      [{ kind: "file", relativePath: "src/app.ts" }],
      [{ kind: "file", relativePath: "README.md" }],
    ]);
    expect(place.mock.calls).toEqual([[{ kind: "files", folderTrail: "src/app" }]]);
    expect(panel().surfaces.map((surface) => surface.id)).toEqual(["files"]);

    // The panel itself moves its tab in place.
    await using screen = await renderFiles();
    await screen.getByText("Open app").click();
    expect(panel().activeSurfaceId).toBe("file:src/app.ts");
  });
});
