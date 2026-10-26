import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  coverageOf,
  type Axis,
  type Claim,
  type RunReport,
  type Scope,
} from '@naught/shared';
import type { Collector, RunSink } from './collector.js';
import {
  readPnpmLock,
  toPurl,
  type LockEntry,
  type LockfileRead,
} from './lockfile.js';
import { OSV_CLIENT, type OsvAdvisory, type OsvClient } from './osv-client.js';

const CHUNK = 100;

/** Where and when one target is being read; shared by every claim about it. */
interface TargetContext {
  readonly observedAt: string;
  readonly container: string;
  readonly sink: RunSink;
}

/**
 * Dependency rot, via the OSV batch API.
 *
 * For each package the lockfile pins, the collector records two things as
 * separate claims (ADR 0007): that the lockfile `contains` it, and what OSV
 * says about `advisory` — one row per advisory listed, one `absent_in_scope`
 * row when OSV lists none, or one `not_assessable` row when OSV did not answer.
 * Drift is not computed here; it is derived from these rows.
 */
@Injectable()
export class DepsOsvCollector implements Collector {
  readonly id = 'deps.osv';
  readonly axis: Axis = 'deps';
  readonly version = '2.0.0';
  private readonly log = new Logger(DepsOsvCollector.name);

  constructor(@Inject(OSV_CLIENT) private readonly osv: OsvClient) {}

  async collect(scope: Scope, sink: RunSink): Promise<RunReport> {
    const observedAt = new Date().toISOString();
    const tally = { observed: 0, expected: 0 };
    const scopeCompleted: string[] = [];
    for (const container of scope.targets) {
      const ctx = { observedAt, container, sink };
      const entries = await this.declare(ctx, tally);
      if (entries === null) continue;
      scopeCompleted.push(container);
      tally.observed += await this.askAbout(ctx, entries);
    }
    const { observed, expected } = tally;
    this.log.log(`${observed}/${expected} package(s) answered`);
    return {
      observed,
      expected,
      coverage: coverageOf(observed, expected),
      scopeCompleted,
    };
  }

  /**
   * Reads one lockfile and records what it declares. Returns null when the
   * lockfile cannot be read at all, which is itself recorded.
   */
  private async declare(
    ctx: TargetContext,
    tally: { expected: number },
  ): Promise<LockEntry[] | null> {
    const lock = await this.readLock(ctx);
    if (lock === null) return null;
    const { entries, unparseable } = lock;
    tally.expected += entries.length + unparseable.length;
    // The denominator is known the moment the lockfile is read, long before
    // the OSV round trips that dominate the run. Announcing it here is what
    // lets a watching interface show a proportion rather than a count
    // climbing towards nothing.
    await ctx.sink.expected(tally.expected);
    for (const key of unparseable) await this.unparseableKey(ctx, key);
    for (const entry of entries) await this.pinned(ctx, entry);
    return entries;
  }

  private async readLock(ctx: TargetContext): Promise<LockfileRead | null> {
    try {
      return await readPnpmLock(ctx.container);
    } catch (err) {
      await this.unreadableLockfile(ctx, err);
      return null;
    }
  }

  private async unreadableLockfile(
    ctx: TargetContext,
    err: unknown,
  ): Promise<void> {
    await ctx.sink.claim({
      ...base(ctx, ctx.container, 'container'),
      container: null,
      claimType: 'contains',
      sourceId: 'pnpm-lock',
      ...unseen(
        'unparseable',
        err instanceof Error ? err.message : 'cannot read lockfile',
      ),
    });
  }

  private async unparseableKey(ctx: TargetContext, key: string): Promise<void> {
    await ctx.sink.claim({
      ...base(ctx, key, 'lockfile_key'),
      claimType: 'contains',
      sourceId: 'pnpm-lock',
      ...unseen('unparseable', 'lockfile key is not name@version'),
    });
  }

  private async pinned(ctx: TargetContext, entry: LockEntry): Promise<void> {
    await ctx.sink.claim({
      ...base(ctx, toPurl(entry), 'package_version'),
      claimType: 'contains',
      claimValue: { declared: entry.version },
      observationKind: 'observed',
      sourceId: 'pnpm-lock',
    });
  }

  /** Asks OSV about every entry, a chunk at a time. Returns how many it answered. */
  private async askAbout(
    ctx: TargetContext,
    entries: LockEntry[],
  ): Promise<number> {
    let answered = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      answered += await this.askChunk(ctx, chunk);
    }
    return answered;
  }

  /**
   * A chunk that fails is not silently dropped and is not counted as clean.
   * Every package in it is recorded as not assessable, which lowers coverage,
   * which is exactly what an operator needs to see.
   */
  private async askChunk(
    ctx: TargetContext,
    chunk: LockEntry[],
  ): Promise<number> {
    let answers: OsvAdvisory[][];
    try {
      answers = await this.osv.advisoriesFor(chunk);
    } catch (err) {
      const note = err instanceof Error ? err.message : 'OSV query failed';
      for (const entry of chunk) await this.unanswered(ctx, entry, note);
      return 0;
    }
    for (const [n, entry] of chunk.entries()) {
      await this.answered(ctx, entry, answers[n] ?? []);
    }
    return chunk.length;
  }

  private async unanswered(
    ctx: TargetContext,
    entry: LockEntry,
    note: string,
  ): Promise<void> {
    await ctx.sink.claim({
      ...base(ctx, toPurl(entry), 'package_version'),
      claimType: 'advisory',
      sourceId: 'osv',
      ...unseen('unreachable-upstream', note),
    });
  }

  private async answered(
    ctx: TargetContext,
    entry: LockEntry,
    advisories: OsvAdvisory[],
  ): Promise<void> {
    const about = {
      ...base(ctx, toPurl(entry), 'package_version'),
      claimType: 'advisory',
      sourceId: 'osv',
    } as const;
    if (advisories.length === 0) {
      await ctx.sink.claim({ ...about, observationKind: 'absent_in_scope' });
      return;
    }
    for (const a of advisories) {
      await ctx.sink.claim({
        ...about,
        claimValue: { vuln: a.id },
        observationKind: 'observed',
        sourceAssertedAt: a.modified,
      });
    }
  }
}

/** The fields every claim about one subject in one target shares. */
function base(
  ctx: TargetContext,
  subject: string,
  subjectKind: Claim['subjectKind'],
): Pick<Claim, 'observedAt' | 'subject' | 'subjectKind' | 'container'> {
  return {
    observedAt: ctx.observedAt,
    subject,
    subjectKind,
    container: ctx.container,
  };
}

function unseen(
  reason: NonNullable<Claim['notAssessableReason']>,
  note: string,
): Pick<Claim, 'observationKind' | 'notAssessableReason' | 'note'> {
  return {
    observationKind: 'not_assessable',
    notAssessableReason: reason,
    note,
  };
}
