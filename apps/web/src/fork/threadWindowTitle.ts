export type ThreadWindowState = "working" | "done" | "idle";

export function formatThreadWindowTitle(input: {
  title: string;
  working: boolean;
  latestTurnState: "running" | "interrupted" | "completed" | "error" | null;
}): string {
  const state: ThreadWindowState = input.working
    ? "working"
    : input.latestTurnState === "completed"
      ? "done"
      : "idle";
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 160) || "New thread";
  return `T3 Thread :: ${state} :: ${title}`;
}
