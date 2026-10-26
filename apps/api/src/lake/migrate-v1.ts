import { rm } from 'node:fs/promises';
import type { DuckDBConnection } from '@duckdb/node-api';
import {
  CollectionRun,
  GRADING_VERSION,
  LAKE_SCHEMA_VERSION,
  type Claim,
} from '@naught/shared';
import { stampClaim, type RunIdentity } from './claim-stamper.js';
import { EvidenceFile, exists } from './evidence-file.js';
import { parseManifest, writeManifest } from './run-manifest.js';
import { claimOfV1BlindSpot, claimsOfV1Observation } from './v1-claims.js';
import { runIdForStem, type V1Run } from './v1-lake.js';
import {
  readV1BlindSpots,
  readV1Observations,
  type V1BlindSpot,
  type V1Observation,
} from './v1-rows.js';
import { mismatchOf } from './v1-verify.js';

/** Stamped as `extractorVersion` on every row the rewriter writes. */
export const MIGRATOR_VERSION = 'migrate-v1';

/** What happened to one version 1 run. */
export type MigrationOutcome =
  | { stem: string; status: 'rewritten'; rows: number }
  | { stem: string; status: 'refused'; reason: string };

interface V1Contents {
  observations: V1Observation[];
  blindSpots: V1BlindSpot[];
  manifest: CollectionRun | null;
}

/**
 * Rewrites one version 1 run as version 2, beside the original (ADR 0005,
 * 0007). The evidence file is written, then verified against the original
 * rows, and only then is `{stem}.v2.run.json` written — the marker that the
 * run is migrated. A run that fails verification has its new file removed and
 * its version 1 files left exactly as they were.
 *
 * @example
 * for (const run of await findV1Runs(runsDir)) await migrateV1Run(db, run);
 */
export async function migrateV1Run(
  db: DuckDBConnection,
  run: V1Run,
): Promise<MigrationOutcome> {
  const file = new EvidenceFile(run.dir, run.stem);
  if (await exists(file.target)) {
    return refused(
      run,
      `${file.target} exists without ${run.stem}.v2.run.json; remove it by hand after checking it`,
    );
  }
  try {
    const contents = await readContents(db, run);
    return await rewrite(db, run, file, contents);
  } catch (err) {
    // The target did not exist when this attempt began, so whatever is there
    // now is this attempt's unverified output, and must not outlive it.
    await file.discard();
    await rm(file.target, { force: true });
    return refused(run, err instanceof Error ? err.message : String(err));
  }
}

async function readContents(
  db: DuckDBConnection,
  run: V1Run,
): Promise<V1Contents> {
  return {
    observations: run.obs ? await readV1Observations(db, run.obs) : [],
    blindSpots: run.blind ? await readV1BlindSpots(db, run.blind) : [],
    manifest: run.manifest ? await parseManifest(run.manifest) : null,
  };
}

async function rewrite(
  db: DuckDBConnection,
  run: V1Run,
  file: EvidenceFile,
  contents: V1Contents,
): Promise<MigrationOutcome> {
  const identity = identityOf(run, contents);
  for (const claim of claimsOf(contents))
    await file.append(stampClaim(claim, identity));
  const written = await file.seal(db);
  if (written === null) return refused(run, 'the run holds no rows to rewrite');
  const problem = await mismatchOf(
    db,
    written,
    contents.observations,
    contents.blindSpots,
  );
  if (problem !== null) {
    await rm(written, { force: true });
    return refused(
      run,
      `verification failed, version 2 file removed: ${problem}`,
    );
  }
  await writeManifest(
    run.dir,
    `${run.stem}.v2`,
    manifestOf(run, contents, identity, written),
  );
  return { stem: run.stem, status: 'rewritten', rows: file.rowCount };
}

function claimsOf({ observations, blindSpots }: V1Contents): Claim[] {
  return [
    ...observations.flatMap(claimsOfV1Observation),
    ...blindSpots.map(claimOfV1BlindSpot),
  ];
}

function identityOf(
  run: V1Run,
  { observations, blindSpots, manifest }: V1Contents,
): RunIdentity {
  const first = observations[0] ?? blindSpots[0];
  return {
    runId: manifest?.runId ?? runIdForStem(run.stem),
    axis: manifest?.axis ?? 'deps',
    collectorId: manifest?.collectorId ?? first?.collectorId ?? 'deps.osv',
    collectorVersion: MIGRATOR_VERSION,
  };
}

/**
 * The version 1 manifest, restated at version 2. A run that never had a
 * manifest gets one now with `summary: null` — its coverage was never
 * recorded, and the rewriter does not invent it.
 */
function manifestOf(
  run: V1Run,
  { observations, blindSpots, manifest }: V1Contents,
  identity: RunIdentity,
  written: string,
): CollectionRun {
  const startedAt = [...observations, ...blindSpots]
    .map((r) => r.observedAt)
    .sort()[0];
  const sources = [run.obs, run.blind, run.manifest].filter(
    (p): p is string => p !== null,
  );
  return CollectionRun.parse({
    runId: identity.runId,
    collectorId: identity.collectorId,
    axis: identity.axis,
    startedAt: manifest?.startedAt ?? startedAt,
    finishedAt: manifest?.finishedAt ?? null,
    status: manifest?.status ?? 'complete',
    summary: manifest?.summary ?? null,
    scope: manifest?.scope ?? null,
    artifacts: [written],
    schemaVersion: LAKE_SCHEMA_VERSION,
    collectorVersion: MIGRATOR_VERSION,
    gradingVersion: GRADING_VERSION,
    migratedFrom: sources,
  });
}

function refused(run: V1Run, reason: string): MigrationOutcome {
  return { stem: run.stem, status: 'refused', reason };
}
