import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import { useStableCallback } from "../hooks/useStableCallback";
import type { TurnBoard } from "./turnBoard";

interface TurnGroup {
  readonly id: string;
  readonly rows: ReadonlyArray<MessagesTimelineRow>;
  readonly requestedWidth: number | null;
  readonly title: string;
}

const THREAD_START_TURN_ID = "thread-start";
const TURN_TITLE_LENGTH = 80;

function requestedWidthOf(rows: ReadonlyArray<MessagesTimelineRow>) {
  const widths = rows.flatMap((row) =>
    row.kind === "html-render" && row.htmlRender.displayWidth !== undefined
      ? [row.htmlRender.displayWidth]
      : [],
  );
  return widths.length === 0 ? null : Math.max(...widths);
}

function titleOf(rows: ReadonlyArray<MessagesTimelineRow>) {
  const opening = rows[0];
  return opening?.kind === "message" ? opening.message.text.slice(0, TURN_TITLE_LENGTH) : "";
}

/** A turn starts at the user's message and runs until the next one. */
function groupRowsByTurn(rows: ReadonlyArray<MessagesTimelineRow>): ReadonlyArray<TurnGroup> {
  const groups: Array<{ id: string; rows: MessagesTimelineRow[] }> = [];
  for (const row of rows) {
    const startsTurn = row.kind === "message" && row.message.role === "user";
    if (startsTurn || groups.length === 0) {
      groups.push({ id: startsTurn ? row.id : THREAD_START_TURN_ID, rows: [] });
    }
    groups.at(-1)?.rows.push(row);
  }
  return groups.map((group) => ({
    ...group,
    requestedWidth: requestedWidthOf(group.rows),
    title: titleOf(group.rows),
  }));
}

/** Renders each turn as one card. The Excalidraw board decides where every card sits. */
export function TurnCards(props: {
  readonly board: TurnBoard;
  readonly rows: ReadonlyArray<MessagesTimelineRow>;
  readonly renderRow: (input: { item: MessagesTimelineRow }) => ReactNode;
  readonly header: ReactNode;
  readonly footer: ReactNode;
  readonly onFollowChange: (following: boolean) => void;
  readonly onReady: () => void;
}) {
  const { board } = props;
  const onFollowChange = useStableCallback(props.onFollowChange);
  const onReady = useStableCallback(props.onReady);
  const turns = groupRowsByTurn(props.rows);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardNodes = useRef(new Map<string, HTMLElement>());

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands the committed card nodes to the board, which positions them outside React
  useLayoutEffect(() => {
    board.publish(
      layerRef.current,
      turns.flatMap((turn) => {
        const element = cardNodes.current.get(turn.id);
        return element === undefined
          ? []
          : [{ id: turn.id, element, requestedWidth: turn.requestedWidth, title: turn.title }];
      }),
    );
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes the timeline to the board's camera and reports the list ready once
  useLayoutEffect(() => {
    board.setFollowListener(onFollowChange);
    onReady();
    return () => {
      board.setFollowListener(null);
      board.publish(null, []);
    };
  }, [board, onFollowChange, onReady]);

  return (
    <div ref={layerRef} className="turn-layer" data-turn-layer>
      {turns.map((turn, index) => (
        <div
          key={turn.id}
          ref={(node) => {
            if (node === null) cardNodes.current.delete(turn.id);
            else cardNodes.current.set(turn.id, node);
          }}
          className="turn-card"
          data-turn-card={turn.id}
        >
          {index === 0 ? props.header : null}
          {turn.rows.map((row) => (
            <Fragment key={row.id}>{props.renderRow({ item: row })}</Fragment>
          ))}
          {index === turns.length - 1 ? props.footer : null}
        </div>
      ))}
    </div>
  );
}
