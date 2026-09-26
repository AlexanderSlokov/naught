import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { LakeService } from '../lake/lake.service.js';
import { CollectorRegistry } from '../collectors/collector.registry.js';
import { ParquetRunSink } from '../lake/parquet-run-sink.js';
import { ProgressReportingSink } from '../lake/progress-reporting-sink.js';
import { RunBroadcaster } from './run-broadcaster.js';
import { COLLECTION_QUEUE, type CollectionJob } from './run-queue.js';

/**
 * Runs one collection, off the request path.
 *
 * This is the same sequence `poc.ts` performs synchronously — collect, then
 * seal — with two differences that matter operationally: the sink reports as
 * it goes, and a failure discards its staging rather than leaving a half-run
 * behind. Nothing reaches the lake until `seal` returns, so a run that dies
 * mid-flight leaves the previous state exactly as it was.
 */
@Processor(COLLECTION_QUEUE, { concurrency: 1 })
export class CollectionProcessor extends WorkerHost {
  private readonly log = new Logger(CollectionProcessor.name);

  constructor(
    @Inject(LakeService) private readonly lake: LakeService,
    @Inject(CollectorRegistry) private readonly collectors: CollectorRegistry,
    @Inject(RunBroadcaster) private readonly events: RunBroadcaster,
  ) {
    super();
  }

  async process(job: Job<CollectionJob>): Promise<void> {
    const { runId, collectorId, scope } = job.data;
    const collector = this.collectors.get(collectorId);
    if (!collector)
      throw new Error(`collector ${collectorId} is not registered`);

    await this.lake.ensureDirs();
    const startedAt = new Date();
    const parquet = new ParquetRunSink(
      this.lake,
      collector.axis,
      collector.id,
      startedAt,
      runId,
    );
    this.events.started(runId, startedAt);

    try {
      const sink = new ProgressReportingSink(parquet, this.events, runId);
      const summary = await collector.collect(scope, sink);
      const sealed = await parquet.seal(summary, scope);
      this.events.sealed(runId, summary, sealed.files);
      this.log.log(`${runId} sealed ${sealed.observed} observation(s)`);
    } catch (err) {
      await this.discard(parquet, runId, err);
      throw err;
    }
  }

  /**
   * Reports the failure before rethrowing, because BullMQ's own failure
   * handling is invisible to the operator watching the screen.
   */
  private async discard(
    sink: ParquetRunSink,
    runId: string,
    err: unknown,
  ): Promise<void> {
    const reason = err instanceof Error ? err.message : String(err);
    await sink.discard();
    this.events.failed(runId, reason);
    this.log.error(`${runId} failed: ${reason}`);
  }
}
