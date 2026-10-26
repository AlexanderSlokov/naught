// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.

/**
 * The only module that reads evidence files (ADR 0007).
 *
 * Version 1 kept "could not see it" rows out of every list of things seen by
 * writing them to a different file. Version 2 keeps both in one table, so the
 * guard moves here: every reader starts from these named views, and
 * `evidence-views.guard.test.ts` fails if any other module calls
 * `read_parquet`. A reader that wants things seen asks for `evidence_seen`; it
 * cannot get `not_assessable` rows by forgetting a filter.
 *
 * The views are CTEs rather than `CREATE VIEW`, because DuckDB binds a view's
 * glob when the view is created, and an axis no collector has run has no
 * files to bind to.
 */

/** `read_parquet` over one glob of evidence files. Exported for the rebuild only. */
export function evidenceSource(glob: string): string {
  return `read_parquet('${glob}', union_by_name = true)`;
}

/**
 * A `WITH` clause defining, over the evidence matched by `glob`:
 *
 * - `evidence` — every row.
 * - `evidence_seen` — `observed` and `absent_in_scope` rows.
 * - `evidence_unseen` — `not_assessable` rows: the version 1 blind spots.
 * - `runs`, `latest_run`, `previous_run` — one row per run, by `observedAt`.
 * - `subject_drift` — the version 1 observation row, derived: one row per run
 *   and answered subject, `drift` = advisories listed, ids sorted.
 *
 * @example
 * await db.runAndReadAll(`${withEvidence(glob)} SELECT count(*) FROM evidence_unseen`);
 */
export function withEvidence(glob: string): string {
  return `WITH
    evidence AS (SELECT * FROM ${evidenceSource(glob)}),
    evidence_seen AS (
      SELECT * FROM evidence
      WHERE observationKind IN ('observed', 'absent_in_scope')
    ),
    evidence_unseen AS (
      SELECT * FROM evidence WHERE observationKind = 'not_assessable'
    ),
    ${RUN_VIEWS},
    ${SUBJECT_DRIFT_VIEWS}`;
}

/**
 * A run's `observedAt` is stamped once per collection, so ordering runs by it
 * is ordering them by when they looked. `runId` breaks a tie that version 1,
 * which identified runs by `observedAt` alone, could not.
 */
const RUN_VIEWS = `
    runs AS (
      SELECT runId, max(observedAt) AS observedAt FROM evidence GROUP BY runId
    ),
    latest_run AS (
      SELECT * FROM runs ORDER BY observedAt DESC, runId DESC LIMIT 1
    ),
    previous_run AS (
      SELECT * FROM runs ORDER BY observedAt DESC, runId DESC LIMIT 1 OFFSET 1
    )`;

/**
 * Only subjects with an answer appear, as in version 1: a package OSV did not
 * answer for is in `evidence_unseen`, never in this list with a drift of 0.
 * Advisory order is not information, so ids are sorted (ADR 0007).
 */
const SUBJECT_DRIFT_VIEWS = `
    declared_subjects AS (
      SELECT runId, subject, container, claimValue->>'declared' AS declared
      FROM evidence_seen WHERE claimType = 'contains'
    ),
    answered_subjects AS (
      SELECT
        runId, subject, container,
        max(observedAt) AS observedAt,
        count(*) FILTER (WHERE observationKind = 'observed') AS listed,
        coalesce(
          list_sort(list(claimValue->>'vuln') FILTER (WHERE observationKind = 'observed')),
          []::VARCHAR[]
        ) AS advisories
      FROM evidence_seen WHERE claimType = 'advisory'
      GROUP BY runId, subject, container
    ),
    subject_drift AS (
      SELECT
        a.runId, a.observedAt, a.subject, a.container, d.declared,
        CASE WHEN a.listed = 0 THEN 'clean' ELSE array_to_string(a.advisories, ',') END AS observed,
        CAST(a.listed AS DOUBLE) AS drift,
        a.advisories
      FROM answered_subjects a
      LEFT JOIN declared_subjects d
        ON d.runId = a.runId AND d.subject = a.subject
        AND d.container IS NOT DISTINCT FROM a.container
    )`;

/** Renders a TIMESTAMP column as the ISO string every API response carries. */
export function isoSql(column: string): string {
  return `strftime(${column}, '%Y-%m-%dT%H:%M:%S.%gZ')`;
}

/**
 * Every evidence column as one JSON object per row, timestamps as ISO, so a
 * row leaves the lake in exactly the shape `Evidence` parses.
 */
export function evidenceJsonSql(
  columns: Readonly<Record<string, string>>,
): string {
  const fields = Object.entries(columns).map(([name, type]) =>
    type === 'TIMESTAMP' ? `'${name}': ${isoSql(name)}` : `'${name}': ${name}`,
  );
  return `CAST(to_json({${fields.join(', ')}}) AS VARCHAR)`;
}
