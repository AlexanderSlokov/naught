# Foundry Workshop: application design constraints

> **Source.** Condensed from
> [Workshop · Application design best practices](https://www.palantir.com/docs/foundry/workshop/application-design-best-practices),
> retrieved 2026-09-24. Summary, not a copy.

## Scan pattern

Users read an operational screen in an **F shape**: horizontally across the top,
then down the left edge. Three layout families follow from that — grid
(left-to-right flow), columnar (top-to-bottom with navigation at the top), or a
hybrid of rows and columns.

## Density budget

These are the numbers, stated as limits rather than suggestions:

- At most **five** primary actions in top-level navigation.
- At most **ten** visible components per screen, counting buttons, panels and
  widgets together.
- **30–40% whitespace** across the interface.
- Touch targets **≥ 30px** wherever the surface scrolls.

The reasoning given is cognitive load, not aesthetics.

## Visual hierarchy

Typography carries the structure: page header largest, section header second,
subheading description for supplementary context.

Containers isolate distinct content groups; dividers separate related content
within one group. Default to **Compact** padding, or standardize on 16px.

Elevation is rationed: drop shadows and borders **once per page**. Applying them
more often dilutes the emphasis they exist to create. Lighter backgrounds read
as higher priority; darker tones read as secondary — filters, chrome.

## Navigation and scrolling

Pin navigation bars and tabs to the primary header so that only content-bearing
sections scroll. Avoid horizontal scrolling; fit table columns instead.

## Across an application

A centralized homepage for module navigation, a consistent primary header
(logo, settings), and standardized placement of recurring widgets — filters
especially — so that a user who learns one module has learned the rest.
