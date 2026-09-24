import { Icon, Tag } from '@blueprintjs/core';
import type { BlindSpotRow } from '@naught/shared';

/**
 * What the run could not see, and why.
 *
 * This is its own widget and never a row in the subject table. "We could not
 * see it" and "it is broken" are different facts; merging them is the lie by
 * omission the lake refuses at the storage layer, where `globFor` takes a
 * mandatory kind so the two file sets can never be unioned by accident. The
 * interface has to refuse it too.
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
      {blindSpots.length === 0 ? (
        <p className="bp6-text-muted" style={{ fontSize: 12, margin: 0 }}>
          Nothing this run knew it could not see. That is not the same as
          nothing having been missed.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {blindSpots.map((spot) => (
            <li
              key={`${spot.reason}:${spot.subject}`}
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}
              title={spot.note ?? undefined}
            >
              <Icon icon="eye-off" size={12} intent="warning" />
              <Tag minimal intent="warning">
                {spot.reason}
              </Tag>
              <span className="naught-mono">{spot.subject}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
