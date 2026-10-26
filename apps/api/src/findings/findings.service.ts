import { Inject, Injectable } from '@nestjs/common';
import {
  Axis,
  NotAssessableReason,
  type AxisAvailability,
  type BlindSpotRow,
  type DeltaView,
  type LatestRun,
  type ProjectRef,
  type SubjectRow,
} from '@naught/shared';
import { LakeService } from '../lake/lake.service.js';
import { deltaSinceLastRun } from '../lake/delta.js';
import { readManifests } from '../lake/run-manifest.js';
import {
  blindSpotsSql,
  latestObservedAtSql,
  observedCountSql,
  openFindingsSql,
  projectsSql,
  subjectsSql,
} from './findings.sql.js';

/**
 * Reads the lake and answers the questions in ARCHITECTURE §9.
 *
 * Every method checks `LakeService.hasFiles` first. An axis no collector has
 * run is an answer, not an error, and the interface has to be able to render
 * the difference between "nothing found" and "nothing looked".
 */
@Injectable()
export class FindingsService {
  constructor(@Inject(LakeService) private readonly lake: LakeService) {}

  /** Which axes hold data, so the interface can say so rather than imply it. */
  async axes(): Promise<AxisAvailability[]> {
    const checks = Axis.options.map(async (axis) => ({
      axis,
      hasData: await this.lake.hasFiles(axis),
    }));
    return Promise.all(checks);
  }

  async projects(axis: Axis): Promise<ProjectRef[]> {
    const rows = await this.read(axis, projectsSql);
    return rows.map(([container, subjects]) => ({
      container: String(container),
      subjects: Number(subjects),
    }));
  }

  /**
   * The verdict for one axis, as of its most recent run.
   *
   * `coverage` comes from the run's own manifest, never from counting rows.
   * A run whose manifest is missing reports unknown coverage rather than a
   * figure reconstructed from the very rows whose completeness is in question.
   */
  async latestRun(axis: Axis): Promise<LatestRun | null> {
    if (!(await this.lake.hasFiles(axis))) return null;
    const observedAt = await this.scalar(
      latestObservedAtSql(this.evidence(axis)),
    );
    const openFindings = Number(
      await this.scalar(openFindingsSql(this.evidence(axis))),
    );
    const counted = Number(
      await this.scalar(observedCountSql(this.evidence(axis))),
    );
    const [manifest] = await readManifests(this.lake.runsDir, axis);
    return {
      axis,
      collectorId: manifest?.collectorId ?? 'unknown',
      observedAt: isoOf(observedAt),
      observed: manifest?.summary?.observed ?? counted,
      expected: manifest?.summary?.expected ?? null,
      coverage: manifest?.summary?.coverage ?? null,
      openFindings,
    };
  }

  async subjects(axis: Axis): Promise<SubjectRow[]> {
    const rows = await this.read(axis, subjectsSql);
    return rows.map(([subject, container, declared, observed, drift, adv]) => ({
      subject: String(subject),
      container: nullableString(container),
      declared: nullableString(declared),
      observed: nullableString(observed),
      drift: drift === null ? null : Number(drift),
      advisories: parseAdvisories(adv),
    }));
  }

  async blindSpots(axis: Axis): Promise<BlindSpotRow[]> {
    const rows = await this.read(axis, blindSpotsSql);
    return rows.map(([subject, container, reason, note]) => ({
      subject: String(subject),
      container: nullableString(container),
      reason: toBlindSpotReason(reason),
      note: nullableString(note),
    }));
  }

  /** §9's fourth question, delegated to the module that already answers it. */
  async delta(axis: Axis): Promise<DeltaView> {
    if (!(await this.lake.hasFiles(axis))) {
      return { runs: 0, previousAt: null, openFindings: 0, changes: [] };
    }
    const db = await this.lake.query();
    const delta = await deltaSinceLastRun(db, this.evidence(axis));
    // DuckDB hands back its own timestamp rendering. Every timestamp that
    // leaves this service is ISO, so the interface never has to know which
    // engine produced which field.
    return {
      ...delta,
      previousAt: delta.previousAt === null ? null : isoOf(delta.previousAt),
    };
  }

  private evidence(axis: Axis): string {
    return this.lake.globFor(axis);
  }

  private async read(
    axis: Axis,
    sql: (glob: string) => string,
  ): Promise<readonly unknown[][]> {
    if (!(await this.lake.hasFiles(axis))) return [];
    const db = await this.lake.query();
    const result = await db.runAndReadAll(sql(this.evidence(axis)));
    return result.getRows();
  }

  private async scalar(sql: string): Promise<unknown> {
    const db = await this.lake.query();
    const result = await db.runAndReadAll(sql);
    return result.getRows()[0]?.[0] ?? null;
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * DuckDB renders a TIMESTAMP as `2026-09-24 03:04:12.000`, which is not an ISO
 * datetime and fails the shared schema. The lake stores UTC; say so explicitly
 * rather than letting a parser guess a local zone.
 */
function isoOf(value: unknown): string {
  return new Date(`${String(value).replace(' ', 'T')}Z`).toISOString();
}

/**
 * Advisory identifiers arrive as a JSON array rendered by `subject_drift`. A
 * malformed value yields an empty list; the drift count beside it still
 * stands, because the finding is real whether or not its identifiers survived
 * the round trip.
 */
function parseAdvisories(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Narrows a lake string to the blind spot reason vocabulary, which is owned by
 * the shared schema and not restated here. A reason written by a newer
 * collector than this reader understands degrades to `other` rather than
 * dropping the row: an unrecognised blind spot is still a blind spot.
 */
function toBlindSpotReason(value: unknown): BlindSpotRow['reason'] {
  const parsed = NotAssessableReason.safeParse(value);
  return parsed.success ? parsed.data : 'other';
}
