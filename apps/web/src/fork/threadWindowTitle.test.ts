import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { formatThreadWindowTitle } from "./threadWindowTitle";

it("reports working before a completed turn and keeps the current title", () => {
  expect(
    formatThreadWindowTitle({
      title: "  Fix   footer\ncolors ",
      working: true,
      latestRunStatus: "completed",
    }),
  ).toBe("T3 Thread :: working :: Fix footer colors");
});

it("reports completed and unstarted threads separately", () => {
  expect(
    formatThreadWindowTitle({
      title: "Build footer",
      working: false,
      latestRunStatus: "completed",
    }),
  ).toBe("T3 Thread :: done :: Build footer");
  expect(formatThreadWindowTitle({ title: "", working: false, latestRunStatus: null })).toBe(
    "T3 Thread :: idle :: New thread",
  );
});

const incompleteRunStatuses: ReadonlyArray<OrchestrationV2RunStatus> = [
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
];
it.each(incompleteRunStatuses)(
  "keeps non-completed V2 status %s idle once work stops",
  (status) => {
    expect(
      formatThreadWindowTitle({
        title: "Synthetic thread",
        working: false,
        latestRunStatus: status,
      }),
    ).toBe("T3 Thread :: idle :: Synthetic thread");
  },
);
