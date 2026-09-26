import { H5, Tag } from '@blueprintjs/core';
import type { Axis, LatestRun, ProjectRef } from '@naught/shared';
import { Coverage } from '@/components/Coverage';
import { RunButton } from '@/components/RunButton';

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
}: {
  axis: Axis;
  project: ProjectRef | null;
  run: LatestRun | null;
}): React.ReactElement {
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
          <Tag minimal icon="time">
            {run.observedAt.replace('T', ' ').slice(0, 19)} UTC
          </Tag>
          <Coverage
            coverage={run.coverage}
            observed={run.observed}
            expected={run.expected}
          />
          <Tag
            minimal
            intent={run.openFindings === 0 ? 'success' : 'danger'}
            icon={run.openFindings === 0 ? 'tick' : 'warning-sign'}
          >
            {run.openFindings} open
          </Tag>
        </>
      )}
      <RunButton axis={axis} />
    </header>
  );
}

/** The container is a path; the header has room for its last component. */
function projectName(project: ProjectRef | null): string {
  if (project === null) return 'no project';
  const parts = project.container.split('/');
  return parts[parts.length - 2] ?? project.container;
}
