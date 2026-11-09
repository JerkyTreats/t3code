import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  formatWorkingDurationLabel,
  resolveThreadWorkingStartedAt,
} from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { SquareIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "../components/ui/button";
import { toastManager } from "../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useNowSecond } from "../hooks/useNowSecond";
import { deriveCanInterruptRunningThread } from "../session-logic";
import { useQuietThreadShell, useQuietThreadShells } from "../state/entities";
import { useEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { chatColorOf } from "./canvasChatPresence";
import {
  boardActivityOf,
  type ChatActivity,
  chatActivityLabel,
  chatActivityOf,
} from "./canvasChatStatus";

// T3's own composer floats over the bottom of the board, hiding a card's composer behind it.
const BOARD_COMPOSER_CLEARANCE_PX = 160;

/**
 * A chat card with its status row on top: the chat's state, how long it has been working, and
 * Stop while the card's own composer, which carries Stop too, is not in view.
 */
export function ChatCardStatus(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  /** The card shows the chat with its composer, not only its face. */
  readonly live: boolean;
  readonly children: ReactNode;
}) {
  const { environmentId, threadId } = props;
  const shell = useQuietThreadShell(scopeThreadRef(environmentId, threadId));
  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const interruptTurn = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const [composerInView, setComposerInView] = useState(false);
  // The sentinel sits on the card's bottom edge, where its composer is.
  const watchComposer = (sentinel: HTMLDivElement | null) => {
    if (sentinel === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setComposerInView(entry?.isIntersecting ?? false),
      { rootMargin: `0px 0px -${BOARD_COMPOSER_CLEARANCE_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      setComposerInView(false);
    };
  };
  if (shell === null) return props.children;
  const activity = chatActivityOf(shell);
  const startedAt = activity.state === "working" ? resolveThreadWorkingStartedAt(shell) : null;
  const canStop =
    canOperate &&
    deriveCanInterruptRunningThread(true, shell.runtime) &&
    !(props.live && composerInView);

  const stop = async () => {
    const result = await interruptTurn({ environmentId, input: { threadId } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not stop the chat",
        ...(error instanceof Error ? { description: error.message } : {}),
      });
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-xs"
        data-canvas-chat-status={activity.state}
      >
        <ChatDot threadId={threadId} activity={activity} />
        <span className="min-w-0 truncate">{chatActivityLabel(activity)}</span>
        {startedAt === null ? null : <WorkingFor startedAt={startedAt} />}
        <span className="flex-1" />
        {canStop ? (
          <Button size="micro" variant="destructive-outline" onClick={() => void stop()}>
            <SquareIcon />
            Stop
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{props.children}</div>
      {props.live ? (
        <div ref={watchComposer} aria-hidden className="absolute inset-x-0 bottom-0 h-px" />
      ) : null}
    </div>
  );
}

/** A chat's colour as a dot: filled while it works or rests, hollow while it waits on the user. */
function ChatDot(props: { readonly threadId: string; readonly activity: ChatActivity }) {
  const color = chatColorOf(props.threadId);
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full border-2"
      style={{
        borderColor: color,
        background: props.activity.state === "waiting" ? "transparent" : color,
      }}
    />
  );
}

// Ticks on its own, once a second, so only this span re-renders and only while the chat works.
function WorkingFor(props: { readonly startedAt: string }) {
  const nowMs = useNowSecond();
  const startedMs = Date.parse(props.startedAt);
  if (Number.isNaN(startedMs)) return null;
  return (
    <span className="text-muted-foreground tabular-nums">
      {formatWorkingDurationLabel(nowMs - startedMs)}
    </span>
  );
}

/**
 * One dot for each chat on the board that is working or waiting, with a count. Clicking a dot
 * shows that chat. Renders nothing while every chat rests.
 */
export function BoardActivityStrip(props: {
  readonly environmentId: EnvironmentId;
  /** The board's own thread, then each chat card's thread. */
  readonly threadIds: ReadonlyArray<ThreadId>;
  readonly onShowChat: (threadId: ThreadId) => void;
}) {
  const shells = useQuietThreadShells();
  const chats = props.threadIds.flatMap((threadId) => {
    const shell = shells.find(
      (candidate) => candidate.environmentId === props.environmentId && candidate.id === threadId,
    );
    return shell === undefined
      ? []
      : [{ threadId, title: shell.title, activity: chatActivityOf(shell) }];
  });
  const summary = boardActivityOf(chats);
  if (summary === null) return null;
  return (
    <div
      className="absolute bottom-16 left-4 z-10 flex items-center gap-1 rounded-full border border-border bg-background/90 py-0.5 pr-2.5 pl-1 text-xs text-muted-foreground shadow-xs"
      data-canvas-activity
    >
      {summary.active.map((chat) => (
        <Tooltip key={chat.threadId}>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-accent"
                aria-label={`Show ${chat.title}: ${chatActivityLabel(chat.activity)}`}
                onClick={() => props.onShowChat(chat.threadId)}
              />
            }
          >
            <ChatDot threadId={chat.threadId} activity={chat.activity} />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {chat.title}: {chatActivityLabel(chat.activity)}
          </TooltipPopup>
        </Tooltip>
      ))}
      <span className="ml-1 tabular-nums">{summary.label}</span>
    </div>
  );
}
