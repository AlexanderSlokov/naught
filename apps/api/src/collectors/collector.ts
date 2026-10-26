import type { Axis, Claim, RunReport, Scope } from '@naught/shared';

/**
 * Where a collector puts what it saw. Calls are buffered into Parquet row
 * groups; a collector never learns where the file is or when it is flushed.
 */
export interface RunSink {
  /**
   * The denominator, once the collector knows it.
   *
   * Announced separately from the final `RunSummary` because a run that is
   * still in flight has no summary yet, and a progress reading with no ceiling
   * is a number nobody can act on. A collector that cannot know its
   * denominator simply never calls this — the same honesty `RunSummary.expected`
   * is nullable for.
   */
  expected(n: number): Promise<void>;

  /**
   * One claim, from one source, about one subject. What the collector could
   * not see is a claim too, with `observationKind: 'not_assessable'` and a
   * reason — never an omission (ADR 0007).
   */
  claim(c: Claim): Promise<void>;
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
  /**
   * Bumped whenever the collector parses a source differently, so that every
   * evidence row can say which parser produced it (`extractorVersion`).
   */
  readonly version: string;
  collect(scope: Scope, sink: RunSink): Promise<RunReport>;
}

export const COLLECTOR = Symbol('naught.collector');
