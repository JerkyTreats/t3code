import type { ReactNode } from "react";

export const chatComposerPresentation = {
  /** Full-width checkout strip; the composer keeps upstream's radius. */
  shellClassName: "fork-chat-composer-shell [--chat-composer-drawer-inset:0px]",
  runtimeTriggerClassName:
    "size-8 min-w-8 rounded-full border border-border/60 bg-background p-0 shadow-sm justify-center [&_[data-slot=select-icon]]:hidden",
};

export function shouldFloatComposerRuntimeControl(input: {
  isMobileViewport: boolean;
  isResting: boolean;
  isApprovalState: boolean;
  hasPendingInput: boolean;
  noProviderAvailable: boolean;
  controlsCompact: boolean;
}): boolean {
  return (
    !input.isMobileViewport &&
    !input.isResting &&
    !input.isApprovalState &&
    !input.hasPendingInput &&
    !input.noProviderAvailable &&
    !input.controlsCompact
  );
}

export function FloatingComposerRuntimeControl({ children }: { children: ReactNode }) {
  return (
    <div
      data-chat-composer-floating-runtime="true"
      className="absolute -top-4 right-4 z-30 flex items-center gap-1"
    >
      {children}
    </div>
  );
}
