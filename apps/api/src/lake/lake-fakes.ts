import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Claim } from '@naught/shared';
import { LakeService } from './lake.service.js';
import { ParquetRunSink } from './parquet-run-sink.js';

/**
 * Test doubles for the lake. The SQL under test runs in DuckDB against real
 * Parquet files, so the lake itself is real — rooted in a scratch directory
 * that each test owns and removes.
 */

/** A `ConfigService` that knows one key: where the lake is. */
export class ScratchConfig {
  constructor(private readonly dataDir: string) {}

  get(key: string): string | undefined {
    return key === 'NAUGHT_DATA_DIR' ? this.dataDir : undefined;
  }
}

/** A real `LakeService` over a fresh temporary directory. */
export class ScratchLake {
  private constructor(
    readonly root: string,
    readonly lake: LakeService,
  ) {}

  static async create(): Promise<ScratchLake> {
    const root = await mkdtemp(join(tmpdir(), 'naught-lake-'));
    const config = new ScratchConfig(root) as unknown as ConfigService;
    return new ScratchLake(root, new LakeService(config));
  }

  /** Seals one run holding exactly `claims`, as `deps.osv` would. */
  async seal(runId: string, startedAt: string, claims: Claim[]): Promise<void> {
    const sink = new ParquetRunSink(
      this.lake,
      {
        runId,
        axis: 'deps',
        collectorId: 'deps.osv',
        collectorVersion: '2.0.0',
      },
      new Date(startedAt),
    );
    for (const c of claims) await sink.claim(c);
    const scope = { targets: ['/repo/pnpm-lock.yaml'], since: null };
    await sink.seal(
      {
        observed: 0,
        expected: null,
        coverage: null,
        scopeCompleted: scope.targets,
      },
      scope,
    );
  }

  async destroy(): Promise<void> {
    await this.lake.onModuleDestroy();
    await rm(this.root, { recursive: true, force: true });
  }
}

/** Builds the claims one package produces, for tests that need many. */
export class ClaimFactory {
  constructor(
    private readonly observedAt: string,
    private readonly container = '/repo/pnpm-lock.yaml',
  ) {}

  pinned(subject: string, declared: string): Claim {
    return {
      ...this.about(subject),
      claimType: 'contains',
      claimValue: { declared },
      observationKind: 'observed',
      sourceId: 'pnpm-lock',
    };
  }

  listed(
    subject: string,
    vuln: string,
    sourceId: Claim['sourceId'] = 'osv',
  ): Claim {
    return {
      ...this.about(subject),
      claimType: 'advisory',
      claimValue: { vuln },
      observationKind: 'observed',
      sourceId,
    };
  }

  clean(subject: string, sourceId: Claim['sourceId'] = 'osv'): Claim {
    return {
      ...this.about(subject),
      claimType: 'advisory',
      observationKind: 'absent_in_scope',
      sourceId,
    };
  }

  unanswered(subject: string): Claim {
    return {
      ...this.about(subject),
      claimType: 'advisory',
      observationKind: 'not_assessable',
      notAssessableReason: 'unreachable-upstream',
      note: 'OSV responded 503',
      sourceId: 'osv',
    };
  }

  private about(
    subject: string,
  ): Pick<Claim, 'observedAt' | 'subject' | 'subjectKind' | 'container'> {
    return {
      observedAt: this.observedAt,
      subject,
      subjectKind: 'package_version',
      container: this.container,
    };
  }
}
