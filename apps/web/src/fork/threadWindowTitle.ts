import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import { useEffect } from "react";

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

/** Publishes the compact Thread client's native window title while it owns the chat. */
export function useThreadWindowTitle(input: {
  enabled: boolean;
  title: string;
  working: boolean;
  latestRunStatus: OrchestrationV2RunStatus | null;
}): void {
  const { enabled, title, working, latestRunStatus } = input;
  useEffect(() => {
    if (!enabled) return;
    document.title = formatThreadWindowTitle({ title, working, latestRunStatus });
  }, [enabled, title, working, latestRunStatus]);
  useEffect(() => {
    if (!enabled) return;
    return () => {
      document.title = "T3 Thread";
    };
  }, [enabled]);
}
