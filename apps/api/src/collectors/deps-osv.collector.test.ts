import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import type { Claim, Scope } from '@naught/shared';
import type { RunSink } from './collector.js';
import { DepsOsvCollector } from './deps-osv.collector.js';
import type { LockEntry } from './lockfile.js';
import type { OsvAdvisory, OsvClient } from './osv-client.js';

const ROTTEN = resolve(
  import.meta.dirname,
  '../../../../fixtures/rotten-lock.yaml',
);

/** Stands in for OSV: lists one advisory against lodash, or fails outright. */
class FakeOsvClient implements OsvClient {
  constructor(private readonly failure: Error | null = null) {}

  async advisoriesFor(entries: readonly LockEntry[]): Promise<OsvAdvisory[][]> {
    if (this.failure) throw this.failure;
    return entries.map((e) =>
      e.name === 'lodash'
        ? [{ id: 'GHSA-35jh-r3h4-6jhm', modified: '2024-01-10T05:39:37.000Z' }]
        : [],
    );
  }
}

/** Records every claim; writes nothing. */
class RecordingRunSink implements RunSink {
  readonly claims: Claim[] = [];
  async expected(_n: number): Promise<void> {}
  async claim(c: Claim): Promise<void> {
    this.claims.push(c);
  }
}

async function collect(osv: OsvClient, targets: string[] = [ROTTEN]) {
  const sink = new RecordingRunSink();
  const scope: Scope = { targets, since: null };
  const report = await new DepsOsvCollector(osv).collect(scope, sink);
  return { report, claims: sink.claims };
}

describe('DepsOsvCollector', () => {
  it('records what the lockfile pins and what OSV said, as separate claims', async () => {
    const { report, claims } = await collect(new FakeOsvClient());
    const lodash = claims.filter((c) => c.subject === 'pkg:npm/lodash@4.17.20');
    expect(lodash.map((c) => [c.claimType, c.observationKind])).toEqual([
      ['contains', 'observed'],
      ['advisory', 'observed'],
    ]);
    expect(lodash[1]?.sourceAssertedAt).toBe('2024-01-10T05:39:37.000Z');
    expect(report).toMatchObject({
      observed: 7,
      expected: 8,
      scopeCompleted: [ROTTEN],
    });
  });

  it('records a package OSV lists nothing for as absent, not as observed', async () => {
    const { claims } = await collect(new FakeOsvClient());
    const leftPad = claims.find(
      (c) =>
        c.subject === 'pkg:npm/left-pad@1.3.0' && c.claimType === 'advisory',
    );
    expect(leftPad?.observationKind).toBe('absent_in_scope');
  });

  /** Regression for the invariant in ADR 0007. */
  it('never writes absent_in_scope for a package in a batch that failed', async () => {
    const { report, claims } = await collect(
      new FakeOsvClient(new Error('OSV responded 503')),
    );
    const advisory = claims.filter((c) => c.claimType === 'advisory');
    expect(advisory).toHaveLength(7);
    expect(advisory.every((c) => c.observationKind === 'not_assessable')).toBe(
      true,
    );
    expect(advisory[0]?.note).toBe('OSV responded 503');
    expect(report.observed).toBe(0);
  });

  it('records an unparseable lockfile key as a declaration not assessable', async () => {
    const { claims } = await collect(new FakeOsvClient());
    expect(
      claims.find((c) => c.subject === 'this-key-has-no-version'),
    ).toMatchObject({
      subjectKind: 'lockfile_key',
      claimType: 'contains',
      notAssessableReason: 'unparseable',
    });
  });

  it('leaves a lockfile it cannot open out of scopeCompleted, and says so', async () => {
    const missing = '/nonexistent/pnpm-lock.yaml';
    const { report, claims } = await collect(new FakeOsvClient(), [
      ROTTEN,
      missing,
    ]);
    expect(report.scopeCompleted).toEqual([ROTTEN]);
    expect(claims.find((c) => c.subject === missing)).toMatchObject({
      subjectKind: 'container',
      container: null,
      observationKind: 'not_assessable',
    });
  });
});
