import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  armDraftHandoff,
  reportDraftScene,
  takeDraftMarks,
  withoutTakenMarks,
} from "./draftBoardHandoff";

const element = (id: string, x: number, y: number, customData?: Record<string, unknown>) => ({
  id,
  x,
  y,
  width: 100,
  version: 1,
  isDeleted: false,
  ...(customData === undefined ? {} : { customData }),
});

describe("draft board handoff", () => {
  beforeEach(() => {
    reportDraftScene([element("hero", 400, 200, { t3Piece: "hero" }), element("mark", 700, 260)]);
  });

  it("moves marks to the thread around the hero box, leaving the draft's frames", () => {
    armDraftHandoff();
    const marks = takeDraftMarks();
    expect(marks.map(({ id, x, y }) => ({ id, x, y }))).toEqual([{ id: "mark", x: 250, y: 60 }]);
    expect(marks[0]?.version).toBe(2);
  });

  it("gives nothing to a board that was opened rather than sent to", () => {
    expect(takeDraftMarks()).toEqual([]);
  });

  it("gives nothing after a send that did not go through", () => {
    armDraftHandoff()();
    expect(takeDraftMarks()).toEqual([]);
  });

  it("hands marks over once, and keeps a pending save from restoring them", () => {
    armDraftHandoff();
    takeDraftMarks();
    expect(takeDraftMarks()).toEqual([]);
    expect(withoutTakenMarks([element("mark", 0, 0), element("other", 0, 0)])).toEqual([
      element("other", 0, 0),
    ]);
  });
});
