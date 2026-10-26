import {
  SOURCES,
  type AssessmentRow,
  type Credibility,
  type Evidence,
  type Reliability,
  type SourceId,
} from '@naught/shared';

/**
 * How an assessment and its evidence are said in words.
 *
 * Two rules from the RFC's application section govern every sentence here.
 * A claim is stated no wider than its evidence: "OSV lists no advisory for
 * this version", never "clean". And likelihood and confidence are never
 * combined in one sentence (ICD 203): the verdict says what is believed, a
 * second line says how firmly and why.
 */

/** A subject's identity in the table: the same purl may sit in two lockfiles. */
export function subjectKey(subject: string, container: string | null): string {
  return `${container ?? ''}\u0000${subject}`;
}

/** Assessments indexed for lookup from a table row. */
export function assessmentIndex(
  rows: readonly AssessmentRow[],
): ReadonlyMap<string, AssessmentRow> {
  return new Map(rows.map((r) => [subjectKey(r.subject, r.container), r]));
}

/**
 * The Admiralty pair as one short label, or null when nothing was seen.
 *
 * @example gradeOf({ bestReliability: 'A', bestCredibility: 2 }) // 'A2'
 */
export function gradeOf(
  a: Pick<AssessmentRow, 'bestReliability' | 'bestCredibility'>,
): string | null {
  if (a.bestReliability === null || a.bestCredibility === null) return null;
  return `${a.bestReliability}${a.bestCredibility}`;
}

const RELIABILITY_WORDS: Record<Reliability, string> = {
  A: 'completely reliable',
  B: 'usually reliable',
  C: 'fairly reliable',
  D: 'not usually reliable',
  E: 'unreliable',
  F: 'reliability cannot be judged',
};

const CREDIBILITY_WORDS: Record<Credibility, string> = {
  1: 'confirmed by an independent source',
  2: 'probably true',
  3: 'possibly true',
  4: 'doubtful',
  5: 'improbable',
  6: 'cannot be judged',
};

/** What the verdict widget shows: a conclusion, then its confidence. */
export interface Reading {
  tone: 'settled' | 'attention';
  says: string;
  confidence: string;
}

/**
 * One assessment as a verdict and a separate confidence line.
 *
 * @example
 * readingOf(lodash).says // 'OSV.dev lists 5 advisories against this version.'
 */
export function readingOf(a: AssessmentRow): Reading {
  return {
    tone:
      a.state === 'established' && a.value.listed === 0
        ? 'settled'
        : 'attention',
    says: verdictOf(a),
    confidence: confidenceOf(a),
  };
}

function verdictOf(a: AssessmentRow): string {
  const who = sourcesWords(a.sources);
  if (a.state === 'conflicting') return 'Sources disagree about this version.';
  if (a.state === 'not_assessable')
    return `${who} could not be asked about this version.`;
  if (a.state === 'missing')
    return 'No source has been asked about this version.';
  const listing = listingOf(who, a.value.listed);
  // A sentence that starts with a source name keeps its capital: `OSV.dev`.
  return a.state === 'stale' ? `Out of date: ${listing}` : listing;
}

function listingOf(who: string, listed: number): string {
  if (listed === 0) return `${who} lists no advisory against this version.`;
  return `${who} lists ${listed} ${listed === 1 ? 'advisory' : 'advisories'} against this version.`;
}

function confidenceOf(a: AssessmentRow): string {
  const grade = gradeOf(a);
  const age = `checked ${ageWords(a.freshnessSeconds)} before this page loaded`;
  if (
    grade === null ||
    a.bestReliability === null ||
    a.bestCredibility === null
  ) {
    return `No grade: nothing was seen to grade. Last attempt ${age}.`;
  }
  const scope =
    a.value.listed === 0
      ? ' It covers what the source has indexed, not what exists.'
      : '';
  return (
    `${grade}: source ${RELIABILITY_WORDS[a.bestReliability]}, claim ` +
    `${CREDIBILITY_WORDS[a.bestCredibility]}; ${age}.${scope}`
  );
}

/** `['osv']` → 'OSV.dev'; two or more are joined with "and". */
export function sourcesWords(sources: readonly SourceId[]): string {
  const names = sources.map((s) => SOURCES[s].name);
  if (names.length === 0) return 'No source';
  if (names.length === 1) return names[0] ?? 'No source';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A duration at the precision an operator acts on.
 *
 * @example ageWords(7200) // '2 h'
 */
export function ageWords(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return 'under a minute';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 172_800) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} days`;
}

/**
 * What one evidence row says, as the short line the dossier lists.
 *
 * @example claimWords(row) // 'lists GHSA-35jh-r3h4-6jhm'
 */
export function claimWords(e: Evidence): string {
  if (e.observationKind === 'not_assessable') {
    return `not assessable: ${e.notAssessableReason ?? 'other'}`;
  }
  if (e.claimType === 'contains') {
    return `pinned at ${String(e.claimValue['declared'] ?? 'an unrecorded version')}`;
  }
  if (e.observationKind === 'absent_in_scope') return 'lists no advisory';
  return `lists ${String(e.claimValue['vuln'] ?? 'an unnamed advisory')}`;
}

/** Where a row came from: `osv → ghsa`, or just `pnpm-lock`. */
export function provenanceOf(e: Evidence): string {
  return e.originSourceId === e.sourceId
    ? e.sourceId
    : `${e.sourceId} → ${e.originSourceId}`;
}

/** An ISO time as the header writes it: `2026-10-26 16:17 UTC`. */
export function utcMinute(iso: string): string {
  return `${iso.replace('T', ' ').slice(0, 16)} UTC`;
}

/**
 * The rows from the run the assessment was made on, and how many older rows
 * the lake holds about the same subject.
 */
export function latestEvidence(rows: readonly Evidence[]): {
  latest: Evidence[];
  earlier: number;
  earlierRuns: number;
} {
  const newest = rows.reduce<string | null>(
    (max, r) => (max === null || r.observedAt > max ? r.observedAt : max),
    null,
  );
  const latest = rows.filter((r) => r.observedAt === newest).sort(byReading);
  const older = rows.filter((r) => r.observedAt !== newest);
  return {
    latest,
    earlier: older.length,
    earlierRuns: new Set(older.map((r) => r.runId)).size,
  };
}

/**
 * The declaration first — it is why the subject is here at all — then the
 * claims about it in the order their words sort, so advisory ids read as a
 * list rather than in the order their hashes fell.
 */
function byReading(a: Evidence, b: Evidence): number {
  const declared =
    Number(b.claimType === 'contains') - Number(a.claimType === 'contains');
  return declared !== 0 ? declared : claimWords(a).localeCompare(claimWords(b));
}
