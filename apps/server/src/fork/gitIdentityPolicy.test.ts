import { describe, expect, it } from "vitest";

import { pickForkFirstRemote } from "./gitIdentityPolicy.ts";

describe("gitIdentityPolicy", () => {
  it("prefers origin over upstream for fork first identity", () => {
    expect(
      pickForkFirstRemote([
        { name: "upstream", url: "git@github.com:T3Tools/t3code.git" },
        { name: "origin", url: "git@github.com:jerkytreats/t3code.git" },
      ]),
    ).toEqual({ name: "origin", url: "git@github.com:jerkytreats/t3code.git" });
  });

  it("does not let pull request head remotes replace origin", () => {
    expect(
      pickForkFirstRemote([
        { name: "alice", url: "git@github.com:alice/t3code.git" },
        { name: "origin", url: "git@github.com:jerkytreats/t3code.git" },
        { name: "upstream", url: "git@github.com:T3Tools/t3code.git" },
      ]),
    ).toEqual({ name: "origin", url: "git@github.com:jerkytreats/t3code.git" });
  });

  it("falls back to named fork before upstream when origin is absent", () => {
    expect(
      pickForkFirstRemote([
        { name: "upstream", url: "git@github.com:T3Tools/t3code.git" },
        { name: "fork", url: "git@github.com:jerkytreats/t3code.git" },
      ]),
    ).toEqual({ name: "fork", url: "git@github.com:jerkytreats/t3code.git" });
  });
});
