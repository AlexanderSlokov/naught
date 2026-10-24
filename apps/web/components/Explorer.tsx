'use client';

import { useState } from 'react';
import type {
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

export interface ExplorerProps {
  axis: Axis;
  axes: AxisAvailability[];
  project: ProjectRef | null;
  run: LatestRun | null;
  subjects: SubjectRow[];
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

  return (
    <div className="naught-shell">
      <Header axis={props.axis} project={props.project} run={props.run} />
      <AxisRail
        axes={props.axes}
        selected={props.axis}
        blindSpots={props.blindSpots.length}
      />
      <div className="naught-table">
        <SubjectTable
          subjects={props.subjects}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <aside className="naught-panel">
        <SubjectPanel subject={subject} />
      </aside>
      <div className="naught-strip">
        <DeltaStrip delta={props.delta} />
        <BlindSpots blindSpots={props.blindSpots} />
      </div>
    </div>
  );
}
