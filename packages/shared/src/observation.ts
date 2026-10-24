import { z } from 'zod';
import { Axis } from './axis.js';
import { Purl } from './purl.js';

/**
 * One fact a collector saw, at one moment. Rows of these are what land in
 * Parquet, and Parquet is the truth. Nothing here is ever edited afterwards.
 */
export const Observation = z.object({
  /** When the collector looked. Not when the fact became true. */
  observedAt: z.iso.datetime(),

  /** Which collector produced this, e.g. "deps.osv". Provenance is not optional. */
  collectorId: z.string().min(1),

  axis: Axis,

  /** The node this is about. */
  subject: Purl,

  /** Where the subject was found — a repo, an image digest, a host. */
  container: z.string().min(1).nullable(),

  /** What the declaration said. */
  declared: z.string().nullable(),

  /** What reality says now. */
  observed: z.string().nullable(),

  /**
   * The drift on this axis, as a number. Comparable within an axis, not
   * across them. `null` means the collector saw the subject but cannot place
   * it on the scale — which is not the same as zero drift.
   */
  drift: z.number().nullable(),

  /** Anything the collector wants to keep that the schema does not name. */
  detail: z.record(z.string(), z.unknown()).default({}),
});
export type Observation = z.infer<typeof Observation>;

/**
 * Something the collector knew it could not see, and why.
 *
 * A map that lies by omission is worse than no map. A blind spot is a first
 * class row in the lake, written on the same path as an observation, and it
 * is what keeps the coverage denominator honest.
 */
export const BlindSpot = z.object({
  observedAt: z.iso.datetime(),
  collectorId: z.string().min(1),
  axis: Axis,

  /** What could not be seen. A purl when known, a free description when not. */
  subject: z.string().min(1),

  container: z.string().min(1).nullable(),

  reason: z.enum([
    'unsupported-ecosystem',
    'unparseable',
    'unreachable-upstream',
    'rate-limited',
    'access-denied',
    'opaque-layer',
    'vendored-binary',
    'other',
  ]),

  note: z.string().nullable(),
});
export type BlindSpot = z.infer<typeof BlindSpot>;
