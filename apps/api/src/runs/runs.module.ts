import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LakeModule } from '../lake/lake.module.js';
import { CollectorsModule } from '../collectors/collectors.module.js';
import { CollectorRegistry } from '../collectors/collector.registry.js';
import { BullRunQueue } from './bull-run-queue.js';
import { CollectionProcessor } from './collection.processor.js';
import { CollectionStarter } from './collection-starter.js';
import { LakeManifestStore } from './lake-manifest-store.js';
import { RunBroadcaster } from './run-broadcaster.js';
import { RunsController } from './runs.controller.js';
import { COLLECTION_QUEUE } from './run-queue.js';

/**
 * Starting a run from the interface: a producer on the request path, a worker
 * beside it, and a socket telling the operator what happened.
 *
 * `CollectionStarter` is built by a factory rather than decorated, because it
 * holds the refusal logic and has to be constructible in a test without a
 * Redis, a lake, or Nest.
 */
@Module({
  imports: [
    LakeModule,
    CollectorsModule,
    BullModule.registerQueue({ name: COLLECTION_QUEUE }),
  ],
  controllers: [RunsController],
  providers: [
    BullRunQueue,
    CollectionProcessor,
    LakeManifestStore,
    RunBroadcaster,
    {
      provide: CollectionStarter,
      inject: [CollectorRegistry, LakeManifestStore, BullRunQueue],
      useFactory: (
        collectors: CollectorRegistry,
        manifests: LakeManifestStore,
        queue: BullRunQueue,
      ) => new CollectionStarter(collectors, manifests, queue),
    },
  ],
})
export class RunsModule {}
