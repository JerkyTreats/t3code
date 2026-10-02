import type { OrchestrationV2RunStatus } from "@t3tools/contracts";

export type ThreadWindowState = "working" | "done" | "idle";

export function formatThreadWindowTitle(input: {
  title: string;
  working: boolean;
  latestRunStatus: OrchestrationV2RunStatus | null;
}): string {
  const state: ThreadWindowState = input.working
    ? "working"
    : input.latestRunStatus === "completed"
      ? "done"
      : "idle";
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 160) || "New thread";
  return `T3 Thread :: ${state} :: ${title}`;
}
