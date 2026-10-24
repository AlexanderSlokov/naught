import type { RunEvent } from '@naught/shared';

/**
 * What the run control shows, and how one event changes it.
 *
 * Kept apart from the hook that feeds it so that the only real logic on this
 * side of the wire — the fold, and the decision that a queued run is never
 * going to start — is a pure function over plain values. A socket, a timer and
 * a router are what `use-collection-run.ts` adds on top.
 */
export type RunPhase = 'idle' | 'starting' | 'running' | 'sealed' | 'failed';

export interface CollectionRunState {
  phase: RunPhase;
  /** Rows the run has written so far. Null before it has written any. */
  observed: number | null;
  /** The denominator, once the collector announces it. Null while unknown. */
  expected: number | null;
  /** Why the last run did not reach the lake. */
  reason: string | null;
  /** Whether the interface is currently being told what is happening. */
  connected: boolean;
}

/** Nothing is running and nothing has been heard. */
export const QUIET: CollectionRunState = {
  phase: 'idle',
  observed: null,
  expected: null,
  reason: null,
  connected: false,
};

/**
 * How long a queued run may sit before the interface stops claiming it is about
 * to happen.
 *
 * The worker takes a job in milliseconds, so this is not a latency budget. It is
 * the case where Redis dropped the job between the POST and the pickup — the
 * queue keeps no persistence, by design — and nothing will ever arrive.
 */
export const PICKUP_MS = 30_000;

/**
 * One event, folded into what the button shows.
 *
 * @example
 * reduce(QUIET, { type: 'expected', runId, expected: 325 }).expected; // 325
 */
export function reduce(
  prior: CollectionRunState,
  event: RunEvent,
): CollectionRunState {
  switch (event.type) {
    case 'idle':
      return { ...prior, phase: 'idle', observed: null, expected: null };
    case 'queued':
      return { ...prior, ...FRESH, phase: 'starting' };
    case 'started':
      return { ...prior, phase: 'running', observed: 0, reason: null };
    case 'expected':
      return { ...prior, phase: 'running', expected: event.expected };
    case 'progress':
      // Blind spots count towards the bar. They are rows the run produced and
      // work it got through; leaving them out would stall a bar at 80% on a run
      // that is finished and one fifth unseen.
      return {
        ...prior,
        phase: 'running',
        observed: event.observed + event.blind,
      };
    case 'sealed':
      return {
        ...prior,
        phase: 'sealed',
        observed: event.summary.observed,
        reason: null,
      };
    case 'failed':
      return { ...prior, phase: 'failed', reason: event.reason };
  }
}

/** A new run inherits no count, no ceiling and no previous failure. */
const FRESH = { observed: null, expected: null, reason: null } as const;

/** The optimistic state the button takes on while the POST is in flight. */
export function starting(prior: CollectionRunState): CollectionRunState {
  return { ...prior, ...FRESH, phase: 'starting' };
}

/** The POST itself was refused or unreachable. */
export function refused(
  prior: CollectionRunState,
  err: unknown,
): CollectionRunState {
  return {
    ...prior,
    phase: 'failed',
    reason: err instanceof Error ? err.message : String(err),
  };
}

/**
 * A run that was queued and never started, reported as the failure it is.
 *
 * Every other failure arrives on the socket. This one cannot: the run that
 * would have reported it never began. Returns `prior` unchanged if the run has
 * moved on in the meantime, so a late timer cannot overwrite a live run.
 */
export function stalled(prior: CollectionRunState): CollectionRunState {
  if (prior.phase !== 'starting') return prior;
  return {
    ...prior,
    phase: 'failed',
    reason:
      'the run was queued but never started; the queue may have dropped it. ' +
      'Try again.',
  };
}
