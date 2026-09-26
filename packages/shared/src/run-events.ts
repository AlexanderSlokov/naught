import { z } from 'zod';
import { Axis } from './axis.js';
import { RunSummary } from './run.js';

/**
 * What the API tells a watching interface about a collection run, as it
 * happens.
 *
 * These events are the only place a run is visible while it is in flight. The
 * lake holds sealed runs and nothing else (ARCHITECTURE §4), so an operator
 * watching a run in progress is watching this stream, not the lake.
 *
 * Every event carries `runId`, including the ones that could be inferred from
 * order, because a client that reconnects mid-run has no order to infer from.
 */
const Queued = z.object({
  type: z.literal('queued'),
  runId: z.uuid(),
  collectorId: z.string().min(1),
  axis: Axis,
  /** What the run will read. Echoed back so the operator sees what they started. */
  targets: z.array(z.string().min(1)),
});

const Started = z.object({
  type: z.literal('started'),
  runId: z.uuid(),
  startedAt: z.iso.datetime(),
});

/**
 * The denominator, once the collector knows it.
 *
 * Sent once per target a collector manages to read, carrying the running
 * total, and not at all by a collector that cannot count. The value only ever
 * grows: a scope of three lockfiles learns its denominator in three steps, and
 * a client that renders the latest one is never shown a ceiling that has not
 * been established. A client that never receives it shows a rising count with
 * no ceiling, which is the honest rendering of an unknown denominator.
 */
const Expected = z.object({
  type: z.literal('expected'),
  runId: z.uuid(),
  expected: z.int().nonnegative(),
});

const Progress = z.object({
  type: z.literal('progress'),
  runId: z.uuid(),
  observed: z.int().nonnegative(),
  blind: z.int().nonnegative(),
});

const Sealed = z.object({
  type: z.literal('sealed'),
  runId: z.uuid(),
  finishedAt: z.iso.datetime(),
  /** The collector's own account of its coverage, as written to the manifest. */
  summary: RunSummary,
  artifacts: z.array(z.string()),
});

/**
 * The run did not reach the lake.
 *
 * A failed run writes nothing: its staging files are discarded and no manifest
 * is recorded. The failure exists only here and in the log, which is why
 * `reason` has to be legible to a person rather than a stack trace.
 */
const Failed = z.object({
  type: z.literal('failed'),
  runId: z.uuid(),
  finishedAt: z.iso.datetime(),
  reason: z.string().min(1),
});

/** Nothing is running. Sent to a client that connects between runs. */
const Idle = z.object({ type: z.literal('idle') });

export const RunEvent = z.discriminatedUnion('type', [
  Queued,
  Started,
  Expected,
  Progress,
  Sealed,
  Failed,
  Idle,
]);
export type RunEvent = z.infer<typeof RunEvent>;

/**
 * Parse one frame off the wire.
 *
 * @example
 * socket.onmessage = (e) => {
 *   const parsed = parseRunEvent(e.data);
 *   if (parsed !== null) reduce(parsed);
 * };
 */
export function parseRunEvent(frame: string): RunEvent | null {
  try {
    return RunEvent.parse(JSON.parse(frame));
  } catch {
    return null;
  }
}

/** What `POST /runs` answers with once a run is accepted. */
export const RunTicket = z.object({
  runId: z.uuid(),
  collectorId: z.string().min(1),
  axis: Axis,
  targets: z.array(z.string().min(1)),
});
export type RunTicket = z.infer<typeof RunTicket>;
