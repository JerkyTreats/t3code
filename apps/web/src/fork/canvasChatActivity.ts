import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

/** What a chat on the board is doing, as its card and the board's activity strip show it. */
export type ChatActivity =
  | { readonly state: "working" }
  | { readonly state: "waiting"; readonly for: "approval" | "answer" }
  | { readonly state: "idle" }
  | { readonly state: "failed" };

type ChatActivityInput = Pick<
  EnvironmentThreadShell,
  "hasPendingApprovals" | "hasPendingUserInput" | "pendingSubagentRequest" | "runtime"
>;

/** A chat's state from its thread shell; a question to the user outranks the run behind it. */
export function chatActivityOf(shell: ChatActivityInput): ChatActivity {
  if (shell.hasPendingApprovals || shell.pendingSubagentRequest === "approval") {
    return { state: "waiting", for: "approval" };
  }
  if (shell.hasPendingUserInput || shell.pendingSubagentRequest === "user_input") {
    return { state: "waiting", for: "answer" };
  }
  if (threadRuntimeIsActive(shell.runtime)) return { state: "working" };
  if (shell.runtime?.status === "failed") return { state: "failed" };
  return { state: "idle" };
}

export function chatActivityLabel(activity: ChatActivity): string {
  switch (activity.state) {
    case "working":
      return "Working";
    case "waiting":
      return activity.for === "approval" ? "Waiting for approval" : "Waiting for an answer";
    case "idle":
      return "Idle";
    case "failed":
      return "Failed";
  }
}

/**
 * The chats on a board that are working or waiting, in the order given, with a count such as
 * "2 working · 1 waiting". Null when none is, so the board shows nothing.
 */
export function boardActivityOf<Chat extends { readonly activity: ChatActivity }>(
  chats: ReadonlyArray<Chat>,
): { readonly active: ReadonlyArray<Chat>; readonly label: string } | null {
  const active = chats.filter(
    (chat) => chat.activity.state === "working" || chat.activity.state === "waiting",
  );
  if (active.length === 0) return null;
  const working = active.filter((chat) => chat.activity.state === "working").length;
  const waiting = active.length - working;
  const label = [
    ...(working > 0 ? [`${working} working`] : []),
    ...(waiting > 0 ? [`${waiting} waiting`] : []),
  ].join(" · ");
  return { active, label };
}
