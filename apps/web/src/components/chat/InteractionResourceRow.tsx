import type { InteractionResource } from "@t3tools/contracts";
import { CircleAlertIcon, CircleCheckIcon, MonitorIcon, MousePointerClickIcon } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";

export interface InteractionResourceRowProps {
  resource: InteractionResource;
  hostAvailable: boolean;
  engagementOwned?: boolean;
  hasFrame?: boolean;
  onEngage: (resource: InteractionResource) => void;
  onDisengage: (resource: InteractionResource) => void;
  onCancel: (resource: InteractionResource) => void;
  onCanvasRef?: (resource: InteractionResource, canvas: HTMLCanvasElement | null) => void;
  onPointerInput?: (resource: InteractionResource, input: InteractionPointerInput) => void;
}

export interface InteractionPointerInput {
  phase: "enter" | "move" | "press" | "release" | "leave";
  normalizedX: number;
  normalizedY: number;
  isTrusted: boolean;
}

function lifecycleLabel(resource: InteractionResource) {
  switch (resource.lifecycle.state) {
    case "open":
      return "Waiting for input";
    case "resolved":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
  }
}

function continuationLabel(resource: InteractionResource) {
  switch (resource.continuation.state) {
    case "none":
      return null;
    case "pending":
      return "Continuation pending";
    case "admitted":
      return "Continuation admitted";
    case "submitting":
      return "Submitting continuation";
    case "started":
      return "Continuation started";
    case "ambiguous":
      return "Continuation status uncertain";
    case "failed":
      return "Continuation failed";
  }
}

function presentationMessage(resource: InteractionResource, hostAvailable: boolean) {
  if (!hostAvailable) {
    return "This native interaction is unavailable in the web client.";
  }
  switch (resource.presentation.state) {
    case "unavailable":
      return "The native interaction host is unavailable.";
    case "starting":
      return "The native surface is starting.";
    case "ready":
      return "The native surface is ready. Engage to send input.";
    case "stopped":
      return "The native surface has stopped.";
    case "failed":
      return "The native surface failed.";
  }
}

function evidenceLabel(resource: InteractionResource) {
  if (resource.evidence === null) return null;
  const bytes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    resource.evidence.byteCount,
  );
  return `Evidence retained · ${bytes} bytes`;
}

export function InteractionResourceRow({
  resource,
  hostAvailable,
  engagementOwned = false,
  hasFrame = false,
  onEngage,
  onDisengage,
  onCancel,
  onCanvasRef,
  onPointerInput,
}: InteractionResourceRowProps) {
  const titleId = useId();
  const [locallyDisarmedEpoch, setLocallyDisarmedEpoch] = useState<number | null>(null);
  const locallyDisarmedEpochRef = useRef<number | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const serverEngagementEpoch =
    resource.engagement.state === "engaged" ? resource.engagement.epoch : null;
  const isEngaged =
    hostAvailable &&
    engagementOwned &&
    serverEngagementEpoch !== null &&
    locallyDisarmedEpoch !== serverEngagementEpoch;
  const isLocallyDisarming =
    hostAvailable &&
    serverEngagementEpoch !== null &&
    locallyDisarmedEpoch === serverEngagementEpoch;
  const isOpen = resource.lifecycle.state === "open";
  const canEngage =
    isOpen &&
    hostAvailable &&
    hasFrame &&
    resource.presentation.state === "ready" &&
    resource.engagement.state === "disengaged";
  const continuation = continuationLabel(resource);
  const evidence = evidenceLabel(resource);
  const engagedElsewhere =
    hostAvailable && resource.engagement.state === "engaged" && !engagementOwned;

  const forwardPointerInput = (
    phase: InteractionPointerInput["phase"],
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      !isEngaged ||
      serverEngagementEpoch === null ||
      locallyDisarmedEpochRef.current === serverEngagementEpoch
    ) {
      return;
    }
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    onPointerInput?.(resource, {
      phase,
      normalizedX: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      normalizedY: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
      isTrusted: event.nativeEvent.isTrusted,
    });
  };

  const disengage = useCallback(() => {
    if (
      !isEngaged ||
      serverEngagementEpoch === null ||
      locallyDisarmedEpochRef.current === serverEngagementEpoch
    ) {
      return;
    }
    locallyDisarmedEpochRef.current = serverEngagementEpoch;
    setLocallyDisarmedEpoch(serverEngagementEpoch);
    onDisengage(resource);
  }, [isEngaged, onDisengage, resource, serverEngagementEpoch]);

  useEffect(() => {
    if (!isEngaged || canvasElement === null) return;
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.find((candidate) => candidate.target === canvasElement);
          if (entry !== undefined && (!entry.isIntersecting || entry.intersectionRatio <= 0)) {
            disengage();
          }
        },
        { root: null, threshold: 0 },
      );
      observer.observe(canvasElement);
      return () => observer.disconnect();
    }

    const disengageOutsideViewport = () => {
      const bounds = canvasElement.getBoundingClientRect();
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        bounds.bottom <= 0 ||
        bounds.right <= 0 ||
        bounds.top >= window.innerHeight ||
        bounds.left >= window.innerWidth
      ) {
        disengage();
      }
    };
    disengageOutsideViewport();
    window.addEventListener("scroll", disengageOutsideViewport, true);
    window.addEventListener("resize", disengageOutsideViewport);
    return () => {
      window.removeEventListener("scroll", disengageOutsideViewport, true);
      window.removeEventListener("resize", disengageOutsideViewport);
    };
  }, [canvasElement, disengage, isEngaged]);

  const registerCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      setCanvasElement(canvas);
      onCanvasRef?.(resource, canvas);
    },
    [onCanvasRef, resource],
  );

  const cancel = () => {
    if (serverEngagementEpoch !== null) {
      locallyDisarmedEpochRef.current = serverEngagementEpoch;
      setLocallyDisarmedEpoch(serverEngagementEpoch);
    }
    onCancel(resource);
  };

  return (
    <section
      aria-labelledby={titleId}
      data-testid={`interaction-resource-${resource.id}`}
      data-thread-id={resource.threadId}
      data-interaction-id={resource.id}
      data-engagement-state={isEngaged ? "engaged" : "disengaged"}
      className={cn(
        "rounded-xl border border-border/80 bg-card/70 p-3 sm:p-4",
        isEngaged && "border-primary/45 bg-primary/[0.035]",
      )}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) disengage();
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || !isEngaged) return;
        event.preventDefault();
        event.stopPropagation();
        disengage();
      }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Interaction</Badge>
            <Badge variant="outline" data-testid={`interaction-provenance-${resource.id}`}>
              {resource.request.inputProvenance === "synthetic"
                ? "Synthetic input"
                : "Physical input"}
            </Badge>
            <span className="text-muted-foreground text-xs">{lifecycleLabel(resource)}</span>
          </div>
          <h3 id={titleId} className="mt-2 text-sm font-medium text-foreground">
            {resource.display.title}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
            {resource.display.summary}
          </p>
        </div>
        {resource.lifecycle.state === "resolved" ? (
          <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        ) : resource.lifecycle.state === "failed" ? (
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : null}
      </div>

      <div
        className={cn(
          "relative mt-3 flex min-h-28 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background/50 text-center",
          isEngaged && "border-primary/35",
        )}
      >
        {hostAvailable ? (
          <canvas
            ref={registerCanvas}
            data-testid={`interaction-canvas-${resource.id}`}
            width={640}
            height={360}
            aria-label={`${resource.display.title} native interaction surface`}
            className={cn(
              "block aspect-video h-auto w-full bg-background",
              isEngaged && "touch-none cursor-crosshair",
            )}
            onPointerEnter={(event) => forwardPointerInput("enter", event)}
            onPointerMove={(event) => forwardPointerInput("move", event)}
            onPointerDown={(event) => forwardPointerInput("press", event)}
            onPointerUp={(event) => forwardPointerInput("release", event)}
            onPointerLeave={(event) => forwardPointerInput("leave", event)}
          />
        ) : null}
        {!hostAvailable || !hasFrame || resource.presentation.state !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <MonitorIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-foreground">
                {isLocallyDisarming
                  ? "Input is disengaging."
                  : hostAvailable && resource.presentation.state === "ready" && !hasFrame
                    ? "Waiting for the first native frame."
                    : presentationMessage(resource, hostAvailable)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {isEngaged ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
          <MousePointerClickIcon className="size-4 text-primary" aria-hidden="true" />
          Input is engaged. Press Escape or move focus away to disengage.
        </p>
      ) : null}

      {evidence || continuation ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          {evidence ? <span>{evidence}</span> : null}
          {continuation ? <span>{continuation}</span> : null}
        </div>
      ) : null}

      {isOpen ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {hostAvailable ? (
            isEngaged ? (
              <Button
                size="sm"
                variant="outline"
                className="transition-none active:scale-100"
                data-testid={`interaction-disengage-${resource.id}`}
                onClick={disengage}
              >
                Disengage
              </Button>
            ) : (
              <Button
                size="sm"
                className="transition-none active:scale-100"
                data-testid={`interaction-engage-${resource.id}`}
                disabled={!canEngage || isLocallyDisarming || engagedElsewhere}
                onClick={() => onEngage(resource)}
              >
                {isLocallyDisarming
                  ? "Disengaging"
                  : engagedElsewhere
                    ? "In use elsewhere"
                    : "Engage"}
              </Button>
            )
          ) : null}
          <Button
            size="sm"
            variant="destructive-outline"
            className="transition-none active:scale-100"
            data-testid={`interaction-cancel-${resource.id}`}
            onClick={cancel}
          >
            Cancel interaction
          </Button>
        </div>
      ) : null}
    </section>
  );
}
