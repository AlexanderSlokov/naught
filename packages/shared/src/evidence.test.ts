import { describe, expect, it } from 'vitest';
import { Claim } from './evidence.js';

const SEEN = {
  observedAt: '2026-10-26T16:17:21.924Z',
  subject: 'pkg:npm/lodash@4.17.20',
  subjectKind: 'package_version',
  container: '/repo/pnpm-lock.yaml',
  claimType: 'advisory',
  claimValue: { vuln: 'GHSA-35jh-r3h4-6jhm' },
  observationKind: 'observed',
  sourceId: 'osv',
} as const;

describe('Claim', () => {
  it('parses a seen claim and defaults what a collector need not state', () => {
    const claim = Claim.parse(SEEN);
    expect(claim.notAssessableReason).toBeNull();
    expect(claim.derivedFrom).toEqual([]);
  });

  it('refuses a not_assessable claim that gives no reason', () => {
    const parsed = Claim.safeParse({
      ...SEEN,
      observationKind: 'not_assessable',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/not_assessable/);
  });

  it('refuses a seen claim that carries a reason', () => {
    const parsed = Claim.safeParse({
      ...SEEN,
      notAssessableReason: 'rate-limited',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a not_assessable claim with its reason', () => {
    const parsed = Claim.safeParse({
      ...SEEN,
      claimValue: {},
      observationKind: 'not_assessable',
      notAssessableReason: 'unreachable-upstream',
    });
    expect(parsed.success).toBe(true);
  });
});
