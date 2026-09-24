// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlindSpot, Observation } from '@naught/shared';
import type { LakeService } from './lake.service.js';
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
  private observations?: WriteStream;
  private blindSpots?: WriteStream;
  private observedCount = 0;
  private blindSpotCount = 0;

  constructor(
    private readonly lake: LakeService,
    private readonly axis: string,
    private readonly collectorId: string,
    private readonly startedAt: Date,
  ) {}

  private get stem(): string {
    const hhmm = this.startedAt
      .toISOString()
      .slice(11, 16)
      .replace(':', '');
    return `${this.collectorId.replace(/\./g, '-')}--${hhmm}`;
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
   * Converts staging to Parquet and returns the files written.
   *
   * The Parquet file appears only once it is complete. A reader globbing the
   * lake mid-run sees the previous state, never a half-written one — which is
   * what lets "immutable, append-only" mean something operationally and not
   * just on paper.
   */
  async seal(): Promise<{ files: string[]; observed: number; blind: number }> {
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
      await db.run(
        `COPY (SELECT * FROM read_json('${staged}', format = 'newline_delimited', columns = ${columnsClause(columns)})) ` +
          `TO '${target}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
      );
      await rm(staged, { force: true });
      files.push(target);
    }

    return {
      files,
      observed: this.observedCount,
      blind: this.blindSpotCount,
    };
  }
}
