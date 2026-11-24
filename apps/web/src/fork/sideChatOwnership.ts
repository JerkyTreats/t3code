import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";

/**
 * F32.D7: any thread can sit on a board as a chat card, so a side chat pane can show another
 * thread's side chat. Only the host thread's own side chat adds itself to the host's chat or is
 * deleted from the pane. A side chat forked from a run belongs to that run's thread; an unloaded
 * shell counts as the host's own, as the panel opens only its own side chats.
 */
export function isOwnSideChat(
  shell: Pick<EnvironmentThreadShell, "forkedFrom" | "lineage"> | null,
  hostRef: ScopedThreadRef,
): boolean {
  if (shell === null) return true;
  const parentThreadId =
    shell.forkedFrom?.type === "run" ? shell.forkedFrom.threadId : shell.lineage.parentThreadId;
  return parentThreadId === hostRef.threadId;
}
