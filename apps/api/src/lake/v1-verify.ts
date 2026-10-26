// noinspection SqlNoDataSourceInspection,SqlResolve
import type { DuckDBConnection } from '@duckdb/node-api';
import { isoSql, withEvidence } from './evidence-views.js';
import type { V1BlindSpot, V1Observation } from './v1-rows.js';

/**
 * The rewriter's proof, in the spirit of ADR 0006: a version 2 file is kept
 * only if projecting it back to version 1 yields exactly the rows it was
 * written from — as multisets, with advisory ids compared sorted, because
 * their order was never information (ADR 0007).
 *
 * Returns null when the projection matches, or a sentence naming the first
 * mismatch.
 *
 * @example
 * const problem = await mismatchOf(db, evidencePath, observations, blindSpots);
 */
export async function mismatchOf(
  db: DuckDBConnection,
  evidencePath: string,
  observations: readonly V1Observation[],
  blindSpots: readonly V1BlindSpot[],
): Promise<string | null> {
  const seen = await projected(db, evidencePath, SEEN_PROJECTION);
  const unseen = await projected(db, evidencePath, UNSEEN_PROJECTION);
  return (
    differenceOf('observation', observations.map(seenKey), seen) ??
    differenceOf('blind spot', blindSpots.map(unseenKey), unseen)
  );
}

// `json_array`, not a list literal: a DuckDB list must hold one type.
const SEEN_PROJECTION = `SELECT CAST(json_array(
    ${isoSql('observedAt')}, subject, container, declared, drift, advisories
  ) AS VARCHAR) FROM subject_drift`;

const UNSEEN_PROJECTION = `SELECT CAST(json_array(
    ${isoSql('observedAt')}, subject, container, notAssessableReason, note
  ) AS VARCHAR) FROM evidence_unseen`;

async function projected(
  db: DuckDBConnection,
  evidencePath: string,
  select: string,
): Promise<string[]> {
  const result = await db.runAndReadAll(
    `${withEvidence(evidencePath)} ${select}`,
  );
  return result.getRows().map(([json]) => String(json));
}

function seenKey(o: V1Observation): string {
  const advisories = [...(o.advisories ?? [])].sort();
  return JSON.stringify([
    o.observedAt,
    o.subject,
    o.container,
    o.declared,
    o.drift,
    advisories,
  ]);
}

function unseenKey(b: V1BlindSpot): string {
  return JSON.stringify([
    b.observedAt,
    b.subject,
    b.container,
    b.reason,
    b.note,
  ]);
}

/** Multiset comparison: sorted, then pairwise. */
function differenceOf(
  kind: string,
  expected: readonly string[],
  actual: readonly string[],
): string | null {
  const want = [...expected].sort();
  const got = [...actual].map(normalised).sort();
  if (want.length !== got.length) {
    return `${kind} count: version 1 has ${want.length}, version 2 projects ${got.length}`;
  }
  const at = want.findIndex((row, i) => row !== got[i]);
  return at === -1
    ? null
    : `${kind} differs: expected ${want[at]}, projected ${got[at]}`;
}

/** DuckDB's JSON and `JSON.stringify` agree on everything but spacing. */
function normalised(json: string): string {
  return JSON.stringify(JSON.parse(json));
}
