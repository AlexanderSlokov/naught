import type {
  ClaimType,
  Credibility,
  ObservationKind,
  Reliability,
  SourceId,
} from './vocabulary.js';

/**
 * The sources a claim may cite, how far each is trusted for each kind of
 * claim, and how long a claim stays current. Held in code, versioned by
 * `GRADING_VERSION`, and stamped onto every evidence row at write time
 * (ADR 0008). Changing a grade means a new version, never an edited row.
 */
export const GRADING_VERSION = 'grading-v0';

export interface SourceEntry {
  readonly name: string;
  /** True when the source republishes what other sources wrote. */
  readonly aggregator: boolean;
  readonly upstreams: readonly SourceId[];
}

/**
 * Upstreams matter because two aggregators repeating one origin are one
 * voice, not two (ICD 206 "most original source"; RFC question 5).
 */
export const SOURCES: Readonly<Record<SourceId, SourceEntry>> = {
  osv: {
    name: 'OSV.dev',
    aggregator: true,
    upstreams: ['ghsa', 'ossf-malicious-packages', 'nvd'],
  },
  'pnpm-lock': { name: 'pnpm lockfile', aggregator: false, upstreams: [] },
  ghsa: { name: 'GitHub Advisory Database', aggregator: false, upstreams: [] },
  'ossf-malicious-packages': {
    name: 'OpenSSF Malicious Packages',
    aggregator: false,
    upstreams: [],
  },
  nvd: { name: 'NVD', aggregator: false, upstreams: [] },
};

interface ReliabilityGrade {
  readonly reliability: Reliability;
  readonly rationale: string;
}

/** Keyed by `${source}:${claimType}`, because trust depends on the claim. */
const RELIABILITY_GRADES: Readonly<Record<string, ReliabilityGrade>> = {
  'osv:advisory': {
    reliability: 'A',
    rationale:
      'For "OSV lists this advisory", OSV is the authority on its own index.',
  },
  'pnpm-lock:contains': {
    reliability: 'A',
    rationale:
      'The lockfile is the declaration itself; it cannot misreport what it pins.',
  },
};

/**
 * The reliability of one source for one kind of claim.
 *
 * An ungraded pair is F, "cannot be judged" — the honest answer for a pairing
 * nobody has reasoned about, and visibly different from a low grade.
 *
 * @example
 * reliabilityOf('osv', 'advisory'); // 'A'
 */
export function reliabilityOf(
  source: SourceId,
  claimType: ClaimType,
): Reliability {
  return RELIABILITY_GRADES[`${source}:${claimType}`]?.reliability ?? 'F';
}

/** Why a pair carries its grade, so an operator can dispute it. */
export function reliabilityRationaleOf(
  source: SourceId,
  claimType: ClaimType,
): string | null {
  return RELIABILITY_GRADES[`${source}:${claimType}`]?.rationale ?? null;
}

/**
 * Rule `credibility-v0`: the credibility of one claim from one source.
 *
 * Absence is weaker than presence because a source can only report the
 * absence of what it has indexed. Credibility 1 needs a second independent
 * origin and is therefore assigned by the assessment layer, never here.
 *
 * @example
 * credibilityOf('absent_in_scope'); // 3
 */
export function credibilityOf(kind: ObservationKind): Credibility {
  const byKind: Record<ObservationKind, Credibility> = {
    observed: 2,
    absent_in_scope: 3,
    not_assessable: 6,
  };
  return byKind[kind];
}

const HOUR_MS = 3_600_000;

/**
 * How long a claim stays current after Naught saw it. Starting values from the
 * RFC, to be tuned against real runs: OSV and the lockfile both move daily.
 */
export const CLAIM_TTL_MS: Readonly<Record<ClaimType, number>> = {
  contains: 24 * HOUR_MS,
  advisory: 24 * HOUR_MS,
};

/**
 * When a claim seen at `observedAt` goes stale, as an ISO datetime.
 *
 * @example
 * staleAfterOf('advisory', '2026-10-26T00:00:00.000Z'); // '2026-10-27T00:00:00.000Z'
 */
export function staleAfterOf(claimType: ClaimType, observedAt: string): string {
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) {
    throw new Error(
      `observedAt ${JSON.stringify(observedAt)} is not an ISO datetime`,
    );
  }
  return new Date(at + CLAIM_TTL_MS[claimType]).toISOString();
}

/** OSV advisory id prefixes, and the database each id was first written in. */
const ORIGIN_BY_ID_PREFIX: readonly (readonly [string, SourceId])[] = [
  ['GHSA-', 'ghsa'],
  ['MAL-', 'ossf-malicious-packages'],
  ['CVE-', 'nvd'],
];

/**
 * The most original source behind a claim (ICD 206). For an OSV advisory that
 * is the database its id belongs to; for everything else, the source itself.
 *
 * @example
 * originSourceOf('osv', { vuln: 'GHSA-35jh-r3h4-6jhm' }); // 'ghsa'
 */
export function originSourceOf(
  source: SourceId,
  claimValue: Readonly<Record<string, unknown>>,
): SourceId {
  const vuln = claimValue['vuln'];
  if (source !== 'osv' || typeof vuln !== 'string') return source;
  const match = ORIGIN_BY_ID_PREFIX.find(([prefix]) => vuln.startsWith(prefix));
  return match?.[1] ?? source;
}
