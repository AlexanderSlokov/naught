// noinspection SqlNoDataSourceInspection,SqlResolve
// The SQL below runs against an in-memory DuckDB pointed at Parquet files.
// There is no datasource to configure, by design.
import type { WriteStream } from 'node:fs';
import { access, mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { Evidence } from '@naught/shared';
import { EVIDENCE_COLUMNS, EVIDENCE_SUFFIX, columnsClause } from './schema.js';

/**
 * One `{stem}.evidence.parquet`, written the only way the lake accepts: rows
 * streamed to a dot-prefixed staging file, then converted to Parquet in one
 * DuckDB pass, refusing to overwrite. Shared by the run sink and the version
 * 1 rewriter so there is exactly one writer of the format.
 *
 * Parquet is written by the same engine that reads it, so there is no second
 * implementation of the format to disagree with.
 *
 * @example
 * const file = new EvidenceFile(dir, 'deps-osv--030412-811d6f');
 * await file.append(row);
 * const path = await file.seal(db); // null if no row was appended
 */
export class EvidenceFile {
  private stream?: WriteStream;
  private rows = 0;

  /**
   * The first write error, held rather than thrown from where it happened.
   *
   * A stream reports a failed write as an asynchronous `'error'` event, and an
   * unhandled one of those ends the process — which used to mean a CLI script
   * dying and now means the API. Errors are captured here and re-thrown from
   * the next call or from `seal`, on a stack the caller can report to an
   * operator.
   */
  private failure: Error | null = null;

  constructor(
    private readonly dir: string,
    private readonly stem: string,
  ) {}

  get rowCount(): number {
    return this.rows;
  }

  get target(): string {
    return join(this.dir, `${this.stem}${EVIDENCE_SUFFIX}`);
  }

  private get stagingPath(): string {
    return join(this.dir, `.${this.stem}.evidence.ndjson`);
  }

  /** Buffered, not awaited: back-pressure is DuckDB's problem at seal time. */
  async append(row: Evidence): Promise<void> {
    this.stream ??= await this.openStaging();
    this.refuseIfFailed();
    this.stream.write(`${JSON.stringify(row)}\n`);
    this.rows += 1;
  }

  /**
   * Opens the staging file and takes ownership of its errors.
   *
   * The descriptor is opened and awaited before the stream exists, so that a
   * lake this run cannot write to at all — a read-only volume, a full disk, a
   * partition owned by someone else — rejects here, where the caller is still
   * on the stack. `createWriteStream` alone reports that as an event nobody is
   * listening for.
   */
  private async openStaging(): Promise<WriteStream> {
    try {
      await mkdir(this.dir, { recursive: true });
      const handle = await open(this.stagingPath, 'w');
      const stream = handle.createWriteStream();
      stream.on('error', (err: Error) => (this.failure ??= err));
      return stream;
    } catch (err) {
      // Recorded as well as thrown. A collector treats a sink error as one
      // bad row and carries on; without this, `seal` would then be reached
      // with no stream, no rows, and no reason to refuse.
      this.failure ??= err instanceof Error ? err : new Error(String(err));
      throw this.failure;
    }
  }

  refuseIfFailed(): void {
    if (this.failure !== null) throw this.failure;
  }

  /**
   * Converts staging to Parquet and returns the file written, or null when no
   * row was appended. The Parquet file appears only once it is complete: a
   * reader globbing the lake mid-run sees the previous state, never a
   * half-written one.
   */
  async seal(db: DuckDBConnection): Promise<string | null> {
    this.refuseIfFailed();
    const stream = this.stream;
    if (!stream) return null;
    await new Promise<void>((resolve, reject) =>
      stream.end((err?: Error | null) => (err ? reject(err) : resolve())),
    );
    this.refuseIfFailed();
    // The lake is append-only, and that has to be enforced rather than
    // assumed. DuckDB's COPY overwrites silently; a name collision here
    // would destroy a run that has already been reported on.
    if (await exists(this.target)) {
      throw new Error(
        `refusing to overwrite an existing run file: ${this.target}`,
      );
    }
    await db.run(
      `COPY (SELECT * FROM read_json('${this.stagingPath}', format = 'newline_delimited', columns = ${columnsClause(EVIDENCE_COLUMNS)})) ` +
        `TO '${this.target}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );
    await rm(this.stagingPath, { force: true });
    return this.target;
  }

  /**
   * Abandons the file, leaving the lake exactly as it was. Staging files are
   * dot-prefixed and no glob matches them, but "nothing was written" should
   * be true rather than nearly true.
   */
  async discard(): Promise<void> {
    const stream = this.stream;
    // `end` is given no error callback on purpose: this path is already
    // reporting a failure, and a second one raised while cleaning up after
    // the first would replace the cause with its own consequence.
    if (stream)
      await new Promise<void>((resolve) => stream.end(() => resolve()));
    await rm(this.stagingPath, { force: true });
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
