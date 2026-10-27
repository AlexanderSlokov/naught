# 5. Parquet schema evolution, and upgrade stops

**Status:** accepted
**Date:** 2026-09-26

## Context

Raw runs are kept forever (`../../explanation/ARCHITECTURE.md` §6). Two consequences follow that
no other part of the design has to live with:

- Files written years apart must answer one `SELECT`. DuckDB unions a glob by
  column name, so a column that changed type between two files makes the pair
  unreadable together — and "together" is the only way Naught reads the lake.
- The lake outlives the code that wrote it. The oldest file in `runs/` was
  written by a build nobody is running any more, and it is still evidence.

`../../../apps/api/src/lake/schema.ts` already declares the column set rather than
inferring it, and already says additions are allowed and type changes are not.
What §10 carried as open was the rest: what happens when a type change is
nonetheless needed, and where the version of a file's schema is written down.

The tempting answer is a reader clever enough to reconcile any two generations
of the schema on the fly. That answer puts the integrity of the one
irreplaceable artifact in the hands of the most complicated code in the
repository, and it fails quietly — a mis-typed column reads as `NULL`, and a
`NULL` in this lake is indistinguishable from a fact that was never observed.

## Decision

**The lake has a schema version, stated by each run. Additions are free within a
version; anything else is a new version, reachable only through an upgrade
stop.**

The shape is GitLab's, whose upgrade path exists for the same reason — a data
store that outlives its releases. GitLab documents *required upgrade stops*:
versions an operator must pass through in order, allowing background migrations
to finish at each, rather than jumping from anywhere to anywhere
(`docs.gitlab.com/update/upgrade_paths/`).

- **Within a version, additions only.** A new column is appended and files
  written before it read as `NULL` for it. No stop, no rewrite, any build to any
  build.
- **A rename or a type change is a new version**, and the release carrying it is
  an upgrade stop. That release ships a rewriter: it reads the lake at the old
  version, writes it at the new one, verifies the result under ADR 0006, and
  only then lets the API serve. An operator may not skip across a stop.
- **The version is recorded by the run**, in its manifest, beside the coverage
  figure and for the same reason: the writer states what it wrote, and readers
  read it rather than sniffing columns to infer a generation. The column set in
  `schema.ts` as of this decision is version **1**. A manifest that names no
  version reads as 1, as does a run with no manifest at all.
- **The API refuses rather than improvises.** On startup it compares the lake's
  schema versions with what the code can read. Older and rewritable: it names
  the upgrade stop to install. Newer than the code: it refuses to serve, because
  reading tomorrow's columns under today's assumptions is how a lake starts
  lying.

## Consequences

- `CollectionRun` gains `schemaVersion`, nullable and defaulted so that
  manifests written before this decision keep parsing — the same compatibility
  rule `scope` already follows.
- Startup gains a lake check beside the existing cache check, and the two are
  handled differently on purpose: a stale `naught.duckdb` is rebuilt without
  asking anyone, while a lake the code cannot read stops the API.
  `../../explanation/ARCHITECTURE.md` §8 records this.
- Release notes acquire a job. A release that is an upgrade stop must say so in
  `../../../CHANGELOG.md`, because an operator cannot discover the requirement from the
  artifact they are installing.
- The cost is real and is accepted: an operator who has skipped several releases
  installs them in order. One extra command, against the alternative of a
  silently mis-typed column in a file nobody reads for two years.
- Nothing here applies to `naught.duckdb`. The cache has no versioned history to
  protect; it is dropped and rebuilt, which is why it needs no migration story
  at all.
