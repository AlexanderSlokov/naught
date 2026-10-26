import { describe, expect, it } from 'vitest';
import type { Claim } from '@naught/shared';
import type { RunSink } from '../collectors/collector.js';
import {
  ProgressReportingSink,
  type RunProgressListener,
} from './progress-reporting-sink.js';

const RUN = '33333333-3333-4333-8333-333333333333';

/** Stands in for the Parquet sink: records what it was handed, writes nothing. */
class FakeRunSink implements RunSink {
  readonly claims: Claim[] = [];
  readonly denominators: number[] = [];

  async expected(n: number): Promise<void> {
    this.denominators.push(n);
  }
  async claim(c: Claim): Promise<void> {
    this.claims.push(c);
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

const ABOUT = {
  observedAt: '2026-09-26T10:00:00.000Z',
  subjectKind: 'package_version',
  container: '/repo/pnpm-lock.yaml',
} as const;

/** OSV answered for the subject: one seen subject. */
const observation = (subject: string, vuln = 'GHSA-aaaa'): Claim => ({
  ...ABOUT,
  subject,
  claimType: 'advisory',
  claimValue: { vuln },
  observationKind: 'observed',
  sourceId: 'osv',
});

/** OSV did not answer for the subject: one unseen subject. */
const blindSpot = (subject: string): Claim => ({
  ...ABOUT,
  subject,
  claimType: 'advisory',
  observationKind: 'not_assessable',
  notAssessableReason: 'unreachable-upstream',
  note: 'OSV responded 503',
  sourceId: 'osv',
});

/** The lockfile pins the subject: says nothing about whether it was answered. */
const declaration = (subject: string): Claim => ({
  ...ABOUT,
  subject,
  claimType: 'contains',
  observationKind: 'observed',
  sourceId: 'pnpm-lock',
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
    await subject.claim(observation('pkg:npm/left-pad@1.3.0'));
    await subject.claim(blindSpot('pkg:npm/unseen@1.0.0'));
    await subject.expected(313);

    expect(inner.claims).toHaveLength(2);
    expect(inner.denominators).toEqual([313]);
  });

  it('reports the denominator the moment it is known', async () => {
    const { listener, subject } = sink();
    await subject.expected(313);
    expect(listener.ceilings).toEqual([313]);
  });

  it('counts observations and blind spots separately', async () => {
    const { listener, clock, subject } = sink();
    await subject.claim(observation('pkg:npm/a@1.0.0'));
    clock.advance(300);
    await subject.claim(blindSpot('pkg:npm/b@1.0.0'));

    expect(listener.ticks.at(-1)).toEqual({ observed: 1, blind: 1 });
  });

  it('counts subjects, not rows: five advisories are one subject seen', async () => {
    const { listener, clock, subject } = sink();
    for (const vuln of ['GHSA-1', 'GHSA-2', 'GHSA-3', 'GHSA-4', 'GHSA-5']) {
      clock.advance(300);
      await subject.claim(observation('pkg:npm/lodash@4.17.20', vuln));
    }
    expect(listener.ticks.at(-1)).toEqual({ observed: 1, blind: 0 });
  });

  it('does not count a declaration as an answer', async () => {
    const { listener, clock, subject } = sink();
    await subject.claim(declaration('pkg:npm/a@1.0.0'));
    clock.advance(300);
    await subject.claim(observation('pkg:npm/b@1.0.0'));
    expect(listener.ticks).toEqual([{ observed: 1, blind: 0 }]);
  });

  it('throttles: a burst inside one window reports once', async () => {
    // A 313-package run produces 313 calls in a couple of seconds. Reporting
    // each one would cost more than the work being reported.
    const { listener, subject } = sink();
    for (let i = 0; i < 50; i += 1) {
      await subject.claim(observation(`pkg:npm/p${i}@1.0.0`));
    }
    expect(listener.ticks).toHaveLength(1);
  });

  it('reports again once the window has passed', async () => {
    const { listener, clock, subject } = sink();
    await subject.claim(observation('pkg:npm/a@1.0.0'));
    clock.advance(250);
    await subject.claim(observation('pkg:npm/b@1.0.0'));

    expect(listener.ticks).toEqual([
      { observed: 1, blind: 0 },
      { observed: 2, blind: 0 },
    ]);
  });
});
