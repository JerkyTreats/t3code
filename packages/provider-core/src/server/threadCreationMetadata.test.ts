import { assert, describe, it } from "@effect/vitest";
import { threadCreationMetadata } from "./threadCreationMetadata.ts";

describe("threadCreationMetadata", () => {
  it("clears a copied parent's Thread classification through a replacement host", () => {
    const child = {
      creationSurface: "thread" as const,
      ...threadCreationMetadata({ createdBy: "agent", creationSource: "provider" }),
    };
    assert.isUndefined(child.creationSurface);
    assert.equal(child.createdBy, "agent");
    assert.equal(child.creationSource, "provider");
  });

  it("retains the explicit surface of the newly created child", () => {
    assert.equal(
      threadCreationMetadata({
        createdBy: "agent",
        creationSource: "provider",
        creationSurface: "thread",
      }).creationSurface,
      "thread",
    );
  });
});
