import { Tag } from '@blueprintjs/core';

/**
 * The only component in Naught that renders a coverage figure.
 *
 * ARCHITECTURE §7 requires coverage to travel with every verdict, so there is
 * exactly one place to check that it does. A null coverage is a collector that
 * could not know its own denominator, and it renders as unknown — never as
 * 100%, never as blank. A blank would be read as fine, and that is the lie
 * this project exists to refuse.
 *
 * @example <Coverage coverage={0.875} observed={7} expected={8} />
 */
export function Coverage({
  coverage,
  observed,
  expected,
}: {
  coverage: number | null;
  observed: number;
  expected: number | null;
}): React.ReactElement {
  if (coverage === null) {
    return (
      <Tag minimal intent="warning" icon="help">
        coverage unknown · {observed} observed
      </Tag>
    );
  }
  return (
    <Tag minimal intent={coverage < 1 ? 'warning' : 'success'} icon="eye-open">
      {(coverage * 100).toFixed(1)}% coverage · {observed}/{expected ?? '?'}
    </Tag>
  );
}
