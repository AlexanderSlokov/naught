import type { Axis, BlindSpot, Observation, RunSummary, Scope } from '@naught/shared';

/**
 * Where a collector puts what it saw. Calls are buffered into Parquet row
 * groups; a collector never learns where the file is or when it is flushed.
 */
export interface RunSink {
  observation(o: Observation): Promise<void>;
  blindSpot(b: BlindSpot): Promise<void>;
}

/**
 * A collector is a thin, replaceable adapter. It reads one external system,
 * writes rows, and exits. It holds no state between runs, and it is never
 * given a credential that can write.
 */
export interface Collector {
  /** "deps.osv", "deps.guac", "image.registry" */
  readonly id: string;
  readonly axis: Axis;
  collect(scope: Scope, sink: RunSink): Promise<RunSummary>;
}

export const COLLECTOR = Symbol('naught.collector');
