# 4. Where `declared` comes from for base images

**Status:** accepted
**Date:** 2026-09-26

## Context

The `image` axis compares the digest a base image tag resolved to *when the
image was built* against the digest that same tag resolves to now. The second
number is free: resolve the tag against the registry. The first number is the
problem, and `ARCHITECTURE.md` §10 has carried it as an open question since the
axis was designed.

Nothing in a running image is obliged to remember what its base tag pointed at.
`FROM node:20-alpine` is recorded in the Dockerfile; the digest that line
resolved to on the day of the build is not, unless something wrote it down.

The failure mode to avoid is specific. A collector that cannot find a build-time
digest could resolve the tag twice, find the two answers agree, and report *no
drift*. Every image in the estate would then read as current, and the axis would
be at its most reassuring exactly when it knows least. §2 forbids this: what a
collector cannot see is recorded as unknown, never silently omitted.

## Decision

**`declared` is read from the first of three sources that is present, and when
none is, the axis reports itself unavailable and names what is missing.**

In order:

1. **The image's own config.** The `org.opencontainers.image.base.digest` and
   `…base.name` annotations, which BuildKit writes at build time. The cheapest
   source by a wide margin: it needs the registry read access this axis already
   requires, and nothing else deployed.
2. **Build metadata.** A provenance record or CI artifact naming the digest that
   was resolved when the image was built. The most authoritative source, and
   available only where the builder was configured to produce one.
3. **An SBOM.** When it lists the base image as a component and carries its
   digest.

The order is by cost to the operator, not by authority. An operator who has done
nothing beyond building with a current BuildKit gets the axis for free; an
operator with provenance or an SBOM gets a stronger answer from what they
already publish.

When an image carries none of the three, the axis does not guess and does not
render empty:

> Base image drift unavailable for `acme/api:2026.9`. No build-time digest
> recorded. This axis needs one of: base-image annotations in the image config,
> a provenance record from the build, or an SBOM naming the base image.

*Unavailable* is a third state beside zero and unknown, defined in
`ARCHITECTURE.md` §12 and reported as itself. "The tag has not moved" and
"nobody wrote down where the tag pointed" are the two facts this project exists
to keep apart.

## Consequences

- The lightweight collector for this axis stays lightweight, per §5: registry
  read access, no sibling tool, no builder changes required.
- The interface needs a per-axis *unavailable* state carrying a sentence.
  `AxisAvailability` currently answers `hasData` as a boolean, which conflates
  "nothing has looked yet" with "this cannot be computed here" — two different
  things to tell an operator.
- The unavailability is a property of the axis for one image, not of the run, so
  it is not a blind spot row. A run that finds no declared digest for 3 of 40
  images has 37 subjects and 3 blind spots; a run where no image in scope
  carries any of the three sources has an unavailable axis.
- This does not settle the coverage denominator for the image axis, which
  remains open in §10. The collector must state what `expected` counts, or
  record in that section why it has none.
- An operator who wants the axis and does not have it has a named remedy, which
  is the point of naming all three sources in the message rather than the one
  that was looked for first.
