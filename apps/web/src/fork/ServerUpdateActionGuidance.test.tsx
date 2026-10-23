import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { EnvironmentId, ServerInstallation } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

// F20.D3/D4 host evidence: headless runtimes never offer an in-app or registry update action.
const testState = vi.hoisted(() => ({ updateServer: vi.fn() }));

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentSettings: (
    _environmentId: EnvironmentId,
    selector: (settings: { continueThreadsAfterServerUpdate: boolean }) => unknown,
  ) => selector({ continueThreadsAfterServerUpdate: false }),
}));
vi.mock("@effect/atom-react", async () => {
  const { AsyncResult } = await import("effect/reactivity");
  return { useAtomValue: () => AsyncResult.initial() };
});
vi.mock("~/rpc/atomRegistry", async () => {
  const { AsyncResult } = await import("effect/reactivity");
  return { appAtomRegistry: { get: () => AsyncResult.initial() } };
});
vi.mock("~/state/session", () => ({
  environmentSession: { sessionStateAtom: () => Symbol("session") },
}));
vi.mock("~/state/server", () => ({
  serverEnvironment: { updateServer: Symbol("updateServer") },
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => testState.updateServer }));

import { ServerUpdateAction } from "../components/ServerUpdateAction";

describe("headless runtime update guidance", () => {
  it.each([
    { kind: "npm-global", prefix: "/opt/node" },
    { kind: "npx" },
    undefined,
  ] satisfies ReadonlyArray<ServerInstallation | undefined>)(
    "shows deployment manager guidance for a headless installation %j",
    (installation) => {
      const action = ServerUpdateAction({
        environmentId: "env-test" as EnvironmentId,
        serverLabel: "Test server",
        selfUpdate: null,
        installation,
        targetVersion: "0.0.45",
      }) as ReactElement<{ readonly onClick?: () => void }>;
      const markup = renderToStaticMarkup(action);
      expect(markup).toContain("through its deployment manager");
      expect(markup).not.toMatch(/\b(?:npx|pnpm dlx|bunx|npm install)\b/u);
      expect(action.props.onClick).toBeUndefined();
      expect(testState.updateServer).not.toHaveBeenCalled();
    },
  );
});
