import type { RuntimeMode } from "@t3tools/contracts";
import { CameraIcon, LockIcon, LockOpenIcon, PenLineIcon, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    label: "Supervised",
    description: "Ask before commands and file changes.",
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    icon: PenLineIcon,
  },
  "full-access": {
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    icon: LockOpenIcon,
  },
};

const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];

interface ComposerTopActionsProps {
  canCaptureDesktopScreenshot: boolean;
  isCapturingDesktopScreenshot: boolean;
  isScreenshotDisabled: boolean;
  runtimeMode: RuntimeMode;
  onCaptureScreenshot: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}

export function ComposerTopActions(props: ComposerTopActionsProps) {
  const runtimeModeOption = runtimeModeConfig[props.runtimeMode];
  const RuntimeModeIcon = runtimeModeOption.icon;

  return (
    <div
      data-chat-composer-top-actions="true"
      className="pointer-events-none absolute right-3 top-0 z-20 flex -translate-y-1/2 items-center gap-1.5 sm:right-4"
    >
      <Select
        value={props.runtimeMode}
        onValueChange={(value) => {
          if (!value || value === props.runtimeMode) return;
          props.onRuntimeModeChange(value);
        }}
      >
        <SelectTrigger
          variant="ghost"
          size="sm"
          className="pointer-events-auto size-8 justify-center rounded-full border border-border/65 bg-background/92 p-0 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-background hover:text-foreground [&_[data-slot=select-icon]]:hidden"
          aria-label={`Runtime mode: ${runtimeModeOption.label}`}
          title={runtimeModeOption.description}
        >
          <RuntimeModeIcon className="size-4" />
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {runtimeModeOptions.map((mode) => {
            const option = runtimeModeConfig[mode];
            const OptionIcon = option.icon;
            return (
              <SelectItem key={mode} value={mode} className="min-w-64 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {option.label}
                  </span>
                  <span className="text-muted-foreground text-xs leading-4">
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>

      {props.canCaptureDesktopScreenshot ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="pointer-events-auto rounded-full border-border/65 bg-background/92 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-background hover:text-foreground"
                disabled={props.isScreenshotDisabled}
                aria-label="Attach screenshot"
                onClick={props.onCaptureScreenshot}
              >
                <CameraIcon
                  className={cn("size-4", props.isCapturingDesktopScreenshot && "animate-pulse")}
                />
              </Button>
            }
          />
          <TooltipPopup side="top">Attach screenshot</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}
