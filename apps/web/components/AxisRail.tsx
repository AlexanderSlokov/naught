import { Icon } from '@blueprintjs/core';
import type { AxisAvailability } from '@naught/shared';

/**
 * The five axes of decay, and which of them the lake actually holds data for.
 *
 * An axis with no data is shown, not hidden. Hiding it would make the
 * interface claim a completeness Naught does not have; showing it inert says
 * "this exists and nothing has looked yet", which is the true statement.
 */
export function AxisRail({
  axes,
  selected,
  blindSpots,
}: {
  axes: AxisAvailability[];
  selected: string;
  blindSpots: number;
}): React.ReactElement {
  return (
    <nav className="naught-rail">
      <p className="naught-label" style={{ padding: '0 16px' }}>
        Axes
      </p>
      {axes.map(({ axis, hasData }) => (
        <div
          key={axis}
          aria-current={axis === selected}
          style={rowStyle(axis === selected, hasData)}
        >
          <Icon
            icon={hasData ? 'full-circle' : 'circle'}
            size={10}
            intent={axis === selected ? 'primary' : 'none'}
          />
          {axis}
        </div>
      ))}
      <p className="naught-label" style={{ padding: '16px 16px 0' }}>
        Blind spots
        <span className="bp6-text-muted">{blindSpots}</span>
      </p>
    </nav>
  );
}

function rowStyle(current: boolean, hasData: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 16px',
    fontSize: 13,
    opacity: hasData ? 1 : 0.4,
    borderLeft: `2px solid ${current ? 'var(--bp-intent-primary-rest)' : 'transparent'}`,
  };
}
