import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import { resolveBoardInteractionPolicy } from "./InteractionPolicy.ts";

describe("resolveBoardInteractionPolicy", () => {
  it("keeps Default mode writable with writable Collective instructions", () => {
    NodeAssert.deepStrictEqual(resolveBoardInteractionPolicy("default"), {
      boardWriteEnabled: true,
      collectiveInstructionProfile: "writable",
    });
  });

  it("treats an omitted provider mode as writable Default mode", () => {
    NodeAssert.deepStrictEqual(resolveBoardInteractionPolicy(undefined), {
      boardWriteEnabled: true,
      collectiveInstructionProfile: "writable",
    });
  });

  it("keeps Plan Mode read-only at both authority and instruction boundaries", () => {
    NodeAssert.deepStrictEqual(resolveBoardInteractionPolicy("plan"), {
      boardWriteEnabled: false,
      collectiveInstructionProfile: "read-only",
    });
  });
});
