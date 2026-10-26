import { describe, expect, it } from 'vitest';
import {
  credibilityOf,
  originSourceOf,
  reliabilityOf,
  reliabilityRationaleOf,
  staleAfterOf,
} from './sources.js';

describe('reliabilityOf', () => {
  it('grades a pair by source and claim type together', () => {
    expect(reliabilityOf('osv', 'advisory')).toBe('A');
    expect(reliabilityOf('pnpm-lock', 'contains')).toBe('A');
  });

  it('grades an ungraded pair F, cannot be judged, rather than low', () => {
    expect(reliabilityOf('osv', 'contains')).toBe('F');
    expect(reliabilityRationaleOf('osv', 'contains')).toBeNull();
  });

  it('carries a rationale for every grade it gives', () => {
    expect(reliabilityRationaleOf('osv', 'advisory')).toMatch(/OSV/);
  });
});

describe('credibilityOf (credibility-v0)', () => {
  it('weighs absence below presence, and unassessed as cannot be judged', () => {
    expect(credibilityOf('observed')).toBe(2);
    expect(credibilityOf('absent_in_scope')).toBe(3);
    expect(credibilityOf('not_assessable')).toBe(6);
  });
});

describe('staleAfterOf', () => {
  it('adds the claim type TTL to the time Naught looked', () => {
    expect(staleAfterOf('advisory', '2026-10-26T00:00:00.000Z')).toBe(
      '2026-10-27T00:00:00.000Z',
    );
  });

  it('names the value it cannot read as a time', () => {
    expect(() => staleAfterOf('advisory', 'yesterday')).toThrow(/"yesterday"/);
  });
});

describe('originSourceOf', () => {
  it('traces an OSV advisory to the database its id belongs to', () => {
    expect(originSourceOf('osv', { vuln: 'GHSA-35jh-r3h4-6jhm' })).toBe('ghsa');
    expect(originSourceOf('osv', { vuln: 'MAL-2025-46992' })).toBe(
      'ossf-malicious-packages',
    );
  });

  it('keeps OSV as its own origin for an id it does not recognise', () => {
    expect(originSourceOf('osv', { vuln: 'PYSEC-2024-1' })).toBe('osv');
    expect(originSourceOf('osv', {})).toBe('osv');
  });

  it('leaves a non-aggregating source as its own origin', () => {
    expect(originSourceOf('pnpm-lock', { vuln: 'GHSA-x' })).toBe('pnpm-lock');
  });
});
