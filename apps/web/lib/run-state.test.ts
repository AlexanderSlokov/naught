import { describe, expect, it } from 'vitest';
import type { RunEvent } from '@naught/shared';
import {
  QUIET,
  reduce,
  refused,
  stalled,
  starting,
  type CollectionRunState,
} from './run-state.js';

const RUN = '55555555-5555-4555-8555-555555555555';

/** Folds a whole stream, the way one run arrives over the socket. */
function fold(...events: RunEvent[]): CollectionRunState {
  return events.reduce(reduce, QUIET);
}

const queued: RunEvent = {
  type: 'queued',
  runId: RUN,
  collectorId: 'deps.osv',
  axis: 'deps',
  targets: ['/repo/pnpm-lock.yaml'],
};
const started: RunEvent = {
  type: 'started',
  runId: RUN,
  startedAt: '2026-09-26T11:00:00.000Z',
};
const sealed: RunEvent = {
  type: 'sealed',
  runId: RUN,
  finishedAt: '2026-09-26T11:00:04.000Z',
  summary: { observed: 325, expected: 325, coverage: 1 },
  artifacts: ['/var/lib/naught/runs/axis=deps/date=2026-09-26/x.obs.parquet'],
};

describe('reduce', () => {
  it('walks a whole run from queued to sealed', () => {
    const state = fold(
      queued,
      started,
      { type: 'expected', runId: RUN, expected: 325 },
      { type: 'progress', runId: RUN, observed: 200, blind: 0 },
      sealed,
    );
    expect(state.phase).toBe('sealed');
    expect(state.observed).toBe(325);
  });

  it('counts blind spots towards progress', () => {
    // A run that is finished and one fifth unseen must not read as 80% done
    // forever; the rows it could not see are still rows it got through.
    const state = fold(started, {
      type: 'progress',
      runId: RUN,
      observed: 240,
      blind: 60,
    });
    expect(state.observed).toBe(300);
  });

  it('holds no ceiling until the collector announces one', () => {
    expect(fold(queued, started).expected).toBeNull();
  });

  it('reports a failure with its reason', () => {
    const state = fold(queued, started, {
      type: 'failed',
      runId: RUN,
      finishedAt: '2026-09-26T11:00:04.000Z',
      reason: 'EACCES: permission denied',
    });
    expect(state.phase).toBe('failed');
    expect(state.reason).toBe('EACCES: permission denied');
  });

  it('clears the previous failure when a new run is queued', () => {
    // Otherwise a run in flight is rendered beside the reason the last one died.
    const failed = fold(started, {
      type: 'failed',
      runId: RUN,
      finishedAt: '2026-09-26T11:00:04.000Z',
      reason: 'disk full',
    });
    expect(reduce(failed, queued).reason).toBeNull();
  });

  it('drops a stale count and ceiling when a new run is queued', () => {
    const done = fold(
      started,
      { type: 'expected', runId: RUN, expected: 325 },
      sealed,
    );
    const next = reduce(done, queued);
    expect(next.observed).toBeNull();
    expect(next.expected).toBeNull();
  });

  it('goes quiet on idle, so a reconnect between runs shows no run', () => {
    const state = reduce(fold(queued, started, sealed), { type: 'idle' });
    expect(state.phase).toBe('idle');
    expect(state.observed).toBeNull();
  });

  it('keeps the socket connection flag across events', () => {
    const connected = { ...QUIET, connected: true };
    expect(reduce(connected, queued).connected).toBe(true);
  });
});

describe('stalled', () => {
  it('fails a run that was queued and never started', () => {
    const state = stalled(starting(QUIET));
    expect(state.phase).toBe('failed');
    expect(state.reason).toMatch(/never started/);
  });

  it('leaves a run that did start alone', () => {
    // The timer fires on a delay; by then the run may be well underway, and a
    // late watchdog must not overwrite a live run with a failure.
    const running = fold(queued, started);
    expect(stalled(running)).toBe(running);
  });

  it('leaves a sealed run alone', () => {
    const done = fold(queued, started, sealed);
    expect(stalled(done).phase).toBe('sealed');
  });
});

describe('refused', () => {
  it('carries the reason the API gave for saying no', () => {
    const state = refused(
      starting(QUIET),
      new Error('deps.osv is already running'),
    );
    expect(state.phase).toBe('failed');
    expect(state.reason).toBe('deps.osv is already running');
  });

  it('survives a thrown non-error', () => {
    expect(refused(QUIET, 'socket hung up').reason).toBe('socket hung up');
  });
});
