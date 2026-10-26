import { z } from 'zod';

/**
 * The controlled words an evidence row is written in. Each is an enum rather
 * than a free string because the lake is read for years: a word that drifts in
 * spelling between two collectors splits one fact into two rows nobody joins.
 *
 * Values are only ever added. Renaming one is a schema version (ADR 0005).
 */

/**
 * The question a claim answers, not the answer. "Does OSV list an advisory for
 * this purl?" is `advisory` whether OSV said yes, said no, or never replied —
 * the shape of the answer is `ObservationKind`. Keeping the two apart is what
 * stops a filter on claim type alone from counting "no reply" as "clean"
 * (ADR 0007).
 */
export const ClaimType = z.enum([
  /** A declaration lists the subject: the lockfile pins this purl. */
  'contains',
  /** A source lists, or does not list, an advisory against the subject. */
  'advisory',
]);
export type ClaimType = z.infer<typeof ClaimType>;

/**
 * The three shapes an answer can take. Only `observed` and `absent_in_scope`
 * are things Naught saw; `not_assessable` is the version 1 blind spot.
 *
 * `absent_in_scope` is the narrow sentence "the source covers this subject and
 * returned nothing", never "there is nothing". A request that failed must not
 * produce it.
 */
export const ObservationKind = z.enum([
  'observed',
  'absent_in_scope',
  'not_assessable',
]);
export type ObservationKind = z.infer<typeof ObservationKind>;

/**
 * Why a claim could not be assessed. The vocabulary of version 1 blind spots,
 * kept as-is because the interface and the glossary already speak it.
 */
export const NotAssessableReason = z.enum([
  'unsupported-ecosystem',
  'unparseable',
  'unreachable-upstream',
  'rate-limited',
  'access-denied',
  'opaque-layer',
  'vendored-binary',
  'other',
]);
export type NotAssessableReason = z.infer<typeof NotAssessableReason>;

/** What kind of thing `subject` names, so a reader need not sniff the string. */
export const SubjectKind = z.enum([
  /** A purl with a version: `pkg:npm/left-pad@1.3.0`. */
  'package_version',
  /** A lockfile key that could not be read as one: `this-key-has-no-version`. */
  'lockfile_key',
  /** A whole input the collector could not open: a lockfile path. */
  'container',
]);
export type SubjectKind = z.infer<typeof SubjectKind>;

/** Every source a claim may come from. See `SOURCES` for what each one is. */
export const SourceId = z.enum([
  'osv',
  'pnpm-lock',
  'ghsa',
  'ossf-malicious-packages',
  'nvd',
]);
export type SourceId = z.infer<typeof SourceId>;

/**
 * Admiralty source reliability (STANAG 2511). F is "cannot be judged", which
 * is a different statement from E, "unreliable" (ADR 0008).
 */
export const Reliability = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);
export type Reliability = z.infer<typeof Reliability>;

/**
 * Admiralty information credibility: 1 confirmed … 5 improbable, 6 cannot be
 * judged. Graded independently of reliability, never combined with it.
 */
export const Credibility = z.int().min(1).max(6);
export type Credibility = z.infer<typeof Credibility>;
