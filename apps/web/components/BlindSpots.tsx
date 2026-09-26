import { Icon, Tag } from '@blueprintjs/core';
import type { BlindSpotRow } from '@naught/shared';
import { Verdict } from '@/components/Verdict';

/**
 * What the run could not see, and why.
 *
 * This is its own widget and never a row in the subject table. "We could not
 * see it" and "it is broken" are different facts; merging them is the lie by
 * omission the lake refuses at the storage layer, where `globFor` takes a
 * mandatory kind so the two file sets can never be unioned by accident. The
 * interface has to refuse it too.
 *
 * The verdict states what the number means before it states the caveat.
 * "Nothing this run knew it could not see" was accurate and asked the reader to
 * resolve three negations to learn that nothing had gone wrong.
 */
export function BlindSpots({
  blindSpots,
}: {
  blindSpots: BlindSpotRow[];
}): React.ReactElement {
  return (
    <section>
      <p className="naught-label">
        Blind spots
        <span className="bp6-text-muted">{blindSpots.length}</span>
      </p>
      {blindSpots.length === 0 ? <Clear /> : <Unread rows={blindSpots} />}
    </section>
  );
}

/**
 * The empty case, which is the one that can mislead.
 *
 * Zero blind spots is a statement about what the collector tried and failed to
 * read. It says nothing about what no collector was pointed at, and an operator
 * who reads it as "everything is covered" has been misled by a true number —
 * which is why the sentence hands them straight to the coverage figure.
 */
function Clear(): React.ReactElement {
  return (
    <Verdict tone="settled" says="Nothing blocked this run.">
      It read everything it went looking for. How much it went looking for is
      the coverage figure in the header, not this number.
    </Verdict>
  );
}

function Unread({ rows }: { rows: BlindSpotRow[] }): React.ReactElement {
  return (
    <>
      <Verdict
        tone="attention"
        says={`${rows.length} thing${rows.length === 1 ? '' : 's'} this run could not read.`}
      >
        Each one is counted against the coverage in the header, never left out
        of it.
      </Verdict>
      <ul
        style={{
          margin: 'var(--naught-gap-2) 0 0',
          padding: 0,
          listStyle: 'none',
        }}
      >
        {rows.map((spot) => (
          <BlindSpotLine key={`${spot.reason}:${spot.subject}`} spot={spot} />
        ))}
      </ul>
    </>
  );
}

function BlindSpotLine({ spot }: { spot: BlindSpotRow }): React.ReactElement {
  return (
    <li
      style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}
      title={spot.note ?? undefined}
    >
      <Icon icon="eye-off" size={12} intent="warning" />
      <Tag minimal intent="warning">
        {spot.reason}
      </Tag>
      <span className="naught-mono">{spot.subject}</span>
    </li>
  );
}
