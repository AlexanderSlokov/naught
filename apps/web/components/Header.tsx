import { H5, Tag } from '@blueprintjs/core';
import type { Axis, LatestRun, ProjectRef } from '@naught/shared';
import { Coverage } from '@/components/Coverage';
import { RunButton } from '@/components/RunButton';
import { ageWords } from '@/lib/dossier';
import { isStale, type LakeFreshness } from '@/lib/freshness';

/**
 * The one part of the screen that never changes, holding what every other
 * part is relative to: which project, which axis, when it was last looked at,
 * at what coverage — and, since ADR 0003, the one control that asks for
 * another look.
 */
export function Header({
  axis,
  project,
  run,
  freshness,
}: {
  axis: Axis;
  project: ProjectRef | null;
  run: LatestRun | null;
  freshness: LakeFreshness;
}): React.ReactElement {
  const stale = isStale(freshness);
  return (
    <header className="naught-header">
      <H5 style={{ margin: 0, letterSpacing: '0.1em' }}>NAUGHT</H5>
      <Tag minimal icon="folder-open" title={project?.container ?? undefined}>
        {projectName(project)}
      </Tag>
      {run === null ? (
        <Tag minimal intent="none">
          no collector has run
        </Tag>
      ) : (
        <>
          <Tag minimal intent="primary">
            {run.axis} · {run.collectorId}
          </Tag>
          <RunTime observedAt={run.observedAt} freshness={freshness} />
          <Coverage
            coverage={run.coverage}
            observed={run.observed}
            expected={run.expected}
          />
          <OpenFindings open={run.openFindings} stale={stale} />
        </>
      )}
      <RunButton axis={axis} />
    </header>
  );
}

/**
 * When the run looked, and — once its answers are past their TTL — how long
 * ago, as a warning. The F-shaped scan meets this tag before any other figure,
 * so it is where a month-old run must stop looking like the present.
 */
function RunTime({
  observedAt,
  freshness,
}: {
  observedAt: string;
  freshness: LakeFreshness;
}): React.ReactElement {
  const when = `${observedAt.replace('T', ' ').slice(0, 19)} UTC`;
  if (!isStale(freshness) || freshness.ageSeconds === null) {
    return (
      <Tag minimal icon="time">
        {when}
      </Tag>
    );
  }
  return (
    <Tag
      minimal
      intent="warning"
      icon="outdated"
      title={`${freshness.staleSubjects} of ${freshness.subjects} answers are past their stale-after time`}
    >
      {when} · {ageWords(freshness.ageSeconds)} old
    </Tag>
  );
}

/**
 * The open count. A zero is only green while the answers behind it are
 * current: "nothing open as of a month ago" is not a clean bill of health.
 */
function OpenFindings({
  open,
  stale,
}: {
  open: number;
  stale: boolean;
}): React.ReactElement {
  if (open > 0) {
    return (
      <Tag minimal intent="danger" icon="warning-sign">
        {open} open
      </Tag>
    );
  }
  return (
    <Tag minimal intent={stale ? 'none' : 'success'} icon="tick">
      {open} open
    </Tag>
  );
}

/** The container is a path; the header has room for its last component. */
function projectName(project: ProjectRef | null): string {
  if (project === null) return 'no project';
  const parts = project.container.split('/');
  return parts[parts.length - 2] ?? project.container;
}
