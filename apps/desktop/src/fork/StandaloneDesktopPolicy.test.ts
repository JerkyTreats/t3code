import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { describe, expect, it } from "@effect/vitest";
import {
  resolveStandaloneDesktopIdentity,
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
  it.effect("requires the complete isolated identity before selecting HTTPS", () =>
    Effect.gen(function* () {
      const result = Option.getOrThrow(yield* identity());
      expect(result.serverUrl.href).toBe("https://code.example.test/");
      expect(result.linuxWmClass).toBe("t3code");
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
  for (const [index, overrides] of invalidIdentities.entries()) {
    it.effect(`rejects incomplete identity ${index}`, () =>
      Effect.gen(function* () {
        expect(yield* identity(overrides).pipe(Effect.isFailure)).toBe(true);
      }),
    );
  }
  for (const url of [
    "http://code.example.test/",
    "https://user:pass@code.example.test/",
    "https://code.example.test/path",
    "https://code.example.test/?token=x",
    "https://code.example.test/#x",
  ]) {
    it.effect(`rejects non-origin URL ${url}`, () =>
      Effect.gen(function* () {
        expect(
          yield* identity({ serverUrl: Option.some(new URL(url)) }).pipe(Effect.isFailure),
        ).toBe(true);
      }),
    );
  }
});
