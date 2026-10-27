# Palantir design language: tokens and tiering

> **Source.** Condensed from the Palantir entry in
> [`ndroussi/design-md-for-ai`](https://github.com/ndroussi/design-md-for-ai/blob/main/design-md/palantir/DESIGN.md),
> retrieved 2026-09-24. This is a summary, not a copy, and not authoritative:
> where it disagrees with Blueprint's own published tokens, Blueprint wins.
> Naught reads these values from `--bp-palette-*` and `--bp-intent-*` at runtime
> rather than transcribing the hex codes below.

## Stated philosophy

Operational software for consequential work. Dark analytical surfaces, rigorous
structure, no ornament. Intent carries meaning; it is not decoration.

## Intent colors

| Intent | Blueprint token | Legacy hex |
|---|---|---|
| Primary | `--bp-intent-primary-rest` | `#137CBD` (blue-5) |
| Success | `--bp-intent-success-rest` | `#0F9960` (green-5) |
| Warning | `--bp-intent-warning-rest` | `#D9822B` (orange-5) |
| Danger | `--bp-intent-danger-rest` | `#DB3737` (red-5) |

## Dark neutrals

Backgrounds `#182026` → `#293742`; borders `#30404D`; text `#5C7080` (muted)
through `#BFCCD6` (primary). Light neutrals exist as the secondary palette:
background `#F5F8FA`, borders `#D8E1E8`, text `#182026`.

## Type scale

| Role | Size | Weight |
|---|---|---|
| Page title | 32px | 700 |
| Section title | 24px | 600 |
| Widget title | 18px | 600 |
| Body | 14px | 400 |
| Label / button | 12px | 600 |

System sans-serif throughout; monospace reserved for technical content.

## Spacing and density

Medium-high density on a 4 / 8 / 12 / 16 / 20 / 24 scale. Border radius 3px on
controls, 4px on widgets, 6px on section containers. Minimum control height
32px. Buttons carry 12px horizontal padding; widgets 16px, sections 20px.

## Tiering

Three tiers, and the names matter because the layout system in
[`palantir-workshop-layouts.md`](./palantir-workshop-layouts.md) uses them:

**Page** (dark backdrop) → **Section** (a logical group) → **Widget** (one
focused unit of work).

Hierarchy is established by borders and contrast first; shadows are a last
resort. No arbitrary custom colors — the intent palette is reused.
