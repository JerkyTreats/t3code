import type { ComposerHandleRef } from "../composerHandleContext";
import { useStableCallback } from "../hooks/useStableCallback";

const CANVAS_NOTES_PROMPT = "Read my notes on the canvas.";

/**
 * Sends the reader's canvas notes from the composer. A draft in progress is the user's, so the
 * note joins it for them to send rather than going out behind their back. Kept out of ChatView
 * for the same reason as `useComposerFocus`: a compiler-memoized closure there pins every
 * thread copy the view has shown.
 */
export function useCanvasNoteSender(
  composerRef: ComposerHandleRef,
  scheduleComposerFocus: () => void,
  send: () => unknown,
) {
  // The server lists the unseen marks for the agent; this prompt only has to open the turn.
  return useStableCallback(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const hadDraft = composer.getSendContext().prompt.trim() !== "";
    if (!composer.insertTextAtEnd(CANVAS_NOTES_PROMPT, { ensureLeadingBoundary: true })) return;
    if (hadDraft) {
      scheduleComposerFocus();
      return;
    }
    requestAnimationFrame(() => void send());
  });
}
