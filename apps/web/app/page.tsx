import { Axis } from '@naught/shared';
import { Explorer, type ExplorerProps } from '@/components/Explorer';
import {
  fetchAssessments,
  fetchAxes,
  fetchBlindSpots,
  fetchDelta,
  fetchLatestRun,
  fetchProjects,
  fetchSubjects,
} from '@/lib/api';

/**
 * Rendered per request, never at build time. A page prerendered during
 * `next build` would bake in whatever the lake said in the build container —
 * which is nothing — and serve it as the present state.
 */
export const dynamic = 'force-dynamic';

/**
 * Only `deps` has a collector. The rail shows the other four as inert rather
 * than hiding them, so the interface never implies a completeness Naught does
 * not have.
 */
const AXIS = Axis.enum.deps;

export default async function Home(): Promise<React.ReactElement> {
  let view: ExplorerProps;
  try {
    view = await load();
  } catch (err) {
    return <Unreachable error={err} />;
  }
  return <Explorer {...view} />;
}

async function load(): Promise<ExplorerProps> {
  const [axes, projects, run, subjects, assessments, blindSpots, delta] =
    await Promise.all([
      fetchAxes(),
      fetchProjects(AXIS),
      fetchLatestRun(AXIS),
      fetchSubjects(AXIS),
      fetchAssessments(AXIS),
      fetchBlindSpots(AXIS),
      fetchDelta(AXIS),
    ]);
  return {
    axis: AXIS,
    axes,
    project: projects[0] ?? null,
    run,
    subjects,
    assessments,
    blindSpots,
    delta,
  };
}

/**
 * An observatory that cannot reach its own data says so in the same words it
 * would use about anything else it cannot see. A blank page here would be
 * indistinguishable from a clean bill of health.
 */
function Unreachable({ error }: { error: unknown }): React.ReactElement {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    <main style={{ padding: 32, fontFamily: 'var(--naught-mono)' }}>
      <h1 style={{ fontSize: 18 }}>Naught cannot see its own lake.</h1>
      <p style={{ color: 'var(--naught-muted)', fontSize: 13 }}>{detail}</p>
      <p style={{ color: 'var(--naught-muted)', fontSize: 13 }}>
        This is a blind spot, not an all-clear. Start the API with{' '}
        <code>make api</code>, or point <code>NAUGHT_API_URL</code> at one that
        is running.
      </p>
    </main>
  );
}
