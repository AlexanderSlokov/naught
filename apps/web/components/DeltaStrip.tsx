import { Icon, type IconName, type Intent } from '@blueprintjs/core';
import type { DeltaView, SubjectChange } from '@naught/shared';

/** Drift value meaning "not present in that run at all". Matches lake/delta.ts. */
const ABSENT = -1;

/**
 * §9's fourth question, and §7's rule, on screen.
 *
 * Only what moved is listed. A finding that was reported last time and has not
 * changed is deliberately absent — but the standing open total sits in the
 * heading, so an empty list can never be read as "all clear".
 */
export function DeltaStrip({ delta }: { delta: DeltaView }): React.ReactElement {
  return (
    <section>
      <p className="naught-label">
        Since last run
        <span className="bp6-text-muted">
          {delta.runs} run{delta.runs === 1 ? '' : 's'} in lake ·{' '}
          {delta.openFindings} open
        </span>
      </p>
      {body(delta)}
    </section>
  );
}

function body(delta: DeltaView): React.ReactElement {
  if (delta.previousAt === null) {
    return <Quiet>First run for this axis. Nothing to compare against yet.</Quiet>;
  }
  if (delta.changes.length === 0) {
    return (
      <Quiet>
        Nothing changed since {delta.previousAt.replace('T', ' ').slice(0, 19)}{' '}
        UTC. {delta.openFindings} finding
        {delta.openFindings === 1 ? '' : 's'} still open.
      </Quiet>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {delta.changes.map((change) => (
        <ChangeLine key={change.subject} change={change} />
      ))}
    </ul>
  );
}

function ChangeLine({ change }: { change: SubjectChange }): React.ReactElement {
  const { verb, icon, intent } = classify(change);
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <Icon icon={icon} size={12} intent={intent} />
      <span style={{ width: 66, color: 'var(--naught-muted)' }}>{verb}</span>
      <span className="naught-mono">{change.subject}</span>
      <span className="bp6-text-muted">{range(change)}</span>
    </li>
  );
}

/** The four things that can happen to a subject between two runs. */
function classify({ was, now }: SubjectChange): {
  verb: string;
  icon: IconName;
  intent: Intent;
} {
  if (was === ABSENT) return { verb: 'appeared', icon: 'plus', intent: 'warning' };
  if (now === ABSENT) return { verb: 'gone', icon: 'minus', intent: 'success' };
  if (now > was) return { verb: 'worsened', icon: 'arrow-up', intent: 'danger' };
  return { verb: 'improved', icon: 'arrow-down', intent: 'success' };
}

function range({ was, now }: SubjectChange): string {
  if (was === ABSENT) return `${now}`;
  if (now === ABSENT) return `was ${was}`;
  return `${was} → ${now}`;
}

function Quiet({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="bp6-text-muted" style={{ fontSize: 12, margin: 0 }}>
      {children}
    </p>
  );
}
