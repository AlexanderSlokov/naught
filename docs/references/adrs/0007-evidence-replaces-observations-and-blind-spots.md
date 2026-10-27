# 7. Evidence replaces observations and blind spots

**Status:** accepted
**Date:** 2026-10-26
**Supersedes:** the file-separation rule in `../../explanation/ARCHITECTURE.md` §4
("Observations and blind spots are separate files")

## Context

A schema version 1 run writes two kinds of row:

- an **observation**: one row per package the collector got an answer for,
  for example `pkg:npm/lodash@4.17.20`, `drift: 5`, `detail.advisories: [...]`;
- a **blind spot**: one row per package or input the collector could not read,
  for example `this-key-has-no-version`, `reason: unparseable`.

The two kinds are written to separate files, `.obs.parquet` and `.blind.parquet`.
They share column names, so a glob that matched both would add each "could not
see it" row to the list of things that were seen. Separate files make that
mistake impossible to write by accident.

The observation row loses information at write time:

1. **No source per claim.** `drift: 5` is five claims from OSV merged into one
   number. The row cannot say which source made each claim, how far that source
   is trusted for that kind of claim, or when the source made it. OSV returns a
   `modified` timestamp for every advisory, and version 1 discards it.
2. **"Clean" is a number, not a claim.** `drift: 0` reads as "this package has no
   problems". The fact Naught holds is narrower: "OSV had no published advisory
   for this purl when Naught asked". The two sentences lead an operator to
   different decisions, and version 1 can only store the first one.
3. **Derived values are stored as truth.** Drift is computed by the collector
   and stored in the lake. A change to how drift is computed cannot be applied to
   runs that are already stored, because the inputs to the computation were not
   kept.

The research in `../rfcs/Palantir_and_Naught.en.md` reaches the same diagnosis
from Palantir's Gotham, which keeps each source's value of a property separately
instead of picking a winner, and from GUAC's evidence tree, which records the
origin, collector and `knownSince` of every claim.

## Decision

**The lake stores one evidence row per claim, in one file per run:
`{stem}.evidence.parquet`. Drift, findings and blind spot lists are derived from
evidence rows. They are no longer stored.**

A *claim* is one statement, from one source, about one subject. For the `deps`
axis, a run that reads 8 lockfile keys and gets OSV answers for 7 of them
writes:

| Claim type | Observation kind | Count | Example |
|---|---|---|---|
| `contains` | `observed` | 7 | the lockfile pins `pkg:npm/lodash@4.17.20` |
| `contains` | `not_assessable` (`unparseable`) | 1 | the key `this-key-has-no-version` |
| `advisory` | `observed` | 1 per advisory | OSV lists `GHSA-35jh-r3h4-6jhm` against `pkg:npm/lodash@4.17.20` |
| `advisory` | `absent_in_scope` | 1 per package with no advisory | OSV lists no advisory for `pkg:npm/ms@2.1.3` |
| `advisory` | `not_assessable` | 1 per package OSV did not answer for | the batch holding `pkg:npm/ms@2.1.3` timed out |

The claim type names the *question* (does OSV list an advisory for this purl?).
The observation kind names the *shape of the answer*. The two are separate on
purpose: if "OSV did not answer" had to be filed under a claim type such as
`advisory_absent`, a query filtering on claim type alone would count every
unanswered package as clean.

Every row carries its source, its grades (ADR 0008), its observation kind, and
three timestamps: when Naught saw it (`observedAt`), when the source made it
(`sourceAssertedAt`), and when it stops being current (`staleAfter`). The full
column set is in `../lake-schema.md`.

The observation kind takes one of three values. Together they replace the
separation by file name:

- `observed`: the source made the claim.
- `absent_in_scope`: Naught asked a source that covers the subject, and the
  source returned nothing. A run whose request to the source failed must never
  write this kind. It writes `not_assessable` instead.
- `not_assessable`: Naught could not ask, or could not read the answer. The
  reason uses the vocabulary of version 1 blind spots (`unparseable`,
  `unreachable-upstream`, `rate-limited`, and so on).

**The guard moves from file names to views.** One module,
`apps/api/src/lake/evidence-views.ts`, reads the evidence glob. It defines the
views `evidence_seen` (`observed` and `absent_in_scope`), `evidence_unseen`
(`not_assessable`), and `subject_drift` (one row per run and subject, in the
version 1 observation shape). All other code reads these views. No other module
calls `read_parquet` on evidence files, and a test enforces this rule.

## Consequences

- This is **schema version 2**. Under ADR 0005, the release that introduces it
  is an upgrade stop. It ships `make migrate-lake`, which writes a version 2 file
  beside each version 1 run. A written file is kept only if its `subject_drift`
  and `evidence_unseen` projections equal the original rows exactly. Version 1
  files are left in place. Deleting them is a later task under ADR 0006.
- The read API keeps its response shapes, because `subject_drift` reproduces
  the version 1 row. The interface does not change.
- A run is identified by `runId` instead of `observedAt`. Two runs stamped in
  the same millisecond can no longer be mistaken for one run.
- Row counts grow. A package with five advisories becomes six rows instead of
  one. Consecutive runs remain almost identical, so Parquet's dictionary and
  run-length encoding absorb most of the growth (ARCHITECTURE §6, *Retention*).
- The file-name guard was enforced by the file system. The view guard is
  enforced by a convention and a test. This is a weaker guarantee, and it is
  accepted: one table with a kind column is what lets a single query place
  "seen", "absent" and "not assessable" side by side for one subject, which the
  assessment layer needs.
- Advisory order within a subject is not information. `subject_drift` sorts
  advisory ids, so a version 1 row whose ids were in another order compares
  equal as a set, not as a string.
