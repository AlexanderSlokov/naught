import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CollectionRun,
  LAKE_SCHEMA_VERSION,
  schemaVersionOf,
} from '@naught/shared';
import { MANIFEST_SUFFIX, parseManifest } from './run-manifest.js';
import { findV1Runs } from './v1-lake.js';

/**
 * Why this build must not serve the lake at `runsDir`, or null if it may.
 *
 * ADR 0005: the API refuses rather than improvises. A lake holding version 1
 * runs that were never rewritten would read as empty history — every reader
 * globs evidence files only — and a lake written by a newer build would be
 * read with today's assumptions about tomorrow's columns. Both are refused,
 * and the refusal names what to do.
 *
 * @example
 * const refusal = await lakeRefusal(lake.runsDir);
 * if (refusal) throw new Error(refusal);
 */
export async function lakeRefusal(runsDir: string): Promise<string | null> {
  return (await newerThanThisBuild(runsDir)) ?? (await unmigrated(runsDir));
}

async function unmigrated(runsDir: string): Promise<string | null> {
  const pending = (await findV1Runs(runsDir)).filter((r) => !r.migrated);
  const [first] = pending;
  if (!first) return null;
  return (
    `the lake at ${runsDir} holds ${pending.length} schema version 1 run(s) ` +
    `not yet rewritten, e.g. ${join(first.dir, first.stem)}. This build reads ` +
    `schema version ${LAKE_SCHEMA_VERSION} and is an upgrade stop: run ` +
    '`make migrate-lake` (under compose: `docker compose run --rm api node ' +
    'apps/api/dist/lake/migrate-lake.js`), ' +
    'then start again. Version 1 files are kept.'
  );
}

async function newerThanThisBuild(runsDir: string): Promise<string | null> {
  const runs = await allManifests(runsDir);
  const ahead = runs.find((r) => schemaVersionOf(r) > LAKE_SCHEMA_VERSION);
  if (!ahead) return null;
  return (
    `run ${ahead.runId} in ${runsDir} was written at schema version ` +
    `${schemaVersionOf(ahead)}; this build reads up to version ` +
    `${LAKE_SCHEMA_VERSION}. Install a release that reads version ` +
    `${schemaVersionOf(ahead)} rather than downgrading over it.`
  );
}

async function allManifests(runsDir: string): Promise<CollectionRun[]> {
  let names: string[];
  try {
    names = await readdir(runsDir, { recursive: true });
  } catch {
    return [];
  }
  const paths = names.filter((n) => n.endsWith(MANIFEST_SUFFIX));
  const runs = await Promise.all(
    paths.map((n) => parseManifest(join(runsDir, n))),
  );
  return runs.filter((r): r is CollectionRun => r !== null);
}
