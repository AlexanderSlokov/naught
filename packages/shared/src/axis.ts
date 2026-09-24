import { z } from 'zod';

/**
 * The axes of decay. Every axis is the same shape of question: what was
 * declared, what is observed, how far apart are they.
 *
 * `deps` and `image` ship first. The rest are in the model from the start so
 * that adding a collector never means changing the data format.
 */
export const Axis = z.enum([
  'deps',
  'image',
  'placement',
  'config',
  'credentials',
]);
export type Axis = z.infer<typeof Axis>;
