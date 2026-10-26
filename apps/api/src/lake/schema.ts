/**
 * The Parquet schema, declared once and never inferred.
 *
 * Inference is what a lake dies of. `read_json_auto` will type a column from
 * whatever happened to be in one file — `credibility: 2` becomes BIGINT today
 * and DOUBLE tomorrow — and two files that disagree cannot be read together.
 * The data format is the durable contract; the code around it is disposable,
 * and a contract is not something you infer at write time.
 *
 * Adding a column is allowed and readers union by name. Changing the type of
 * an existing column is not, and is a new schema version (ADR 0005).
 *
 * This is schema version 2: one evidence row per claim (ADR 0007). Version 1,
 * observations and blind spots in two files, is read only by the rewriter in
 * `migrate-v1.ts`. Column meanings are in `docs/references/lake-schema.md`.
 */
export const EVIDENCE_COLUMNS = {
  evidenceId: 'VARCHAR',
  runId: 'VARCHAR',
  observedAt: 'TIMESTAMP',
  collectorId: 'VARCHAR',
  axis: 'VARCHAR',
  subject: 'VARCHAR',
  subjectKind: 'VARCHAR',
  objectId: 'VARCHAR',
  container: 'VARCHAR',
  claimType: 'VARCHAR',
  claimValue: 'JSON',
  observationKind: 'VARCHAR',
  notAssessableReason: 'VARCHAR',
  note: 'VARCHAR',
  sourceId: 'VARCHAR',
  originSourceId: 'VARCHAR',
  reliability: 'VARCHAR',
  credibility: 'TINYINT',
  gradingVersion: 'VARCHAR',
  sourceAssertedAt: 'TIMESTAMP',
  validFrom: 'TIMESTAMP',
  validTo: 'TIMESTAMP',
  staleAfter: 'TIMESTAMP',
  derivedFrom: 'VARCHAR[]',
  extractorVersion: 'VARCHAR',
  modelVersion: 'VARCHAR',
  sensitivity: 'VARCHAR',
  supersedes: 'VARCHAR',
} as const;

/** The one file kind a version 2 run writes: `{stem}.evidence.parquet`. */
export const EVIDENCE_SUFFIX = '.evidence.parquet';

/** Renders a column map as a DuckDB `columns = {...}` struct literal. */
export function columnsClause(columns: Record<string, string>): string {
  const entries = Object.entries(columns)
    .map(([name, type]) => `'${name}': '${type}'`)
    .join(', ');
  return `{${entries}}`;
}
