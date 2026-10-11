import { ANTIGRAVITY_DEFAULT_MODEL } from "@t3tools/contracts";

export function threadModelIdentifierPresentation(input: {
  labelMode: "display" | "identifier" | undefined;
  model: string;
  selectedModel: { slug: string; isUnavailable?: boolean | undefined } | undefined;
}) {
  if (input.labelMode !== "identifier") return null;
  const title =
    input.model === ANTIGRAVITY_DEFAULT_MODEL
      ? input.selectedModel?.slug || "Choose model"
      : input.model || "Choose model";
  return {
    title,
    label: `${title}${input.selectedModel?.isUnavailable ? " (Unavailable)" : ""}`,
    ariaLabel: `Model: ${title}`,
  };
}

/** Thread keeps model identity readable while ordinary chat retains its compact strip. */
export function threadComposerPresentation(threadClient: boolean, inStrip: boolean) {
  return {
    modelTriggerClassName: threadClient
      ? "h-auto min-h-7 max-w-full shrink text-xs! [&_[data-chat-provider-model-picker-label]]:whitespace-normal [&_[data-chat-provider-model-picker-label]]:break-all [&_[data-chat-provider-model-picker-label]]:overflow-visible"
      : inStrip
        ? "min-w-13 shrink text-xs! @max-[640px]/composer-surface:[&_[data-chat-provider-model-picker-label]]:w-0 @max-[640px]/composer-surface:[&_[data-chat-provider-model-picker-label]]:flex-none"
        : "-ms-2.5",
    modelLabelMode: threadClient ? ("identifier" as const) : ("display" as const),
    runtimeIconOnly: threadClient,
    keepControlsExpanded: threadClient,
    controlsClassName: threadClient ? "flex-wrap overflow-visible" : undefined,
  };
}
