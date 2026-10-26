import { z } from 'zod';
import { Axis } from './axis.js';
import {
  ClaimType,
  Credibility,
  NotAssessableReason,
  ObservationKind,
  Reliability,
  SourceId,
  SubjectKind,
} from './vocabulary.js';

/**
 * A claim is one statement, from one source, about one subject. A collector
 * emits claims; the run sink stamps each into an `Evidence` row, which is what
 * the lake stores and never edits (ADR 0007).
 *
 * The split exists so that grading, ids and staleness are computed in one
 * place for every collector, rather than re-implemented — and mis-implemented
 * — in each.
 */
const ClaimFields = z.object({
  /** When the collector looked. Not when the fact became true. */
  observedAt: z.iso.datetime(),

  subject: z.string().min(1),
  subjectKind: SubjectKind,
  /** The other end, when the claim is an edge. */
  objectId: z.string().min(1).nullable().default(null),
  /** Where the subject was found — the lockfile, for `deps`. */
  container: z.string().min(1).nullable(),

  claimType: ClaimType,
  /** The content: `{ declared: '4.17.20' }`, `{ vuln: 'GHSA-…' }`. */
  claimValue: z.record(z.string(), z.unknown()).default({}),
  observationKind: ObservationKind,
  notAssessableReason: NotAssessableReason.nullable().default(null),
  note: z.string().nullable().default(null),

  sourceId: SourceId,
  /** When the source made the claim, e.g. OSV's `modified`. */
  sourceAssertedAt: z.iso.datetime().nullable().default(null),
  /** When the claim is true in the world. Null on `deps`; used by `image`. */
  validFrom: z.iso.datetime().nullable().default(null),
  validTo: z.iso.datetime().nullable().default(null),

  derivedFrom: z.array(z.string()).default([]),
  modelVersion: z.string().nullable().default(null),
  sensitivity: z.string().nullable().default(null),
  supersedes: z.string().nullable().default(null),
});

/**
 * A reason without `not_assessable`, or `not_assessable` without a reason, is
 * a row that says two contradictory things about whether Naught saw it.
 */
function reasonMatchesKind(
  row: z.infer<typeof ClaimFields>,
  ctx: z.RefinementCtx,
): void {
  const unseen = row.observationKind === 'not_assessable';
  if (unseen === (row.notAssessableReason !== null)) return;
  ctx.addIssue({
    code: 'custom',
    path: ['notAssessableReason'],
    message:
      `observationKind ${row.observationKind} with notAssessableReason ` +
      `${JSON.stringify(row.notAssessableReason)}; expected a reason exactly ` +
      `when the kind is not_assessable`,
  });
}

export const Claim = ClaimFields.superRefine(reasonMatchesKind);
export type Claim = z.input<typeof Claim>;

/** One row of `*.evidence.parquet`. Columns in `apps/api/src/lake/schema.ts`. */
export const Evidence = ClaimFields.extend({
  /** sha256 of run, subject, container, claim type, kind and value. */
  evidenceId: z.string().regex(/^[0-9a-f]{64}$/),
  runId: z.uuid(),
  collectorId: z.string().min(1),
  axis: Axis,
  /** The most original source behind `sourceId` (ICD 206). */
  originSourceId: SourceId,
  reliability: Reliability,
  credibility: Credibility,
  gradingVersion: z.string().min(1),
  staleAfter: z.iso.datetime(),
  /** The collector build that parsed the source into this row. */
  extractorVersion: z.string().min(1),
}).superRefine(reasonMatchesKind);
export type Evidence = z.infer<typeof Evidence>;
