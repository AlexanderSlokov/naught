'use client';

import { useMemo, useState } from 'react';
import type {
  AssessmentRow,
  Axis,
  AxisAvailability,
  BlindSpotRow,
  DeltaView,
  LatestRun,
  ProjectRef,
  SubjectRow,
} from '@naught/shared';
import { AxisRail } from '@/components/AxisRail';
import { BlindSpots } from '@/components/BlindSpots';
import { DeltaStrip } from '@/components/DeltaStrip';
import { Header } from '@/components/Header';
import { SubjectPanel } from '@/components/SubjectPanel';
import { SubjectTable } from '@/components/SubjectTable';
import { assessmentIndex, subjectKey } from '@/lib/dossier';
import { freshnessOf } from '@/lib/freshness';

export interface ExplorerProps {
  axis: Axis;
  axes: AxisAvailability[];
  project: ProjectRef | null;
  run: LatestRun | null;
  subjects: SubjectRow[];
  assessments: AssessmentRow[];
  blindSpots: BlindSpotRow[];
  delta: DeltaView;
}

/**
 * The shell. Everything it renders was fetched on the server; the only state
 * that lives here is which object is selected, which is a property of the
 * person looking rather than of the lake.
 */
export function Explorer(props: ExplorerProps): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  const subject =
    props.subjects.find((row) => row.subject === selected) ?? null;
  const assessments = useMemo(
    () => assessmentIndex(props.assessments),
    [props.assessments],
  );
  const freshness = useMemo(
    () => freshnessOf(props.assessments),
    [props.assessments],
  );
  const assessment =
    subject === null
      ? null
      : (assessments.get(subjectKey(subject.subject, subject.container)) ??
        null);

  return (
    <div className="naught-shell">
      <Header
        axis={props.axis}
        project={props.project}
        run={props.run}
        freshness={freshness}
      />
      <AxisRail
        axes={props.axes}
        selected={props.axis}
        blindSpots={props.blindSpots.length}
      />
      <div className="naught-table">
        <SubjectTable
          subjects={props.subjects}
          assessments={assessments}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <aside className="naught-panel">
        <SubjectPanel
          axis={props.axis}
          subject={subject}
          assessment={assessment}
        />
      </aside>
      <div className="naught-strip">
        <DeltaStrip delta={props.delta} freshness={freshness} />
        <BlindSpots blindSpots={props.blindSpots} />
      </div>
    </div>
  );
}
