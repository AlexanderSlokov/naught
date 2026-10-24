'use client';

import { Button, ProgressBar, Spinner, Tag } from '@blueprintjs/core';
import type { Axis } from '@naught/shared';
import { useCollectionRun } from '@/lib/use-collection-run';
import type { CollectionRunState } from '@/lib/run-state';

/**
 * The one control in Naught that starts something.
 *
 * A collection run reads external systems and writes to none of them, so this
 * does not breach the read-only rule in ARCHITECTURE §2 — see ADR 0003. What it
 * writes to is Naught's own queue, which is the distinction that makes it
 * allowed.
 *
 * It refuses a second run itself as well as at the API. The button being
 * disabled is the explanation; a 409 the operator never sees is not.
 *
 * @example <RunButton axis="deps" />
 */
export function RunButton({ axis }: { axis: Axis }): React.ReactElement {
  const { state, start } = useCollectionRun(axis);
  const busy = state.phase === 'starting' || state.phase === 'running';

  return (
    <div className="naught-run">
      <Button
        small
        intent="primary"
        icon={busy ? undefined : 'refresh'}
        disabled={busy}
        onClick={() => void start()}
      >
        {busy ? <Spinner size={14} /> : 'Collect'}
      </Button>
      <RunState state={state} />
    </div>
  );
}

/** What the run is doing, in the one place beside the button. */
function RunState({
  state,
}: {
  state: CollectionRunState;
}): React.ReactElement | null {
  if (state.phase === 'failed' && state.reason !== null) {
    return (
      <Tag minimal intent="danger" icon="error" title={state.reason}>
        run failed
      </Tag>
    );
  }
  if (state.phase === 'sealed') {
    return (
      <Tag minimal intent="success" icon="tick">
        run complete
      </Tag>
    );
  }
  if (state.phase === 'starting') {
    return (
      <Tag minimal icon="time">
        queued
      </Tag>
    );
  }
  if (state.phase === 'running') return <Working state={state} />;
  return null;
}

/**
 * A bar once the denominator is known, a count until then.
 *
 * The count without a bar is not a placeholder. A collector that cannot know
 * how much it was meant to see must not be rendered as though it could, which
 * is the same rule `Coverage` applies to a sealed run.
 */
function Working({ state }: { state: CollectionRunState }): React.ReactElement {
  const observed = state.observed ?? 0;
  if (state.expected === null) {
    return (
      <Tag minimal intent="primary">
        {observed} seen
      </Tag>
    );
  }
  return (
    <div
      className="naught-run-progress"
      title={`${observed}/${state.expected}`}
    >
      <ProgressBar
        intent="primary"
        stripes={false}
        value={Math.min(observed / state.expected, 1)}
      />
    </div>
  );
}
