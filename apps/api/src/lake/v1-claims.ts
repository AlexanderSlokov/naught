import { NotAssessableReason, type Claim } from '@naught/shared';
import type { V1BlindSpot, V1Observation } from './v1-rows.js';

/**
 * Version 1 rows, restated as the claims `deps.osv` would have emitted had it
 * written version 2 at the time (ADR 0007). Only what the row recorded is
 * restated: OSV's `modified` was discarded in version 1, so
 * `sourceAssertedAt` stays null rather than being guessed.
 *
 * Every version 1 run was written by `deps.osv`; a row from any other
 * collector is refused, because its claims cannot be inferred from its shape.
 */
export function claimsOfV1Observation(row: V1Observation): Claim[] {
  refuseForeignCollector(row);
  const about = {
    observedAt: row.observedAt,
    subject: row.subject,
    subjectKind: 'package_version',
    container: row.container,
  } as const;
  const declared = row.declared === null ? {} : { declared: row.declared };
  return [
    {
      ...about,
      claimType: 'contains',
      claimValue: declared,
      observationKind: 'observed',
      sourceId: 'pnpm-lock',
    },
    ...advisoryClaims(row).map((c): Claim => ({ ...about, ...c })),
  ];
}

type AdvisoryPart = Pick<
  Claim,
  'claimType' | 'claimValue' | 'observationKind' | 'sourceId'
>;

/**
 * `drift` counted the advisories in `detail.advisories`. A row where the two
 * disagree cannot be restated faithfully, so it stops the run's rewrite.
 */
function advisoryClaims(row: V1Observation): AdvisoryPart[] {
  const ids = row.advisories ?? [];
  if (row.drift !== ids.length) {
    throw new Error(
      `cannot restate ${row.subject}: drift ${String(row.drift)} with ` +
        `${ids.length} advisory id(s); expected drift to equal the id count`,
    );
  }
  if (ids.length === 0) {
    return [
      {
        claimType: 'advisory',
        observationKind: 'absent_in_scope',
        sourceId: 'osv',
      },
    ];
  }
  return ids.map((vuln) => ({
    claimType: 'advisory',
    claimValue: { vuln },
    observationKind: 'observed',
    sourceId: 'osv',
  }));
}

/**
 * Which claim a version 1 blind spot was about, from what `deps.osv` wrote:
 * a purl it could not ask OSV about, a lockfile key it could not split, or a
 * lockfile it could not open (no container).
 */
export function claimOfV1BlindSpot(row: V1BlindSpot): Claim {
  refuseForeignCollector(row);
  const unseen = {
    observedAt: row.observedAt,
    subject: row.subject,
    observationKind: 'not_assessable',
    notAssessableReason: NotAssessableReason.parse(row.reason),
    note: row.note,
  } as const;
  if (row.subject.startsWith('pkg:')) {
    return {
      ...unseen,
      subjectKind: 'package_version',
      container: row.container,
      claimType: 'advisory',
      sourceId: 'osv',
    };
  }
  const subjectKind = row.container === null ? 'container' : 'lockfile_key';
  return {
    ...unseen,
    subjectKind,
    container: row.container,
    claimType: 'contains',
    sourceId: 'pnpm-lock',
  };
}

function refuseForeignCollector(row: {
  collectorId: string;
  subject: string;
}): void {
  if (row.collectorId === 'deps.osv') return;
  throw new Error(
    `cannot restate ${row.subject}: written by collector ` +
      `${JSON.stringify(row.collectorId)}; expected "deps.osv", the only version 1 collector`,
  );
}
