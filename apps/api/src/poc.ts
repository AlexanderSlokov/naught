// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
/**
 * The acceptance test from ARCHITECTURE §9, as one command.
 *
 * Naught is pointed at Naught's own lockfile. If it cannot find the rot in
 * itself, it does not work. The run then drops the derived cache, rebuilds it
 * from the Parquet lake, and checks that both give the same answers — because
 * "the cache is droppable" is a claim, and an untested claim is a wish.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StandaloneCollectionModule } from './standalone-collection.module.js';
import { LakeService } from './lake/lake.service.js';
import { CollectorRegistry } from './collectors/collector.registry.js';
import { ParquetRunSink } from './lake/parquet-run-sink.js';
import { deltaSinceLastRun, describe } from './lake/delta.js';
import { evidenceSource, withEvidence } from './lake/evidence-views.js';
import { lakeRefusal } from './lake/lake-version.js';

const lockfile = resolve(process.argv[2] ?? './pnpm-lock.yaml');

function rule(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m\n${'─'.repeat(64)}`);
}

// Not `AppModule`: that one owns a queue, and this command must work on a
// machine with no Redis (ARCHITECTURE §5).
const app = await NestFactory.createApplicationContext(
  StandaloneCollectionModule,
  {
    logger: ['warn', 'error'],
  },
);
const lake = app.get(LakeService);
const registry = app.get(CollectorRegistry);

const collector = registry.get('deps.osv');
if (!collector) throw new Error('deps.osv is not registered');

await lake.ensureDirs();
// The same refusal as the API's: a version 2 run written into an unmigrated
// version 1 lake would report itself as the first run ever made.
const refusal = await lakeRefusal(lake.runsDir);
if (refusal !== null) throw new Error(`refusing to collect: ${refusal}`);

rule('1. Collect — Naught, pointed at Naught');
console.log(`lockfile : ${lockfile}`);
const startedAt = new Date();
const sink = new ParquetRunSink(
  lake,
  {
    runId: randomUUID(),
    axis: collector.axis,
    collectorId: collector.id,
    collectorVersion: collector.version,
  },
  startedAt,
);
// Recorded in the manifest so the interface can repeat this run without an
// operator retyping the path. A run that does not say what it was pointed at
// cannot be asked for again.
const scope = { targets: [lockfile], since: null };
const summary = await collector.collect(scope, sink);
const sealed = await sink.seal(summary, scope);
const glob = lake.globFor(collector.axis);

console.log(`observed : ${summary.observed}`);
console.log(`expected : ${summary.expected ?? 'unknown'}`);
console.log(
  `coverage : ${summary.coverage === null ? 'unknown' : `${(summary.coverage * 100).toFixed(1)}%`}`,
);
console.log(
  `evidence : ${sealed.rows} row(s), ${sealed.unseen} not assessable`,
);
for (const f of sealed.files) console.log(`wrote    : ${f}`);

rule('2. Query the lake — Parquet is the truth');
const db = await lake.query();
// The lake holds every run ever made; the verdict is about now. §9's first
// question is "what is this made of, right now", so this is scoped to the
// latest run. History is what section 3 is for.
const findings = await db.runAndReadAll(`
  ${withEvidence(glob)}
  SELECT subject, observed AS advisories
  FROM subject_drift
  WHERE drift > 0 AND runId = (SELECT runId FROM latest_run)
  ORDER BY drift DESC, subject
`);
const rows = findings.getRows();

if (rows.length === 0) {
  const pct =
    summary.coverage === null
      ? 'unknown'
      : `${(summary.coverage * 100).toFixed(1)}%`;
  // "Nothing found." on its own is a reassurance, and Naught does not give
  // those. The coverage travels with the verdict.
  console.log(`Nothing found, at ${pct} coverage.`);
} else {
  console.log(`${rows.length} package(s) carrying known advisories:\n`);
  for (const [subject, advisories] of rows) {
    console.log(`  ${String(subject).padEnd(46)} ${String(advisories)}`);
  }
}

// "This run had nothing it could not see" is a legitimate result, and is
// said in words rather than as an empty list.
if (sealed.unseen === 0) {
  console.log('\nNo blind spots on this run.');
} else {
  const blind = await db.runAndReadAll(`
    ${withEvidence(glob)}
    SELECT notAssessableReason, count(*) AS n
    FROM evidence_unseen
    WHERE runId = (SELECT runId FROM latest_run)
    GROUP BY notAssessableReason ORDER BY n DESC
  `);
  console.log(
    `\nBlind spots: ${blind
      .getRows()
      .map(([r, n]) => `${String(r)}=${String(n)}`)
      .join(', ')}`,
  );
}

rule('3. What changed since the previous run');
const delta = await deltaSinceLastRun(db, glob);
console.log(`runs in lake : ${delta.runs}`);

if (delta.previousAt === null) {
  console.log('First run for this axis. Nothing to compare against yet.');
} else {
  console.log(`previous run : ${delta.previousAt}`);
  if (delta.changes.length === 0) {
    // §7: what was already reported is not reported again. The standing
    // total goes with it, so silence can never be read as "all clear".
    console.log(
      `\nNothing changed since the previous run. ` +
        `${delta.openFindings} finding(s) still open.`,
    );
  } else {
    console.log(`\n${delta.changes.length} change(s):\n`);
    for (const c of delta.changes) console.log(`  ${describe(c)}`);
    console.log(`\n${delta.openFindings} finding(s) open in total.`);
  }
}

rule('4. Throw the cache away and rebuild it');
const cachePath = resolve(lake.dataDir, 'naught.duckdb');
// Every row ever written, on purpose: the cache must reproduce the whole
// lake, not just the latest slice of it.
const fromLake = await db.runAndReadAll(`
  ${withEvidence(glob)}
  SELECT (SELECT count(*) FROM evidence), (SELECT sum(drift) FROM subject_drift)
`);

const { rm } = await import('node:fs/promises');
await rm(cachePath, { force: true });
await rm(`${cachePath}.wal`, { force: true });
console.log(`dropped  : ${cachePath}`);

const cacheInstance = await DuckDBInstance.create(cachePath);
const cache = await cacheInstance.connect();
await cache.run(
  `CREATE TABLE evidence AS SELECT * FROM ${evidenceSource(glob)}`,
);
await cache.run(
  `CREATE TABLE subject_drift AS ${withEvidence(glob)} SELECT * FROM subject_drift`,
);
const fromCache = await cache.runAndReadAll(
  'SELECT (SELECT count(*) FROM evidence), (SELECT sum(drift) FROM subject_drift)',
);

const a = JSON.stringify(fromLake.getRows(), (_k, v) =>
  typeof v === 'bigint' ? v.toString() : v,
);
const b = JSON.stringify(fromCache.getRows(), (_k, v) =>
  typeof v === 'bigint' ? v.toString() : v,
);
console.log(`rebuilt  : ${cachePath}`);
console.log(`lake     : ${a}`);
console.log(`cache    : ${b}`);
console.log(
  a === b ? '\n\x1b[32mIdentical.\x1b[0m' : '\n\x1b[31mDIVERGED.\x1b[0m',
);

cache.closeSync();
cacheInstance.closeSync();
await app.close();

if (a !== b) process.exitCode = 1;
new Logger('Naught').log('done');
