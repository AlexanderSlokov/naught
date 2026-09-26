import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LakeModule } from './lake/lake.module.js';
import { CollectorsModule } from './collectors/collectors.module.js';

/**
 * Everything needed to run a collection and write it to the lake, and nothing
 * that needs a service beside it.
 *
 * ARCHITECTURE §5: "The lightweight path must always exist and must never
 * require another service to be deployed." Once `AppModule` gained a queue,
 * booting it became a Redis connection, and `make poc-here` — the command that
 * proves Naught works at all — would hang on a machine that has no Redis.
 * The CLI entry points boot this instead.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    LakeModule,
    CollectorsModule,
  ],
  exports: [LakeModule, CollectorsModule],
})
export class StandaloneCollectionModule {}
