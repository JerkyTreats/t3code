import "~/index.css";

import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => "none",
  useClientSettings: () => false,
}));
vi.mock("../components/SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: () => null,
  useSidebarStageBackdropVariant: () => null,
}));

import { ComposerPrimaryActions } from "../components/chat/ComposerPrimaryActions";

// Rehomed from the deleted upstream host test: ordinary draft send presentation (CHAT.D4).
function actions(input: { promptHasText: boolean; sendDisabledReason: string | null }) {
  return (
    <ComposerPrimaryActions
      compact
      canOperateThread
      pendingAction={null}
      isRunning={false}
      canInterrupt={false}
      isSendBusy={false}
      sendDisabledReason={input.sendDisabledReason}
      isEnvironmentUnavailable={false}
      isPreparingWorktree={false}
      hasSendableContent={input.promptHasText}
      onSubmitMessage={() => {}}
      onResume={() => {}}
      onPreviousPendingQuestion={() => {}}
      onInterrupt={() => {}}
    />
  );
}

describe("ordinary composer primary actions", () => {
  it("keeps the disabled submit control for an empty draft", async () => {
    await using screen = await render(actions({ promptHasText: false, sendDisabledReason: null }));
    await expect.element(screen.getByRole("button", { name: "Submit message" })).toBeDisabled();
  });

  it("names the transient reason while a non-empty draft cannot send", async () => {
    await using screen = await render(
      actions({ promptHasText: true, sendDisabledReason: "Preparing attachments" }),
    );
    await expect
      .element(screen.getByRole("button", { name: "Preparing attachments" }))
      .toBeInTheDocument();
  });
});
