import type { EnvironmentId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  desktop: false,
  primary: null as string | null,
  serverBrowser: new Set<string>(),
  desktopBrowser: new Set<string>(),
}));

vi.mock("~/env", () => ({ isElectron: true }));
vi.mock("~/previewStateStore", () => ({ isPreviewSupportedInRuntime: () => state.desktop }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: { get: () => state.primary } }));
vi.mock("~/state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: {} }));
vi.mock("~/state/entities", () => ({
  readEnvironmentHasDesktopBrowser: (id: string) => state.desktopBrowser.has(id),
  readEnvironmentSupportsServerBrowser: (id: string) => state.serverBrowser.has(id),
  useEnvironmentHasDesktopBrowser: () => false,
  useEnvironmentSupportsServerBrowser: () => false,
}));

import {
  alternatePreviewRuntime,
  previewRuntimeFor,
  rendersPreviewTabNatively,
  rendersServerTabNatively,
} from "./previewRuntime";

const local = "local" as EnvironmentId;
const remote = "remote" as EnvironmentId;

afterEach(() => {
  state.desktop = false;
  state.primary = null;
  state.serverBrowser = new Set();
  state.desktopBrowser = new Set();
});

describe("previewRuntimeFor", () => {
  it("opens a remote environment's tabs on this computer in the desktop app", () => {
    state.desktop = true;
    state.primary = local;
    state.serverBrowser = new Set([local, remote]);

    expect(previewRuntimeFor(remote)).toBeUndefined();
    expect(previewRuntimeFor(local)).toBe("server");
  });

  it("uses the environment's browser where the client has none of its own", () => {
    state.serverBrowser = new Set([remote]);

    expect(previewRuntimeFor(remote)).toBe("server");
  });
});

describe("alternatePreviewRuntime", () => {
  it("moves a remote environment's tab between this computer and the environment", () => {
    state.desktop = true;

    expect(alternatePreviewRuntime(remote, local, true, {})).toBe("server");
    expect(alternatePreviewRuntime(remote, local, true, { runtime: "server" })).toBe("desktop");
    expect(alternatePreviewRuntime(local, local, true, {})).toBeNull();
    expect(alternatePreviewRuntime(remote, local, false, {})).toBeNull();
  });

  it("offers no move outside the desktop app", () => {
    expect(alternatePreviewRuntime(remote, null, true, { runtime: "server" })).toBeNull();
  });
});

describe("rendersPreviewTabNatively", () => {
  it.each([
    {
      desktop: false,
      environment: local,
      runtime: "server" as const,
      channel: true,
      native: false,
    },
    { desktop: true, environment: local, runtime: "server" as const, channel: true, native: true },
    {
      desktop: true,
      environment: local,
      runtime: "server" as const,
      channel: false,
      native: false,
    },
    {
      desktop: true,
      environment: remote,
      runtime: "server" as const,
      channel: true,
      native: false,
    },
    {
      desktop: true,
      environment: remote,
      runtime: "desktop" as const,
      channel: false,
      native: true,
    },
    { desktop: true, environment: remote, runtime: undefined, channel: false, native: true },
  ])(
    "classifies desktop=$desktop environment=$environment runtime=$runtime channel=$channel",
    ({ desktop, environment, runtime, channel, native }) => {
      state.desktop = desktop;
      state.primary = local;
      state.desktopBrowser = new Set(channel ? [local] : []);
      expect(rendersPreviewTabNatively(environment, { runtime })).toBe(native);
    },
  );
});

describe("rendersServerTabNatively", () => {
  it("draws the primary's server tabs natively only when it holds the desktop browser channel", () => {
    expect(rendersServerTabNatively(local, local, true, { runtime: "server" })).toBe(true);
    // A WSL-only primary has no channel, so a local <webview> would never reach its server.
    expect(rendersServerTabNatively(local, local, false, { runtime: "server" })).toBe(false);
    expect(rendersServerTabNatively(remote, local, true, { runtime: "server" })).toBe(false);
    expect(rendersServerTabNatively(local, local, true, {})).toBe(false);
  });
});
