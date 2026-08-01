import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { dismissFileEditorInteraction } from "./fileEditorDismissal";

describe("dismissFileEditorInteraction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears the editor selection before dismissal can unmount its document", () => {
    vi.stubGlobal(
      "HTMLElement",
      class HTMLElement {
        readonly nodeType = 1;
      },
    );
    let dismissed = false;
    const calls: string[] = [];

    dismissFileEditorInteraction({
      root: {
        querySelector: () => null,
      } as unknown as HTMLElement,
      editor: {
        setSelections: () => {
          expect(dismissed).toBe(false);
          calls.push("selection");
        },
      },
      onDismiss: () => {
        dismissed = true;
        calls.push("dismiss");
      },
    });

    expect(calls).toEqual(["selection", "dismiss"]);
  });
});
