import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/hooks/useSettings", () => ({ useEnvironmentIdentificationMode: () => "none" }));
vi.mock("../components/SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: () => null,
  useSidebarStageBackdropVariant: () => null,
}));

import { ComposerPrimaryActions } from "../components/chat/ComposerPrimaryActions";

// Rehomed from the deleted upstream host test: ordinary draft send presentation (CHAT.D4).
function renderActions(input: { promptHasText: boolean; sendDisabledReason: string | null }) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: null,
      isRunning: false,
      canInterrupt: false,
      showPlanFollowUpPrompt: false,
      promptHasText: input.promptHasText,
      isSendBusy: false,
      sendDisabledReason: input.sendDisabledReason,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: input.promptHasText,
      onSubmitMessage: () => {},
      onResume: () => {},
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

describe("ordinary composer primary actions", () => {
  it("keeps the disabled submit control for an empty draft", () => {
    const markup = renderActions({ promptHasText: false, sendDisabledReason: null });
    expect(markup).toContain('aria-label="Submit message"');
    expect(markup).toContain("disabled");
  });

  it("names the transient reason while a non-empty draft cannot send", () => {
    const markup = renderActions({
      promptHasText: true,
      sendDisabledReason: "Preparing attachments",
    });
    expect(markup).toContain('aria-label="Preparing attachments"');
  });
});
