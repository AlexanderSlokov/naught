import { describe, expect, it } from 'vitest';
import { CollectionRun, type Scope } from '@naught/shared';
import { latestScope } from './latest-scope.js';
import { FakeManifestStore } from './run-fakes.js';

/** Parsed, so fields added to the manifest since arrive at their defaults. */
function run(startedAt: string, scope: Scope | null): CollectionRun {
  return CollectionRun.parse({
    runId: '00000000-0000-4000-8000-000000000000',
    collectorId: 'deps.osv',
    axis: 'deps',
    startedAt,
    finishedAt: startedAt,
    status: 'complete',
    summary: { observed: 1, expected: 1, coverage: 1 },
    artifacts: [],
    scope,
  });
}

const HERE: Scope = { targets: ['/repo/pnpm-lock.yaml'], since: null };
const THERE: Scope = { targets: ['/other/pnpm-lock.yaml'], since: null };

describe('latestScope', () => {
  it('takes the scope of the newest run that recorded one', async () => {
    const store = new FakeManifestStore([
      run('2026-09-26T10:00:00.000Z', HERE),
      run('2026-09-25T10:00:00.000Z', THERE),
    ]);
    expect(await latestScope(store, 'deps')).toEqual(HERE);
  });

  it('skips newer runs that recorded none', async () => {
    // Runs sealed before manifests carried a scope sit at the top of the list
    // forever. Stopping at the first one would make the axis permanently
    // unrepeatable.
    const store = new FakeManifestStore([
      run('2026-09-26T10:00:00.000Z', null),
      run('2026-09-25T10:00:00.000Z', THERE),
    ]);
    expect(await latestScope(store, 'deps')).toEqual(THERE);
  });

  it('is null when no run has ever recorded a scope', async () => {
    const store = new FakeManifestStore([
      run('2026-09-26T10:00:00.000Z', null),
    ]);
    expect(await latestScope(store, 'deps')).toBeNull();
  });

  it('is null on an axis nothing has ever run', async () => {
    expect(await latestScope(new FakeManifestStore(), 'image')).toBeNull();
  });
});
