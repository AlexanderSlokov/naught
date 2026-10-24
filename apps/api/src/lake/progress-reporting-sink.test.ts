import { describe, expect, it } from 'vitest';
import type { BlindSpot, Observation } from '@naught/shared';
import type { RunSink } from '../collectors/collector.js';
import {
  ProgressReportingSink,
  type RunProgressListener,
} from './progress-reporting-sink.js';

const RUN = '33333333-3333-4333-8333-333333333333';

/** Stands in for the Parquet sink: records what it was handed, writes nothing. */
class FakeRunSink implements RunSink {
  readonly observations: Observation[] = [];
  readonly blindSpots: BlindSpot[] = [];
  readonly denominators: number[] = [];

  async expected(n: number): Promise<void> {
    this.denominators.push(n);
  }
  async observation(o: Observation): Promise<void> {
    this.observations.push(o);
  }
  async blindSpot(b: BlindSpot): Promise<void> {
    this.blindSpots.push(b);
  }
}

/** Stands in for the WebSocket gateway. */
class FakeRunProgressListener implements RunProgressListener {
  readonly ceilings: number[] = [];
  readonly ticks: { observed: number; blind: number }[] = [];

  expected(_runId: string, expected: number): void {
    this.ceilings.push(expected);
  }
  progress(_runId: string, observed: number, blind: number): void {
    this.ticks.push({ observed, blind });
  }
}

/** A clock the test drives, so throttling is tested rather than waited on. */
class FakeClock {
  private millis = 0;
  now = (): number => this.millis;
  advance(by: number): void {
    this.millis += by;
  }
}

const observation = (subject: string): Observation => ({
  observedAt: '2026-09-26T10:00:00.000Z',
  collectorId: 'deps.osv',
  axis: 'deps',
  subject,
  container: '/repo/pnpm-lock.yaml',
  declared: '1.0.0',
  observed: 'clean',
  drift: 0,
  detail: {},
});

const blindSpot = (subject: string): BlindSpot => ({
  observedAt: '2026-09-26T10:00:00.000Z',
  collectorId: 'deps.osv',
  axis: 'deps',
  subject,
  container: '/repo/pnpm-lock.yaml',
  reason: 'unreachable-upstream',
  note: 'OSV responded 503',
});

function sink() {
  const inner = new FakeRunSink();
  const listener = new FakeRunProgressListener();
  const clock = new FakeClock();
  return {
    inner,
    listener,
    clock,
    subject: new ProgressReportingSink(inner, listener, RUN, clock.now),
  };
}

describe('ProgressReportingSink', () => {
  it('passes every row through unchanged', async () => {
    const { inner, subject } = sink();
    await subject.observation(observation('pkg:npm/left-pad@1.3.0'));
    await subject.blindSpot(blindSpot('pkg:npm/unseen@1.0.0'));
    await subject.expected(313);

    expect(inner.observations).toHaveLength(1);
    expect(inner.blindSpots).toHaveLength(1);
    expect(inner.denominators).toEqual([313]);
  });

  it('reports the denominator the moment it is known', async () => {
    const { listener, subject } = sink();
    await subject.expected(313);
    expect(listener.ceilings).toEqual([313]);
  });

  it('counts observations and blind spots separately', async () => {
    const { listener, clock, subject } = sink();
    await subject.observation(observation('pkg:npm/a@1.0.0'));
    clock.advance(300);
    await subject.blindSpot(blindSpot('pkg:npm/b@1.0.0'));

    expect(listener.ticks.at(-1)).toEqual({ observed: 1, blind: 1 });
  });

  it('throttles: a burst inside one window reports once', async () => {
    // A 313-package run produces 313 calls in a couple of seconds. Reporting
    // each one would cost more than the work being reported.
    const { listener, subject } = sink();
    for (let i = 0; i < 50; i += 1) {
      await subject.observation(observation(`pkg:npm/p${i}@1.0.0`));
    }
    expect(listener.ticks).toHaveLength(1);
  });

  it('reports again once the window has passed', async () => {
    const { listener, clock, subject } = sink();
    await subject.observation(observation('pkg:npm/a@1.0.0'));
    clock.advance(250);
    await subject.observation(observation('pkg:npm/b@1.0.0'));

    expect(listener.ticks).toEqual([
      { observed: 1, blind: 0 },
      { observed: 2, blind: 0 },
    ]);
  });
});
