import { BookmarkIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";

export const ComposerStashBadge = memo(function ComposerStashBadge(props: {
  readonly count: number;
  readonly active: boolean;
  readonly onToggle: () => void;
}) {
  if (props.count === 0) return null;
  return (
    <button
      type="button"
      aria-label={`Open ${props.count} stashed prompts`}
      aria-expanded={props.active}
      className={cn(
        "absolute -top-3 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-popover px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm transition-colors",
        "hover:border-border hover:text-foreground",
        props.active && "border-primary/30 text-foreground",
      )}
      onPointerDown={(event) => event.preventDefault()}
      onClick={props.onToggle}
    >
      <BookmarkIcon className="size-3" aria-hidden="true" />
      Stash
      <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums">
        {props.count}
      </span>
    </button>
  );
});
