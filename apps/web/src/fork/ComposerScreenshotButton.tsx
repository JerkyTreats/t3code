import { ScanLineIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";

/** Desktop screenshot capture beside the ordinary attach action; rendered only with the capability. */
export function ComposerScreenshotButton({
  capturing,
  disabled,
  onCapture,
}: {
  readonly capturing: boolean;
  readonly disabled: boolean;
  readonly onCapture: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={capturing || disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onCapture}
            aria-label="Capture screenshot"
          />
        }
      >
        <ScanLineIcon />
      </TooltipTrigger>
      <TooltipPopup>Capture screenshot</TooltipPopup>
    </Tooltip>
  );
}
