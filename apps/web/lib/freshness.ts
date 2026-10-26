import type { AssessmentRow } from '@naught/shared';
import { ageWords } from './dossier';

/**
 * Whether the latest run's answers still describe the present.
 *
 * Derived from the assessments the API judged at request time, not from the
 * browser's clock: the server knows when it asked, and a page rendered on the
 * server and hydrated in the browser must agree with itself.
 */
export interface LakeFreshness {
  /** Subjects in the latest run whose answer is past its `staleAfter`. */
  staleSubjects: number;
  subjects: number;
  /** Age of the newest answer when the page was requested; null if none. */
  ageSeconds: number | null;
  /** When the earliest stale answer went stale; null if none has. */
  staleSince: string | null;
}

/**
 * @example freshnessOf(assessments).staleSubjects // 325
 */
export function freshnessOf(rows: readonly AssessmentRow[]): LakeFreshness {
  const stale = rows.filter((r) => r.state === 'stale');
  const ages = rows.map((r) => r.freshnessSeconds);
  const since = stale
    .map((r) => r.staleAfter)
    .filter((t): t is string => t !== null)
    .sort();
  return {
    staleSubjects: stale.length,
    subjects: rows.length,
    ageSeconds: ages.length === 0 ? null : Math.min(...ages),
    staleSince: since[0] ?? null,
  };
}

export function isStale(f: LakeFreshness): boolean {
  return f.staleSubjects > 0;
}

/**
 * The sentence every settled verdict must carry when the answers it rests on
 * are out of date, or null when they are not.
 *
 * @example staleCaveat(f) // '325 of 325 answers are out of date; the newest is 30 days old.'
 */
export function staleCaveat(f: LakeFreshness): string | null {
  if (!isStale(f)) return null;
  const age =
    f.ageSeconds === null
      ? ''
      : `; the newest is ${ageWords(f.ageSeconds)} old`;
  return `${f.staleSubjects} of ${f.subjects} answers are out of date${age}.`;
}
