// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import type { DuckDBConnection } from '@duckdb/node-api';

/** Absent from a run entirely, as distinct from present with zero drift. */
export const ABSENT = -1;

export interface Change {
  subject: string;
  /** Drift in the previous run, or ABSENT if the subject was not in it. */
  was: number;
  /** Drift in this run, or ABSENT if the subject has gone. */
  now: number;
}

export interface Delta {
  /** How many runs the lake holds for this axis. */
  runs: number;
  /** When the run before this one happened, or null if there was none. */
  previousAt: string | null;
  /** Subjects carrying advisories right now, changed or not. */
  openFindings: number;
  /** Only what moved. What did not move is deliberately not here. */
  changes: Change[];
}

/**
 * What changed since the run before this one.
 *
 * This is §9's fourth question and §7's rule in one place: a finding that was
 * reported last time and has not moved is not reported again. Silence here
 * means "unchanged", never "nothing is wrong" — `openFindings` carries the
 * standing total so the two can never be confused.
 *
 * A run is identified by its `observedAt`, which a collector stamps once per
 * collection. The lake is append-only, so the previous run is still there to
 * compare against; that is the whole reason nothing is ever deleted.
 */
export async function deltaSinceLastRun(
  db: DuckDBConnection,
  obsGlob: string,
): Promise<Delta> {
  const source = `read_parquet('${obsGlob}', union_by_name = true)`;

  const runsResult = await db.runAndReadAll(
    `SELECT count(DISTINCT observedAt) FROM ${source}`,
  );
  const runs = Number(runsResult.getRows()[0]?.[0] ?? 0);

  const openResult = await db.runAndReadAll(`
    SELECT count(*) FROM ${source}
    WHERE drift > 0 AND observedAt = (SELECT max(observedAt) FROM ${source})
  `);
  const openFindings = Number(openResult.getRows()[0]?.[0] ?? 0);

  if (runs < 2) {
    return { runs, previousAt: null, openFindings, changes: [] };
  }

  const previousResult = await db.runAndReadAll(`
    SELECT CAST(max(observedAt) AS VARCHAR) FROM ${source}
    WHERE observedAt < (SELECT max(observedAt) FROM ${source})
  `);
  const previousAt = String(previousResult.getRows()[0]?.[0] ?? '');

  const changed = await db.runAndReadAll(`
    WITH obs AS (SELECT * FROM ${source}),
    cur AS (
      SELECT subject, drift FROM obs
      WHERE observedAt = (SELECT max(observedAt) FROM obs)
    ),
    prev AS (
      SELECT subject, drift FROM obs
      WHERE observedAt = (
        SELECT max(observedAt) FROM obs
        WHERE observedAt < (SELECT max(observedAt) FROM obs)
      )
    )
    SELECT
      coalesce(cur.subject, prev.subject) AS subject,
      coalesce(prev.drift, ${ABSENT}) AS was,
      coalesce(cur.drift, ${ABSENT}) AS now
    FROM cur FULL OUTER JOIN prev ON cur.subject = prev.subject
    WHERE coalesce(cur.drift, ${ABSENT}) <> coalesce(prev.drift, ${ABSENT})
    ORDER BY now DESC, subject
  `);

  const changes: Change[] = changed.getRows().map((row) => ({
    subject: String(row[0]),
    was: Number(row[1]),
    now: Number(row[2]),
  }));

  return { runs, previousAt, openFindings, changes };
}

/** One line per change, in the tense an operator reads it in. */
export function describe({ subject, was, now }: Change): string {
  if (was === ABSENT) return `appeared   ${subject} (${now} advisory/ies)`;
  if (now === ABSENT) return `gone       ${subject} (was ${was})`;
  if (now > was) return `worsened   ${subject} (${was} → ${now})`;
  return `improved   ${subject} (${was} → ${now})`;
}
