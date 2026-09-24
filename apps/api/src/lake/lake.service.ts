import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The lake is a directory of Parquet files and nothing else. This service is
 * the only thing that knows where it is.
 *
 * DuckDB here is stateless: it is opened in memory and pointed at the files.
 * It holds no truth, takes no lock, and can be restarted mid-query without
 * costing anything. The `naught.duckdb` cache is a separate, droppable file
 * and is not this connection.
 */
/**
 * Injection is declared, not inferred.
 *
 * Nest can read constructor parameter types from `emitDecoratorMetadata`,
 * but only tsc emits it — esbuild, which is what tsx and vitest run on, does
 * not. Wiring that works compiled and breaks under the dev runner is a trap
 * with no error message worth reading. `@Inject` states the token outright
 * and costs nothing.
 */
@Injectable()
export class LakeService implements OnModuleDestroy {
  readonly dataDir: string;
  readonly runsDir: string;
  private instance?: DuckDBInstance;
  private connection?: DuckDBConnection;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.dataDir = config.get<string>('NAUGHT_DATA_DIR') ?? './data';
    this.runsDir = join(this.dataDir, 'runs');
  }

  /** Hive path for one run's output: runs/axis=deps/date=2026-09-24/ */
  partitionDir(axis: string, when: Date): string {
    const date = when.toISOString().slice(0, 10);
    return join(this.runsDir, `axis=${axis}`, `date=${date}`);
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
  }

  async query(): Promise<DuckDBConnection> {
    if (!this.connection) {
      this.instance = await DuckDBInstance.create(':memory:');
      this.connection = await this.instance.connect();
    }
    return this.connection;
  }

  /**
   * Reads the whole lake for one axis and one row kind. The glob is the
   * entire query planner: a file that exists is included, a file that does
   * not is not, and there is no index to fall out of sync with either.
   *
   * The kind is not optional. Observations and blind spots share a partition
   * and share column names; a glob that matches both silently unions a
   * "could not see it" row into a list of things that were seen, which is
   * precisely the lie by omission this project exists to refuse.
   */
  globFor(axis: string, kind: 'obs' | 'blind'): string {
    return join(this.runsDir, `axis=${axis}`, '**', `*.${kind}.parquet`);
  }

  /**
   * Whether the lake holds any file of this kind for this axis.
   *
   * DuckDB raises `IO Error: No files found that match the pattern` on a glob
   * that matches nothing, so every reader must ask this before querying. A lake
   * with nothing in it is a legitimate state — no collector has run yet — and
   * not a query failure.
   */
  async hasFiles(axis: string, kind: 'obs' | 'blind'): Promise<boolean> {
    const axisDir = join(this.runsDir, `axis=${axis}`);
    try {
      const entries = await readdir(axisDir, { recursive: true });
      return entries.some((name) => name.endsWith(`.${kind}.parquet`));
    } catch {
      return false;
    }
  }

  async countRunFiles(): Promise<number> {
    try {
      const entries = await readdir(this.runsDir, {
        recursive: true,
        withFileTypes: true,
      });
      return entries.filter((e) => e.isFile() && e.name.endsWith('.parquet'))
        .length;
    } catch {
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.connection?.closeSync();
    this.instance?.closeSync();
  }
}
