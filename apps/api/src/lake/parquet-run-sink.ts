// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import { createWriteStream, type WriteStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Axis, BlindSpot, Observation, RunSummary } from '@naught/shared';
import type { LakeService } from './lake.service.js';
import { writeManifest } from './run-manifest.js';
import {
  BLIND_SPOT_COLUMNS,
  OBSERVATION_COLUMNS,
  columnsClause,
} from './schema.js';

/**
 * A collector never holds its whole result in memory. A monorepo lock file
 * can exceed what a container is given, and a collector that dies at 90% has
 * produced nothing at all — which is worse than a partial run honestly
 * labelled.
 *
 * Rows are streamed to newline-delimited JSON, then converted to Parquet in
 * one pass by DuckDB. Parquet is written by the same engine that reads it,
 * so there is no second implementation of the format to disagree with.
 */
export class ParquetRunSink {
  /**
   * Distinguishes two runs of the same collector in the same second. Without
   * it, a second run inside the same clock tick writes the same filename and
   * DuckDB's COPY overwrites the first one without a word — append-only in
   * the design document and last-write-wins on disk.
   */
  private readonly nonce = randomBytes(3).toString('hex');
  private observations?: WriteStream;
  private blindSpots?: WriteStream;
  private observedCount = 0;
  private blindSpotCount = 0;

  constructor(
    private readonly lake: LakeService,
    private readonly axis: Axis,
    private readonly collectorId: string,
    private readonly startedAt: Date,
  ) {}

  private get stem(): string {
    const hhmmss = this.startedAt
      .toISOString()
      .slice(11, 19)
      .replace(/:/g, '');
    return `${this.collectorId.replace(/\./g, '-')}--${hhmmss}-${this.nonce}`;
  }

  private async staging(kind: 'obs' | 'blind'): Promise<string> {
    const dir = this.lake.partitionDir(this.axis, this.startedAt);
    await mkdir(dir, { recursive: true });
    return join(dir, `.${this.stem}.${kind}.ndjson`);
  }

  async observation(o: Observation): Promise<void> {
    this.observations ??= createWriteStream(await this.staging('obs'));
    this.observations.write(`${JSON.stringify(o)}\n`);
    this.observedCount += 1;
  }

  async blindSpot(b: BlindSpot): Promise<void> {
    this.blindSpots ??= createWriteStream(await this.staging('blind'));
    this.blindSpots.write(`${JSON.stringify(b)}\n`);
    this.blindSpotCount += 1;
  }

  /**
   * Converts staging to Parquet, records the run's manifest, and returns the
   * files written.
   *
   * The Parquet file appears only once it is complete. A reader globbing the
   * lake mid-run sees the previous state, never a half-written one — which is
   * what lets "immutable, append-only" mean something operationally and not
   * just on paper.
   *
   * The summary is the collector's own account of its coverage and is taken as
   * given. Nothing downstream can recover it from the rows; see `run-manifest.ts`.
   */
  async seal(
    summary: RunSummary,
  ): Promise<{ files: string[]; observed: number; blind: number }> {
    const dir = this.lake.partitionDir(this.axis, this.startedAt);
    const db = await this.lake.query();
    const files: string[] = [];

    for (const [kind, stream, count, columns] of [
      ['obs', this.observations, this.observedCount, OBSERVATION_COLUMNS],
      ['blind', this.blindSpots, this.blindSpotCount, BLIND_SPOT_COLUMNS],
    ] as const) {
      if (!stream || count === 0) continue;
      await new Promise<void>((resolve, reject) =>
        stream.end((err?: Error | null) => (err ? reject(err) : resolve())),
      );

      const staged = join(dir, `.${this.stem}.${kind}.ndjson`);
      const target = join(dir, `${this.stem}.${kind}.parquet`);

      // The lake is append-only, and that has to be enforced rather than
      // assumed. DuckDB's COPY overwrites silently; a name collision here
      // would destroy a run that has already been reported on.
      if (await exists(target)) {
        throw new Error(`refusing to overwrite an existing run file: ${target}`);
      }
      await db.run(
        `COPY (SELECT * FROM read_json('${staged}', format = 'newline_delimited', columns = ${columnsClause(columns)})) ` +
          `TO '${target}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
      );
      await rm(staged, { force: true });
      files.push(target);
    }

    // Written last, and only over files that already exist: a manifest naming
    // artifacts that were never sealed would describe a run that did not
    // happen.
    await writeManifest(dir, this.stem, {
      runId: randomUUID(),
      collectorId: this.collectorId,
      axis: this.axis,
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'complete',
      summary,
      artifacts: files,
    });

    return {
      files,
      observed: this.observedCount,
      blind: this.blindSpotCount,
    };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
