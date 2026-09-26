// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import type { WriteStream } from 'node:fs';
import { access, mkdir, open, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type {
  Axis,
  BlindSpot,
  Observation,
  RunSummary,
  Scope,
} from '@naught/shared';
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

  /**
   * The first write error, held rather than thrown from where it happened.
   *
   * A stream reports a failed write as an asynchronous `'error'` event, and an
   * unhandled one of those ends the process — which used to mean a CLI script
   * dying and now means the API. Errors are captured here and re-thrown from
   * the next sink call or from `seal`, on a stack the caller can report to an
   * operator.
   */
  private failure: Error | null = null;

  /**
   * @param runId Minted by whoever started the run, not by this sink. The
   *   interface shows an operator a run id the moment they ask for a run,
   *   which is before any file exists; generating a second id at seal would
   *   leave the manifest naming a run nobody watched.
   */
  constructor(
    private readonly lake: LakeService,
    private readonly axis: Axis,
    private readonly collectorId: string,
    private readonly startedAt: Date,
    private readonly runId: string,
  ) {}

  private get stem(): string {
    const hhmmss = this.startedAt.toISOString().slice(11, 19).replace(/:/g, '');
    return `${this.collectorId.replace(/\./g, '-')}--${hhmmss}-${this.nonce}`;
  }

  private async staging(kind: 'obs' | 'blind'): Promise<string> {
    const dir = this.lake.partitionDir(this.axis, this.startedAt);
    await mkdir(dir, { recursive: true });
    return join(dir, `.${this.stem}.${kind}.ndjson`);
  }

  /**
   * Ignored. The manifest takes its denominator from the sealed `RunSummary`,
   * which is the collector's considered account; a mid-run figure is a
   * progress reading and has no business in the lake.
   */
  async expected(_n: number): Promise<void> {}

  async observation(o: Observation): Promise<void> {
    this.observations ??= await this.openStaging('obs');
    this.append(this.observations, o);
    this.observedCount += 1;
  }

  async blindSpot(b: BlindSpot): Promise<void> {
    this.blindSpots ??= await this.openStaging('blind');
    this.append(this.blindSpots, b);
    this.blindSpotCount += 1;
  }

  /**
   * Opens one staging file and takes ownership of its errors.
   *
   * The descriptor is opened and awaited before the stream exists, so that a
   * lake this run cannot write to at all — a read-only volume, a full disk, a
   * partition owned by someone else — rejects here, where the caller is still
   * on the stack. `createWriteStream` alone reports that as an event nobody is
   * listening for.
   */
  private async openStaging(kind: 'obs' | 'blind'): Promise<WriteStream> {
    try {
      const handle = await open(await this.staging(kind), 'w');
      const stream = handle.createWriteStream();
      stream.on('error', (err: Error) => (this.failure ??= err));
      return stream;
    } catch (err) {
      // Recorded as well as thrown. The collector treats a sink error as one
      // bad row and carries on; without this, `seal` would then be reached
      // with no stream, no rows, and no reason to refuse.
      this.failure ??= err instanceof Error ? err : new Error(String(err));
      throw this.failure;
    }
  }

  /** Buffered, not awaited: back-pressure is DuckDB's problem at seal time. */
  private append(stream: WriteStream, row: Observation | BlindSpot): void {
    this.refuseIfFailed();
    stream.write(`${JSON.stringify(row)}\n`);
  }

  private refuseIfFailed(): void {
    if (this.failure !== null) throw this.failure;
  }

  /**
   * A collector's summary and this sink's own count have to agree about whether
   * anything was written.
   *
   * They are two independent tallies of the same calls, so they can only
   * disagree if rows were lost on the way to disk. Sealing anyway would put a
   * manifest in the lake describing a run that did not happen — the mirror of
   * the artifact check further down, and the more dangerous direction, because
   * a coverage figure with no rows behind it still reads as a verdict.
   */
  private refuseIfRowsAreMissing(summary: RunSummary): void {
    if (summary.observed > 0 && this.observedCount === 0) {
      throw new Error(
        `refusing to seal ${this.stem}: the collector reported ` +
          `${summary.observed} observation(s) and none reached the sink`,
      );
    }
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
    scope: Scope,
  ): Promise<{ files: string[]; observed: number; blind: number }> {
    this.refuseIfFailed();
    this.refuseIfRowsAreMissing(summary);
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
      this.refuseIfFailed();

      const staged = join(dir, `.${this.stem}.${kind}.ndjson`);
      const target = join(dir, `${this.stem}.${kind}.parquet`);

      // The lake is append-only, and that has to be enforced rather than
      // assumed. DuckDB's COPY overwrites silently; a name collision here
      // would destroy a run that has already been reported on.
      if (await exists(target)) {
        throw new Error(
          `refusing to overwrite an existing run file: ${target}`,
        );
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
      runId: this.runId,
      collectorId: this.collectorId,
      axis: this.axis,
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'complete',
      summary,
      artifacts: files,
      scope,
    });

    return {
      files,
      observed: this.observedCount,
      blind: this.blindSpotCount,
    };
  }

  /**
   * Abandon the run, leaving the lake exactly as it was.
   *
   * Staging files are dot-prefixed and no glob matches them, so a run that
   * died without this left litter rather than corruption. That distinction
   * stops holding once runs can be started by anyone with the screen open:
   * litter accumulates once per failure, and "nothing was written" should be
   * true rather than nearly true.
   */
  async discard(): Promise<void> {
    const dir = this.lake.partitionDir(this.axis, this.startedAt);
    for (const stream of [this.observations, this.blindSpots]) {
      // `end` is given no error callback on purpose: this path is already
      // reporting a failure, and a second one raised while cleaning up after
      // the first would replace the cause with its own consequence.
      if (stream)
        await new Promise<void>((resolve) => stream.end(() => resolve()));
    }
    for (const kind of ['obs', 'blind'] as const) {
      await rm(join(dir, `.${this.stem}.${kind}.ndjson`), { force: true });
    }
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
