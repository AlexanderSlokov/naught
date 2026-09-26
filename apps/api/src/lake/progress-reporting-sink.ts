import type { RunSink } from '../collectors/collector.js';
import type { BlindSpot, Observation } from '@naught/shared';

/** One event per 250ms is a readable progress bar and a quiet socket. */
const THROTTLE_MS = 250;

/**
 * Where a run's progress is reported to. Narrow on purpose: this file must not
 * learn what a WebSocket is, and the transport must not learn what a sink is.
 */
export interface RunProgressListener {
  expected(runId: string, expected: number): void;
  progress(runId: string, observed: number, blind: number): void;
}

/**
 * A `RunSink` that counts what passes through it and reports as it goes.
 *
 * Wrapping rather than instrumenting keeps the collector unaware that anyone
 * is watching — `DepsOsvCollector` streams to an interface, and whether that
 * interface writes Parquet, reports progress, or both is not its business.
 *
 * @example
 * const sink = new ProgressReportingSink(parquetSink, gateway, runId);
 * await collector.collect(scope, sink);
 */
export class ProgressReportingSink implements RunSink {
  private observed = 0;
  private blind = 0;
  // Negative infinity, not zero: the first row must report. It is the moment
  // the run stops being "queued" and starts being visible, and against a clock
  // that begins at zero — a test's, or a process started at the epoch — a zero
  // here silently swallows it.
  private lastReportAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly inner: RunSink,
    private readonly listener: RunProgressListener,
    private readonly runId: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Forwarded immediately: it arrives once per target and sets the ceiling. */
  async expected(n: number): Promise<void> {
    this.listener.expected(this.runId, n);
    await this.inner.expected(n);
  }

  async observation(o: Observation): Promise<void> {
    await this.inner.observation(o);
    this.observed += 1;
    this.report();
  }

  async blindSpot(b: BlindSpot): Promise<void> {
    await this.inner.blindSpot(b);
    this.blind += 1;
    this.report();
  }

  /**
   * A 313-package run produces 313 calls in a few seconds. Reporting every one
   * would spend more time on the socket than on the work being reported.
   */
  private report(): void {
    const at = this.now();
    if (at - this.lastReportAt < THROTTLE_MS) return;
    this.lastReportAt = at;
    this.listener.progress(this.runId, this.observed, this.blind);
  }
}
