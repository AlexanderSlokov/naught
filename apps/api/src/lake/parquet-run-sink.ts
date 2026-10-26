import { randomBytes } from 'node:crypto';
import {
  GRADING_VERSION,
  LAKE_SCHEMA_VERSION,
  sealedStatusOf,
  summaryOf,
  type Claim,
  type RunReport,
  type Scope,
} from '@naught/shared';
import type { LakeService } from './lake.service.js';
import { stampClaim, type RunIdentity } from './claim-stamper.js';
import { EvidenceFile } from './evidence-file.js';
import { writeManifest } from './run-manifest.js';

/** What `seal` wrote, for the caller to report. */
export interface SealedRun {
  files: string[];
  rows: number;
  /** Rows that record something the run could not see. */
  unseen: number;
}

/**
 * A collector never holds its whole result in memory. A monorepo lock file
 * can exceed what a container is given, and a collector that dies at 90% has
 * produced nothing at all — which is worse than a partial run honestly
 * labelled.
 *
 * Rows are stamped into evidence and streamed to one `EvidenceFile`; the run
 * manifest is written beside it once the file is sealed.
 */
export class ParquetRunSink {
  /**
   * Distinguishes two runs of the same collector in the same second. Without
   * it, a second run inside the same clock tick writes the same filename and
   * DuckDB's COPY overwrites the first one without a word — append-only in
   * the design document and last-write-wins on disk.
   */
  private readonly nonce = randomBytes(3).toString('hex');
  private evidence?: EvidenceFile;
  private unseenCount = 0;

  /**
   * @param run `runId` is minted by whoever started the run, not by this sink. The
   *   interface shows an operator a run id the moment they ask for a run,
   *   which is before any file exists; generating a second id at seal would
   *   leave the manifest naming a run nobody watched.
   */
  constructor(
    private readonly lake: LakeService,
    private readonly run: RunIdentity,
    private readonly startedAt: Date,
  ) {}

  private get stem(): string {
    const hhmmss = this.startedAt.toISOString().slice(11, 19).replace(/:/g, '');
    const collector = this.run.collectorId.replace(/\./g, '-');
    return `${collector}--${hhmmss}-${this.nonce}`;
  }

  private get dir(): string {
    return this.lake.partitionDir(this.run.axis, this.startedAt);
  }

  private get file(): EvidenceFile {
    this.evidence ??= new EvidenceFile(this.dir, this.stem);
    return this.evidence;
  }

  /**
   * Ignored. The manifest takes its denominator from the sealed `RunSummary`,
   * which is the collector's considered account; a mid-run figure is a
   * progress reading and has no business in the lake.
   */
  async expected(_n: number): Promise<void> {}

  /** Stamped before it is staged, so a claim that cannot be a row fails here. */
  async claim(c: Claim): Promise<void> {
    const row = stampClaim(c, this.run);
    await this.file.append(row);
    if (row.observationKind === 'not_assessable') this.unseenCount += 1;
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
  private refuseIfRowsAreMissing(report: RunReport): void {
    if (report.observed > 0 && this.file.rowCount === 0) {
      throw new Error(
        `refusing to seal ${this.stem}: the collector reported ` +
          `${report.observed} observed subject(s) and no evidence reached the sink`,
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
  async seal(report: RunReport, scope: Scope): Promise<SealedRun> {
    this.file.refuseIfFailed();
    this.refuseIfRowsAreMissing(report);
    const sealed = await this.file.seal(await this.lake.query());
    const files = sealed === null ? [] : [sealed];

    // Written last, and only over files that already exist: a manifest naming
    // artifacts that were never sealed would describe a run that did not
    // happen.
    await writeManifest(this.dir, this.stem, {
      runId: this.run.runId,
      collectorId: this.run.collectorId,
      axis: this.run.axis,
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status: sealedStatusOf(scope, report.scopeCompleted),
      summary: summaryOf(report),
      artifacts: files,
      scope,
      schemaVersion: LAKE_SCHEMA_VERSION,
      collectorVersion: this.run.collectorVersion,
      gradingVersion: GRADING_VERSION,
      scopeCompleted: report.scopeCompleted,
    });
    return { files, rows: this.file.rowCount, unseen: this.unseenCount };
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
    await this.file.discard();
  }
}
