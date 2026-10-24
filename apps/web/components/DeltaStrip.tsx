import { Icon, type IconName, type Intent } from '@blueprintjs/core';
import type { DeltaView, SubjectChange } from '@naught/shared';
import { Verdict } from '@/components/Verdict';

/** Drift value meaning "not present in that run at all". Matches lake/delta.ts. */
const ABSENT = -1;

/**
 * §9's fourth question, and §7's rule, on screen.
 *
 * Only what moved is listed. A finding that was reported last time and has not
 * changed is deliberately absent — but the standing open total is stated in the
 * verdict, so an empty list can never be read as "all clear".
 *
 * The verdict answers the operator's actual question — is there anything for me
 * to do — before the evidence for it. Reading the timestamp and subtracting it
 * from the open count to arrive at that answer is work the screen should have
 * done already.
 */
export function DeltaStrip({
  delta,
}: {
  delta: DeltaView;
}): React.ReactElement {
  return (
    <section>
      <p className="naught-label">
        Since last run
        <span className="bp6-text-muted">
          {delta.runs} run{delta.runs === 1 ? '' : 's'} in lake
        </span>
      </p>
      {body(delta)}
    </section>
  );
}

function body(delta: DeltaView): React.ReactElement {
  if (delta.previousAt === null) {
    return (
      <Verdict tone="settled" says="First run on this axis.">
        There is nothing earlier to compare it against yet.
      </Verdict>
    );
  }
  if (delta.changes.length === 0) return <NothingMoved delta={delta} />;
  return <Moved delta={delta} />;
}

/** The quiet case, which is most runs, and the one easiest to render wrongly. */
function NothingMoved({ delta }: { delta: DeltaView }): React.ReactElement {
  const open = delta.openFindings;
  return (
    <Verdict
      tone={open === 0 ? 'settled' : 'attention'}
      says={
        open === 0
          ? 'Nothing to act on.'
          : `${open} finding${open === 1 ? '' : 's'} open, none of them new.`
      }
    >
      Unchanged since {at(delta.previousAt)}
      {open === 0 ? ', and nothing was open then either' : ''}.
    </Verdict>
  );
}

function Moved({ delta }: { delta: DeltaView }): React.ReactElement {
  const worse = delta.changes.filter((c) => worsened(c)).length;
  return (
    <>
      <Verdict
        tone={worse === 0 ? 'settled' : 'attention'}
        says={
          worse === 0
            ? `${delta.changes.length} change${delta.changes.length === 1 ? '' : 's'}, none for the worse.`
            : `${worse} subject${worse === 1 ? '' : 's'} got worse.`
        }
      >
        {delta.changes.length} change{delta.changes.length === 1 ? '' : 's'}{' '}
        since {at(delta.previousAt)} · {delta.openFindings} open in total.
      </Verdict>
      <ul
        style={{
          margin: 'var(--naught-gap-2) 0 0',
          padding: 0,
          listStyle: 'none',
        }}
      >
        {delta.changes.map((change) => (
          <ChangeLine key={change.subject} change={change} />
        ))}
      </ul>
    </>
  );
}

/** A subject the operator may have to do something about. */
function worsened({ was, now }: SubjectChange): boolean {
  return was === ABSENT ? now > 0 : now !== ABSENT && now > was;
}

function at(iso: string | null): string {
  return iso === null
    ? 'the previous run'
    : `${iso.replace('T', ' ').slice(0, 19)} UTC`;
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
  if (was === ABSENT)
    return { verb: 'appeared', icon: 'plus', intent: 'warning' };
  if (now === ABSENT) return { verb: 'gone', icon: 'minus', intent: 'success' };
  if (now > was)
    return { verb: 'worsened', icon: 'arrow-up', intent: 'danger' };
  return { verb: 'improved', icon: 'arrow-down', intent: 'success' };
}

function range({ was, now }: SubjectChange): string {
  if (was === ABSENT) return `${now}`;
  if (now === ABSENT) return `was ${was}`;
  return `${was} → ${now}`;
}
