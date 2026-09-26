import {
  AxisAvailabilities,
  BlindSpotRows,
  DeltaView,
  LatestRun,
  ProjectRefs,
  RunTicket,
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
 * The API as the *browser* reaches it, which is not how the server reaches it.
 *
 * `NAUGHT_API_URL` is `http://api:3001` under compose — a name that resolves
 * on the container network and nowhere else. Starting a run and following it
 * happen in the browser, so they need an address the browser has.
 *
 * Inlined at build time by Next, not read at runtime: see the `ARG` in
 * `apps/web/Dockerfile`.
 */
const PUBLIC_BASE =
  process.env['NEXT_PUBLIC_NAUGHT_API_URL'] ?? 'http://localhost:3001';

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

/**
 * Ask for a collection run on one axis. The run repeats the scope of the last
 * run that recorded one; the interface supplies no path of its own.
 *
 * @example
 * const ticket = await startRun('deps'); // follow ticket.runId on the socket
 */
export async function startRun(axis: Axis): Promise<RunTicket> {
  const res = await fetch(`${PUBLIC_BASE}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ axis }),
  });
  const body: unknown = await res.json();
  // A refusal carries the reason the operator needs — already running, or no
  // scope ever recorded. Dropping it for the status code would leave them
  // looking at a button that did nothing.
  if (!res.ok)
    throw new Error(messageOf(body) ?? `POST /runs responded ${res.status}`);
  return RunTicket.parse(body);
}

/** Where run events arrive. Same host and port as the API; http becomes ws. */
export function runStreamUrl(): string {
  return `${PUBLIC_BASE.replace(/^http/, 'ws')}/runs/stream`;
}

/** Nest puts the reason in `message`, as a string or a list of them. */
function messageOf(body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return null;
}
