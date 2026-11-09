import type { ScopedThreadRef, ThreadCanvasBrowserTrailFrame } from "@t3tools/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { useAssetUrls } from "../assets/assetUrls";
import { Button } from "../components/ui/button";
import { threadCanvasBrowserTrail } from "../state/threadCanvas";
import { useAtomCommand } from "../state/use-atom-command";

const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * What a browser card shows once its tab is gone: the screenshots the server kept while the tab
 * was open, newest first, stepped through with the arrows or the slider.
 */
export function BrowserTrailPlayer(props: {
  readonly threadRef: ScopedThreadRef;
  readonly tabId: string;
  readonly reason: string;
}) {
  const { threadRef, tabId } = props;
  const load = useAtomCommand(threadCanvasBrowserTrail, { reportFailure: false });
  const [frames, setFrames] = useState<ReadonlyArray<ThreadCanvasBrowserTrailFrame> | null>(null);
  const [index, setIndex] = useState(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the trail is read once, when the closed card mounts
  useEffect(() => {
    let current = true;
    void load({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, tabId },
    }).then((result) => {
      if (!current) return;
      const loaded = result._tag === "Success" ? result.value.frames : [];
      setFrames(loaded);
      setIndex(Math.max(0, loaded.length - 1));
    });
    return () => {
      current = false;
    };
  }, [load, threadRef.environmentId, threadRef.threadId, tabId]);

  const frame = frames?.[index];
  const [src] = useAssetUrls(
    threadRef.environmentId,
    frame === undefined ? [] : [{ _tag: "attachment", attachmentId: frame.attachmentId }],
  );

  if (frames === null) {
    return <p className="text-muted-foreground text-xs">Loading the recording…</p>;
  }
  if (frame === undefined) {
    return <p className="text-muted-foreground text-xs">No longer available. {props.reason}</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-browser-trail>
      <div className="bg-muted/40 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded">
        {src ? (
          <img
            src={src}
            alt={frame.title || frame.url}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Earlier screenshot"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft />
        </Button>
        <input
          type="range"
          className="min-w-0 flex-1"
          min={0}
          max={frames.length - 1}
          value={index}
          aria-label="Recording position"
          onChange={(event) => setIndex(Number(event.currentTarget.value))}
        />
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Later screenshot"
          disabled={index === frames.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {index + 1}/{frames.length} · {timeOf(frame.at)}
        </span>
      </div>
      <a
        href={frame.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground truncate text-xs hover:underline"
      >
        {frame.title || frame.url}
      </a>
    </div>
  );
}
