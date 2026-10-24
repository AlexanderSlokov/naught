import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CollectionRun } from '@naught/shared';

/** Manifests sit beside the Parquet files they describe, one per run. */
export const MANIFEST_SUFFIX = '.run.json';

/**
 * The manifest of one collection run, written next to its Parquet files.
 *
 * Observations record what was seen. They cannot record what a collector
 * expected to see, and so they cannot answer "at what coverage" — a lake of
 * 313 clean rows looks identical whether the collector read 313 packages or
 * read 313 of 400 and gave up. Deriving the denominator from the rows would
 * put the count at the mercy of the same collector that failed to count, which
 * is exactly the failure `RunSummary.expected` is nullable to prevent.
 *
 * So the run states its own summary, once, and the reader reads it.
 */
export async function writeManifest(
  dir: string,
  stem: string,
  run: CollectionRun,
): Promise<string> {
  const path = join(dir, `${stem}${MANIFEST_SUFFIX}`);
  await writeFile(path, `${JSON.stringify(CollectionRun.parse(run), null, 2)}\n`);
  return path;
}

/**
 * Every manifest under one axis, newest first.
 *
 * @example
 * const [latest] = await readManifests('/var/lib/naught/runs', 'deps');
 * latest?.summary?.coverage; // 1, or null if the collector could not count
 */
export async function readManifests(
  runsDir: string,
  axis: string,
): Promise<CollectionRun[]> {
  const axisDir = join(runsDir, `axis=${axis}`);
  const paths = await manifestPaths(axisDir);
  const runs = await Promise.all(paths.map(parseManifest));
  return runs
    .filter((run): run is CollectionRun => run !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function manifestPaths(axisDir: string): Promise<string[]> {
  try {
    const entries = await readdir(axisDir, { recursive: true });
    return entries
      .filter((name) => name.endsWith(MANIFEST_SUFFIX))
      .map((name) => join(axisDir, name));
  } catch {
    return [];
  }
}

/**
 * A manifest that cannot be parsed is skipped, not thrown on. One unreadable
 * run must not hide every other run in the lake.
 */
async function parseManifest(path: string): Promise<CollectionRun | null> {
  try {
    return CollectionRun.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}
