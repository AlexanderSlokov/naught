// noinspection SqlNoDataSourceInspection,SqlResolve
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withEvidence } from './evidence-views.js';
import { ClaimFactory, ScratchLake } from './lake-fakes.js';

const RUN_1 = '11111111-1111-4111-8111-000000000001';
const RUN_2 = '11111111-1111-4111-8111-000000000002';
const T1 = '2026-10-26T10:00:00.000Z';
const T2 = '2026-10-26T11:00:00.000Z';

describe('withEvidence', () => {
  let scratch: ScratchLake;

  beforeEach(async () => {
    scratch = await ScratchLake.create();
    const at = new ClaimFactory(T1);
    await scratch.seal(RUN_1, T1, [
      at.pinned('pkg:npm/lodash@4.17.20', '4.17.20'),
      at.listed('pkg:npm/lodash@4.17.20', 'GHSA-zzzz'),
      at.listed('pkg:npm/lodash@4.17.20', 'GHSA-aaaa'),
      at.pinned('pkg:npm/ms@2.1.3', '2.1.3'),
      at.clean('pkg:npm/ms@2.1.3'),
      at.pinned('pkg:npm/debug@4.4.2', '4.4.2'),
      at.unanswered('pkg:npm/debug@4.4.2'),
    ]);
    const later = new ClaimFactory(T2);
    await scratch.seal(RUN_2, T2, [
      later.pinned('pkg:npm/ms@2.1.3', '2.1.3'),
      later.clean('pkg:npm/ms@2.1.3'),
    ]);
  });

  afterEach(() => scratch.destroy());

  async function rows(select: string): Promise<unknown[][]> {
    const db = await scratch.lake.query();
    const result = await db.runAndReadAll(
      `${withEvidence(scratch.lake.globFor('deps'))} ${select}`,
    );
    // BIGINT arrives as bigint; the assertions compare plain numbers.
    return result
      .getRows()
      .map((r) => r.map((v) => (typeof v === 'bigint' ? Number(v) : v)));
  }

  it('derives the version 1 row: drift counted, advisory ids sorted', async () => {
    expect(
      await rows(
        `SELECT subject, declared, observed, drift FROM subject_drift WHERE runId = '${RUN_1}' ORDER BY subject`,
      ),
    ).toEqual([
      ['pkg:npm/lodash@4.17.20', '4.17.20', 'GHSA-aaaa,GHSA-zzzz', 2],
      ['pkg:npm/ms@2.1.3', '2.1.3', 'clean', 0],
    ]);
  });

  it('keeps a package OSV did not answer for out of the seen list, and in the unseen one', async () => {
    expect(
      await rows(
        `SELECT subject FROM subject_drift WHERE subject LIKE '%debug%'`,
      ),
    ).toEqual([]);
    expect(
      await rows(`SELECT subject, notAssessableReason FROM evidence_unseen`),
    ).toEqual([['pkg:npm/debug@4.4.2', 'unreachable-upstream']]);
  });

  it('orders runs by when they looked, newest first', async () => {
    expect(await rows('SELECT runId FROM latest_run')).toEqual([[RUN_2]]);
    expect(await rows('SELECT runId FROM previous_run')).toEqual([[RUN_1]]);
  });
});
