import { Module } from '@nestjs/common';
import { DepsOsvCollector } from './deps-osv.collector.js';
import { CollectorRegistry } from './collector.registry.js';

/**
 * One module, one provider per collector. Adding an axis means adding a file
 * here and nothing anywhere else — the reason this stack has dependency
 * injection at all.
 */
@Module({
  providers: [DepsOsvCollector, CollectorRegistry],
  exports: [CollectorRegistry],
})
export class CollectorsModule {}
