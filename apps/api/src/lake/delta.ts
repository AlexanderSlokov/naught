// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import type { DuckDBConnection } from '@duckdb/node-api';
import { withEvidence } from './evidence-views.js';

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
 * A run is identified by its `runId`, and runs are ordered by the
 * `observedAt` a collector stamps once per collection. The lake is
 * append-only, so the previous run is still there to compare against; that is
 * the whole reason nothing is ever deleted.
 */
export async function deltaSinceLastRun(
  db: DuckDBConnection,
  glob: string,
): Promise<Delta> {
  const runs = Number(
    await scalar(db, `${withEvidence(glob)} SELECT count(*) FROM runs`),
  );
  const openFindings = Number(
    await scalar(
      db,
      `${withEvidence(glob)} SELECT count(*) FROM subject_drift
       WHERE drift > 0 AND runId = (SELECT runId FROM latest_run)`,
    ),
  );
  if (runs < 2) return { runs, previousAt: null, openFindings, changes: [] };

  const previousAt = String(
    await scalar(
      db,
      `${withEvidence(glob)} SELECT CAST(observedAt AS VARCHAR) FROM previous_run`,
    ),
  );
  const changed = await db.runAndReadAll(changesSql(glob));
  const changes: Change[] = changed.getRows().map((row) => ({
    subject: String(row[0]),
    was: Number(row[1]),
    now: Number(row[2]),
  }));
  return { runs, previousAt, openFindings, changes };
}

/** Subjects whose drift differs between the latest run and the one before it. */
function changesSql(glob: string): string {
  return `${withEvidence(glob)},
    cur AS (
      SELECT subject, drift FROM subject_drift
      WHERE runId = (SELECT runId FROM latest_run)
    ),
    prev AS (
      SELECT subject, drift FROM subject_drift
      WHERE runId = (SELECT runId FROM previous_run)
    )
    SELECT
      coalesce(cur.subject, prev.subject) AS subject,
      coalesce(prev.drift, ${ABSENT}) AS was,
      coalesce(cur.drift, ${ABSENT}) AS now
    FROM cur FULL OUTER JOIN prev ON cur.subject = prev.subject
    WHERE coalesce(cur.drift, ${ABSENT}) <> coalesce(prev.drift, ${ABSENT})
    ORDER BY now DESC, subject`;
}

async function scalar(db: DuckDBConnection, sql: string): Promise<unknown> {
  const result = await db.runAndReadAll(sql);
  return result.getRows()[0]?.[0] ?? null;
}

/** One line per change, in the tense an operator reads it in. */
export function describe({ subject, was, now }: Change): string {
  if (was === ABSENT) return `appeared   ${subject} (${now} advisory/ies)`;
  if (now === ABSENT) return `gone       ${subject} (was ${was})`;
  if (now > was) return `worsened   ${subject} (${was} → ${now})`;
  return `improved   ${subject} (${was} → ${now})`;
}
