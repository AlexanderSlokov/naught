# 2. pnpm as the package manager

**Status:** accepted
**Date:** 2026-09-24

## Context

Naught is a tool for finding dependency rot that is itself assembled out of
npm packages. The choice of package manager is therefore not incidental — it
is the first place Naught either practises what it measures or does not.

Candidates: npm, yarn, pnpm, bun.

## Decision

**pnpm**, pinned via `packageManager` in the root manifest.

The deciding properties are about the supply chain, not ergonomics:

- **Install scripts are blocked by default.** pnpm does not execute a
  dependency's lifecycle scripts unless it is named in
  `onlyBuiltDependencies`. Under npm, `npm install` grants arbitrary code
  execution to every package in the tree, transitively. This is the single
  largest difference and it is the reason for the choice.
- **A cooldown on new releases.** `minimumReleaseAge: 10080` makes pnpm
  refuse any version published less than seven days ago. Registry compromises
  are typically caught within hours; this window removes the class of attack
  where a freshly published malicious version is pulled in by a range.
- **Strict `node_modules`.** A package that is not declared cannot be
  imported. Phantom dependencies are undeclared edges in the graph — exactly
  the blind spot Naught exists to refuse.
- **A content-addressable store.** Package contents are verified by hash and
  shared between workspaces rather than copied.

Alongside it: `save-exact=true`, so every version in a manifest is exact and
the lockfile is the only place resolution happens.

## Consequences

- A dependency that genuinely needs a build script will fail loudly until it
  is added to `onlyBuiltDependencies`. This is the intended cost; each entry
  is a deliberate, reviewed grant.
- `minimumReleaseAge` delays legitimate upgrades by a week, including
  security patches. When a patch must land immediately,
  `pnpm add pkg@ver --ignore-minimum-release-age` is the documented escape
  hatch, and using it is a decision someone makes on purpose.
- Contributors must have pnpm 11. `engine-strict=true` enforces it rather
  than letting a stray `npm install` produce a second, divergent lockfile.
