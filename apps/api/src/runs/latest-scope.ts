import type { Axis, CollectionRun, Scope } from '@naught/shared';

/**
 * Where recorded runs are read from. An interface rather than the function
 * itself so that resolving a scope can be tested without a lake on disk.
 */
export interface ManifestStore {
  /** Every manifest under one axis, newest first. */
  manifests(axis: Axis): Promise<CollectionRun[]>;
}

/**
 * The scope of the most recent run on this axis that recorded one, or null.
 *
 * "Look again" is the only thing the interface can ask for, because it is the
 * only thing it can ask for honestly: an operator clicking a button supplies
 * no lockfile path, and inventing one would point a run at something nobody
 * chose. Runs sealed before manifests carried a scope return null here, and
 * the caller refuses rather than guessing.
 *
 * @example
 * const scope = await latestScope(store, 'deps');
 * if (scope === null) throw new NoRecordedScopeError('deps');
 */
export async function latestScope(
  store: ManifestStore,
  axis: Axis,
): Promise<Scope | null> {
  const runs = await store.manifests(axis);
  return runs.find((run) => run.scope !== null)?.scope ?? null;
}
