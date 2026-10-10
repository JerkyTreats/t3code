import { useId } from "react";
import { CheckIcon } from "lucide-react";
import { ComposerControl, type ComposerControlSize } from "../components/chat/ComposerControl";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";

export function PotetoModeControl({
  on,
  unavailableReason,
  onToggle,
  size,
  hidden,
}: {
  on: boolean;
  unavailableReason: string | null;
  onToggle: () => void;
  size: ComposerControlSize;
  hidden: boolean;
}) {
  const descriptionId = useId();
  const description =
    unavailableReason ??
    (on
      ? "Poteto Mode on. Every message invokes the workflow. Turn off to stop adding the invocation."
      : "Poteto Mode off. Turn on to use the workflow for every message in this thread.");
  const unavailable = !on && unavailableReason !== null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            size={size}
            aria-label="Poteto Mode"
            aria-pressed={on}
            aria-disabled={unavailable || undefined}
            aria-describedby={descriptionId}
            aria-hidden={hidden || undefined}
            inert={hidden || undefined}
            data-poteto-mode={on ? "on" : "off"}
            className={unavailable ? "opacity-64" : undefined}
            onClick={() => {
              if (!unavailable) onToggle();
            }}
          />
        }
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          data-composer-control-icon
          className="size-4"
        >
          <path
            fillRule="evenodd"
            d="M4 2h6.5a5.5 5.5 0 0 1 0 11H7.5v5H4V2Zm3.5 3.25v4.5h2.75a2.25 2.25 0 0 0 0-4.5H7.5Z"
            clipRule="evenodd"
          />
        </svg>
        {on ? <CheckIcon aria-hidden="true" className="size-2.5!" strokeWidth={3} /> : null}
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="top">{description}</TooltipPopup>
    </Tooltip>
  );
}
