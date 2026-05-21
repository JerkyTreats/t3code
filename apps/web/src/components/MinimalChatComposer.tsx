import { ChevronUpIcon } from "lucide-react";
import { type ClipboardEventHandler, type RefObject } from "react";

import { cn } from "~/lib/utils";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "./ComposerPromptEditor";

export interface MinimalChatComposerProps {
  composerEditorRef: RefObject<ComposerPromptEditorHandle | null>;
  prompt: string;
  placeholder: string;
  disabled: boolean;
  onChange: (
    nextValue: string,
    nextCursor: number,
    expandedCursor: number,
    cursorAdjacentToMention: boolean,
    terminalContextIds: string[],
  ) => void;
  onCommandKeyDown: (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
    event: KeyboardEvent,
  ) => boolean;
  onPaste: ClipboardEventHandler<HTMLElement>;
  isSendBusy: boolean;
  isConnecting: boolean;
  hasSendableContent: boolean;
  isRunning: boolean;
  onInterrupt: () => void;
  onExpand: () => void;
}

export function MinimalChatComposer(props: MinimalChatComposerProps) {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-208">
      {/* Top expand tab */}
      <button
        type="button"
        className={cn(
          "[-webkit-app-region:no-drag]",
          "absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full",
          "flex h-5 w-20 cursor-pointer items-center justify-center",
          "rounded-t-md border border-b-0 border-border/70 bg-background/90",
          "text-muted-foreground shadow-sm transition-colors hover:border-border hover:text-foreground",
        )}
        onClick={props.onExpand}
        aria-label="Expand composer"
        title="Expand composer"
      >
        <ChevronUpIcon className="size-3.5" />
      </button>

      <div className="rounded-[22px] border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="min-w-0 flex-1">
            <ComposerPromptEditor
              ref={props.composerEditorRef}
              value={props.prompt}
              cursor={0}
              terminalContexts={[]}
              skills={[]}
              onRemoveTerminalContext={() => {}}
              onChange={props.onChange}
              onCommandKeyDown={props.onCommandKeyDown}
              onPaste={props.onPaste}
              placeholder={props.placeholder}
              disabled={props.disabled}
            />
          </div>

          {props.isRunning ? (
            <button
              type="button"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:scale-105 hover:bg-rose-500"
              onClick={props.onInterrupt}
              aria-label="Stop generation"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              className="flex size-8 shrink-0 enabled:cursor-pointer items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-all duration-150 hover:scale-105 hover:bg-primary disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100"
              disabled={props.isSendBusy || props.isConnecting || !props.hasSendableContent}
              aria-label={
                props.isConnecting ? "Connecting" : props.isSendBusy ? "Sending" : "Send message"
              }
            >
              {props.isConnecting || props.isSendBusy ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="animate-spin"
                  aria-hidden="true"
                >
                  <circle
                    cx="7"
                    cy="7"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray="20 12"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
