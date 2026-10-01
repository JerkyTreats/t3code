import { expect, it } from "vite-plus/test";
import { formatThreadWindowTitle } from "./threadWindowTitle";

it("reports working before a completed turn and keeps the current title", () => {
  expect(
    formatThreadWindowTitle({
      title: "  Fix   footer\ncolors ",
      working: true,
      latestTurnState: "completed",
    }),
  ).toBe("T3 Thread :: working :: Fix footer colors");
});

it("reports completed and unstarted threads separately", () => {
  expect(
    formatThreadWindowTitle({
      title: "Build footer",
      working: false,
      latestTurnState: "completed",
    }),
  ).toBe("T3 Thread :: done :: Build footer");
  expect(formatThreadWindowTitle({ title: "", working: false, latestTurnState: null })).toBe(
    "T3 Thread :: idle :: New thread",
  );
});
