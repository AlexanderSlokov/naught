import { Injectable, Logger } from '@nestjs/common';
import type { Collector } from './collector.js';
import { DepsOsvCollector } from './deps-osv.collector.js';

@Injectable()
export class CollectorRegistry {
  private readonly log = new Logger(CollectorRegistry.name);
  private readonly collectors = new Map<string, Collector>();

  constructor(depsOsv: DepsOsvCollector) {
    for (const c of [depsOsv]) this.collectors.set(c.id, c);
    this.log.log(`${this.collectors.size} collector(s) registered`);
  }

  get(id: string): Collector | undefined {
    return this.collectors.get(id);
  }

  all(): Collector[] {
    return [...this.collectors.values()];
  }
}
