/**
 * The Parquet schema, declared once and never inferred.
 *
 * Inference is what a lake dies of. `read_json_auto` will type a column from
 * whatever happened to be in one file — `drift: 0` becomes BIGINT today and
 * DOUBLE tomorrow — and two files that disagree cannot be read together. The
 * data format is the durable contract; the code around it is disposable, and
 * a contract is not something you infer at write time.
 *
 * Adding a column is allowed and readers union by name. Changing the type of
 * an existing column is not, and needs an ADR.
 */
export const OBSERVATION_COLUMNS = {
  observedAt: 'TIMESTAMP',
  collectorId: 'VARCHAR',
  axis: 'VARCHAR',
  subject: 'VARCHAR',
  container: 'VARCHAR',
  declared: 'VARCHAR',
  observed: 'VARCHAR',
  drift: 'DOUBLE',
  detail: 'JSON',
} as const;

export const BLIND_SPOT_COLUMNS = {
  observedAt: 'TIMESTAMP',
  collectorId: 'VARCHAR',
  axis: 'VARCHAR',
  subject: 'VARCHAR',
  container: 'VARCHAR',
  reason: 'VARCHAR',
  note: 'VARCHAR',
} as const;

/** Renders a column map as a DuckDB `columns = {...}` struct literal. */
export function columnsClause(columns: Record<string, string>): string {
  const entries = Object.entries(columns)
    .map(([name, type]) => `'${name}': '${type}'`)
    .join(', ');
  return `{${entries}}`;
}
