import type { CanvasSurfaceRef } from "@t3tools/shared/canvasSurfaceCard";

import {
  PersistentThreadTerminalPanel,
  type PersistentThreadTerminalPanelProps,
} from "../components/PersistentThreadTerminals";
import { useThreadTerminalActions } from "../components/terminal/useThreadTerminalActions";
import { focusTerminal } from "../lib/terminalFocus";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { MAX_TERMINALS_PER_GROUP } from "../types";
import type { PanelSurfaceCard } from "./canvasSurfaceCards";

type TerminalSurface = PersistentThreadTerminalPanelProps["surface"];

/** The card's ref for a terminal group after a change to its terminals. */
function groupRef(
  surface: TerminalSurface,
  terminalIds: ReadonlyArray<string>,
  activeTerminalId: string,
  splitDirection: TerminalSurface["splitDirection"],
): CanvasSurfaceRef {
  return {
    kind: "terminal",
    resourceId: surface.resourceId,
    terminalIds,
    activeTerminalId,
    ...(splitDirection === "vertical" ? { splitDirection } : {}),
  };
}

/**
 * The panel's terminal group in a card. The panel's own terminal callbacks act on the panel's
 * active tab, so a card splits, switches and closes its own group, and a new terminal becomes a
 * card beside it, as a new tab would in the panel.
 */
export function CanvasCardTerminal(
  props: Omit<
    PersistentThreadTerminalPanelProps,
    | "onSplitTerminal"
    | "onSplitTerminalVertical"
    | "onNewTerminal"
    | "onActiveTerminalChange"
    | "onCloseTerminal"
  > & { readonly card: PanelSurfaceCard },
) {
  const { card, surface, threadRef, ...panel } = props;
  const terminalActions = useThreadTerminalActions(threadRef);
  const launch = (place: (terminalId: string) => void) => {
    const launched = terminalActions.launchTerminal({ place });
    if (!launched) return;
    focusTerminal(threadRef, launched.terminalId);
    void launched.result;
  };
  const split = (direction: "horizontal" | "vertical") => {
    if (surface.terminalIds.length >= MAX_TERMINALS_PER_GROUP) return;
    launch((terminalId) =>
      card.show(groupRef(surface, [...surface.terminalIds, terminalId], terminalId, direction)),
    );
  };
  return (
    <PersistentThreadTerminalPanel
      {...panel}
      threadRef={threadRef}
      surface={surface}
      onSplitTerminal={() => split("horizontal")}
      onSplitTerminalVertical={() => split("vertical")}
      onNewTerminal={() =>
        launch((terminalId) => card.place({ kind: "terminal", resourceId: terminalId }))
      }
      onActiveTerminalChange={(terminalId) => {
        card.show(groupRef(surface, surface.terminalIds, terminalId, surface.splitDirection));
        focusTerminal(threadRef, terminalId);
      }}
      onCloseTerminal={(terminalId) => {
        if (!terminalActions.canWrite()) return;
        terminalActions.closeTerminalSession(terminalId, threadRef);
        useTerminalUiStateStore.getState().closeTerminal(threadRef, terminalId);
        const remaining = surface.terminalIds.filter((id) => id !== terminalId);
        if (remaining.length === 0) {
          card.close();
          return;
        }
        card.show(
          groupRef(
            surface,
            remaining,
            surface.activeTerminalId === terminalId ? remaining.at(-1)! : surface.activeTerminalId,
            surface.splitDirection,
          ),
        );
      }}
    />
  );
}
