import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PartitionedSemaphore from "effect/PartitionedSemaphore";
import { Atom, type AtomRegistry } from "effect/unstable/reactivity";

import { safeErrorLogAttributes } from "../errors/safeLog.ts";
import { EnvironmentCacheStore } from "../platform/persistence.ts";

export interface VcsRefsGeneration {
  readonly revision: number;
  readonly persistedCacheReadable: boolean;
}

function normalizeRepositoryPath(value: string): string {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/\/+$/gu, "");
  return normalized.length > 0 ? normalized : "/";
}

function repositoryKey(environmentId: EnvironmentId, repositoryPath: string): string {
  return JSON.stringify([environmentId, normalizeRepositoryPath(repositoryPath)]);
}

const generationByRepository = Atom.family((key: string) =>
  Atom.make<VcsRefsGeneration>({
    revision: 0,
    persistedCacheReadable: true,
  }).pipe(Atom.withLabel(`environment-data:vcs:refs-generation:${key}`)),
);

const repositoryByCwd = new Map<string, string>();
const cwdByAlias = new Map<string, string>();
const cwdAliasesByRepository = new Map<string, Set<string>>();
const invalidationSequenceByEnvironment = new Map<EnvironmentId, number>();
const lastInvalidationSequenceByRepository = new Map<string, number>();
const persistedSequenceByAlias = new Map<string, number>();
const persistenceLock = PartitionedSemaphore.makeUnsafe<string>({ permits: 1 });

function cwdKey(environmentId: EnvironmentId, cwd: string): string {
  return repositoryKey(environmentId, cwd);
}

export function registerVcsRepositoryIdentity(
  environmentId: EnvironmentId,
  cwd: string,
  repositoryIdentity: string | undefined,
): void {
  if (!repositoryIdentity) return;
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryKey(environmentId, repositoryIdentity);
  const previousIdentity = repositoryByCwd.get(alias);
  if (previousIdentity !== undefined && previousIdentity !== identity) {
    const previousAliases = cwdAliasesByRepository.get(previousIdentity);
    previousAliases?.delete(alias);
    if (previousAliases?.size === 0) cwdAliasesByRepository.delete(previousIdentity);
  }
  cwdByAlias.set(alias, normalizeRepositoryPath(cwd));
  repositoryByCwd.set(alias, identity);
  const aliasInvalidationSequence = lastInvalidationSequenceByRepository.get(alias);
  if (aliasInvalidationSequence !== undefined) {
    lastInvalidationSequenceByRepository.set(
      identity,
      Math.max(aliasInvalidationSequence, lastInvalidationSequenceByRepository.get(identity) ?? 0),
    );
  }
  const aliases = cwdAliasesByRepository.get(identity) ?? new Set<string>();
  aliases.add(alias);
  cwdAliasesByRepository.set(identity, aliases);
}

export interface VcsRefsInvalidationSnapshot {
  readonly environmentSequence: number;
}

export function captureVcsRefsInvalidationSnapshot(
  environmentId: EnvironmentId,
): VcsRefsInvalidationSnapshot {
  return {
    environmentSequence: invalidationSequenceByEnvironment.get(environmentId) ?? 0,
  };
}

export function isVcsRefsInvalidationSnapshotCurrent(
  environmentId: EnvironmentId,
  cwd: string,
  snapshot: VcsRefsInvalidationSnapshot,
): boolean {
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(alias) ?? alias;
  return (lastInvalidationSequenceByRepository.get(identity) ?? 0) <= snapshot.environmentSequence;
}

export function wasVcsRepositoryIdentityKnown(environmentId: EnvironmentId, cwd: string): boolean {
  return repositoryByCwd.has(cwdKey(environmentId, cwd));
}

export function wasVcsRepositoryInvalidated(environmentId: EnvironmentId, cwd: string): boolean {
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(alias) ?? alias;
  return (lastInvalidationSequenceByRepository.get(identity) ?? 0) > 0;
}

export function isVcsRefsPersistedCacheCurrent(environmentId: EnvironmentId, cwd: string): boolean {
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(alias) ?? alias;
  return (
    (persistedSequenceByAlias.get(alias) ?? 0) >=
    (lastInvalidationSequenceByRepository.get(identity) ?? 0)
  );
}

export function markVcsRefsPersistenceFresh(environmentId: EnvironmentId, cwd: string): void {
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(alias) ?? alias;
  persistedSequenceByAlias.set(alias, lastInvalidationSequenceByRepository.get(identity) ?? 0);
}

function resolveRepositoryAliases(
  environmentId: EnvironmentId,
  cwd: string,
): ReadonlyArray<string> {
  const alias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(alias) ?? alias;
  return [...(cwdAliasesByRepository.get(identity) ?? new Set([alias]))];
}

export function vcsRefsGenerationAtom(environmentId: EnvironmentId, cwd: string) {
  return generationByRepository(cwdKey(environmentId, cwd));
}

export function withVcsRefsPersistenceLock<A, E, R>(
  environmentId: EnvironmentId,
  cwd: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return persistenceLock.withPermit(environmentId)(effect);
}

export function invalidateVcsRefsGeneration(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  cwd: string,
  persistedCacheReadable?: boolean,
): void {
  const targetAlias = cwdKey(environmentId, cwd);
  const identity = repositoryByCwd.get(targetAlias) ?? targetAlias;
  const nextSequence = (invalidationSequenceByEnvironment.get(environmentId) ?? 0) + 1;
  invalidationSequenceByEnvironment.set(environmentId, nextSequence);
  lastInvalidationSequenceByRepository.set(identity, nextSequence);
  for (const alias of resolveRepositoryAliases(environmentId, cwd)) {
    registry.update(generationByRepository(alias), (current) => ({
      revision: current.revision + 1,
      persistedCacheReadable: persistedCacheReadable ?? current.persistedCacheReadable,
    }));
  }
}

export const invalidateCachedVcsRefs = Effect.fn("VcsRefsState.invalidateCached")(function* (
  registry: AtomRegistry.AtomRegistry,
  target: {
    readonly environmentId: EnvironmentId;
    readonly cwd: string;
  },
) {
  const cache = yield* EnvironmentCacheStore;
  yield* withVcsRefsPersistenceLock(
    target.environmentId,
    target.cwd,
    Effect.gen(function* () {
      const aliases = resolveRepositoryAliases(target.environmentId, target.cwd);
      let persistedCacheReadable = true;
      for (const alias of aliases) {
        const cwd = cwdByAlias.get(alias) ?? normalizeRepositoryPath(target.cwd);
        const removed = yield* cache.removeVcsRefs(target.environmentId, cwd).pipe(
          Effect.as(true),
          Effect.catch((error) =>
            Effect.logWarning("Could not clear invalidated cached Git refs.").pipe(
              Effect.annotateLogs({
                environmentId: target.environmentId,
                cwd,
                ...safeErrorLogAttributes(error),
              }),
              Effect.as(false),
            ),
          ),
        );
        persistedCacheReadable &&= removed;
        if (removed) persistedSequenceByAlias.delete(alias);
      }
      invalidateVcsRefsGeneration(
        registry,
        target.environmentId,
        target.cwd,
        persistedCacheReadable,
      );
    }),
  );
});
