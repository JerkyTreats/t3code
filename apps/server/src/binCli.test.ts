import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import { makeCli } from "./binCli.ts";

// Command registration authority is independent of server startup wiring.
vi.mock("./server.ts", () => ({ runServer: Effect.void }));

it("keeps package acquisition and service launch commands outside the CLI", () => {
  const commands = makeCli({ cloudEnabled: false }).subcommands.flatMap((group) =>
    group.commands.map((command) => command.name),
  );
  for (const command of [
    "update",
    "uninstall",
    "service",
    "__service-launcher",
    "__service-preflight",
  ]) {
    assert.notInclude(commands, command);
  }
  for (const command of [
    "acp-mcp-bridge",
    "acp-mcp-call",
    "__claude-history",
    "__ssh-helper",
    "serve",
    "pair",
  ]) {
    assert.include(commands, command);
  }
});
