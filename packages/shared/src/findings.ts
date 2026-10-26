import { z } from 'zod';
import { Axis } from './axis.js';
import { RunSummary } from './run.js';
import { Evidence } from './evidence.js';
import {
  Credibility,
  NotAssessableReason,
  Reliability,
  SourceId,
} from './vocabulary.js';

/**
 * What the read API returns, declared once and imported by both sides.
 *
 * The API produces these shapes and the web parses responses with the same
 * schemas, so a change on one side that the other has not followed surfaces as
 * a parse error naming the field. The alternative — each side holding its own
 * idea of the shape — fails silently as a blank panel, which is the failure
 * mode this project exists to refuse.
 */

/**
 * The verdict for one axis, as of its most recent run.
 *
 * Extends `RunSummary`, so `expected` and `coverage` stay nullable here too: a
 * collector that cannot know its denominator must say so, and the interface
 * renders that as unknown rather than as complete.
 *
 * @example
 * { axis: 'deps', collectorId: 'deps.osv', observedAt: '2026-09-24T03:04:12.000Z',
 *   observed: 313, expected: 313, coverage: 1, openFindings: 6 }
 */
export const LatestRun = RunSummary.extend({
  axis: Axis,
  collectorId: z.string().min(1),
  observedAt: z.iso.datetime(),
  /** Subjects carrying advisories in this run, changed since last time or not. */
  openFindings: z.int().nonnegative(),
});
export type LatestRun = z.infer<typeof LatestRun>;

/** One row of the object table: a subject as the latest run saw it. */
export const SubjectRow = z.object({
  subject: z.string().min(1),
  container: z.string().nullable(),
  declared: z.string().nullable(),
  observed: z.string().nullable(),
  drift: z.number().nullable(),
  /** Advisory identifiers behind `drift`, unpacked from the observation detail. */
  advisories: z.array(z.string()).default([]),
});
export type SubjectRow = z.infer<typeof SubjectRow>;

/**
 * Something the run could not see. Carries the same `reason` vocabulary as the
 * lake row it comes from, and is never merged into `SubjectRow` — "could not
 * see it" and "it is broken" are different facts.
 */
export const BlindSpotRow = z.object({
  /** What could not be seen. A purl when known, a free description when not. */
  subject: z.string().min(1),
  container: z.string().min(1).nullable(),
  reason: NotAssessableReason,
  note: z.string().nullable(),
});
export type BlindSpotRow = z.infer<typeof BlindSpotRow>;

/** One subject whose drift moved between the last two runs. */
export const SubjectChange = z.object({
  subject: z.string().min(1),
  /** Drift in the previous run, or -1 if the subject was not in it. */
  was: z.number(),
  /** Drift in this run, or -1 if the subject has gone. */
  now: z.number(),
});
export type SubjectChange = z.infer<typeof SubjectChange>;

/**
 * §9's fourth question on the wire. `changes` holds only what moved; what did
 * not move is deliberately absent, per §7. `openFindings` travels with it so
 * that an empty list can never be read as "all clear".
 */
export const DeltaView = z.object({
  runs: z.int().nonnegative(),
  previousAt: z.string().nullable(),
  openFindings: z.int().nonnegative(),
  changes: z.array(SubjectChange),
});
export type DeltaView = z.infer<typeof DeltaView>;

/**
 * A project, as the lake knows one: the `container` a subject was observed in.
 * For the deps axis that is the lockfile path the collector was pointed at.
 */
export const ProjectRef = z.object({
  container: z.string().min(1),
  subjects: z.int().nonnegative(),
});
export type ProjectRef = z.infer<typeof ProjectRef>;

/** Which axes the lake actually holds data for, so the rail can be honest. */
export const AxisAvailability = z.object({
  axis: Axis,
  hasData: z.boolean(),
});
export type AxisAvailability = z.infer<typeof AxisAvailability>;

/**
 * How settled the answer about one subject is, as of the latest run. The five
 * states of the RFC's assessment layer; see `assessment.sql.ts` for the rule.
 */
export const AssessmentState = z.enum([
  'established',
  'conflicting',
  'stale',
  'missing',
  'not_assessable',
]);
export type AssessmentState = z.infer<typeof AssessmentState>;

/**
 * One derived judgement about one subject. Never stored: its staleness depends
 * on the clock, so it is computed per request from evidence rows it names.
 *
 * @example
 * { subject: 'pkg:npm/lodash@4.17.20', factor: 'known_advisories',
 *   state: 'established', value: { listed: 5, advisories: ['GHSA-…'] },
 *   bestReliability: 'A', bestCredibility: 2, ruleVersion: 'assess-v0', … }
 */
export const AssessmentRow = z.object({
  subject: z.string().min(1),
  container: z.string().nullable(),
  factor: z.literal('known_advisories'),
  state: AssessmentState,
  value: z.object({
    listed: z.int().nonnegative(),
    advisories: z.array(z.string()),
  }),
  /** The evidence the state rests on. Empty only when the state is `missing`. */
  supportingIds: z.array(z.string()),
  /** Rows that contradict `supportingIds`. Non-empty only when `conflicting`. */
  conflictingIds: z.array(z.string()),
  /** Every source asked about this factor, answered or not, sorted. */
  sources: z.array(SourceId),
  /** Null when nothing was seen: an unseen claim has no grade worth showing. */
  bestReliability: Reliability.nullable(),
  bestCredibility: Credibility.nullable(),
  observedAt: z.iso.datetime(),
  staleAfter: z.iso.datetime().nullable(),
  freshnessSeconds: z.int(),
  ruleVersion: z.string().min(1),
  asOf: z.iso.datetime(),
});
export type AssessmentRow = z.infer<typeof AssessmentRow>;

/**
 * List forms, exported so that a consumer can validate a whole response
 * without taking a direct dependency on zod. `apps/web` holds no zod of its
 * own; adding one would change the lockfile, and the lockfile is the thing
 * Naught is currently observing.
 */
export const SubjectRows = z.array(SubjectRow);
export const BlindSpotRows = z.array(BlindSpotRow);
export const ProjectRefs = z.array(ProjectRef);
export const AxisAvailabilities = z.array(AxisAvailability);
export const AssessmentRows = z.array(AssessmentRow);
/** Every evidence row about one subject: the dossier behind its assessment. */
export const EvidenceRows = z.array(Evidence);
