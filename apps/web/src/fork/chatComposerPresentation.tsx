import type { ReactNode } from "react";

export const chatComposerPresentation = {
  mainClassName: "rounded-[24px]",
  surfaceClassName: "rounded-[23px] transition-[background-color] duration-200",
  shellClassName:
    "fork-chat-composer-shell [--chat-composer-drawer-inset:0px] before:rounded-[24px]",
  hostClassName: "rounded-[24px]",
  runtimeTriggerClassName:
    "size-8 min-w-8 rounded-full border border-border/60 bg-background p-0 shadow-sm justify-center [&_[data-slot=select-icon]]:hidden",
};

export function restingComposerActionPadding(input: {
  hasContextMeter: boolean;
  hasAttachmentPicker: boolean;
  hasScreenshot: boolean;
}): string {
  if (input.hasScreenshot)
    return input.hasContextMeter ? "pr-36" : input.hasAttachmentPicker ? "pr-28" : "pr-20";
  return input.hasContextMeter ? "pr-28" : input.hasAttachmentPicker ? "pr-20" : "pr-12";
}

export function shouldFloatComposerRuntimeControl(input: {
  isMobileViewport: boolean;
  isResting: boolean;
  isApprovalState: boolean;
  hasPendingInput: boolean;
  noProviderAvailable: boolean;
}): boolean {
  return (
    !input.isMobileViewport &&
    !input.isResting &&
    !input.isApprovalState &&
    !input.hasPendingInput &&
    !input.noProviderAvailable
  );
}

export function FloatingComposerRuntimeControl({ children }: { children: ReactNode }) {
  return (
    <div data-chat-composer-floating-runtime="true" className="absolute -top-4 right-4 z-30">
      {children}
    </div>
  );
}
