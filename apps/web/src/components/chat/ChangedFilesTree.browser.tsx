import "../../index.css";

import { page } from "vite-plus/test/browser";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";
import { TurnId } from "@t3tools/contracts";

import { ChangedFilesTree } from "./ChangedFilesTree";

describe("ChangedFilesTree browser interactions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens file rows through the preview callback when available", async () => {
    const onOpenTurnDiff = vi.fn();
    const onOpenFilePreview = vi.fn();
    const screen = await render(
      <ChangedFilesTree
        turnId={TurnId.make("turn-1")}
        files={[{ path: "docs/PLAN.md", additions: 1, deletions: 0 }]}
        allDirectoriesExpanded
        resolvedTheme="light"
        onOpenTurnDiff={onOpenTurnDiff}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    try {
      await page.getByRole("button", { name: /PLAN\.md/ }).click();

      expect(onOpenFilePreview).toHaveBeenCalledWith("docs/PLAN.md");
      expect(onOpenTurnDiff).not.toHaveBeenCalled();
    } finally {
      await screen.unmount();
    }
  });
});
