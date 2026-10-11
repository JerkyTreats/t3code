import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { describe, expect, it } from "@effect/vitest";
import {
  resolveEarlyManagedLinuxIdentity,
  resolveStandaloneDesktopIdentity,
  resolveStandaloneUserDataPath,
  standaloneDesktopRegistration,
  type StandaloneDesktopInput,
} from "./StandaloneDesktopPolicy.ts";

const identity = (overrides: Partial<StandaloneDesktopInput> = {}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* resolveStandaloneDesktopIdentity({
      platform: "linux",
      isPackaged: true,
      isDevelopment: false,
      homeDirectory: "/home/example",
      baseDir: "/data/t3code-production/state",
      appDataDirectory: "/config/t3code-production",
      path,
      serverUrl: Option.some(new URL("https://code.example.test/")),
      legacyServerUrl: Option.none(),
      displayName: Option.some("T3 Code"),
      xdgConfigHome: Option.some("/config/t3code-production"),
      xdgDataHome: Option.some("/data"),
      configuredBackendPort: Option.none(),
      disableAutoUpdate: true,
      ...overrides,
    });
  }).pipe(Effect.provide(NodePath.layerPosix));

describe("StandaloneDesktopPolicy", () => {
  it("preserves installed registration through replacement early and ready hosts", () => {
    const calls: string[] = [];
    const replacementHost = (host: "pre-ready" | "ready", managedStandalone: boolean) => {
      if (standaloneDesktopRegistration({ managedStandalone }) === "register-runtime") {
        calls.push(`${host}:write-entry`, `${host}:register-protocol`);
      }
    };
    for (const [channel, displayName] of [
      ["production", "T3 Code"],
      ["staging", "T3 Code (Staging)"],
    ]) {
      const managed = resolveEarlyManagedLinuxIdentity(
        { T3CODE_DESKTOP_CHANNEL: channel, T3CODE_DESKTOP_DISPLAY_NAME: displayName },
        false,
      );
      expect(managed).not.toBeNull();
      replacementHost("pre-ready", managed !== null);
      replacementHost("ready", managed !== null);
    }
    expect(calls).toEqual([]);
    const mismatched = resolveEarlyManagedLinuxIdentity(
      { T3CODE_DESKTOP_CHANNEL: "staging", T3CODE_DESKTOP_DISPLAY_NAME: "T3 Code" },
      false,
    );
    replacementHost("pre-ready", mismatched !== null);
    replacementHost("ready", false);
    expect(calls).toEqual([
      "pre-ready:write-entry",
      "pre-ready:register-protocol",
      "ready:write-entry",
      "ready:register-protocol",
    ]);
  });
  it("selects the matching installed Linux identity before Electron is ready", () => {
    for (const [channel, displayName, desktopName, wmClass] of [
      ["production", "T3 Code", "t3code.desktop", "t3code"],
      ["staging", "T3 Code (Staging)", "t3code-staging.desktop", "t3code-staging"],
    ]) {
      expect(
        resolveEarlyManagedLinuxIdentity(
          { T3CODE_DESKTOP_CHANNEL: channel, T3CODE_DESKTOP_DISPLAY_NAME: displayName },
          false,
        ),
      ).toMatchObject({
        linuxDesktopEntryName: desktopName,
        linuxWmClass: wmClass,
      });
    }
    expect(
      resolveEarlyManagedLinuxIdentity(
        { T3CODE_DESKTOP_CHANNEL: "staging", T3CODE_DESKTOP_DISPLAY_NAME: "T3 Code" },
        false,
      ),
    ).toBeNull();
    expect(
      resolveEarlyManagedLinuxIdentity(
        { T3CODE_DESKTOP_CHANNEL: "staging", T3CODE_DESKTOP_DISPLAY_NAME: "T3 Code (Staging)" },
        true,
      ),
    ).toBeNull();
  });

  it.effect(
    "retains isolated managed profiles independently of upstream V2 profile selection",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        for (const channel of ["production", "staging"]) {
          const appDataDirectory = `/config/t3code-${channel}`;
          expect(
            resolveStandaloneUserDataPath({
              standaloneServerUrl: Option.some(new URL("https://code.example.test/")),
              appDataDirectory,
              path,
            }),
          ).toEqual(Option.some(`${appDataDirectory}/t3code`));
        }
        expect(
          resolveStandaloneUserDataPath({
            appDataDirectory: "/config/ordinary",
            path,
          }),
        ).toEqual(Option.none());
      }).pipe(Effect.provide(NodePath.layerPosix)),
  );

  it.effect("requires the complete isolated identity before selecting HTTPS", () =>
    Effect.gen(function* () {
      const result = Option.getOrThrow(yield* identity());
      expect(result.serverUrl.href).toBe("https://code.example.test/");
      expect(result.linuxWmClass).toBe("t3code");
      expect(result.linuxDesktopEntryName).toBe("t3code.desktop");
    }),
  );
  it.effect("leaves normal upstream selection unchanged", () =>
    Effect.gen(function* () {
      expect(
        Option.isNone(yield* identity({ serverUrl: Option.none(), displayName: Option.none() })),
      ).toBe(true);
    }),
  );
  const invalidIdentities: Partial<StandaloneDesktopInput>[] = [
    { displayName: Option.none() },
    { serverUrl: Option.none() },
    { displayName: Option.some("Unknown") },
    { isPackaged: false },
    { isDevelopment: true },
    { platform: "darwin" },
    { configuredBackendPort: Option.some(3773) },
    { disableAutoUpdate: false },
    { baseDir: "/home/example/.t3" },
    { appDataDirectory: "/config/shared" },
    { xdgConfigHome: Option.none() },
    { xdgDataHome: Option.some("relative") },
    { legacyServerUrl: Option.some(new URL("https://other.example.test")) },
  ];
  it.effect.each(invalidIdentities)("rejects incomplete identity %#", (overrides) =>
    Effect.gen(function* () {
      expect(yield* identity(overrides).pipe(Effect.isFailure)).toBe(true);
    }),
  );
  it.effect.each([
    "http://code.example.test/",
    "https://user:pass@code.example.test/",
    "https://code.example.test/path",
    "https://code.example.test/?token=x",
    "https://code.example.test/#x",
  ])("rejects non-origin URL %s", (url) =>
    Effect.gen(function* () {
      expect(yield* identity({ serverUrl: Option.some(new URL(url)) }).pipe(Effect.isFailure)).toBe(
        true,
      );
    }),
  );
});
