import { describe, expect, it } from 'vitest';
import type { AssessmentRow, Evidence } from '@naught/shared';
import {
  ageWords,
  claimWords,
  gradeOf,
  latestEvidence,
  provenanceOf,
  readingOf,
  sourcesWords,
} from './dossier';

const ESTABLISHED: AssessmentRow = {
  subject: 'pkg:npm/lodash@4.17.20',
  container: '/repo/pnpm-lock.yaml',
  factor: 'known_advisories',
  state: 'established',
  value: { listed: 5, advisories: ['GHSA-a'] },
  supportingIds: ['x'],
  conflictingIds: [],
  sources: ['osv'],
  bestReliability: 'A',
  bestCredibility: 2,
  observedAt: '2026-10-26T16:17:21.924Z',
  staleAfter: '2026-10-27T16:17:21.924Z',
  freshnessSeconds: 7200,
  ruleVersion: 'assess-v0',
  asOf: '2026-10-26T18:17:21.924Z',
};

const ROW: Evidence = {
  observedAt: '2026-10-26T16:17:21.924Z',
  subject: 'pkg:npm/lodash@4.17.20',
  subjectKind: 'package_version',
  objectId: null,
  container: '/repo/pnpm-lock.yaml',
  claimType: 'advisory',
  claimValue: { vuln: 'GHSA-35jh-r3h4-6jhm' },
  observationKind: 'observed',
  notAssessableReason: null,
  note: null,
  sourceId: 'osv',
  sourceAssertedAt: null,
  validFrom: null,
  validTo: null,
  derivedFrom: [],
  modelVersion: null,
  sensitivity: null,
  supersedes: null,
  evidenceId: 'a'.repeat(64),
  runId: '11111111-1111-4111-8111-111111111111',
  collectorId: 'deps.osv',
  axis: 'deps',
  originSourceId: 'ghsa',
  reliability: 'A',
  credibility: 2,
  gradingVersion: 'grading-v0',
  staleAfter: '2026-10-27T16:17:21.924Z',
  extractorVersion: '2.0.0',
};

describe('readingOf', () => {
  it('names the source and the count, and asks for attention', () => {
    const r = readingOf(ESTABLISHED);
    expect(r.says).toBe('OSV.dev lists 5 advisories against this version.');
    expect(r.tone).toBe('attention');
  });

  it('says "lists no advisory", never "clean", and bounds it to the index', () => {
    const r = readingOf({
      ...ESTABLISHED,
      value: { listed: 0, advisories: [] },
      bestCredibility: 3,
    });
    expect(r.says).toBe('OSV.dev lists no advisory against this version.');
    expect(r.tone).toBe('settled');
    expect(r.confidence).toMatch(/indexed, not what exists/);
  });

  it('keeps confidence out of the verdict sentence (ICD 203)', () => {
    const r = readingOf(ESTABLISHED);
    expect(r.says).not.toMatch(/A2|probably/);
    expect(r.confidence).toBe(
      'A2: source completely reliable, claim probably true; checked 2 h before this page loaded.',
    );
  });

  it('marks a stale answer as out of date before saying what it was', () => {
    expect(readingOf({ ...ESTABLISHED, state: 'stale' }).says).toBe(
      'Out of date: OSV.dev lists 5 advisories against this version.',
    );
  });

  it('gives no grade when nothing was seen', () => {
    const r = readingOf({
      ...ESTABLISHED,
      state: 'not_assessable',
      bestReliability: null,
      bestCredibility: null,
    });
    expect(r.says).toBe('OSV.dev could not be asked about this version.');
    expect(r.confidence).toMatch(/^No grade/);
  });
});

describe('gradeOf', () => {
  it('pairs reliability and credibility, or gives nothing', () => {
    expect(gradeOf(ESTABLISHED)).toBe('A2');
    expect(
      gradeOf({ bestReliability: null, bestCredibility: null }),
    ).toBeNull();
  });
});

describe('sourcesWords', () => {
  it('names sources from the shared catalog', () => {
    expect(sourcesWords(['nvd', 'osv'])).toBe('NVD and OSV.dev');
    expect(sourcesWords([])).toBe('No source');
  });
});

describe('ageWords', () => {
  it('rounds to the unit an operator acts on', () => {
    expect(ageWords(30)).toBe('under a minute');
    expect(ageWords(600)).toBe('10 min');
    expect(ageWords(7200)).toBe('2 h');
    expect(ageWords(3 * 86_400)).toBe('3 days');
  });
});

describe('claimWords and provenanceOf', () => {
  it('says what each kind of row claims', () => {
    expect(claimWords(ROW)).toBe('lists GHSA-35jh-r3h4-6jhm');
    expect(
      claimWords({
        ...ROW,
        observationKind: 'absent_in_scope',
        claimValue: {},
      }),
    ).toBe('lists no advisory');
    expect(
      claimWords({
        ...ROW,
        claimType: 'contains',
        claimValue: { declared: '4.17.20' },
      }),
    ).toBe('pinned at 4.17.20');
    expect(
      claimWords({
        ...ROW,
        observationKind: 'not_assessable',
        notAssessableReason: 'rate-limited',
      }),
    ).toBe('not assessable: rate-limited');
  });

  it('shows the original source only when it differs', () => {
    expect(provenanceOf(ROW)).toBe('osv → ghsa');
    expect(
      provenanceOf({
        ...ROW,
        sourceId: 'pnpm-lock',
        originSourceId: 'pnpm-lock',
      }),
    ).toBe('pnpm-lock');
  });
});

describe('latestEvidence', () => {
  it('lists the declaration first, then claims in reading order', () => {
    const pinned = {
      ...ROW,
      claimType: 'contains' as const,
      claimValue: { declared: '4.17.20' },
    };
    const later = { ...ROW, claimValue: { vuln: 'GHSA-zzzz' } };
    const rows = latestEvidence([later, ROW, pinned]).latest;
    expect(rows.map(claimWords)).toEqual([
      'pinned at 4.17.20',
      'lists GHSA-35jh-r3h4-6jhm',
      'lists GHSA-zzzz',
    ]);
  });

  it('splits the newest run from the history behind it', () => {
    const old = {
      ...ROW,
      observedAt: '2026-10-25T00:00:00.000Z',
      runId: '22222222-2222-4222-8222-222222222222',
    };
    const { latest, earlier, earlierRuns } = latestEvidence([old, ROW, old]);
    expect(latest).toEqual([ROW]);
    expect([earlier, earlierRuns]).toEqual([2, 1]);
  });
});
