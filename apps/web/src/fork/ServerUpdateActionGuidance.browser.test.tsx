import type { EnvironmentId, ServerInstallation } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

// F20.D3/D4 host evidence: headless runtimes never offer an in-app or registry update action.
const testState = vi.hoisted(() => ({ updateServer: vi.fn() }));

vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useServerConfigs: (() => new Map()) as never,
}));
vi.mock(import("~/state/managedPolicy"), async (original) => ({
  ...(await original()),
  useManagedPolicy: (() => undefined) as never,
}));
vi.mock(import("~/state/session"), async (original) => {
  const actual = await original();
  const sessionAtom = Atom.make(AsyncResult.initial());
  return {
    ...actual,
    environmentSession: {
      ...actual.environmentSession,
      sessionStateAtom: (() => sessionAtom) as never,
    },
  };
});
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => testState.updateServer) as never,
}));

import { ServerUpdateAction } from "../components/ServerUpdateAction";

describe("headless runtime update guidance", () => {
  it.each([
    { kind: "npm-global", prefix: "/opt/node" },
    { kind: "npx" },
    undefined,
  ] satisfies ReadonlyArray<ServerInstallation | undefined>)(
    "shows deployment manager guidance for a headless installation %j",
    async (installation) => {
      await using screen = await render(
        <ServerUpdateAction
          environmentId={"env-test" as EnvironmentId}
          serverLabel="Test server"
          selfUpdate={null}
          installation={installation}
          targetVersion="0.0.45"
        />,
      );
      await expect.element(screen.getByText(/through its deployment manager/u)).toBeVisible();
      expect(screen.container.textContent).not.toMatch(/\b(?:npx|pnpm dlx|bunx|npm install)\b/u);
      expect(screen.container.querySelector("button")).toBeNull();
      expect(testState.updateServer).not.toHaveBeenCalled();
    },
  );
});
