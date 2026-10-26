import { createHash } from 'node:crypto';
import {
  Evidence,
  GRADING_VERSION,
  credibilityOf,
  originSourceOf,
  reliabilityOf,
  staleAfterOf,
  type Axis,
  type Claim,
} from '@naught/shared';

/** Who wrote a run. Stamped onto every row the run seals. */
export interface RunIdentity {
  readonly runId: string;
  readonly axis: Axis;
  readonly collectorId: string;
  readonly collectorVersion: string;
}

/**
 * Turns a collector's claim into the row the lake stores (ADR 0007, 0008).
 *
 * Grading, identity and staleness are decided here and nowhere else, so two
 * collectors cannot grade the same source differently by accident. The result
 * is parsed, not cast: a claim that cannot become a valid row fails on the
 * stack of the collector that emitted it, not years later in a reader.
 *
 * @example
 * const row = stampClaim(claim, { runId, axis: 'deps',
 *   collectorId: 'deps.osv', collectorVersion: '2.0.0' });
 * row.reliability; // 'A'
 */
export function stampClaim(claim: Claim, run: RunIdentity): Evidence {
  return Evidence.parse({
    ...claim,
    evidenceId: evidenceIdOf(run.runId, claim),
    runId: run.runId,
    collectorId: run.collectorId,
    axis: run.axis,
    originSourceId: originSourceOf(claim.sourceId, claim.claimValue ?? {}),
    reliability: reliabilityOf(claim.sourceId, claim.claimType),
    credibility: credibilityOf(claim.observationKind),
    gradingVersion: GRADING_VERSION,
    staleAfter: staleAfterOf(claim.claimType, claim.observedAt),
    extractorVersion: run.collectorVersion,
  });
}

/**
 * Deterministic, so that re-stamping the same claim for the same run — as the
 * version 1 rewriter does — yields the same id rather than a second row.
 */
export function evidenceIdOf(runId: string, claim: Claim): string {
  const key = JSON.stringify([
    runId,
    claim.subject,
    claim.container,
    claim.claimType,
    claim.observationKind,
    canonicalJson(claim.claimValue ?? {}),
  ]);
  return createHash('sha256').update(key).digest('hex');
}

/** Key order is not information; `{a,b}` and `{b,a}` are one claim value. */
function canonicalJson(value: Readonly<Record<string, unknown>>): string {
  const sorted = Object.keys(value)
    .sort()
    .map((k) => [k, value[k]]);
  return JSON.stringify(Object.fromEntries(sorted));
}
