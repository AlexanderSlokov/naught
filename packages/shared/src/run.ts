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

export const RunStatus = z.enum(['running', 'complete', 'failed']);
export type RunStatus = z.infer<typeof RunStatus>;

/** What a collector is pointed at. */
export const Scope = z.object({
  /** Repository paths, image references, host groups — collector-specific. */
  targets: z.array(z.string().min(1)).min(1),
  since: z.iso.datetime().nullable().default(null),
});
export type Scope = z.infer<typeof Scope>;

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
});
export type CollectionRun = z.infer<typeof CollectionRun>;
