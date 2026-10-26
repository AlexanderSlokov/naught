// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import { isoSql, withEvidence } from './evidence-views.js';

/** The rule set below. Bumped whenever a state is decided differently. */
export const ASSESSMENT_RULE_VERSION = 'assess-v0';

/**
 * One `known_advisories` assessment per subject in the latest run, as JSON.
 *
 * Rule `assess-v0`, in order:
 * - `conflicting` — one row lists an advisory and another says none.
 * - `not_assessable` — nothing seen about advisories, and something unseen.
 * - `missing` — nothing at all about advisories for a declared subject.
 * - `stale` — seen, but the oldest supporting row is past `staleAfter`.
 * - `established` — otherwise.
 *
 * Credibility 1 is assigned here and only here: a claim value asserted by two
 * or more distinct `originSourceId`s is confirmed (ADR 0008). Reliability A
 * sorts before B, so the best grade is the minimum.
 *
 * @example
 * await db.runAndReadAll(assessmentsSql(glob, new Date().toISOString()));
 */
export function assessmentsSql(glob: string, asOf: string): string {
  const iso = checkedIso(asOf);
  const at = `TIMESTAMP '${iso.replace('T', ' ').replace('Z', '')}'`;
  return `${withEvidence(glob)},
    ${latestRowsViews()},
    judged AS (${judgedSelect(at)})
    -- Keys are quoted: \`asOf\` unquoted parses as the ASOF keyword.
    SELECT CAST(to_json({
      'subject': subject, 'container': container, 'factor': 'known_advisories',
      'state': state, 'value': {'listed': listed, 'advisories': advisories},
      'supportingIds': supportingIds, 'conflictingIds': conflictingIds,
      'sources': sources,
      'bestReliability': bestReliability, 'bestCredibility': bestCredibility,
      'observedAt': ${isoSql('observedAt')}, 'staleAfter': ${isoSql('staleAfter')},
      'freshnessSeconds': CAST(epoch(${at}) - epoch(observedAt) AS BIGINT),
      'ruleVersion': '${ASSESSMENT_RULE_VERSION}', 'asOf': '${iso}'
    }) AS VARCHAR)
    FROM judged ORDER BY subject, container`;
}

/** The latest run's rows, summarised per subject. */
function latestRowsViews(): string {
  const seen = `observationKind <> 'not_assessable'`;
  const ids = (where: string): string =>
    `coalesce(list(evidenceId ORDER BY evidenceId) FILTER (WHERE ${where}), []::VARCHAR[])`;
  return `
    latest AS (SELECT * FROM evidence WHERE runId = (SELECT runId FROM latest_run)),
    advisory AS (SELECT * FROM latest WHERE claimType = 'advisory'),
    origins AS (
      SELECT subject, container, max(n) AS origins FROM (
        SELECT subject, container, observationKind, claimValue->>'vuln',
               count(DISTINCT originSourceId) AS n
        FROM advisory WHERE ${seen} GROUP BY ALL
      ) GROUP BY ALL
    ),
    per_subject AS (
      SELECT subject, container,
        count(*) FILTER (WHERE claimType = 'advisory' AND observationKind = 'observed') AS listed,
        count(*) FILTER (WHERE claimType = 'advisory' AND observationKind = 'absent_in_scope') AS absent,
        count(*) FILTER (WHERE observationKind = 'not_assessable') AS unseen,
        ${ids(`claimType = 'advisory' AND observationKind = 'observed'`)} AS listedIds,
        ${ids(`claimType = 'advisory' AND observationKind = 'absent_in_scope'`)} AS absentIds,
        ${ids(`observationKind = 'not_assessable'`)} AS unseenIds,
        coalesce(list_sort(list(claimValue->>'vuln')
          FILTER (WHERE claimType = 'advisory' AND observationKind = 'observed')), []::VARCHAR[]) AS advisories,
        coalesce(list_sort(list(DISTINCT sourceId)
          FILTER (WHERE claimType = 'advisory')), []::VARCHAR[]) AS sources,
        min(reliability) FILTER (WHERE claimType = 'advisory' AND ${seen}) AS bestReliability,
        min(credibility) FILTER (WHERE claimType = 'advisory' AND ${seen}) AS credibility,
        min(staleAfter) FILTER (WHERE claimType = 'advisory' AND ${seen}) AS staleAfter,
        max(observedAt) AS observedAt
      FROM latest WHERE subjectKind <> 'container'
      GROUP BY subject, container
    )`;
}

/** Applies `assess-v0` to each subject. */
function judgedSelect(at: string): string {
  return `
    SELECT p.subject, p.container, p.listed, p.advisories, p.sources, p.bestReliability,
      p.observedAt, p.staleAfter,
      CASE
        WHEN p.listed > 0 AND p.absent > 0 THEN 'conflicting'
        WHEN p.listed + p.absent = 0 AND p.unseen > 0 THEN 'not_assessable'
        WHEN p.listed + p.absent = 0 THEN 'missing'
        WHEN p.staleAfter < ${at} THEN 'stale'
        ELSE 'established'
      END AS state,
      CASE
        WHEN p.listed + p.absent = 0 THEN p.unseenIds
        WHEN p.listed > 0 THEN p.listedIds
        ELSE p.absentIds
      END AS supportingIds,
      CASE WHEN p.listed > 0 AND p.absent > 0 THEN p.absentIds ELSE []::VARCHAR[] END
        AS conflictingIds,
      CASE WHEN coalesce(o.origins, 0) >= 2 THEN 1 ELSE p.credibility END AS bestCredibility
    FROM per_subject p
    LEFT JOIN origins o
      ON o.subject = p.subject AND o.container IS NOT DISTINCT FROM p.container`;
}

/**
 * `asOf` is interpolated into SQL, so it is re-rendered from a parsed date
 * rather than trusted as a string.
 */
function checkedIso(asOf: string): string {
  const at = Date.parse(asOf);
  if (Number.isNaN(at)) {
    throw new Error(`asOf ${JSON.stringify(asOf)} is not an ISO datetime`);
  }
  return new Date(at).toISOString();
}
