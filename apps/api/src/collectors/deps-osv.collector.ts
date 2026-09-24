import { Injectable } from '@nestjs/common';
import { coverageOf, type Axis, type RunSummary, type Scope } from '@naught/shared';
import type { Collector, RunSink } from './collector.js';

/**
 * Dependency rot via the OSV batch API. Not implemented yet.
 *
 * Until it is, it reports itself as a blind spot rather than as a clean run.
 * A collector that does nothing and says nothing is indistinguishable from a
 * collector that looked and found nothing, and Naught does not ship that
 * ambiguity even in its own scaffolding.
 */
@Injectable()
export class DepsOsvCollector implements Collector {
  readonly id = 'deps.osv';
  readonly axis: Axis = 'deps';

  async collect(scope: Scope, sink: RunSink): Promise<RunSummary> {
    for (const target of scope.targets) {
      await sink.blindSpot({
        observedAt: new Date().toISOString(),
        collectorId: this.id,
        axis: this.axis,
        subject: target,
        container: null,
        reason: 'other',
        note: 'collector not implemented',
      });
    }
    return { observed: 0, expected: null, coverage: coverageOf(0, null) };
  }
}
