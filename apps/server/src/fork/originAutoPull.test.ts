import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as GitWorkflowService from "../git/GitWorkflowService.ts";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import { autoPullProjects } from "../serverRuntimeStartup.ts";
import { ServerConfig } from "../config.ts";

const driverLayer = GitVcsDriver.layer.pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "origin-auto-pull-config-" })),
  Layer.provideMerge(NodeServices.layer),
);

for (const host of ["startup", "broadcaster"] as const) {
  describe(`exact-origin automatic pull through ${host}`, () => {
    for (const trackingRemote of ["origin", "upstream"] as const) {
      it.effect(
        `${trackingRemote === "origin" ? "accepts origin" : "refuses upstream"} tracking with a real driver`,
        () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const driver = yield* GitVcsDriver.GitVcsDriver;
            const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "origin-auto-local-" });
            const origin = yield* fs.makeTempDirectoryScoped({ prefix: "origin-auto-origin-" });
            const upstream = yield* fs.makeTempDirectoryScoped({ prefix: "origin-auto-upstream-" });
            const run = (args: ReadonlyArray<string>, directory = cwd) =>
              driver
                .execute({ operation: "originAutoPull.fixture", cwd: directory, args })
                .pipe(Effect.map((result) => result.stdout.trim()));
            yield* run(["init", "--bare"], origin);
            yield* run(["init", "--bare"], upstream);
            yield* run(["init", "-b", "main"]);
            yield* run(["config", "user.name", "Fixture"]);
            yield* run(["config", "user.email", "fixture@example.test"]);
            yield* run(["commit", "--allow-empty", "-m", "initial"]);
            const initial = yield* run(["rev-parse", "HEAD"]);
            yield* run(["remote", "add", "origin", origin]);
            yield* run(["remote", "add", "upstream", upstream]);
            yield* run(["push", "-u", "origin", "main"]);
            yield* run(["push", "upstream", "main"]);
            yield* run(["commit", "--allow-empty", "-m", "remote update"]);
            const remoteHead = yield* run(["rev-parse", "HEAD"]);
            yield* run(["push", "origin", "main"]);
            yield* run(["push", "upstream", "main"]);
            yield* run(["reset", "--hard", initial]);
            yield* run(["branch", "--set-upstream-to", `${trackingRemote}/main`]);
            assert.equal((yield* driver.statusDetails(cwd)).behindCount, 1);

            if (host === "startup") {
              yield* autoPullProjects([{ workspaceRoot: cwd, autoPull: true } as never]);
            } else {
              const workflow = Layer.mock(GitWorkflowService.GitWorkflowService)({
                localStatus: ({ cwd }) =>
                  driver.statusDetailsLocal(cwd).pipe(
                    Effect.map((status) => ({
                      isRepo: status.isRepo,
                      hasPrimaryRemote: status.hasOriginRemote,
                      isDefaultRef: status.isDefaultBranch,
                      refName: status.branch,
                      hasWorkingTreeChanges: status.hasWorkingTreeChanges,
                      workingTree: status.workingTree,
                    })),
                  ),
                remoteStatus: ({ cwd }) =>
                  driver.statusDetails(cwd).pipe(
                    Effect.map((status) => ({
                      hasUpstream: status.hasUpstream,
                      aheadCount: status.aheadCount,
                      behindCount: status.behindCount,
                      pr: null,
                    })),
                  ),
                invalidateLocalStatus: () => Effect.void,
                invalidateRemoteStatus: () => Effect.void,
                invalidateStatus: () => Effect.void,
                pullCurrentBranch: driver.pullCurrentBranch,
              });
              yield* Effect.gen(function* () {
                const broadcaster = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
                yield* broadcaster.refreshStatus(cwd);
              }).pipe(
                Effect.provide(
                  VcsStatusBroadcaster.layer.pipe(
                    Layer.provide(workflow),
                    Layer.provide(
                      Layer.succeed(VcsStatusBroadcaster.VcsAutoPullPolicy, {
                        isEnabled: () => Effect.succeed(true),
                      }),
                    ),
                    Layer.provide(
                      Layer.mock(BackgroundPolicy.BackgroundPolicy)({
                        streamChanges: Stream.empty,
                        shouldRunScopeWork: () => Effect.succeed(true),
                      }),
                    ),
                  ),
                ),
              );
            }
            assert.equal(
              yield* run(["rev-parse", "HEAD"]),
              trackingRemote === "origin" ? remoteHead : initial,
            );
            assert.equal(yield* run(["rev-parse", "refs/heads/main"], origin), remoteHead);
            assert.equal(yield* run(["rev-parse", "refs/heads/main"], upstream), remoteHead);
          }).pipe(Effect.provide(driverLayer)),
      );
    }
  });
}
