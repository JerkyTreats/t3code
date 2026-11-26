import "../index.css";

import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  WorkspaceCanvasId,
  type WorkspaceCanvasRecord,
  workspaceCanvasThreadId,
} from "@t3tools/contracts";
import { page } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

vi.mock("./ThreadCanvasSync", () => ({ ThreadCanvasSync: () => null }));

// The sidebar lists what this holds instead of subscribing to a server.
const listed: { canvases: ReadonlyArray<WorkspaceCanvasRecord> } = { canvases: [] };
vi.mock("../state/workspaceCanvas", () => ({
  useEnvironmentWorkspaceCanvases: () => ({
    canvases: listed.canvases,
    loaded: true,
    failed: false,
  }),
  workspaceCanvasCreate: { label: "create" },
  workspaceCanvasRename: { label: "rename" },
  workspaceCanvasDelete: { label: "delete" },
}));

import ExcalidrawBoard from "./ExcalidrawBoard";
import { useCanvasAnchorsStore, type WorkspaceBoardActions } from "./canvasAnchors";
import { canvasBoardMounted } from "./canvasSurfaceCards";
import { SidebarCanvasSection } from "./SidebarCanvasSection";
import { createTurnBoard } from "./turnBoard";
import { boardStorageKey } from "./workspaceCanvasBoards";

const envId = EnvironmentId.make("workspace-canvas-test");
const projectId = ProjectId.make("project-canvas-a");
const otherProjectId = ProjectId.make("project-canvas-b");
const canvasId = WorkspaceCanvasId.make("canvas:ws-browser-1");
const otherCanvasId = WorkspaceCanvasId.make("canvas:ws-browser-2");
const boardThreadId = workspaceCanvasThreadId(canvasId);
const boardThreadRef = { environmentId: envId, threadId: boardThreadId };
const boardKey = `${envId}:${boardThreadId}`;
const peerA = ThreadId.make("peer-thread-a");
const peerB = ThreadId.make("peer-thread-b");
// The board's top chrome: the fallback header height plus Excalidraw's toolbar clearance.
const TOP_CLEARANCE_PX = 48 + 64;

const record = (id: WorkspaceCanvasId, project: ProjectId, title: string) => ({
  id,
  projectId: project,
  title,
  createdAt: "2026-11-26T00:00:00.000Z",
  updatedAt: "2026-11-26T00:00:00.000Z",
});

const projects = [
  { id: projectId, environmentId: envId, title: "Alpha" },
  { id: otherProjectId, environmentId: envId, title: "Beta" },
];

const chatPin = (
  id: string,
  threadId: ThreadId,
  title: string,
  x: number,
  versionNonce: number,
) => ({
  id,
  type: "rectangle",
  x,
  y: 140,
  width: 484,
  height: 624,
  version: 1,
  versionNonce,
  isDeleted: false,
  customData: {
    t3Card: { kind: "surface", surface: { kind: "side-chat", threadId }, title },
  },
});

function setup() {
  listed.canvases = [
    record(canvasId, projectId, "Alpha board"),
    record(otherCanvasId, otherProjectId, "Beta board"),
  ];
  useCanvasAnchorsStore.setState({ activeBoard: null, focusedChat: {}, chatPinCreators: {} });
  localStorage.setItem(
    boardStorageKey(boardKey),
    JSON.stringify([
      {
        id: "frame-arch",
        type: "frame",
        x: 1400,
        y: 200,
        width: 720,
        height: 520,
        name: "Auth Architecture",
        version: 1,
        versionNonce: 1,
        isDeleted: false,
      },
      chatPin("chat-pin-a", peerA, "Architect Chat", 120, 2),
      chatPin("chat-pin-b", peerB, "Reviewer Chat", 2600, 3),
    ]),
  );
}

const focusedCardId = (layer: HTMLElement) =>
  layer.querySelector('[data-canvas-chat-focused="true"]')?.getAttribute("data-canvas-card-id");

describe("Workspace Canvas board and sidebar (F34)", () => {
  it("shares chat pin focus between board and sidebar, and jumps so a tall pin clears the chrome", async () => {
    setup();
    await page.viewport(1500, 800);
    const turnBoard = createTurnBoard();
    const layer = document.createElement("div");
    layer.dataset.assistantCitationViewport = "true";
    document.body.append(layer);
    turnBoard.publish(layer, []);
    // The canvas view registers its chat pin action before the lazy board mounts.
    const createChatPin = vi.fn();
    useCanvasAnchorsStore.getState().setChatPinCreator(boardKey, createChatPin);
    let actions: WorkspaceBoardActions | null = null;

    await using screen = await render(
      <div style={{ display: "flex" }}>
        <div style={{ width: 260 }}>
          <SidebarCanvasSection projects={projects} scopedProjectKeys={null} />
        </div>
        <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
          <ExcalidrawBoard
            draft={false}
            storageId={boardKey}
            turnBoard={turnBoard}
            canvasThread={boardThreadRef}
            workspaceMode
            onBoardActions={(next) => {
              actions = next;
            }}
            renderPanelSurface={(surface) => (
              <div data-testid={`surface-${surface.id}`}>{surface.id}</div>
            )}
          />
        </div>
      </div>,
      { router: `/canvas/${envId}/${canvasId}` },
    );
    using _layer = { [Symbol.dispose]: () => layer.remove() };
    const root = screen.container.querySelector<HTMLElement>("[data-board-root]")!;

    await vi.waitFor(() => expect(canvasBoardMounted(boardThreadRef)).toBe(true));
    // A workspace canvas has no turns.
    expect(layer.querySelectorAll("[data-turn-box]").length).toBe(0);

    // The sidebar lists the active canvas's pins and frames, and its chat pin action.
    const waypoints = screen.container.querySelector("[data-sidebar-canvases]")!;
    await vi.waitFor(() => {
      expect(waypoints.querySelector(`[data-sidebar-chat-waypoint="${peerA}"]`)).not.toBeNull();
      expect(waypoints.querySelector(`[data-sidebar-chat-waypoint="${peerB}"]`)).not.toBeNull();
      expect(waypoints.querySelector('[data-sidebar-frame-waypoint="frame-arch"]')).not.toBeNull();
    });
    await page.getByRole("button", { name: "Add peer chat pin" }).click();
    expect(createChatPin).toHaveBeenCalledOnce();

    // With nothing focused yet, the first pin is the Cite target.
    await vi.waitFor(() => expect(focusedCardId(layer)).toBe("chat-pin-a"));

    // A sidebar click focuses pin B on the board and moves the camera to it.
    waypoints.querySelector<HTMLElement>(`[data-sidebar-chat-waypoint="${peerB}"]`)!.click();
    await vi.waitFor(() => {
      expect(focusedCardId(layer)).toBe("chat-pin-b");
      expect(
        waypoints
          .querySelector(`[data-sidebar-chat-waypoint="${peerB}"]`)
          ?.getAttribute("data-focused"),
      ).toBe("true");
    });
    await vi.waitFor(() => {
      const card = layer
        .querySelector('[data-canvas-card-id="chat-pin-b"]')!
        .getBoundingClientRect();
      const board = root.getBoundingClientRect();
      // Centred across, and a pin taller than the space below the chrome starts under it.
      expect(Math.abs(card.left + card.width / 2 - (board.left + board.width / 2))).toBeLessThan(2);
      expect(card.top - board.top).toBeGreaterThanOrEqual(TOP_CLEARANCE_PX);
      expect(card.top - board.top).toBeLessThan(TOP_CLEARANCE_PX + 40);
    });

    // Pressing pin A on the board focuses it in both places.
    layer
      .querySelector('[data-canvas-card-id="chat-pin-a"]')!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await vi.waitFor(() => {
      expect(focusedCardId(layer)).toBe("chat-pin-a");
      expect(
        waypoints
          .querySelector(`[data-sidebar-chat-waypoint="${peerA}"]`)
          ?.getAttribute("data-focused"),
      ).toBe("true");
    });

    // A new frame takes the next unused zone name and shows up as a waypoint.
    expect(actions).not.toBeNull();
    expect(actions!.addFrame()).toBeTruthy();
    await vi.waitFor(() => expect(waypoints.textContent).toContain("Zone 1"));
    expect(() => actions!.zoomToFit()).not.toThrow();

    await screen.unmount();
    // Unmounting the board clears its anchors, but the view still owns the chat pin action.
    expect(useCanvasAnchorsStore.getState().activeBoard).toBeNull();
    expect(useCanvasAnchorsStore.getState().chatPinCreators[boardKey]).toBe(createChatPin);
  });

  it("lists only the scoped project's canvases and no waypoints off the canvas route", async () => {
    setup();
    await using screen = await render(
      <SidebarCanvasSection
        projects={projects}
        scopedProjectKeys={new Set([`${envId}:${otherProjectId}`])}
      />,
    );
    await expect.element(screen.getByText("Beta board")).toBeInTheDocument();
    expect(screen.container.textContent).not.toContain("Alpha board");
    expect(screen.container.querySelector("[data-sidebar-canvas-waypoints]")).toBeNull();
  });
});
