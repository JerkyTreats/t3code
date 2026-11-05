import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import type { ManagedPolicyDocument } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as DesktopAppUpdate from "../desktopUpdate/DesktopAppUpdate.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as ServerSelfUpdate from "./selfUpdate.ts";

interface HarnessOptions {
  readonly mode?: "web" | "desktop";
  readonly desktopAppUpdate?: DesktopAppUpdate.DesktopAppUpdate["Service"];
  readonly policy?: ManagedPolicyDocument;
}

const makeHarness = Effect.fn("test.make_self_update_harness")(function* (
  options: HarnessOptions = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-self-update-test-" });
  const config = yield* ServerConfig.ServerConfig.pipe(
    Effect.provide(ServerConfig.layerTest(process.cwd(), baseDir)),
  );
  const selfUpdate = yield* ServerSelfUpdate.make().pipe(
    Effect.provideService(
      DesktopAppUpdate.DesktopAppUpdate,
      options.desktopAppUpdate ?? {
        available: false,
        run: () => Effect.die("unexpected desktop app update run"),
        commit: () => Effect.die("unexpected desktop app update commit"),
      },
    ),
    Effect.provide(
      Layer.merge(
        ServerConfig.layer({ ...config, mode: options.mode ?? "web" }),
        ManagedPolicy.layerTest(options.policy),
      ),
    ),
  );
  return { selfUpdate };
});

it.layer(NodeServices.layer)("server self update", (it) => {
  it.effect("refuses desktop-managed updates when the managed policy turns updates off", () =>
    Effect.gen(function* () {
      const policy: ManagedPolicyDocument = {
        schemaVersion: 1,
        organization: "Example Corp",
        limits: { updates: { mode: "off" } },
      };
      const { selfUpdate } = yield* makeHarness({
        mode: "desktop",
        policy,
        desktopAppUpdate: {
          available: true,
          run: () => Effect.die("unexpected desktop app update run"),
          commit: () => Effect.never,
        },
      });
      expect((yield* selfUpdate.update({ targetVersion: "1.1.0" }).pipe(Effect.flip)).reason).toBe(
        "Example Corp manages T3 Code updates.",
      );
    }),
  );

  it.effect("refuses update track switches on the single fork release track", () =>
    Effect.gen(function* () {
      const { selfUpdate } = yield* makeHarness({
        mode: "desktop",
        desktopAppUpdate: {
          available: true,
          run: () => Effect.die("unexpected desktop app update run"),
          commit: () => Effect.never,
        },
      });
      expect(
        (yield* selfUpdate.update({ targetVersion: "1.1.0", channel: "nightly" }).pipe(Effect.flip))
          .reason,
      ).toContain("single release track");
    }),
  );

  it.effect("rejects operator-managed updates and desktop updates without a control channel", () =>
    Effect.gen(function* () {
      const web = yield* makeHarness();
      expect(
        (yield* web.selfUpdate.update({ targetVersion: "latest" }).pipe(Effect.flip)).reason,
      ).toContain("operator-managed deployment");
      const desktop = yield* makeHarness({ mode: "desktop" });
      expect(
        (yield* desktop.selfUpdate.update({ targetVersion: "1.1.0" }).pipe(Effect.flip)).reason,
      ).toContain("desktop app");
    }),
  );

  it.effect(
    "rejects updates and commits on a headless host even when a desktop adapter is injected",
    () =>
      Effect.gen(function* () {
        const { selfUpdate } = yield* makeHarness({
          mode: "web",
          desktopAppUpdate: {
            available: true,
            run: () => Effect.die("headless update escaped its policy"),
            commit: () => Effect.die("headless commit escaped its policy"),
          },
        });
        expect(
          (yield* selfUpdate.update({ targetVersion: "1.2.0" }).pipe(Effect.flip)).reason,
        ).toContain("operator-managed deployment");
        expect(
          (yield* selfUpdate.commitDesktopUpdate("synthetic-token").pipe(Effect.flip)).reason,
        ).toContain("unavailable");
      }),
  );

  it.effect("delegates desktop-managed updates to the desktop app when available", () =>
    Effect.gen(function* () {
      const stages: string[] = [];
      const { selfUpdate } = yield* makeHarness({
        mode: "desktop",
        desktopAppUpdate: {
          available: true,
          run: (reportProgress) =>
            reportProgress("downloading").pipe(
              Effect.andThen(reportProgress("installing")),
              Effect.as({ targetVersion: "1.2.0", method: "desktop-app" as const }),
            ),
          commit: () => Effect.never,
        },
      });
      const result = yield* selfUpdate.update({ targetVersion: "1.1.0" }, (stage) =>
        Effect.sync(() => void stages.push(stage)),
      );
      expect(result).toEqual({ targetVersion: "1.2.0", method: "desktop-app" });
      expect(stages).toEqual(["downloading", "installing"]);
    }),
  );

  it.effect("streams desktop-managed progress and the result through the update stream", () =>
    Effect.gen(function* () {
      const { selfUpdate } = yield* makeHarness({
        mode: "desktop",
        desktopAppUpdate: {
          available: true,
          run: (reportProgress) =>
            reportProgress("downloading").pipe(
              Effect.as({ targetVersion: "1.2.0", method: "desktop-app" as const }),
            ),
          commit: () => Effect.never,
        },
      });
      const events = yield* Stream.runCollect(
        ServerSelfUpdate.updateProgressStream(selfUpdate, { targetVersion: "1.1.0" }),
      );
      expect(Array.from(events)).toEqual([
        { type: "progress", stage: "downloading" },
        { type: "complete", result: { targetVersion: "1.2.0", method: "desktop-app" } },
      ]);
    }),
  );

  it.effect("fails the update stream for an operator-managed runtime", () =>
    Effect.gen(function* () {
      const { selfUpdate } = yield* makeHarness();
      const error = yield* Stream.runCollect(
        ServerSelfUpdate.updateProgressStream(selfUpdate, { targetVersion: "1.1.0" }),
      ).pipe(Effect.flip);
      expect(error.reason).toContain("operator-managed deployment");
    }),
  );
});
