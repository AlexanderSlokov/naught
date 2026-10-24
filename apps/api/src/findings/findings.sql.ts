// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.

/**
 * Every query the read API makes, in one place.
 *
 * All of them scope to the most recent run — `observedAt = (SELECT max(...))`
 * — because the verdict is about now. The lake holds every run ever made, and
 * a query that forgets to scope reports each finding once per run. History is
 * what `lake/delta.ts` is for.
 */
function latest(obsGlob: string): string {
  return `read_parquet('${obsGlob}', union_by_name = true)`;
}

/** When the most recent run looked, as an ISO string. */
export function latestObservedAtSql(obsGlob: string): string {
  return `SELECT CAST(max(observedAt) AS VARCHAR) FROM ${latest(obsGlob)}`;
}

/** Every subject the most recent run saw, worst drift first. */
export function subjectsSql(obsGlob: string): string {
  return `
    WITH obs AS (SELECT * FROM ${latest(obsGlob)})
    SELECT
      subject,
      container,
      declared,
      observed,
      drift,
      json_extract_string(detail, '$.advisories') AS advisories
    FROM obs
    WHERE observedAt = (SELECT max(observedAt) FROM obs)
    ORDER BY drift DESC, subject
  `;
}

/** How many subjects the most recent run recorded. */
export function observedCountSql(obsGlob: string): string {
  return `
    WITH obs AS (SELECT * FROM ${latest(obsGlob)})
    SELECT count(*) FROM obs
    WHERE observedAt = (SELECT max(observedAt) FROM obs)
  `;
}

/** Subjects carrying drift in the most recent run, changed or not. */
export function openFindingsSql(obsGlob: string): string {
  return `
    WITH obs AS (SELECT * FROM ${latest(obsGlob)})
    SELECT count(*) FROM obs
    WHERE drift > 0 AND observedAt = (SELECT max(observedAt) FROM obs)
  `;
}

/** What the most recent run could not see. Never unioned with observations. */
export function blindSpotsSql(blindGlob: string): string {
  return `
    WITH b AS (SELECT * FROM read_parquet('${blindGlob}', union_by_name = true))
    SELECT subject, container, reason, note FROM b
    WHERE observedAt = (SELECT max(observedAt) FROM b)
    ORDER BY reason, subject
  `;
}

/**
 * The projects the most recent run covered. A project is the `container` a
 * subject was observed in — for the deps axis, the lockfile the collector was
 * pointed at.
 */
export function projectsSql(obsGlob: string): string {
  return `
    WITH obs AS (SELECT * FROM ${latest(obsGlob)})
    SELECT container, count(DISTINCT subject) AS subjects FROM obs
    WHERE observedAt = (SELECT max(observedAt) FROM obs) AND container IS NOT NULL
    GROUP BY container ORDER BY subjects DESC
  `;
}
