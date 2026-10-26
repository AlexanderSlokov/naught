// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import type { DuckDBConnection } from '@duckdb/node-api';
import { z } from 'zod';
import { isoSql } from './evidence-views.js';

/**
 * The rows of one version 1 run, read for the rewriter and for nothing else.
 * Allowed to call `read_parquet` because no version 2 reader may see these
 * files (ADR 0007); see `evidence-views.guard.test.ts`.
 */

/** A version 1 observation, with its advisory ids unpacked from `detail`. */
export const V1Observation = z.object({
  observedAt: z.iso.datetime(),
  collectorId: z.string().min(1),
  axis: z.string().min(1),
  subject: z.string().min(1),
  container: z.string().nullable(),
  declared: z.string().nullable(),
  drift: z.number().nullable(),
  advisories: z.array(z.string()).nullable(),
});
export type V1Observation = z.infer<typeof V1Observation>;

/** A version 1 blind spot. */
export const V1BlindSpot = z.object({
  observedAt: z.iso.datetime(),
  collectorId: z.string().min(1),
  axis: z.string().min(1),
  subject: z.string().min(1),
  container: z.string().nullable(),
  reason: z.string().min(1),
  note: z.string().nullable(),
});
export type V1BlindSpot = z.infer<typeof V1BlindSpot>;

/** Every observation in one `.obs.parquet` file. */
export async function readV1Observations(
  db: DuckDBConnection,
  path: string,
): Promise<V1Observation[]> {
  return jsonRows(
    db,
    V1Observation,
    `SELECT CAST(to_json({
      'observedAt': ${isoSql('observedAt')}, 'collectorId': collectorId,
      'axis': axis, 'subject': subject, 'container': container,
      'declared': declared, 'drift': drift,
      'advisories': json_extract(detail, '$.advisories')
    }) AS VARCHAR) FROM read_parquet('${path}')`,
  );
}

/** Every blind spot in one `.blind.parquet` file. */
export async function readV1BlindSpots(
  db: DuckDBConnection,
  path: string,
): Promise<V1BlindSpot[]> {
  return jsonRows(
    db,
    V1BlindSpot,
    `SELECT CAST(to_json({
      'observedAt': ${isoSql('observedAt')}, 'collectorId': collectorId,
      'axis': axis, 'subject': subject, 'container': container,
      'reason': reason, 'note': note
    }) AS VARCHAR) FROM read_parquet('${path}')`,
  );
}

/** Parsed, not cast: a version 1 file is old evidence, and old is not trusted. */
async function jsonRows<T>(
  db: DuckDBConnection,
  schema: z.ZodType<T>,
  sql: string,
): Promise<T[]> {
  const result = await db.runAndReadAll(sql);
  return result
    .getRows()
    .map(([json]) => schema.parse(JSON.parse(String(json))));
}
