import { NonIdealState, Spinner, Tag, type Intent } from '@blueprintjs/core';
import type { Evidence } from '@naught/shared';
import {
  claimWords,
  latestEvidence,
  provenanceOf,
  utcMinute,
} from '@/lib/dossier';
import type { EvidenceState } from '@/lib/use-subject-evidence';

/**
 * The rows an assessment rests on, one line each: what was claimed, by which
 * source and on whose original authority, at what grade, and when the source
 * said it. This is the end of the trail — every number above it in the panel
 * can be checked against these lines.
 */
export function EvidenceList({
  state,
}: {
  state: EvidenceState;
}): React.ReactElement | null {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <Spinner size={16} />;
  if (state.status === 'failed') {
    return (
      <NonIdealState
        icon="eye-off"
        title="Evidence could not be read"
        description={`${state.reason}. This is a blind spot in the interface, not an absence of evidence.`}
        layout="vertical"
      />
    );
  }
  const { latest, earlier, earlierRuns } = latestEvidence(state.rows);
  return (
    <>
      <p className="naught-label">
        Evidence
        <span className="bp6-text-muted">{latest.length}</span>
      </p>
      <ul className="naught-evidence-list">
        {latest.map((row) => (
          <EvidenceLine key={row.evidenceId} row={row} />
        ))}
      </ul>
      {earlier > 0 && (
        <p className="naught-evidence">
          {earlier} earlier row{earlier === 1 ? '' : 's'} from {earlierRuns}{' '}
          earlier run
          {earlierRuns === 1 ? '' : 's'} are kept in the lake.
        </p>
      )}
    </>
  );
}

function EvidenceLine({ row }: { row: Evidence }): React.ReactElement {
  return (
    <li title={row.note ?? undefined}>
      <div className="naught-evidence-claim">
        <Tag minimal intent={intentOf(row)}>
          {row.claimType}
        </Tag>
        <span className="naught-mono">{claimWords(row)}</span>
      </div>
      <div className="naught-evidence-meta naught-mono">
        {provenanceOf(row)} · {row.reliability}
        {row.credibility}
        {row.sourceAssertedAt !== null &&
          ` · said ${utcMinute(row.sourceAssertedAt)}`}
      </div>
    </li>
  );
}

/** Intent carries meaning: a listed advisory is danger, an unseen row a warning. */
function intentOf(row: Evidence): Intent {
  if (row.observationKind === 'not_assessable') return 'warning';
  if (row.claimType === 'advisory' && row.observationKind === 'observed')
    return 'danger';
  return 'none';
}
