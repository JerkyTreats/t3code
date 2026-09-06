import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  primaryId: "primary" as string | null,
  retry: vi.fn(),
  navigate: vi.fn(),
  pairingProps: null as { onAuthenticated: () => void | Promise<void> } | null,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: object) => ({
    options,
    useRouteContext: () => ({ authGateState: { status: "requires-auth", auth: {} } }),
  }),
  redirect: vi.fn(),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../connection/catalog", () => ({ environmentCatalog: { retryNow: {} } }));
vi.mock("../../rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => mocks.primaryId },
}));
vi.mock("../../state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.retry }));
vi.mock("./PairingRouteSurface", () => ({
  PairingRouteSurface: (props: typeof mocks.pairingProps) => {
    mocks.pairingProps = props;
    return null;
  },
  HostedPairingRouteSurface: () => null,
  PairingPendingSurface: () => null,
}));

process.env.NODE_ENV = "development";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const React = await import("react");
const TestRenderer = await import("react-test-renderer");
const { Route } = await import("../../routes/pair");
let renderer: ReturnType<typeof TestRenderer.create> | undefined;

beforeEach(() => {
  mocks.primaryId = EnvironmentId.make("primary");
  mocks.retry.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.pairingProps = null;
  vi.stubGlobal("window", { t3ThreadBridge: {} });
});
afterEach(async () => {
  await React.act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

async function renderPairing() {
  await Route.options.component!.preload?.();
  await React.act(async () => {
    renderer = TestRenderer.create(React.createElement(Route.options.component!));
  });
}

describe("Thread pairing connection recovery", () => {
  it("retries the discovered primary only after accepted pairing and before navigation", async () => {
    mocks.primaryId = null;
    await renderPairing();
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
    await React.act(async () => {
      completion = mocks.pairingProps!.onAuthenticated();
    });
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith("primary");
    expect(mocks.navigate).not.toHaveBeenCalled();
    await React.act(async () => {
      release();
      await completion;
    });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/", replace: true });
  });

  it.each(["ordinary browser", "primary not discovered"])(
    "preserves navigation for %s",
    async (scenario) => {
      if (scenario === "ordinary browser") vi.stubGlobal("window", {});
      else mocks.primaryId = null;
      await renderPairing();
      await React.act(async () => {
        await mocks.pairingProps!.onAuthenticated();
      });
      expect(mocks.retry).not.toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/", replace: true });
    },
  );
});
