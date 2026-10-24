import { z } from 'zod';

/**
 * A Package URL — the unit of Naught's graph.
 *
 * Naught's node is a package at a specific version, one level finer than
 * GUAC's OS package, because "compromised" and "abandoned" are properties of
 * a version, not of a name. Repositories, images and builds are containers
 * that hold these nodes; they are not nodes themselves.
 *
 * Validated by shape only. Naught does not resolve a purl to decide whether
 * it is real — an unresolvable purl is an observation, not an error.
 */
export const Purl = z
  .string()
  .min(1)
  .regex(/^pkg:[a-zA-Z][a-zA-Z0-9.+-]*\/.+/, 'not a package URL');
export type Purl = z.infer<typeof Purl>;
