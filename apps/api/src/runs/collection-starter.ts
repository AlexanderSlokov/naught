import { randomUUID } from 'node:crypto';
import type { Axis, RunTicket } from '@naught/shared';
import type { Collector } from '../collectors/collector.js';
import { latestScope, type ManifestStore } from './latest-scope.js';
import type { CollectionJob, RunQueue } from './run-queue.js';

/** A run is already queued or active for this collector. */
export class RunInFlightError extends Error {
  constructor(
    readonly runId: string,
    collectorId: string,
  ) {
    super(`${collectorId} is already running as ${runId}`);
  }
}

/** No run on this axis ever recorded what it was pointed at. */
export class NoRecordedScopeError extends Error {
  constructor(axis: Axis) {
    // Names the condition rather than one machine's command. `make poc-here`
    // runs on a developer's checkout against ./data; in a container the same
    // CLI has to be run against the mounted volume, and a message that names
    // only the former sends a deployed operator to a command that changes
    // nothing they can see. ARCHITECTURE §8 promises a scope config file that
    // would remove the need for either — it does not exist yet.
    super(
      `no run on axis ${axis} has recorded a scope, so there is nothing to ` +
        `repeat; record one by running a collection against this data ` +
        `directory from the command line (in a checkout, 'make poc-here')`,
    );
  }
}

/** No collector is registered for this axis. */
export class NoCollectorError extends Error {
  constructor(axis: Axis) {
    super(`no collector is registered for axis ${axis}`);
  }
}

/** Finds the collector that covers an axis. */
export interface CollectorSource {
  all(): Collector[];
}

/**
 * Turns "look at this axis again" into a queued job, or into a refusal that
 * says which of the three reasons applied.
 *
 * @example
 * const ticket = await starter.start('deps');
 * ticket.runId; // the id the interface follows on the socket
 */
export class CollectionStarter {
  constructor(
    private readonly collectors: CollectorSource,
    private readonly manifests: ManifestStore,
    private readonly queue: RunQueue,
  ) {}

  async start(axis: Axis): Promise<RunTicket> {
    const collector = this.collectorFor(axis);
    await this.refuseIfInFlight(collector.id);

    const scope = await latestScope(this.manifests, axis);
    if (scope === null) throw new NoRecordedScopeError(axis);

    const runId = randomUUID();
    await this.queue.enqueue({ runId, collectorId: collector.id, axis, scope });
    return { runId, collectorId: collector.id, axis, targets: scope.targets };
  }

  /**
   * The run the queue is holding, whichever collector it belongs to, or null.
   *
   * Redis outlives the API process, so this is the one account of an in-flight
   * run that survives a restart. The broadcaster's snapshot does not, and must
   * not be the only thing asked: an operator who reloads after a restart would
   * be told nothing is happening while a worker is still working.
   *
   * Not scoped to an axis, because the worker runs one job at a time across all
   * of them. Scoping it would invite a caller to name an axis and be told `null`
   * while a different collector is busy.
   */
  async inFlight(): Promise<RunTicket | null> {
    for (const collector of this.collectors.all()) {
      const job = await this.queue.inFlight(collector.id);
      if (job) return ticketFor(job);
    }
    return null;
  }

  private collectorFor(axis: Axis): Collector {
    const collector = this.collectors.all().find((c) => c.axis === axis);
    if (!collector) throw new NoCollectorError(axis);
    return collector;
  }

  /**
   * Checked before the scope is resolved, so that a second click is refused on
   * the cheap question rather than after a directory walk.
   */
  private async refuseIfInFlight(collectorId: string): Promise<void> {
    const running = await this.queue.inFlight(collectorId);
    if (running) throw new RunInFlightError(running.runId, collectorId);
  }
}

/** A queued job as the interface needs to see it. */
function ticketFor(job: CollectionJob): RunTicket {
  return {
    runId: job.runId,
    collectorId: job.collectorId,
    axis: job.axis,
    targets: job.scope.targets,
  };
}
