import { describe, expect, it } from 'vitest';
import type { AssessmentRow } from '@naught/shared';
import { freshnessOf, isStale, staleCaveat } from './freshness';

function row(
  state: AssessmentRow['state'],
  freshnessSeconds: number,
  staleAfter: string,
): AssessmentRow {
  return {
    subject: `pkg:npm/p-${freshnessSeconds}@1.0.0`,
    container: '/repo/pnpm-lock.yaml',
    factor: 'known_advisories',
    state,
    value: { listed: 0, advisories: [] },
    supportingIds: [],
    conflictingIds: [],
    sources: ['osv'],
    bestReliability: 'A',
    bestCredibility: 3,
    observedAt: '2026-09-26T11:03:54.032Z',
    staleAfter,
    freshnessSeconds,
    ruleVersion: 'assess-v0',
    asOf: '2026-10-26T11:03:54.032Z',
  };
}

const DAY = 86_400;

describe('freshnessOf', () => {
  it('counts stale answers and takes the newest age and the earliest staleness', () => {
    const f = freshnessOf([
      row('stale', 30 * DAY, '2026-09-27T11:03:54.032Z'),
      row('stale', 31 * DAY, '2026-09-26T11:03:54.032Z'),
      row('established', 3600, '2026-10-27T11:03:54.032Z'),
    ]);
    expect(f).toEqual({
      staleSubjects: 2,
      subjects: 3,
      ageSeconds: 3600,
      staleSince: '2026-09-26T11:03:54.032Z',
    });
  });

  it('reads an empty lake as having no age, and as not stale', () => {
    const f = freshnessOf([]);
    expect([f.ageSeconds, isStale(f)]).toEqual([null, false]);
  });
});

describe('staleCaveat', () => {
  it('says nothing over fresh answers', () => {
    expect(
      staleCaveat(
        freshnessOf([row('established', 60, '2026-10-27T00:00:00.000Z')]),
      ),
    ).toBeNull();
  });

  it('says how many answers are out of date and how old the newest is', () => {
    const f = freshnessOf([row('stale', 30 * DAY, '2026-09-27T11:03:54.032Z')]);
    expect(staleCaveat(f)).toBe(
      '1 of 1 answers are out of date; the newest is 30 days old.',
    );
  });
});
