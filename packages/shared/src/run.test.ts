import { describe, expect, it } from 'vitest';
import { CollectionRun, schemaVersionOf, sealedStatusOf } from './run.js';

/**
 * A manifest exactly as sealed before `scope` existed, copied from
 * data/runs/axis=deps/date=2026-09-24/. Held verbatim rather than built by a
 * helper: the point of the test is that this literal shape still parses.
 */
const MANIFEST_WITHOUT_SCOPE = {
  runId: '9036d08c-b4a9-46d9-a5ff-e7400e1a02ba',
  collectorId: 'deps.osv',
  axis: 'deps',
  startedAt: '2026-09-24T17:05:50.137Z',
  finishedAt: '2026-09-24T17:05:52.793Z',
  status: 'complete',
  summary: { observed: 313, expected: 313, coverage: 1 },
  artifacts: ['/var/lib/naught/runs/axis=deps/date=2026-09-24/x.obs.parquet'],
};

describe('CollectionRun', () => {
  it('parses a manifest sealed before scope existed', () => {
    const run = CollectionRun.parse(MANIFEST_WITHOUT_SCOPE);
    expect(run.scope).toBeNull();
  });

  it('keeps a scope that was recorded', () => {
    const run = CollectionRun.parse({
      ...MANIFEST_WITHOUT_SCOPE,
      scope: { targets: ['/repo/pnpm-lock.yaml'], since: null },
    });
    expect(run.scope?.targets).toEqual(['/repo/pnpm-lock.yaml']);
  });

  it('refuses a scope that points at nothing', () => {
    // An empty target list would enqueue a run that reads no system and
    // reports 0/0 as full coverage.
    const parsed = CollectionRun.safeParse({
      ...MANIFEST_WITHOUT_SCOPE,
      scope: { targets: [], since: null },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('schemaVersionOf', () => {
  it('reads a manifest that names no version as version 1', () => {
    expect(schemaVersionOf(CollectionRun.parse(MANIFEST_WITHOUT_SCOPE))).toBe(
      1,
    );
  });

  it('keeps a version that was recorded', () => {
    const run = CollectionRun.parse({
      ...MANIFEST_WITHOUT_SCOPE,
      schemaVersion: 2,
    });
    expect(schemaVersionOf(run)).toBe(2);
  });
});

describe('sealedStatusOf', () => {
  const scope = {
    targets: ['/a/pnpm-lock.yaml', '/b/pnpm-lock.yaml'],
    since: null,
  };

  it('is complete when every target was read', () => {
    expect(
      sealedStatusOf(scope, ['/b/pnpm-lock.yaml', '/a/pnpm-lock.yaml']),
    ).toBe('complete');
  });

  it('is partial when a target went unread', () => {
    expect(sealedStatusOf(scope, ['/a/pnpm-lock.yaml'])).toBe('partial');
  });
});
