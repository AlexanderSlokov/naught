import { z } from 'zod';
import { Axis } from './axis.js';

/**
 * What a collector reports about its own run.
 *
 * `expected` is nullable on purpose. A collector that does not know its
 * denominator must say so, because the alternative is a collector that
 * cannot count reporting 100% coverage. Downstream, a null coverage is
 * displayed as unknown — never as complete.
 */
export const RunSummary = z.object({
  observed: z.int().nonnegative(),
  expected: z.int().nonnegative().nullable(),
  coverage: z.number().min(0).max(1).nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/** Derive coverage without ever inventing a denominator. */
export function coverageOf(
  observed: number,
  expected: number | null,
): number | null {
  if (expected === null || expected <= 0) return null;
  return Math.min(observed / expected, 1);
}

/**
 * `partial` is a sealed run that could not read every target it was pointed
 * at: `scopeCompleted` is shorter than `scope.targets`.
 */
export const RunStatus = z.enum(['running', 'complete', 'partial', 'failed']);
export type RunStatus = z.infer<typeof RunStatus>;

/** What a collector is pointed at. */
export const Scope = z.object({
  /** Repository paths, image references, host groups — collector-specific. */
  targets: z.array(z.string().min(1)).min(1),
  since: z.iso.datetime().nullable().default(null),
});
export type Scope = z.infer<typeof Scope>;

/**
 * What a collector returns: its summary, plus which targets it actually read.
 * The gap between `scope.targets` and `scopeCompleted` is coverage at the
 * level of whole inputs, stated rather than reconstructed from rows.
 */
export const RunReport = RunSummary.extend({
  scopeCompleted: z.array(z.string().min(1)),
});
export type RunReport = z.infer<typeof RunReport>;

/** The summary alone, for the places that must not grow a field. */
export function summaryOf({
  observed,
  expected,
  coverage,
}: RunReport): RunSummary {
  return { observed, expected, coverage };
}

/**
 * The lake's schema version as of this code (ADR 0005). Version 2 is the
 * evidence table of ADR 0007; version 1 is observations plus blind spots.
 */
export const LAKE_SCHEMA_VERSION = 2;

/** The manifest of one collection run. One row per run, not per observation. */
export const CollectionRun = z.object({
  runId: z.uuid(),
  collectorId: z.string().min(1),
  axis: Axis,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  status: RunStatus,
  summary: RunSummary.nullable(),
  /** Parquet files this run appended. The run is only real once these exist. */
  artifacts: z.array(z.string()).default([]),

  /**
   * What the run was pointed at, so that a later run can repeat it without an
   * operator retyping a path.
   *
   * Nullable and defaulted rather than required: manifests written before this
   * field existed must keep parsing. `readManifests` drops anything it cannot
   * parse, so making this mandatory would make every run that predates it
   * vanish from the lake rather than merely be incomplete — the lie by
   * omission this project exists to refuse. A null here means the run cannot
   * be repeated, and callers say so rather than guessing a scope.
   */
  scope: Scope.nullable().default(null),

  /**
   * Which generation of the column set the run's files were written at. The
   * same compatibility rule as `scope`: absent in older manifests, and read as
   * 1 by `schemaVersionOf` rather than guessed from the files (ADR 0005).
   */
  schemaVersion: z.int().positive().nullable().default(null),

  /** The collector build that wrote the run. Null before schema version 2. */
  collectorVersion: z.string().min(1).nullable().default(null),

  /** The grading the run's evidence was stamped with (ADR 0008). */
  gradingVersion: z.string().min(1).nullable().default(null),

  /** The targets the run actually read. Null when it was not recorded. */
  scopeCompleted: z.array(z.string().min(1)).nullable().default(null),

  /**
   * The version 1 files this run was rewritten from, when it was. The same
   * lineage a compacted file keeps of its sources (ADR 0006).
   */
  migratedFrom: z.array(z.string().min(1)).nullable().default(null),
});
export type CollectionRun = z.infer<typeof CollectionRun>;
/** A manifest before parsing: fields with defaults may be left out. */
export type CollectionRunInput = z.input<typeof CollectionRun>;

/**
 * The schema version a manifest states, with an unstated one read as 1.
 *
 * @example
 * schemaVersionOf(CollectionRun.parse(oldManifest)); // 1
 */
export function schemaVersionOf(run: CollectionRun): number {
  return run.schemaVersion ?? 1;
}

/** `partial` when any target in the scope went unread, else `complete`. */
export function sealedStatusOf(
  scope: Scope,
  scopeCompleted: readonly string[],
): RunStatus {
  const read = new Set(scopeCompleted);
  return scope.targets.every((t) => read.has(t)) ? 'complete' : 'partial';
}
