import type { AssessmentRow, SubjectRow } from '@naught/shared';
import { driftClass } from '@/components/drift';
import { gradeOf, subjectKey } from '@/lib/dossier';

/**
 * The object table: every subject the latest run saw, worst first.
 *
 * Plain `<table>` rather than `@blueprintjs/table`, which would be a new
 * dependency under the cooldown in pnpm-workspace.yaml for a grid that does
 * not virtualize. Density comes from the stylesheet.
 */
export function SubjectTable({
  subjects,
  assessments,
  selected,
  onSelect,
}: {
  subjects: SubjectRow[];
  assessments: ReadonlyMap<string, AssessmentRow>;
  selected: string | null;
  onSelect: (subject: string) => void;
}): React.ReactElement {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: '50%' }}>Subject</th>
          <th style={{ width: 70 }}>Drift</th>
          <th style={{ width: 96 }}>Basis</th>
          <th>Observed</th>
        </tr>
      </thead>
      <tbody>
        {subjects.map((row) => (
          <tr
            key={row.subject}
            aria-selected={row.subject === selected}
            onClick={() => onSelect(row.subject)}
          >
            <td className="naught-mono">{row.subject}</td>
            <td className={driftClass(row.drift)}>{row.drift ?? '—'}</td>
            <Basis
              assessment={assessments.get(
                subjectKey(row.subject, row.container),
              )}
            />
            <td
              className="naught-mono bp6-text-muted"
              title={row.observed ?? undefined}
            >
              {row.observed ?? 'unknown'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The grade, quiet when the answer is settled, and the state in its place
 * when it is not — so a stale or contested row is visible without selecting it.
 */
function Basis({
  assessment,
}: {
  assessment: AssessmentRow | undefined;
}): React.ReactElement {
  if (assessment === undefined) {
    return <td className="naught-mono naught-basis--attention">unassessed</td>;
  }
  if (assessment.state !== 'established') {
    return (
      <td
        className="naught-mono naught-basis--attention"
        title={`grade ${gradeOf(assessment) ?? 'none'}`}
      >
        {assessment.state.replace('_', ' ')}
      </td>
    );
  }
  return <td className="naught-mono naught-basis">{gradeOf(assessment)}</td>;
}
