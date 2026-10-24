import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  COLLECTION_QUEUE,
  type CollectionJob,
  type RunQueue,
} from './run-queue.js';

/**
 * `RunQueue` over BullMQ.
 *
 * The job id is the collector id, which is what makes a duplicate impossible
 * rather than merely unlikely: BullMQ refuses a second job under an id that is
 * already present, so the check in `CollectionStarter` and the queue itself
 * agree even if two requests arrive in the same tick.
 *
 * Settled jobs are removed so the id frees itself. Their outcome is not lost —
 * a sealed run is in the lake, and a failed run was reported on the socket and
 * in the log. Keeping them here would only mean a run that succeeded yesterday
 * blocking one today.
 */
@Injectable()
export class BullRunQueue implements RunQueue {
  constructor(
    @InjectQueue(COLLECTION_QUEUE)
    private readonly queue: Queue<CollectionJob>,
  ) {}

  async inFlight(collectorId: string): Promise<CollectionJob | null> {
    const job = await this.queue.getJob(collectorId);
    return job?.data ?? null;
  }

  async enqueue(job: CollectionJob): Promise<void> {
    await this.queue.add(job.collectorId, job, {
      jobId: job.collectorId,
      removeOnComplete: true,
      removeOnFail: true,
      // Collection reads external systems. A retry is another round of
      // requests nobody asked for, and the operator can simply click again.
      attempts: 1,
    });
  }
}
