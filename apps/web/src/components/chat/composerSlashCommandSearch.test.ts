import { describe, expect, it } from "vitest";
import { ProviderInstanceId } from "@t3tools/contracts";

import type { ComposerCommandItem } from "./ComposerCommandMenu";
import { searchSlashCommandItems } from "./composerSlashCommandSearch";

describe("searchSlashCommandItems", () => {
  it("ranks built in and provider slash commands together", () => {
    const items = [
      {
        id: "slash:plan",
        type: "slash-command",
        command: "plan",
        label: "/plan",
        description: "Switch this thread into plan mode",
      },
      {
        id: "provider-slash-command:claudeAgent:review",
        type: "provider-slash-command",
        provider: "claudeAgent",
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        command: {
          name: "review",
          description: "Review the current work",
        },
        label: "/review",
        description: "Review the current work",
      },
      {
        id: "provider-slash-command:claudeAgent:frontend-design",
        type: "provider-slash-command",
        provider: "claudeAgent",
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        command: {
          name: "frontend-design",
          description: "Build polished UI",
        },
        label: "/frontend-design",
        description: "Build polished UI",
      },
    ] satisfies Extract<
      ComposerCommandItem,
      { type: "slash-command" | "provider-slash-command" }
    >[];

    expect(searchSlashCommandItems(items, "rev").map((item) => item.id)).toEqual([
      "provider-slash-command:claudeAgent:review",
    ]);
    expect(searchSlashCommandItems(items, "/pl").map((item) => item.id)).toEqual(["slash:plan"]);
  });
});
