import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import type { ThreadRightPanelState } from "../rightPanelStore";
import {
  boardPanelActionKey,
  boardPanelAfterThreadAction,
  boardPanelCloseOtherSurfaces,
  boardPanelUserActionRevision,
  boardPanelVisibilityKeys,
  combineThreadAndEnvironmentBoardState,
  environmentBoardKey,
  migrateBoardPanelSelection,
  selectedBoardPanelActionKey,
} from "./boardPanelState";

const ref = (environment: string, thread: string) =>
  scopeThreadRef(EnvironmentId.make(environment), ThreadId.make(thread));
const a = ref("env-a", "thread-a");
const b = ref("env-a", "thread-b");
const other = ref("env-b", "thread-a");
const board = (isOpen = true): ThreadRightPanelState => ({
  isOpen,
  activeSurfaceId: "board",
  surfaces: [{ id: "board", kind: "board" }],
});
const files: ThreadRightPanelState = {
  isOpen: true,
  activeSurfaceId: "files",
  surfaces: [{ id: "files", kind: "files" }],
};

describe("environment Board panel owner", () => {
  it("shares selection within one environment while retaining thread surfaces and stable snapshots", () => {
    const state = { [scopedThreadKey(a)]: files, [environmentBoardKey(a.environmentId)]: board() };
    const combined = combineThreadAndEnvironmentBoardState(state, a);
    expect(combined.surfaces).toEqual([...files.surfaces, { id: "board", kind: "board" }]);
    expect(combineThreadAndEnvironmentBoardState(state, a)).toBe(combined);
    expect(combineThreadAndEnvironmentBoardState(state, b).activeSurfaceId).toBe("board");
    expect(combineThreadAndEnvironmentBoardState(state, other).activeSurfaceId).toBeNull();
    expect(state[scopedThreadKey(a)]).toBe(files);
  });

  it("retains hidden selection for reopening from another thread", () => {
    const state = {
      [scopedThreadKey(a)]: files,
      [environmentBoardKey(a.environmentId)]: board(false),
    };
    expect(combineThreadAndEnvironmentBoardState(state, a)).toMatchObject({
      isOpen: false,
      activeSurfaceId: "board",
    });
    expect(selectedBoardPanelActionKey(state, b)).toBe(environmentBoardKey(a.environmentId));
    expect(selectedBoardPanelActionKey(state, other)).toBe(scopedThreadKey(other));
    expect(boardPanelActionKey(b, "board")).toBe(environmentBoardKey(a.environmentId));
    expect(boardPanelActionKey(b, "files")).toBe(scopedThreadKey(b));
  });

  it("clears even hidden Board selection on explicit thread actions only in that environment", () => {
    const foreign = board();
    const state = {
      [scopedThreadKey(a)]: files,
      [environmentBoardKey(a.environmentId)]: board(false),
      [environmentBoardKey(other.environmentId)]: foreign,
    };
    const updated = boardPanelAfterThreadAction(state, scopedThreadKey(b));
    expect(updated[environmentBoardKey(a.environmentId)]).toMatchObject({
      isOpen: false,
      activeSurfaceId: null,
    });
    expect(updated[environmentBoardKey(other.environmentId)]).toBe(foreign);
    expect(updated[scopedThreadKey(a)]).toBe(files);
    expect(combineThreadAndEnvironmentBoardState(updated, a)).toBe(files);
    expect(boardPanelAfterThreadAction(state, environmentBoardKey(a.environmentId))).toBe(state);
    expect(boardPanelAfterThreadAction(updated, scopedThreadKey(b))).toBe(updated);
  });

  it("keeps environment Board while closing only the current thread's peer surfaces", () => {
    const selected = board();
    const state = {
      [scopedThreadKey(a)]: files,
      [scopedThreadKey(b)]: files,
      [environmentBoardKey(a.environmentId)]: selected,
    };
    const updated = boardPanelCloseOtherSurfaces(state, a, "board");
    expect(updated?.[scopedThreadKey(a)]).toBeUndefined();
    expect(updated?.[scopedThreadKey(b)]).toBe(files);
    expect(updated?.[environmentBoardKey(a.environmentId)]).toBe(selected);
    expect(boardPanelCloseOtherSurfaces(state, a, "files")).toBeNull();
    expect(boardPanelCloseOtherSurfaces(state, other, "board")).toBe(state);
    const dismissed = { ...files, dismissedDeviceSurfaceIds: ["device:synthetic"] };
    expect(
      boardPanelCloseOtherSurfaces({ ...state, [scopedThreadKey(a)]: dismissed }, a, "board")?.[
        scopedThreadKey(a)
      ],
    ).toEqual({ ...dismissed, isOpen: false, activeSurfaceId: null, surfaces: [] });
  });

  it("limits upstream thread visibility transitions and pending actions to the chosen environment", () => {
    const keys = [scopedThreadKey(a), scopedThreadKey(b), scopedThreadKey(other), "malformed"];
    expect(boardPanelVisibilityKeys(environmentBoardKey(a.environmentId), keys)).toEqual(
      keys.slice(0, 2),
    );
    expect(boardPanelVisibilityKeys(scopedThreadKey(a), keys)).toEqual([scopedThreadKey(a)]);
    const revisions = {
      [scopedThreadKey(a)]: 2,
      [environmentBoardKey(a.environmentId)]: 3,
      [environmentBoardKey(other.environmentId)]: 99,
    };
    expect(boardPanelUserActionRevision(revisions, a)).toBe(5);
    expect(boardPanelUserActionRevision(revisions, b)).toBe(3);
  });

  it("clears ambiguous pre13 hidden Board only when a same-environment thread panel is open", () => {
    const hidden = board(false);
    const foreign = board(false);
    const state = {
      [scopedThreadKey(a)]: files,
      [environmentBoardKey(a.environmentId)]: hidden,
      [environmentBoardKey(other.environmentId)]: foreign,
    };
    const legacy = migrateBoardPanelSelection(state, 12);
    expect(legacy[environmentBoardKey(a.environmentId)]?.activeSurfaceId).toBeNull();
    expect(legacy[environmentBoardKey(other.environmentId)]).toBe(foreign);
    expect(legacy[scopedThreadKey(a)]).toBe(files);
    expect(migrateBoardPanelSelection(state, 13)[environmentBoardKey(a.environmentId)]).toBe(
      hidden,
    );
    expect(
      migrateBoardPanelSelection({ [environmentBoardKey(a.environmentId)]: hidden }, 12)[
        environmentBoardKey(a.environmentId)
      ],
    ).toBe(hidden);
    const open = board();
    expect(
      migrateBoardPanelSelection({ ...state, [environmentBoardKey(a.environmentId)]: open }, 12)[
        environmentBoardKey(a.environmentId)
      ],
    ).toBe(open);
  });
});
