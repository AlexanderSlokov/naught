import type { Axis, Scope } from '@naught/shared';

/** One queue, named once, so the producer and the worker cannot disagree. */
export const COLLECTION_QUEUE = 'collection';

/** Everything the worker needs to reproduce a run, and nothing else. */
export interface CollectionJob {
  runId: string;
  collectorId: string;
  axis: Axis;
  scope: Scope;
}

/**
 * The queue, as this project needs it.
 *
 * BullMQ is behind this interface rather than in front of it because two
 * methods is the whole of what Naught asks a queue for, and because a starter
 * that refuses duplicate runs should be testable without a Redis.
 */
export interface RunQueue {
  /**
   * The job holding this collector's slot, or null when the slot is free.
   *
   * The job id is the collector id, so a present job means one run is queued
   * or active — which is exactly the condition a second click must not get
   * past.
   */
  inFlight(collectorId: string): Promise<CollectionJob | null>;

  enqueue(job: CollectionJob): Promise<void>;
}
