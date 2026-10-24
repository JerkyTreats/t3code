import { describe, expect, it } from "vite-plus/test";

import { clientPresentationMetadata } from "../connection/clientMetadata";

// Fork F27: the protected T3 Thread bridge presents as its own client surface. Upstream deleted
// the host clientMetadata test, so this owner-level proof lives here.
const desktopChrome = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
};

describe("T3 Thread client metadata", () => {
  it("identifies the protected T3 Thread bridge as a separate client surface", () => {
    expect(
      clientPresentationMetadata({
        appVersion: "1.2.3",
        hosted: true,
        identity: desktopChrome,
        desktopBridge: undefined,
        threadBridge: true,
      }),
    ).toEqual({
      label: "T3 Thread",
      deviceType: "desktop",
      os: "Windows",
      surface: "thread",
      appVersion: "1.2.3",
    });
  });

  it("keeps ordinary hosted web presentation without the Thread bridge", () => {
    expect(
      clientPresentationMetadata({
        appVersion: "1.2.3",
        hosted: true,
        identity: desktopChrome,
        desktopBridge: undefined,
        threadBridge: false,
      }),
    ).toMatchObject({ label: "T3 Code Web", surface: "web", webDeployment: "hosted" });
  });
});
