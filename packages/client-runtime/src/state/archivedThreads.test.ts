import { EnvironmentId, type OrchestrationShellSnapshot } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { expect, it } from "vite-plus/test";

import {
  createArchivedThreadSnapshotsAtomFamily,
  makeArchivedThreadsEnvironmentKey,
  parseArchivedThreadsEnvironmentKey,
} from "./archivedThreads.ts";

it("round-trips environment keys in sorted order", () => {
  const envA = EnvironmentId.make("env-a");
  const envB = EnvironmentId.make("env-b");
  const key = makeArchivedThreadsEnvironmentKey([envB, envA]);

  expect(parseArchivedThreadsEnvironmentKey(key)).toEqual([envA, envB]);
});

it("does not expose an archived snapshot failure message", () => {
  const environmentId = EnvironmentId.make("env-sensitive");
  const snapshotsAtom = createArchivedThreadSnapshotsAtomFamily<Error>({
    getSnapshotAtom: () =>
      Atom.make(
        AsyncResult.failure<OrchestrationShellSnapshot, Error>(
          Cause.fail(new Error("credential=secret-value")),
        ),
      ),
    labelPrefix: "test:archived-thread-snapshots",
  });
  const registry = AtomRegistry.make();

  expect(registry.get(snapshotsAtom(makeArchivedThreadsEnvironmentKey([environmentId])))).toEqual({
    snapshots: [],
    error: "Failed to load archived threads.",
    isLoading: false,
    environmentStateById: new Map([
      [
        environmentId,
        {
          snapshot: null,
          error: "Failed to load archived threads.",
          isLoading: false,
        },
      ],
    ]),
  });

  registry.dispose();
});

it("keeps readiness isolated by exact environment", () => {
  const healthyEnvironmentId = EnvironmentId.make("env-healthy");
  const failedEnvironmentId = EnvironmentId.make("env-failed");
  const loadingEnvironmentId = EnvironmentId.make("env-loading");
  const healthySnapshot: OrchestrationShellSnapshot = {
    snapshotSequence: 1,
    projects: [],
    threads: [],
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
  const snapshotsAtom = createArchivedThreadSnapshotsAtomFamily<Error>({
    getSnapshotAtom: (environmentId) => {
      if (environmentId === healthyEnvironmentId) {
        return Atom.make(AsyncResult.success(healthySnapshot));
      }
      if (environmentId === loadingEnvironmentId) {
        return Atom.make(AsyncResult.initial<OrchestrationShellSnapshot, Error>(true));
      }
      return Atom.make(
        AsyncResult.failure<OrchestrationShellSnapshot, Error>(Cause.fail(new Error("offline"))),
      );
    },
    labelPrefix: "test:isolated-archived-thread-snapshots",
  });
  const registry = AtomRegistry.make();

  const state = registry.get(
    snapshotsAtom(
      makeArchivedThreadsEnvironmentKey([
        healthyEnvironmentId,
        failedEnvironmentId,
        loadingEnvironmentId,
      ]),
    ),
  );

  expect(state.environmentStateById.get(healthyEnvironmentId)).toEqual({
    snapshot: healthySnapshot,
    error: null,
    isLoading: false,
  });
  expect(state.environmentStateById.get(failedEnvironmentId)).toEqual({
    snapshot: null,
    error: "Failed to load archived threads.",
    isLoading: false,
  });
  expect(state.environmentStateById.get(loadingEnvironmentId)).toEqual({
    snapshot: null,
    error: null,
    isLoading: true,
  });

  registry.dispose();
});
