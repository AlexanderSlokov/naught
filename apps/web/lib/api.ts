import {
  AxisAvailabilities,
  BlindSpotRows,
  DeltaView,
  LatestRun,
  ProjectRefs,
  SubjectRows,
  type Axis,
  type AxisAvailability,
  type BlindSpotRow,
  type ProjectRef,
  type SubjectRow,
} from '@naught/shared';

/**
 * The read API, as the server component sees it.
 *
 * Every response is parsed with the schema the API produced it from, so a
 * change on one side the other has not followed surfaces as an error naming
 * the field. A blank panel would be the alternative, and a blank panel in an
 * observatory is indistinguishable from good news.
 */
const BASE = process.env['NAUGHT_API_URL'] ?? 'http://127.0.0.1:3001';

/**
 * Never cached. A drift observatory that serves yesterday's verdict is lying
 * about the present tense, which is the only tense it has.
 */
async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${BASE}${path} responded ${res.status}`);
  }
  // Nest serializes a null return as a 200 with no body at all, and
  // `res.json()` on an empty body throws. Left alone, an axis no collector
  // has run reads as an unreachable API — a lake that is empty reported as a
  // lake that cannot be seen. Those are the two states Naught exists to keep
  // apart.
  const body = await res.text();
  return body === '' ? null : JSON.parse(body);
}

export async function fetchAxes(): Promise<AxisAvailability[]> {
  return AxisAvailabilities.parse(await get('/axes'));
}

export async function fetchProjects(axis: Axis): Promise<ProjectRef[]> {
  return ProjectRefs.parse(await get(`/axes/${axis}/projects`));
}

/** Null when no collector has run this axis. Not an error; an answer. */
export async function fetchLatestRun(axis: Axis): Promise<LatestRun | null> {
  const body = await get(`/axes/${axis}/latest`);
  return body === null ? null : LatestRun.parse(body);
}

export async function fetchSubjects(axis: Axis): Promise<SubjectRow[]> {
  return SubjectRows.parse(await get(`/axes/${axis}/subjects`));
}

export async function fetchBlindSpots(axis: Axis): Promise<BlindSpotRow[]> {
  return BlindSpotRows.parse(await get(`/axes/${axis}/blind-spots`));
}

export async function fetchDelta(axis: Axis): Promise<DeltaView> {
  return DeltaView.parse(await get(`/axes/${axis}/delta`));
}
