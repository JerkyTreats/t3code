import { BookmarkIcon, XIcon } from "lucide-react";
import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { PromptStashEntry } from "../../promptStashStore";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { resolveComposerStashMenuKeyAction } from "./composerStashMenuKeyboard";

function entryLabel(entry: PromptStashEntry): string {
  const prompt = entry.prompt.trim().replace(/\s+/g, " ");
  if (prompt.length > 0) return prompt.length > 90 ? `${prompt.slice(0, 90)}…` : prompt;
  if (entry.prompt.length > 0) return "Whitespace-only prompt";
  const imageCount = entry.attachments.length + entry.droppedImageNames.length;
  return imageCount === 1 ? "1 image" : `${imageCount} images`;
}

export const ComposerStashMenu = memo(function ComposerStashMenu(props: {
  readonly entries: ReadonlyArray<PromptStashEntry>;
  readonly onRestore: (entry: PromptStashEntry) => void;
  readonly onDelete: (entry: PromptStashEntry) => void;
  readonly onClose: () => void;
}) {
  const listboxRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(props.entries[0]?.id ?? null);
  const activeEntry =
    props.entries.find((entry) => entry.id === activeId) ?? props.entries[0] ?? null;

  useEffect(() => {
    if (activeEntry || props.entries.length === 0) return;
    setActiveId(props.entries[0]?.id ?? null);
  }, [activeEntry, props.entries]);

  useEffect(() => {
    listboxRef.current?.focus({ preventScroll: true });
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = resolveComposerStashMenuKeyAction({
      key: event.key,
      targetIsButton:
        event.target instanceof HTMLElement && event.target.closest("button") !== null,
      hasEntries: props.entries.length > 0,
    });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.kind === "close") {
      props.onClose();
      return;
    }
    if (action.kind === "restore") {
      if (activeEntry) props.onRestore(activeEntry);
      return;
    }
    const currentIndex = Math.max(
      0,
      props.entries.findIndex((entry) => entry.id === activeEntry?.id),
    );
    const nextIndex = (currentIndex + action.offset + props.entries.length) % props.entries.length;
    setActiveId(props.entries[nextIndex]?.id ?? null);
  };

  return (
    <div className="dropdown-glass absolute inset-x-0 bottom-full z-30 mb-2 rounded-[20px] border border-border/70 p-1.5 shadow-xl">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <BookmarkIcon className="size-3" aria-hidden="true" />
        Stashed prompts
      </div>
      {props.entries.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Nothing stashed yet. Add text or images, then press the stash shortcut.
        </p>
      ) : null}
      <div
        ref={listboxRef}
        role="listbox"
        tabIndex={0}
        aria-label="Stashed prompts"
        aria-activedescendant={activeEntry ? `stash-option-${activeEntry.id}` : undefined}
        className="max-h-60 overflow-y-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onKeyDown={handleKeyDown}
      >
        {props.entries.map((entry) => {
          const missingCount =
            entry.droppedImageNames.length + (entry.unreadableImageNames?.length ?? 0);
          return (
            <div
              key={entry.id}
              id={`stash-option-${entry.id}`}
              role="option"
              aria-selected={activeEntry?.id === entry.id}
              className={cn(
                "group flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-sm",
                activeEntry?.id === entry.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
              onMouseMove={() => setActiveId(entry.id)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => props.onRestore(entry)}
            >
              {entry.attachments[0] ? (
                <img
                  src={entry.attachments[0].dataUrl}
                  alt=""
                  className="size-6 shrink-0 rounded border border-border/70 object-cover"
                />
              ) : (
                <BookmarkIcon className="size-4 shrink-0 text-muted-foreground/60" />
              )}
              <span className="min-w-0 flex-1 truncate">{entryLabel(entry)}</span>
              {entry.pendingImageCount ? (
                <span className="text-[10px] text-muted-foreground">
                  saving {entry.pendingImageCount}
                </span>
              ) : missingCount > 0 ? (
                <span className="text-[10px] text-amber-600">{missingCount} dropped</span>
              ) : null}
              <span className="shrink-0 text-xs text-muted-foreground/60">
                {formatRelativeTimeLabel(entry.createdAt)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Delete stashed prompt"
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDelete(entry);
                }}
              >
                <XIcon />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
});
