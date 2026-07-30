import { describe, expect, it } from "vite-plus/test";

import { promptStashFinalizationWarning } from "./promptStashFinalization";

describe("prompt stash finalization warnings", () => {
  it("reports every image lost to a restore race", () => {
    expect(
      promptStashFinalizationWarning({
        status: "entry-missing",
        imageNames: ["one.png", "two.png"],
      }),
    ).toEqual({
      title: "Stashed images were not restored",
      description:
        "one.png, two.png finished saving after the stash was restored or deleted. Reattach the images if they are still needed.",
    });
  });

  it("does not claim a failed finalization can be recovered by restoring", () => {
    const warning = promptStashFinalizationWarning({
      status: "persistence-failed",
      imageNames: ["lost.png"],
    });
    expect(warning?.description).toContain("cannot be recovered from the stash");
    expect(warning?.description).toContain("Reattach");
  });

  it("names images dropped during otherwise durable finalization", () => {
    expect(
      promptStashFinalizationWarning({
        status: "images-dropped",
        imageNames: ["too-large.png", "unreadable.png"],
      }),
    ).toEqual({
      title: "Stashed images were not saved",
      description:
        "too-large.png, unreadable.png could not fit within stash limits or could not be read. The text remains stashed without those images.",
    });
  });
});
