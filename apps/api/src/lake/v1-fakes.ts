// noinspection SqlNoDataSourceInspection,SqlResolve
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CollectionRunInput } from '@naught/shared';
import type { LakeService } from './lake.service.js';
import { writeManifest } from './run-manifest.js';
import { columnsClause } from './schema.js';

/**
 * Writes schema version 1 runs, for the rewriter's tests. The column sets are
 * version 1's `schema.ts`, frozen here because no production code writes them
 * any more.
 */
const V1_OBSERVATION_COLUMNS = {
  observedAt: 'TIMESTAMP',
  collectorId: 'VARCHAR',
  axis: 'VARCHAR',
  subject: 'VARCHAR',
  container: 'VARCHAR',
  declared: 'VARCHAR',
  observed: 'VARCHAR',
  drift: 'DOUBLE',
  detail: 'JSON',
} as const;

const V1_BLIND_SPOT_COLUMNS = {
  observedAt: 'TIMESTAMP',
  collectorId: 'VARCHAR',
  axis: 'VARCHAR',
  subject: 'VARCHAR',
  container: 'VARCHAR',
  reason: 'VARCHAR',
  note: 'VARCHAR',
} as const;

export interface V1ObservationFixture {
  subject: string;
  declared: string;
  advisories: string[];
  /** Defaults to `advisories.length`, as version 1 wrote it. */
  drift?: number;
}

export class V1LakeWriter {
  constructor(
    private readonly lake: LakeService,
    private readonly observedAt = '2026-09-24T16:31:47.000Z',
    private readonly container = '/repo/pnpm-lock.yaml',
  ) {}

  get dir(): string {
    return this.lake.partitionDir('deps', new Date(this.observedAt));
  }

  async observations(
    stem: string,
    rows: V1ObservationFixture[],
  ): Promise<void> {
    await this.write(
      stem,
      'obs',
      V1_OBSERVATION_COLUMNS,
      rows.map((r) => ({
        ...this.base(r.subject),
        declared: r.declared,
        observed: r.advisories.length === 0 ? 'clean' : r.advisories.join(','),
        drift: r.drift ?? r.advisories.length,
        detail: { advisories: r.advisories },
      })),
    );
  }

  async blindSpots(
    stem: string,
    rows: { subject: string; reason: string; note: string }[],
  ): Promise<void> {
    await this.write(
      stem,
      'blind',
      V1_BLIND_SPOT_COLUMNS,
      rows.map((r) => ({ ...this.base(r.subject), ...r })),
    );
  }

  async manifest(stem: string, run: CollectionRunInput): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeManifest(this.dir, stem, run);
  }

  private base(subject: string): object {
    return {
      observedAt: this.observedAt,
      collectorId: 'deps.osv',
      axis: 'deps',
      subject,
      container: this.container,
    };
  }

  private async write(
    stem: string,
    kind: string,
    columns: Record<string, string>,
    rows: object[],
  ): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const staged = join(this.dir, `.${stem}.${kind}.ndjson`);
    await writeFile(staged, rows.map((r) => JSON.stringify(r)).join('\n'));
    const db = await this.lake.query();
    await db.run(
      `COPY (SELECT * FROM read_json('${staged}', format = 'newline_delimited', columns = ${columnsClause(columns)})) ` +
        `TO '${join(this.dir, `${stem}.${kind}.parquet`)}' (FORMAT PARQUET)`,
    );
    await rm(staged);
  }
}
