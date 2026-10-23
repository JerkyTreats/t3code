import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  DesktopLauncherActivation,
  DesktopLauncherActivationCompletion,
  DesktopLauncherActivationRequest,
  DesktopLauncherArtifactManifest,
  DesktopLauncherHandoffAck,
  DesktopLauncherHandoffRequest,
  DesktopLauncherReadiness,
} from "./desktopLauncher.ts";

const decodeArtifactManifest = Schema.decodeUnknownEffect(DesktopLauncherArtifactManifest);
const decodeReadiness = Schema.decodeUnknownEffect(DesktopLauncherReadiness);
const decodeHandoffRequest = Schema.decodeUnknownEffect(DesktopLauncherHandoffRequest);
const decodeHandoffAck = Schema.decodeUnknownEffect(DesktopLauncherHandoffAck);
const decodeActivationRequest = Schema.decodeUnknownEffect(DesktopLauncherActivationRequest, {
  onExcessProperty: "error",
});
const decodeActivation = Schema.decodeUnknownEffect(DesktopLauncherActivation, {
  onExcessProperty: "error",
});
const decodeActivationCompletion = Schema.decodeUnknownEffect(DesktopLauncherActivationCompletion, {
  onExcessProperty: "error",
});

const manifest = {
  contractVersion: 1,
  productAppId: "dev.example.t3code",
  userServiceName: "t3code-desktop.service",
  linuxWmClass: "t3code",
  artifactPath: "/opt/t3code/T3-Code.AppImage",
  artifactSha256: "a".repeat(64),
  version: "1.2.3",
  commitHash: "1234567890ab",
  architecture: "x64",
} as const;

describe("desktop launcher contracts", () => {
  it.effect("decodes artifact metadata and completed readiness", () =>
    Effect.gen(function* () {
      const decodedManifest = yield* decodeArtifactManifest(manifest);
      const readiness = yield* decodeReadiness({
        ...decodedManifest,
        generation: "generation-1",
        desktopMainPid: 42,
        bootId: "12345678-1234-1234-1234-1234567890ab",
        desktopMainProcessStartTicks: 100,
        backendReady: true,
        rendererReady: true,
      });
      assert.equal(readiness.artifactSha256, manifest.artifactSha256);
      assert.equal(readiness.generation, "generation-1");
    }),
  );

  it.effect("rejects invalid identity data and incomplete readiness", () =>
    Effect.gen(function* () {
      assert.isTrue(
        yield* decodeArtifactManifest({
          ...manifest,
          artifactSha256: "not-a-hash",
        }).pipe(Effect.flip, Effect.as(true)),
      );
      assert.isTrue(
        yield* decodeReadiness({
          ...manifest,
          generation: "generation-1",
          desktopMainPid: 42,
          bootId: "12345678-1234-1234-1234-1234567890ab",
          desktopMainProcessStartTicks: 100,
          backendReady: false,
          rendererReady: true,
        }).pipe(Effect.flip, Effect.as(true)),
      );
    }),
  );

  it.effect("rejects launcher metadata beyond file and IPC ceilings", () =>
    Effect.gen(function* () {
      for (const oversizedManifest of [
        { ...manifest, productAppId: "x".repeat(256) },
        { ...manifest, userServiceName: "x".repeat(256) },
        { ...manifest, linuxWmClass: "x".repeat(256) },
        { ...manifest, artifactPath: `/${"x".repeat(4_096)}` },
        { ...manifest, version: "x".repeat(129) },
      ]) {
        assert.isTrue(
          yield* decodeArtifactManifest(oversizedManifest).pipe(Effect.flip, Effect.as(true)),
        );
      }

      assert.isTrue(
        yield* decodeReadiness({
          ...manifest,
          generation: "x".repeat(129),
          desktopMainPid: 42,
          bootId: "12345678-1234-1234-1234-1234567890ab",
          desktopMainProcessStartTicks: 100,
          backendReady: true,
          rendererReady: true,
        }).pipe(Effect.flip, Effect.as(true)),
      );
    }),
  );

  it.effect("decodes generation scoped handoff records and rejects malformed tokens", () =>
    Effect.gen(function* () {
      const identity = {
        contractVersion: 1,
        productAppId: "dev.example.t3code",
        generation: "generation-1",
        token: "b".repeat(64),
      } as const;
      const request = yield* decodeHandoffRequest({
        ...identity,
        artifactSha256: "a".repeat(64),
        requesterPid: 42,
        requesterBootId: "12345678-1234-1234-1234-1234567890ab",
        requesterStartTicks: 100,
      });
      const ack = yield* decodeHandoffAck({
        ...identity,
        primaryPid: 84,
        primaryBootId: "12345678-1234-1234-1234-1234567890ab",
        primaryStartTicks: 200,
        accepted: true,
      });
      assert.equal(request.token, ack.token);
      assert.isTrue(
        yield* decodeHandoffAck({ ...ack, token: "bad" }).pipe(Effect.flip, Effect.as(true)),
      );
    }),
  );

  it.effect("accepts bounded private activation data and explicit completion", () =>
    Effect.gen(function* () {
      const request = yield* decodeActivationRequest({
        contractVersion: 1,
        workspace: "/home/example/workspace",
        action: "submit",
        prompt: "Fix the focused test.",
      });
      const activation = yield* decodeActivation({
        activationId: "12345678-1234-4234-8234-1234567890ab",
        ...request,
      });
      const completion = yield* decodeActivationCompletion({
        activationId: activation.activationId,
      });

      assert.equal(activation.workspace, "/home/example/workspace");
      assert.equal(completion.activationId, activation.activationId);
    }),
  );

  it.effect("rejects unbounded ambiguous or extensible private activation data", () =>
    Effect.gen(function* () {
      for (const invalid of [
        { contractVersion: 1, workspace: "relative", action: "open" },
        { contractVersion: 1, workspace: "/workspace", action: "submit" },
        { contractVersion: 1, workspace: "/workspace", action: "open", unknown: true },
        {
          contractVersion: 1,
          workspace: "/workspace",
          action: "open",
          prompt: "x".repeat(65_537),
        },
      ]) {
        assert.isTrue(yield* decodeActivationRequest(invalid).pipe(Effect.flip, Effect.as(true)));
      }
    }),
  );
});
