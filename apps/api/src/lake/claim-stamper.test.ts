import { describe, expect, it } from 'vitest';
import { evidenceIdOf, stampClaim } from './claim-stamper.js';
import { ClaimFactory } from './lake-fakes.js';

const RUN = {
  runId: '55555555-5555-4555-8555-555555555555',
  axis: 'deps',
  collectorId: 'deps.osv',
  collectorVersion: '2.0.0',
} as const;
const at = new ClaimFactory('2026-10-26T16:17:21.924Z');

describe('stampClaim', () => {
  it('grades, dates and attributes a claim in one place', () => {
    const row = stampClaim(
      at.listed('pkg:npm/lodash@4.17.20', 'GHSA-35jh-r3h4-6jhm'),
      RUN,
    );
    expect(row).toMatchObject({
      runId: RUN.runId,
      reliability: 'A',
      credibility: 2,
      originSourceId: 'ghsa',
      gradingVersion: 'grading-v0',
      staleAfter: '2026-10-27T16:17:21.924Z',
      extractorVersion: '2.0.0',
    });
  });

  it('grades a claim that could not be assessed as cannot be judged', () => {
    expect(stampClaim(at.unanswered('pkg:npm/ms@2.1.3'), RUN).credibility).toBe(
      6,
    );
  });
});

describe('evidenceIdOf', () => {
  it('is deterministic, so a rewrite of the same run names rows the same', () => {
    const claim = at.clean('pkg:npm/ms@2.1.3');
    expect(evidenceIdOf(RUN.runId, claim)).toBe(
      evidenceIdOf(RUN.runId, { ...claim }),
    );
  });

  it('ignores the key order of a claim value', () => {
    const a = { ...at.clean('pkg:npm/ms@2.1.3'), claimValue: { a: 1, b: 2 } };
    const b = { ...a, claimValue: { b: 2, a: 1 } };
    expect(evidenceIdOf(RUN.runId, a)).toBe(evidenceIdOf(RUN.runId, b));
  });

  it('tells "no advisory" from "no answer" about the same subject', () => {
    const subject = 'pkg:npm/ms@2.1.3';
    expect(evidenceIdOf(RUN.runId, at.clean(subject))).not.toBe(
      evidenceIdOf(RUN.runId, at.unanswered(subject)),
    );
  });
});
