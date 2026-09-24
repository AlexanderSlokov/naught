import { NonIdealState, Tag } from '@blueprintjs/core';
import type { SubjectRow } from '@naught/shared';
import { driftClass } from '@/components/drift';

/**
 * One object, as the latest run recorded it: its properties, then the
 * advisories behind its drift. Nothing is summarized here — this is the end of
 * the trail, and the operator came here to read the identifiers.
 */
export function SubjectPanel({
  subject,
}: {
  subject: SubjectRow | null;
}): React.ReactElement {
  if (subject === null) {
    return (
      <NonIdealState
        icon="select"
        title="No subject selected"
        description="Pick a row to see what the run recorded about it."
        layout="vertical"
      />
    );
  }

  return (
    <>
      <p className="naught-label">Subject</p>
      <p className="naught-mono" style={{ overflowWrap: 'anywhere' }}>
        {subject.subject}
      </p>

      <p className="naught-label" style={{ marginTop: 16 }}>
        Properties
      </p>
      <dl className="naught-props">
        <dt>declared</dt>
        <dd>{subject.declared ?? 'unknown'}</dd>
        <dt>observed</dt>
        <dd>{subject.observed ?? 'unknown'}</dd>
        <dt>drift</dt>
        <dd className={driftClass(subject.drift)}>
          {subject.drift ?? 'not on the scale'}
        </dd>
        <dt>container</dt>
        <dd>{subject.container ?? 'unknown'}</dd>
      </dl>

      <p className="naught-label" style={{ marginTop: 16 }}>
        Advisories
        <span className="bp6-text-muted">{subject.advisories.length}</span>
      </p>
      {subject.advisories.length === 0 ? (
        <p className="bp6-text-muted" style={{ fontSize: 12 }}>
          None recorded for this version at the time of the run.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {subject.advisories.map((id) => (
            <Tag key={id} minimal intent="danger" className="naught-mono">
              {id}
            </Tag>
          ))}
        </div>
      )}
    </>
  );
}
