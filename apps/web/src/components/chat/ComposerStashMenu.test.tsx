import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerStashMenu } from "./ComposerStashMenu";

describe("ComposerStashMenu semantics", () => {
  it("keeps restore and deletion under one focusable listbox owner", () => {
    const markup = renderToStaticMarkup(
      <ComposerStashMenu
        entries={[
          {
            id: "stash-one",
            createdAt: "2026-07-30T00:00:00.000Z",
            prompt: "saved prompt",
            attachments: [],
            droppedImageNames: [],
          },
        ]}
        onRestore={() => undefined}
        onDelete={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('aria-keyshortcuts="Delete"');
    expect(markup).toContain("Press Delete to remove");
    expect(markup).not.toContain("<button");
  });
});
