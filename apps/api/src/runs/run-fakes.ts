import type { Axis, CollectionRun, RunReport, Scope } from '@naught/shared';
import type { Collector, RunSink } from '../collectors/collector.js';
import type { ManifestStore } from './latest-scope.js';
import type { CollectionJob, RunQueue } from './run-queue.js';

/**
 * Doubles for the three things a run touches that a test must not: the lake,
 * Redis, and a collector that calls OSV.
 *
 * They are classes with names rather than inline object literals so that a
 * failing test says which collaborator misbehaved.
 */

export class FakeManifestStore implements ManifestStore {
  constructor(private readonly runs: CollectionRun[] = []) {}

  /** Newest first, as `readManifests` guarantees. */
  async manifests(_axis: Axis): Promise<CollectionRun[]> {
    return this.runs;
  }
}

export class FakeRunQueue implements RunQueue {
  readonly enqueued: CollectionJob[] = [];
  private held: CollectionJob | null = null;

  /** Puts a job in the collector's slot, as a run already in flight would. */
  hold(job: CollectionJob): void {
    this.held = job;
  }

  async inFlight(collectorId: string): Promise<CollectionJob | null> {
    return this.held?.collectorId === collectorId ? this.held : null;
  }

  async enqueue(job: CollectionJob): Promise<void> {
    this.enqueued.push(job);
  }
}

export class FakeCollector implements Collector {
  constructor(
    readonly id: string,
    readonly axis: Axis,
  ) {}

  readonly version = '0.0.0-fake';

  async collect(_scope: Scope, _sink: RunSink): Promise<RunReport> {
    return { observed: 0, expected: 0, coverage: null, scopeCompleted: [] };
  }
}

export class FakeCollectorSource {
  constructor(private readonly collectors: Collector[]) {}

  all(): Collector[] {
    return this.collectors;
  }
}
