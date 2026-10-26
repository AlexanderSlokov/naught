import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { DossierService } from '../findings/dossier.service.js';
import { FindingsService } from '../findings/findings.service.js';
import { ScratchLake } from './lake-fakes.js';
import { lakeRefusal } from './lake-version.js';
import { migrateV1Run } from './migrate-v1.js';
import { readManifests } from './run-manifest.js';
import { findV1Runs, runIdForStem } from './v1-lake.js';
import { V1LakeWriter } from './v1-fakes.js';

const STEM = 'deps-osv--163147-02e8a9';
const RUN_ID = '9036d08c-b4a9-46d9-a5ff-e7400e1a02ba';

describe('migrateV1Run', () => {
  let scratch: ScratchLake;
  let v1: V1LakeWriter;

  beforeEach(async () => {
    scratch = await ScratchLake.create();
    v1 = new V1LakeWriter(scratch.lake);
    await v1.observations(STEM, [
      {
        subject: 'pkg:npm/lodash@4.17.20',
        declared: '4.17.20',
        advisories: ['GHSA-b', 'GHSA-a'],
      },
      { subject: 'pkg:npm/ms@2.1.3', declared: '2.1.3', advisories: [] },
    ]);
    await v1.blindSpots(STEM, [
      {
        subject: 'this-key-has-no-version',
        reason: 'unparseable',
        note: 'lockfile key is not name@version',
      },
    ]);
  });
  afterEach(() => scratch.destroy());

  async function migrateAll() {
    const db = await scratch.lake.query();
    const runs = await findV1Runs(scratch.lake.runsDir);
    return Promise.all(runs.map((r) => migrateV1Run(db, r)));
  }

  it('rewrites a run so the read API answers as it did at version 1', async () => {
    await v1.manifest(STEM, {
      runId: RUN_ID,
      collectorId: 'deps.osv',
      axis: 'deps',
      startedAt: '2026-09-24T16:31:47.000Z',
      finishedAt: '2026-09-24T16:31:49.000Z',
      status: 'complete',
      summary: { observed: 2, expected: 3, coverage: 0.667 },
      artifacts: [],
    });
    expect(await migrateAll()).toEqual([
      { stem: STEM, status: 'rewritten', rows: 6 },
    ]);

    const findings = new FindingsService(scratch.lake);
    expect(await findings.subjects('deps')).toEqual([
      {
        subject: 'pkg:npm/lodash@4.17.20',
        container: '/repo/pnpm-lock.yaml',
        declared: '4.17.20',
        observed: 'GHSA-a,GHSA-b',
        drift: 2,
        advisories: ['GHSA-a', 'GHSA-b'],
      },
      {
        subject: 'pkg:npm/ms@2.1.3',
        container: '/repo/pnpm-lock.yaml',
        declared: '2.1.3',
        observed: 'clean',
        drift: 0,
        advisories: [],
      },
    ]);
    expect(await findings.blindSpots('deps')).toEqual([
      {
        subject: 'this-key-has-no-version',
        container: '/repo/pnpm-lock.yaml',
        reason: 'unparseable',
        note: 'lockfile key is not name@version',
      },
    ]);
    expect((await findings.latestRun('deps'))?.coverage).toBe(0.667);
  });

  it('keeps the run id, and names it from the stem when no manifest recorded one', async () => {
    await migrateAll();
    const [evidence] = await new DossierService(scratch.lake).evidenceAbout(
      'deps',
      'pkg:npm/ms@2.1.3',
    );
    expect(evidence?.runId).toBe(runIdForStem(STEM));
    expect(evidence?.extractorVersion).toBe('migrate-v1');
    const [manifest] = await readManifests(scratch.lake.runsDir, 'deps');
    expect(manifest).toMatchObject({ schemaVersion: 2, summary: null });
  });

  it('keeps the version 1 files, and stands one manifest for the run', async () => {
    await v1.manifest(STEM, {
      runId: RUN_ID,
      collectorId: 'deps.osv',
      axis: 'deps',
      startedAt: '2026-09-24T16:31:47.000Z',
      finishedAt: null,
      status: 'complete',
      summary: null,
      artifacts: [],
    });
    await migrateAll();
    expect((await readdir(v1.dir)).sort()).toEqual([
      `${STEM}.blind.parquet`,
      `${STEM}.evidence.parquet`,
      `${STEM}.obs.parquet`,
      `${STEM}.run.json`,
      `${STEM}.v2.run.json`,
    ]);
    const manifests = await readManifests(scratch.lake.runsDir, 'deps');
    expect(manifests.map((m) => m.schemaVersion)).toEqual([2]);
    expect(manifests[0]?.migratedFrom).toHaveLength(3);
  });

  it('refuses a row it cannot restate, and leaves nothing behind', async () => {
    await v1.observations('deps-osv--170000-badbad', [
      {
        subject: 'pkg:npm/x@1.0.0',
        declared: '1.0.0',
        advisories: ['GHSA-a'],
        drift: 3,
      },
    ]);
    const outcomes = await migrateAll();
    expect(
      outcomes.find((o) => o.stem === 'deps-osv--170000-badbad'),
    ).toMatchObject({
      status: 'refused',
      reason: expect.stringMatching(/drift 3 with 1 advisory id/),
    });
    expect((await readdir(v1.dir)).filter((n) => n.includes('badbad'))).toEqual(
      ['deps-osv--170000-badbad.obs.parquet'],
    );
  });

  it('is skipped once migrated, so running the stop twice writes nothing new', async () => {
    await migrateAll();
    const runs = await findV1Runs(scratch.lake.runsDir);
    expect(runs.map((r) => r.migrated)).toEqual([true]);
  });
});

describe('lakeRefusal', () => {
  let scratch: ScratchLake;
  beforeEach(async () => (scratch = await ScratchLake.create()));
  afterEach(() => scratch.destroy());

  it('serves an empty lake', async () => {
    expect(await lakeRefusal(scratch.lake.runsDir)).toBeNull();
  });

  it('refuses unmigrated version 1 runs and names the command, then serves once migrated', async () => {
    const v1 = new V1LakeWriter(scratch.lake);
    await v1.observations(STEM, [
      { subject: 'pkg:npm/ms@2.1.3', declared: '2.1.3', advisories: [] },
    ]);
    expect(await lakeRefusal(scratch.lake.runsDir)).toMatch(
      /1 schema version 1 run.*make migrate-lake/,
    );

    const [run] = await findV1Runs(scratch.lake.runsDir);
    if (run) await migrateV1Run(await scratch.lake.query(), run);
    expect(await lakeRefusal(scratch.lake.runsDir)).toBeNull();
  });

  it('refuses a lake written ahead of this build, naming both versions', async () => {
    await new V1LakeWriter(scratch.lake).manifest('future--000000-aaaaaa', {
      runId: RUN_ID,
      collectorId: 'deps.osv',
      axis: 'deps',
      startedAt: '2027-01-01T00:00:00.000Z',
      finishedAt: null,
      status: 'complete',
      summary: null,
      artifacts: [],
      schemaVersion: 3,
    });
    expect(await lakeRefusal(scratch.lake.runsDir)).toMatch(
      /schema version 3; this build reads up to version 2/,
    );
  });
});

describe('runIdForStem', () => {
  it('is a stable version 5 UUID', () => {
    const id = runIdForStem(STEM);
    expect(id).toBe(runIdForStem(STEM));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(runIdForStem('other')).not.toBe(id);
  });
});
