/**
 * How far a subject has drifted, rendered as a class rather than a colour.
 *
 * Null is not zero. A collector that saw a subject but could not place it on
 * the scale has said something different from "no drift", and the interface
 * has to keep those apart — `SubjectRow.drift` is nullable for exactly this
 * reason.
 *
 * A class and not an inline colour, because a selected row inverts its
 * background and an inline colour cannot be overridden by the stylesheet that
 * knows about the inversion.
 *
 * @example driftClass(3) // → 'naught-drift naught-drift--danger'
 */
export function driftClass(drift: number | null): string {
  return `naught-drift naught-drift--${severity(drift)}`;
}

function severity(drift: number | null): 'unknown' | 'danger' | 'warning' | 'none' {
  if (drift === null) return 'unknown';
  if (drift >= 3) return 'danger';
  if (drift >= 1) return 'warning';
  return 'none';
}
