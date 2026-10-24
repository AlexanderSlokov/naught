import type { SubjectRow } from '@naught/shared';
import { driftClass } from '@/components/drift';

/**
 * The object table: every subject the latest run saw, worst first.
 *
 * Plain `<table>` rather than `@blueprintjs/table`, which would be a new
 * dependency under the cooldown in pnpm-workspace.yaml for a grid that does
 * not virtualize. Density comes from the stylesheet.
 */
export function SubjectTable({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectRow[];
  selected: string | null;
  onSelect: (subject: string) => void;
}): React.ReactElement {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: '55%' }}>Subject</th>
          <th style={{ width: 70 }}>Drift</th>
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
            <td className="naught-mono bp6-text-muted">
              {row.observed ?? 'unknown'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
