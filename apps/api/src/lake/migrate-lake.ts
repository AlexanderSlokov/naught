/**
 * `make migrate-lake` — the upgrade stop into schema version 2 (ADR 0005).
 *
 * Rewrites every version 1 run under `NAUGHT_DATA_DIR/runs` as version 2,
 * beside the original, and verifies each before marking it migrated. Version 1
 * files are never deleted here. Safe to run twice: a migrated run is skipped.
 *
 * Exits non-zero if any run was refused, naming it and why.
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { join, resolve } from 'node:path';
import { migrateV1Run } from './migrate-v1.js';
import { findV1Runs } from './v1-lake.js';

// Resolved, not relative. Under a workspace runner the cwd is whichever
// package is executing, and a lake that moves depending on who asked is not
// a lake.
const runsDir = join(
  resolve(process.env['NAUGHT_DATA_DIR'] ?? './data'),
  'runs',
);
const pending = (await findV1Runs(runsDir)).filter((r) => !r.migrated);
console.log(`lake      : ${runsDir}`);
console.log(`to rewrite: ${pending.length} schema version 1 run(s)`);

const instance = await DuckDBInstance.create(':memory:');
const db = await instance.connect();
let refusals = 0;
for (const run of pending) {
  const outcome = await migrateV1Run(db, run);
  if (outcome.status === 'rewritten') {
    console.log(`rewritten : ${run.stem} (${outcome.rows} evidence row(s))`);
  } else {
    refusals += 1;
    console.log(`REFUSED   : ${run.stem}: ${outcome.reason}`);
  }
}
db.closeSync();
instance.closeSync();
console.log(
  refusals === 0
    ? 'done; version 1 files were kept in place'
    : `${refusals} run(s) refused`,
);
if (refusals > 0) process.exitCode = 1;
