// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import { withEvidence } from '../lake/evidence-views.js';

/**
 * Every query the read API makes, in one place.
 *
 * All of them scope to the most recent run — `runId = (SELECT runId FROM
 * latest_run)` — because the verdict is about now. The lake holds every run
 * ever made, and a query that forgets to scope reports each finding once per
 * run. History is what `lake/delta.ts` is for.
 *
 * Each reads through `withEvidence`, never the files (ADR 0007).
 */
const IN_LATEST = 'runId = (SELECT runId FROM latest_run)';

/** When the most recent run looked, in DuckDB's rendering; see `isoOf`. */
export function latestObservedAtSql(glob: string): string {
  return `${withEvidence(glob)} SELECT CAST(observedAt AS VARCHAR) FROM latest_run`;
}

/** Every subject the most recent run answered for, worst drift first. */
export function subjectsSql(glob: string): string {
  return `${withEvidence(glob)}
    SELECT subject, container, declared, observed, drift, CAST(to_json(advisories) AS VARCHAR)
    FROM subject_drift WHERE ${IN_LATEST}
    ORDER BY drift DESC, subject`;
}

/** How many subjects the most recent run answered for. */
export function observedCountSql(glob: string): string {
  return `${withEvidence(glob)} SELECT count(*) FROM subject_drift WHERE ${IN_LATEST}`;
}

/** Subjects carrying drift in the most recent run, changed or not. */
export function openFindingsSql(glob: string): string {
  return `${withEvidence(glob)}
    SELECT count(*) FROM subject_drift WHERE drift > 0 AND ${IN_LATEST}`;
}

/** What the most recent run could not see. Read from `evidence_unseen` only. */
export function blindSpotsSql(glob: string): string {
  return `${withEvidence(glob)}
    SELECT subject, container, notAssessableReason AS reason, note
    FROM evidence_unseen WHERE ${IN_LATEST}
    ORDER BY reason, subject`;
}

/**
 * The projects the most recent run covered. A project is the `container` a
 * subject was observed in — for the deps axis, the lockfile the collector was
 * pointed at.
 */
export function projectsSql(glob: string): string {
  return `${withEvidence(glob)}
    SELECT container, count(DISTINCT subject) AS subjects FROM subject_drift
    WHERE ${IN_LATEST} AND container IS NOT NULL
    GROUP BY container ORDER BY subjects DESC`;
}
