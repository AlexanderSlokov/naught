import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Claim, Scope } from '@naught/shared';
import { ParquetRunSink } from './parquet-run-sink.js';
import type { LakeService } from './lake.service.js';

const RUN = '44444444-4444-4444-8444-444444444444';
const STARTED = new Date('2026-09-26T11:00:35.000Z');
const SCOPE: Scope = { targets: ['/repo/pnpm-lock.yaml'], since: null };

/**
 * A lake rooted at a scratch directory. Only the two members the sink uses;
 * DuckDB is never reached, because every test here fails before seal.
 */
class FakeLake {
  constructor(private readonly root: string) {}

  partitionDir(axis: string, when: Date): string {
    return join(
      this.root,
      `axis=${axis}`,
      `date=${when.toISOString().slice(0, 10)}`,
    );
  }

  async query(): Promise<never> {
    throw new Error('the lake was queried on a path that should never seal');
  }
}

const claim = (subject: string): Claim => ({
  observedAt: STARTED.toISOString(),
  subject,
  subjectKind: 'package_version',
  container: '/repo/pnpm-lock.yaml',
  claimType: 'advisory',
  observationKind: 'absent_in_scope',
  sourceId: 'osv',
});

const IDENTITY = {
  runId: RUN,
  axis: 'deps',
  collectorId: 'deps.osv',
  collectorVersion: '2.0.0',
} as const;

function sinkOver(lake: FakeLake): ParquetRunSink {
  return new ParquetRunSink(lake as unknown as LakeService, IDENTITY, STARTED);
}

describe('ParquetRunSink, on a lake it cannot write to', () => {
  let root: string;
  let partition: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'naught-sink-'));
    partition = join(root, 'axis=deps', 'date=2026-09-26');
    await mkdir(partition, { recursive: true });
    await chmod(partition, 0o555);
  });

  afterEach(async () => {
    await chmod(partition, 0o755);
    await rm(root, { recursive: true, force: true });
  });

  /**
   * Regression. `createWriteStream` reports a failed open as an asynchronous
   * `'error'` event; with no listener Node ends the process. That was survivable
   * while a run was only ever a CLI script, and stopped being survivable when a
   * run could be started from the interface — one unwritable partition took the
   * whole API down instead of failing one run.
   */
  it('rejects rather than emitting an unhandled stream error', async () => {
    const sink = sinkOver(new FakeLake(root));
    await expect(sink.claim(claim('pkg:npm/a@1.0.0'))).rejects.toThrow(
      /EACCES|permission denied/,
    );
  });

  it('refuses to seal a run whose rows never landed', async () => {
    const sink = sinkOver(new FakeLake(root));
    await sink.claim(claim('pkg:npm/a@1.0.0')).catch(() => undefined);

    await expect(
      sink.seal(
        {
          observed: 1,
          expected: 1,
          coverage: 1,
          scopeCompleted: SCOPE.targets,
        },
        SCOPE,
      ),
    ).rejects.toThrow(/EACCES|permission denied/);
  });

  it('leaves no staging file behind when discarded', async () => {
    const sink = sinkOver(new FakeLake(root));
    await sink.claim(claim('pkg:npm/a@1.0.0')).catch(() => undefined);
    await sink.discard();

    await chmod(partition, 0o755);
    expect(await readdir(partition)).toEqual([]);
  });
});
