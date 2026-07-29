import { EnvironmentId, type VcsListRefsResult } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AtomRegistry } from "effect/unstable/reactivity";

import { AVAILABLE_CONNECTION_STATE, type SupervisorConnectionState } from "../connection/model.ts";
import { ConnectionPersistenceError, EnvironmentCacheStore } from "../platform/persistence.ts";
import { commitVcsRefsRefresh } from "./vcs.ts";
import {
  captureVcsRefsInvalidationSnapshot,
  invalidateCachedVcsRefs,
  invalidateVcsRefsGeneration,
  isVcsRefsInvalidationSnapshotCurrent,
  isVcsRefsPersistedCacheCurrent,
  markVcsRefsPersistenceFresh,
  registerVcsRepositoryIdentity,
  vcsRefsGenerationAtom,
  wasVcsRepositoryInvalidated,
} from "./vcsRefInvalidation.ts";

const environmentId = EnvironmentId.make("environment-vcs-invalidation");
const refs: VcsListRefsResult = {
  refs: [],
  isRepo: true,
  hasPrimaryRemote: true,
  nextCursor: null,
  totalCount: 0,
};

function makeCache(input: {
  readonly saved: string[];
  readonly cleared: string[];
}): EnvironmentCacheStore["Service"] {
  return EnvironmentCacheStore.of({
    loadShell: () => Effect.succeed(Option.none()),
    saveShell: () => Effect.void,
    loadThread: () => Effect.succeed(Option.none()),
    saveThread: () => Effect.void,
    removeThread: () => Effect.void,
    loadServerConfig: () => Effect.succeed(Option.none()),
    saveServerConfig: () => Effect.void,
    loadVcsRefs: () => Effect.succeed(Option.none()),
    saveVcsRefs: (_environmentId, cwd) =>
      Effect.sync(() => {
        input.saved.push(cwd);
      }),
    removeVcsRefs: (_environmentId, cwd) =>
      Effect.sync(() => {
        input.cleared.push(cwd);
      }),
    clearVcsRefs: () => Effect.void,
    clear: () => Effect.void,
  });
}

describe("VCS ref generation ordering", () => {
  it.effect("clears persistence before publishing a new invalidation generation", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const cache = makeCache({ saved, cleared });

      yield* invalidateCachedVcsRefs(registry, {
        environmentId,
        cwd: "/repo",
      }).pipe(Effect.provideService(EnvironmentCacheStore, cache));

      expect(cleared).toEqual(["/repo"]);
      expect(registry.get(vcsRefsGenerationAtom(environmentId, "/repo"))).toEqual({
        revision: 1,
        persistedCacheReadable: true,
      });
      registry.dispose();
    }),
  );

  it.effect("rejects stale invalidation and connection generations before persistence", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const cache = makeCache({ saved, cleared });
      const connectionState = yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connected",
        attempt: 1,
        generation: 1,
      });

      const initial = yield* commitVcsRefsRefresh(registry, cache, {
        environmentId,
        cwd: "/repo",
        refs,
        expectedRevision: 0,
        expectedConnectionGeneration: 1,
        invalidationSnapshot: captureVcsRefsInvalidationSnapshot(environmentId),
        persist: true,
        connectionState,
      });
      expect(initial).toBe(true);
      expect(saved).toEqual(["/repo"]);

      invalidateVcsRefsGeneration(registry, environmentId, "/repo");
      const staleRevision = yield* commitVcsRefsRefresh(registry, cache, {
        environmentId,
        cwd: "/repo",
        refs,
        expectedRevision: 0,
        expectedConnectionGeneration: 1,
        invalidationSnapshot: captureVcsRefsInvalidationSnapshot(environmentId),
        persist: true,
        connectionState,
      });
      expect(staleRevision).toBe(false);

      yield* SubscriptionRef.update(connectionState, (current) => ({
        ...current,
        generation: 2,
      }));
      const staleConnection = yield* commitVcsRefsRefresh(registry, cache, {
        environmentId,
        cwd: "/repo",
        refs,
        expectedRevision: 1,
        expectedConnectionGeneration: 1,
        invalidationSnapshot: captureVcsRefsInvalidationSnapshot(environmentId),
        persist: true,
        connectionState,
      });
      expect(staleConnection).toBe(false);
      expect(saved).toEqual(["/repo"]);
      registry.dispose();
    }),
  );

  it.effect("removes a snapshot when the connection generation changes during persistence", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const saveStarted = yield* Deferred.make<void>();
      const releaseSave = yield* Deferred.make<void>();
      const baseCache = makeCache({ saved, cleared });
      const cache = EnvironmentCacheStore.of({
        ...baseCache,
        saveVcsRefs: (_environmentId, cwd) =>
          Effect.gen(function* () {
            saved.push(cwd);
            yield* Deferred.succeed(saveStarted, undefined);
            yield* Deferred.await(releaseSave);
          }),
      });
      const connectionState = yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connected",
        attempt: 1,
        generation: 1,
      });

      const commit = yield* commitVcsRefsRefresh(registry, cache, {
        environmentId,
        cwd: "/repo",
        refs,
        expectedRevision: 0,
        expectedConnectionGeneration: 1,
        invalidationSnapshot: captureVcsRefsInvalidationSnapshot(environmentId),
        persist: true,
        connectionState,
      }).pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(saveStarted);
      yield* SubscriptionRef.update(connectionState, (current) => ({
        ...current,
        generation: 2,
      }));
      yield* Deferred.succeed(releaseSave, undefined);

      expect(yield* Fiber.join(commit)).toBe(false);
      expect(saved).toEqual(["/repo"]);
      expect(cleared).toEqual(["/repo"]);
      registry.dispose();
    }),
  );

  it.effect("disables stale persistence reads when post-save cleanup fails", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const saveStarted = yield* Deferred.make<void>();
      const releaseSave = yield* Deferred.make<void>();
      const cache = EnvironmentCacheStore.of({
        ...makeCache({ saved, cleared }),
        saveVcsRefs: (_environmentId, cwd) =>
          Effect.gen(function* () {
            saved.push(cwd);
            yield* Deferred.succeed(saveStarted, undefined);
            yield* Deferred.await(releaseSave);
          }),
        removeVcsRefs: () =>
          Effect.fail(
            new ConnectionPersistenceError({
              operation: "remove-vcs-refs",
              message: "storage unavailable",
            }),
          ),
      });
      const connectionState = yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connected",
        attempt: 1,
        generation: 1,
      });
      const commit = yield* commitVcsRefsRefresh(registry, cache, {
        environmentId,
        cwd: "/repo-cleanup-failure",
        refs,
        expectedRevision: 0,
        expectedConnectionGeneration: 1,
        invalidationSnapshot: captureVcsRefsInvalidationSnapshot(environmentId),
        persist: true,
        connectionState,
      }).pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(saveStarted);
      yield* SubscriptionRef.update(connectionState, (current) => ({
        ...current,
        generation: 2,
      }));
      yield* Deferred.succeed(releaseSave, undefined);

      expect(yield* Fiber.join(commit)).toBe(false);
      expect(
        registry.get(vcsRefsGenerationAtom(environmentId, "/repo-cleanup-failure")),
      ).toMatchObject({ persistedCacheReadable: false });
      registry.dispose();
    }),
  );

  it.effect("invalidates only aliases for one normalized Git common directory", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const cache = makeCache({ saved, cleared });
      registerVcsRepositoryIdentity(environmentId, "/repo", "/repo/.git");
      registerVcsRepositoryIdentity(environmentId, "/repo-worktree", "/repo/.git");
      registerVcsRepositoryIdentity(environmentId, "/other", "/other/.git");

      yield* invalidateCachedVcsRefs(registry, {
        environmentId,
        cwd: "/repo-worktree",
      }).pipe(Effect.provideService(EnvironmentCacheStore, cache));

      expect(cleared.toSorted()).toEqual(["/repo", "/repo-worktree"]);
      expect(registry.get(vcsRefsGenerationAtom(environmentId, "/repo"))).toMatchObject({
        revision: 1,
      });
      expect(registry.get(vcsRefsGenerationAtom(environmentId, "/repo-worktree"))).toMatchObject({
        revision: 1,
      });
      expect(registry.get(vcsRefsGenerationAtom(environmentId, "/other"))).toMatchObject({
        revision: 0,
      });
      registry.dispose();
    }),
  );

  it.effect("rejects first-discovery worktree data invalidated through a known alias", () =>
    Effect.gen(function* () {
      const discoveryEnvironmentId = EnvironmentId.make("environment-vcs-invalidation-discovery");
      const registry = AtomRegistry.make();
      const saved: string[] = [];
      const cleared: string[] = [];
      const cache = makeCache({ saved, cleared });
      const connectionState = yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connected",
        attempt: 1,
        generation: 1,
      });
      registerVcsRepositoryIdentity(discoveryEnvironmentId, "/repo", "/repo/.git");
      const requestSnapshot = captureVcsRefsInvalidationSnapshot(discoveryEnvironmentId);

      yield* invalidateCachedVcsRefs(registry, {
        environmentId: discoveryEnvironmentId,
        cwd: "/repo",
      }).pipe(Effect.provideService(EnvironmentCacheStore, cache));
      registerVcsRepositoryIdentity(discoveryEnvironmentId, "/repo-worktree", "/repo/.git");

      expect(
        isVcsRefsInvalidationSnapshotCurrent(
          discoveryEnvironmentId,
          "/repo-worktree",
          requestSnapshot,
        ),
      ).toBe(false);
      expect(wasVcsRepositoryInvalidated(discoveryEnvironmentId, "/repo-worktree")).toBe(true);
      expect(isVcsRefsPersistedCacheCurrent(discoveryEnvironmentId, "/repo-worktree")).toBe(false);
      expect(isVcsRefsPersistedCacheCurrent(discoveryEnvironmentId, "/repo-worktree")).toBe(false);
      expect(
        yield* commitVcsRefsRefresh(registry, cache, {
          environmentId: discoveryEnvironmentId,
          cwd: "/repo-worktree",
          refs: { ...refs, repositoryIdentity: "/repo/.git" },
          expectedRevision: 0,
          expectedConnectionGeneration: 1,
          invalidationSnapshot: requestSnapshot,
          persist: true,
          connectionState,
        }),
      ).toBe(false);
      expect(saved).toEqual([]);
      markVcsRefsPersistenceFresh(discoveryEnvironmentId, "/repo-worktree");
      expect(isVcsRefsPersistedCacheCurrent(discoveryEnvironmentId, "/repo-worktree")).toBe(true);
      registry.dispose();
    }),
  );
});
