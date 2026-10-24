import { EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";

const mocks = vi.hoisted(() => ({
  primaryId: "primary" as string | null,
  retry: vi.fn(),
  navigate: vi.fn(),
  replace: vi.fn(),
  flush: vi.fn(),
  pairingProps: null as { onAuthenticated: () => void | Promise<void> } | null,
}));
vi.mock(import("@tanstack/react-router"), async (importOriginal) => ({
  ...(await importOriginal()),
  createFileRoute: (() => (options: object) => ({
    options,
    useRouteContext: () => ({ authGateState: { status: "requires-auth", auth: {} } }),
  })) as never,
  redirect: vi.fn() as never,
  useNavigate: (() => mocks.navigate) as never,
  useRouter: (() => ({ history: { replace: mocks.replace, flush: mocks.flush } })) as never,
}));
vi.mock(
  import("../../connection/catalog"),
  () => ({ environmentCatalog: { retryNow: {} } }) as never,
);
vi.mock(
  import("../../rpc/atomRegistry"),
  () => ({ appAtomRegistry: { get: () => mocks.primaryId } }) as never,
);
vi.mock(
  import("../../state/primaryEnvironment"),
  () => ({ primaryEnvironmentIdAtom: {} }) as never,
);
vi.mock(
  import("../../state/use-atom-command"),
  () => ({ useAtomCommand: () => mocks.retry }) as never,
);
vi.mock(
  import("./PairingRouteSurface"),
  () =>
    ({
      PairingRouteSurface: (props: NonNullable<typeof mocks.pairingProps>) => {
        mocks.pairingProps = props;
        return null;
      },
      HostedPairingRouteSurface: () => null,
      PairingPendingSurface: () => null,
    }) as never,
);

import { Route } from "../../routes/pair";

function resetMocks() {
  mocks.primaryId = EnvironmentId.make("primary");
  mocks.retry.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.replace.mockReset();
  mocks.flush.mockReset();
  mocks.pairingProps = null;
}

// The router plugin code-splits route components, so load the real component before render.
async function loadPairingRoute() {
  const Component = (
    Route as unknown as {
      options: { component: (() => ReactNode) & { preload?: () => Promise<void> } };
    }
  ).options.component;
  await Component.preload?.();
  return Component;
}

// Fork F27: Thread pairing resumes the discovered primary connection before chat navigation.
// The ordinary-browser path reloads the page, which a browser test cannot exercise; it keeps
// upstream's unchanged replace/flush/reload branch.
describe("Thread pairing connection recovery", () => {
  it("retries the discovered primary only after accepted pairing and before navigation", async () => {
    resetMocks();
    using _bridge = stubGlobal("t3ThreadBridge", {});
    mocks.primaryId = null;
    const PairRoute = await loadPairingRoute();
    await using _screen = await render(<PairRoute />, { router: false });
    mocks.primaryId = EnvironmentId.make("primary");
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    let release!: () => void;
    mocks.retry.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    let completion: void | Promise<void>;
    await act(async () => {
      completion = mocks.pairingProps!.onAuthenticated();
    });
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith("primary");
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await completion;
    });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/", replace: true });
  });

  it("preserves navigation when the primary was not discovered", async () => {
    resetMocks();
    using _bridge = stubGlobal("t3ThreadBridge", {});
    mocks.primaryId = null;
    const PairRoute = await loadPairingRoute();
    await using _screen = await render(<PairRoute />, { router: false });
    await act(async () => {
      await mocks.pairingProps!.onAuthenticated();
    });
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/", replace: true });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
