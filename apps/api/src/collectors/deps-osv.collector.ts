import { Injectable, Logger } from '@nestjs/common';
import {
  coverageOf,
  type Axis,
  type RunSummary,
  type Scope,
} from '@naught/shared';
import type { Collector, RunSink } from './collector.js';
import { readPnpmLock, toPurl, type LockEntry } from './lockfile.js';

const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const CHUNK = 100;

interface OsvResult {
  vulns?: { id: string; modified?: string }[];
}

/**
 * Dependency rot, via the OSV batch API.
 *
 * Declared is the version the lockfile pinned. Observed is what OSV says
 * about that exact version today. The drift is the count of advisories that
 * apply — a number that was zero on the day the lockfile was written, and is
 * the whole reason this axis exists.
 *
 * Read-only: one POST that asks questions and changes nothing.
 */
@Injectable()
export class DepsOsvCollector implements Collector {
  readonly id = 'deps.osv';
  readonly axis: Axis = 'deps';
  private readonly log = new Logger(DepsOsvCollector.name);

  async collect(scope: Scope, sink: RunSink): Promise<RunSummary> {
    const observedAt = new Date().toISOString();
    let observed = 0;
    let expected = 0;

    for (const target of scope.targets) {
      let entries: LockEntry[];
      try {
        const lock = await readPnpmLock(target);
        entries = lock.entries;
        expected += lock.entries.length + lock.unparseable.length;

        for (const key of lock.unparseable) {
          await sink.blindSpot({
            observedAt,
            collectorId: this.id,
            axis: this.axis,
            subject: key,
            container: target,
            reason: 'unparseable',
            note: 'lockfile key is not name@version',
          });
        }
      } catch (err) {
        await sink.blindSpot({
          observedAt,
          collectorId: this.id,
          axis: this.axis,
          subject: target,
          container: null,
          reason: 'unparseable',
          note: err instanceof Error ? err.message : 'cannot read lockfile',
        });
        continue;
      }

      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        let results: OsvResult[];

        try {
          results = await this.ask(chunk);
        } catch (err) {
          // The chunk is not silently dropped and it is not counted as clean.
          // Every package in it becomes a blind spot, which lowers coverage,
          // which is exactly what an operator needs to see.
          for (const entry of chunk) {
            await sink.blindSpot({
              observedAt,
              collectorId: this.id,
              axis: this.axis,
              subject: toPurl(entry),
              container: target,
              reason: 'unreachable-upstream',
              note: err instanceof Error ? err.message : 'OSV query failed',
            });
          }
          continue;
        }

        for (const [n, entry] of chunk.entries()) {
          const vulns = results[n]?.vulns ?? [];
          await sink.observation({
            observedAt,
            collectorId: this.id,
            axis: this.axis,
            subject: toPurl(entry),
            container: target,
            declared: entry.version,
            observed: vulns.length === 0 ? 'clean' : vulns.map((v) => v.id).join(','),
            drift: vulns.length,
            detail: { advisories: vulns.map((v) => v.id) },
          });
          observed += 1;
        }
      }
    }

    this.log.log(`${observed}/${expected} package(s) answered`);
    return { observed, expected, coverage: coverageOf(observed, expected) };
  }

  private async ask(chunk: LockEntry[]): Promise<OsvResult[]> {
    const res = await fetch(OSV_BATCH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: chunk.map((e) => ({
          package: { name: e.name, ecosystem: 'npm' },
          version: e.version,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OSV responded ${res.status}`);
    const body = (await res.json()) as { results?: OsvResult[] };
    return body.results ?? [];
  }
}
