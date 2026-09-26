import { describe, expect, it } from 'vitest';
import type { CollectionRun, Scope } from '@naught/shared';
import {
  CollectionStarter,
  NoCollectorError,
  NoRecordedScopeError,
  RunInFlightError,
} from './collection-starter.js';
import {
  FakeCollector,
  FakeCollectorSource,
  FakeManifestStore,
  FakeRunQueue,
} from './run-fakes.js';

const SCOPE: Scope = { targets: ['/repo/pnpm-lock.yaml'], since: null };

const SEALED: CollectionRun = {
  runId: '11111111-1111-4111-8111-111111111111',
  collectorId: 'deps.osv',
  axis: 'deps',
  startedAt: '2026-09-26T10:00:00.000Z',
  finishedAt: '2026-09-26T10:00:03.000Z',
  status: 'complete',
  summary: { observed: 313, expected: 313, coverage: 1 },
  artifacts: [],
  scope: SCOPE,
};

function starter(queue: FakeRunQueue, runs: CollectionRun[] = [SEALED]) {
  return new CollectionStarter(
    new FakeCollectorSource([new FakeCollector('deps.osv', 'deps')]),
    new FakeManifestStore(runs),
    queue,
  );
}

describe('CollectionStarter', () => {
  it('enqueues a run repeating the last recorded scope', async () => {
    const queue = new FakeRunQueue();
    const ticket = await starter(queue).start('deps');

    expect(ticket.collectorId).toBe('deps.osv');
    expect(ticket.targets).toEqual(SCOPE.targets);
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]?.scope).toEqual(SCOPE);
  });

  it('gives the run an id the interface can follow', async () => {
    const queue = new FakeRunQueue();
    const ticket = await starter(queue).start('deps');
    expect(queue.enqueued[0]?.runId).toBe(ticket.runId);
  });

  it('refuses a second run while one is in flight, naming the first', async () => {
    // The whole of X1's "a second click does not start a second run".
    const queue = new FakeRunQueue();
    queue.hold({
      runId: '22222222-2222-4222-8222-222222222222',
      collectorId: 'deps.osv',
      axis: 'deps',
      scope: SCOPE,
    });

    await expect(starter(queue).start('deps')).rejects.toThrow(
      RunInFlightError,
    );
    await expect(starter(queue).start('deps')).rejects.toThrow(
      /22222222-2222-4222-8222-222222222222/,
    );
    expect(queue.enqueued).toHaveLength(0);
  });

  it('refuses when no run has recorded what to point at', async () => {
    const queue = new FakeRunQueue();
    const noScope = { ...SEALED, scope: null };

    await expect(starter(queue, [noScope]).start('deps')).rejects.toThrow(
      NoRecordedScopeError,
    );
    // The refusal has to be actionable, not just correct.
    await expect(starter(queue, [noScope]).start('deps')).rejects.toThrow(
      /running a collection against this data directory/,
    );
    expect(queue.enqueued).toHaveLength(0);
  });

  it('reports the queued run, so a reload after a restart is told the truth', async () => {
    // The broadcaster's snapshot dies with the process; Redis does not.
    const queue = new FakeRunQueue();
    queue.hold({
      runId: '22222222-2222-4222-8222-222222222222',
      collectorId: 'deps.osv',
      axis: 'deps',
      scope: SCOPE,
    });

    const ticket = await starter(queue).inFlight();
    expect(ticket?.runId).toBe('22222222-2222-4222-8222-222222222222');
    expect(ticket?.targets).toEqual(SCOPE.targets);
  });

  it('reports no run when the queue is empty', async () => {
    expect(await starter(new FakeRunQueue()).inFlight()).toBeNull();
  });

  it('refuses an axis no collector covers', async () => {
    const queue = new FakeRunQueue();
    await expect(starter(queue).start('image')).rejects.toThrow(
      NoCollectorError,
    );
    expect(queue.enqueued).toHaveLength(0);
  });
});
