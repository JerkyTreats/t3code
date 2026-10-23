import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { resolveThreadClientHostPolicy } from "./threadClientSurface";
afterEach(() => vi.unstubAllGlobals());
describe("Thread host presentation and navigation", () => {
  it("leaves ordinary browser bootstrap intact", () => {
    vi.stubGlobal("window", {
      location: { href: "https://app.example.test/" },
      sessionStorage: { getItem: () => null },
    });
    expect(resolveThreadClientHostPolicy()).toEqual({
      compact: false,
      ownsLaunchNavigation: false,
    });
  });
  it("treats query selection as presentation only even without storage", () => {
    vi.stubGlobal("window", {
      location: { href: "https://app.example.test/?t3-thread-client=1" },
      get sessionStorage() {
        throw new Error("blocked");
      },
    });
    expect(resolveThreadClientHostPolicy()).toEqual({ compact: true, ownsLaunchNavigation: false });
  });
  it("lets actual Thread activation own initial navigation independently of query", () => {
    vi.stubGlobal("window", {
      location: { href: "https://app.example.test/" },
      t3ThreadBridge: {},
    });
    expect(resolveThreadClientHostPolicy()).toEqual({ compact: true, ownsLaunchNavigation: true });
  });
});
