import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NetService from "@t3tools/shared/Net";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as TestConsole from "effect/testing/TestConsole";
import { Command } from "effect/cli";

import { authCommand } from "./auth.ts";
import { base64UrlDecodeUtf8 } from "../auth/utils.ts";

const layerCli = Layer.mergeAll(NodeServices.layer, NetService.layer, TestConsole.layer);
const run = Command.runWith(authCommand, { version: "0.0.0" });

it.effect.each([[], ["--ttl", "8d"]])(
  "reports the authority owner's portal lifetime rule for %j",
  (ttlArgs) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-cli-portal-policy-" });
      const error = yield* run([
        "session",
        "issue",
        "--base-dir",
        baseDir,
        "--device-administrator",
        ...ttlArgs,
      ]).pipe(Effect.flip);
      expect(error.message).toContain("--ttl");
      expect(error.message).toContain("from 1 ms through 7 days");
    }).pipe(Effect.scoped, Effect.provide(layerCli)),
);

it.effect.each(["1s", "7d"])("issues portal authority at valid TTL %s", (ttl) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-cli-portal-policy-" });
    yield* run([
      "session",
      "issue",
      "--base-dir",
      baseDir,
      "--device-administrator",
      "--ttl",
      ttl,
      "--json",
    ]);
    const output = (yield* TestConsole.logLines).findLast((line) => typeof line === "string");
    const issued = JSON.parse(String(output)) as { readonly token: string };
    const claims = JSON.parse(base64UrlDecodeUtf8(issued.token.split(".")[0]!));
    expect(claims).toMatchObject({
      authorityClass: "device-administrator",
      scopes: [],
      method: "bearer-access-token",
    });
  }).pipe(Effect.scoped, Effect.provide(layerCli)),
);

it.effect("preserves explicitly selected ordinary client scopes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-cli-portal-policy-" });
    yield* run([
      "session",
      "issue",
      "--base-dir",
      baseDir,
      "--scope",
      "orchestration:read",
      "--json",
    ]);
    const output = (yield* TestConsole.logLines).findLast((line) => typeof line === "string");
    const issued = JSON.parse(String(output)) as { readonly token: string };
    const claims = JSON.parse(base64UrlDecodeUtf8(issued.token.split(".")[0]!));
    expect(claims).toMatchObject({
      authorityClass: "client",
      scopes: ["orchestration:read"],
    });
  }).pipe(Effect.scoped, Effect.provide(layerCli)),
);
