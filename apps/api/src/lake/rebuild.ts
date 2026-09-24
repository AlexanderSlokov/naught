// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
/**
 * `pnpm rebuild-cache` — drop the derived cache and build it again from the
 * lake.
 *
 * This exists as one command, exercised in CI, because constraint #2 says the
 * cache is droppable and an untested claim of droppability is just a wish.
 * It never writes to `runs/`.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Resolved, not relative. Under a workspace runner the cwd is whichever
// package is executing, and a lake that moves depending on who asked is not
// a lake.
const dataDir = resolve(process.env['NAUGHT_DATA_DIR'] ?? './data');
const cache = join(dataDir, 'naught.duckdb');
const runs = join(dataDir, 'runs');

await mkdir(runs, { recursive: true });
await rm(cache, { force: true });
await rm(`${cache}.wal`, { force: true });

const instance = await DuckDBInstance.create(cache);
const db = await instance.connect();

let observations = 0;
try {
  await db.run(`
    CREATE TABLE observations AS
    SELECT * FROM read_parquet('${runs}/**/*.obs.parquet', union_by_name = true, hive_partitioning = true)
  `);
  await db.run(`
    CREATE TABLE blind_spots AS
    SELECT * FROM read_parquet('${runs}/**/*.blind.parquet', union_by_name = true, hive_partitioning = true)
  `);
  const r = await db.runAndReadAll('SELECT count(*) FROM observations');
  observations = Number(r.getRows()[0]?.[0] ?? 0);
} catch {
  // An empty lake is a legitimate state, not a failure: nothing has been
  // collected yet. It is reported as zero coverage, never as a clean run.
  console.warn('lake is empty; cache built with no observations');
}

db.closeSync();
instance.closeSync();
console.log(`rebuilt ${cache} from ${observations} observation(s)`);
