import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Claim } from '@naught/shared';
import { DossierService } from '../findings/dossier.service.js';
import { ClaimFactory, ScratchLake } from './lake-fakes.js';

const RUN = '22222222-2222-4222-8222-000000000001';
const T = '2026-10-26T10:00:00.000Z';
const SOON = new Date('2026-10-26T12:00:00.000Z');
const at = new ClaimFactory(T);

describe('assessments (assess-v0)', () => {
  let scratch: ScratchLake;
  let dossier: DossierService;

  beforeEach(async () => {
    scratch = await ScratchLake.create();
    dossier = new DossierService(scratch.lake);
  });
  afterEach(() => scratch.destroy());

  async function judge(claims: Claim[], asOf = SOON) {
    await scratch.seal(RUN, T, claims);
    return dossier.assessments('deps', asOf);
  }

  it('establishes a subject OSV answered for, naming the rows it rests on', async () => {
    const [row] = await judge([
      at.pinned('pkg:npm/a@1.0.0', '1.0.0'),
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x'),
    ]);
    expect(row).toMatchObject({
      state: 'established',
      value: { listed: 1, advisories: ['GHSA-x'] },
      bestReliability: 'A',
      bestCredibility: 2,
    });
    expect(row?.supportingIds).toHaveLength(1);
    expect(row?.freshnessSeconds).toBe(7200);
  });

  it('reads a subject seen only as not assessable as not_assessable, never clean', async () => {
    const [row] = await judge([
      at.pinned('pkg:npm/a@1.0.0', '1.0.0'),
      at.unanswered('pkg:npm/a@1.0.0'),
    ]);
    expect(row).toMatchObject({
      state: 'not_assessable',
      bestReliability: null,
      bestCredibility: null,
    });
    expect(row?.supportingIds).toHaveLength(1);
  });

  it('reads a seen subject as stale once its TTL has passed', async () => {
    const [row] = await judge(
      [at.clean('pkg:npm/a@1.0.0')],
      new Date('2026-10-28T00:00:00.000Z'),
    );
    expect(row?.state).toBe('stale');
  });

  it('keeps a listing and a contradicting absence apart, as conflicting', async () => {
    const [row] = await judge([
      at.listed('pkg:npm/a@1.0.0', 'CVE-2026-1'),
      at.clean('pkg:npm/a@1.0.0', 'nvd'),
    ]);
    expect(row?.state).toBe('conflicting');
    expect(row?.conflictingIds).toHaveLength(1);
  });

  /** ADR 0008: confirmed means two independent origins, not two sources. */
  it('confirms an advisory asserted by two independent origins', async () => {
    const [row] = await judge([
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x'),
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x', 'nvd'),
    ]);
    expect(row?.bestCredibility).toBe(1);
  });

  it('does not confirm OSV repeating GHSA, which is one origin', async () => {
    const [row] = await judge([
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x'),
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x', 'ghsa'),
    ]);
    expect(row?.bestCredibility).toBe(2);
  });
});

describe('DossierService.evidenceAbout', () => {
  it('returns every row about one subject, parsed as Evidence', async () => {
    const scratch = await ScratchLake.create();
    await scratch.seal(RUN, T, [
      at.pinned('pkg:npm/a@1.0.0', '1.0.0'),
      at.listed('pkg:npm/a@1.0.0', 'GHSA-x'),
      at.clean('pkg:npm/b@1.0.0'),
    ]);
    const rows = await new DossierService(scratch.lake).evidenceAbout(
      'deps',
      'pkg:npm/a@1.0.0',
    );
    expect(rows.map((r) => [r.claimType, r.observedAt])).toEqual([
      ['advisory', T],
      ['contains', T],
    ]);
    await scratch.destroy();
  });
});
