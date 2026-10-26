# 6. Compaction preserves rows, and proves it before deleting

**Status:** accepted
**Date:** 2026-09-26

## Context

Two statements in `../../explanation/ARCHITECTURE.md` contradict each other on their face. §4:
`runs/` is immutable and append-only. §6: a monthly compactor merges the day's
files into month partitions, so the file count stays flat and query planning
stays fast.

Compaction is not optional. A collector that runs hourly writes some 9,000 files
a year per axis, and DuckDB plans a glob over every one of them. Nor is
immutability optional: it is the reason backup is `cp -r`, the reason no
database can corrupt the truth, and the reason a run's evidence is still the
run's evidence years later.

What was missing was the invariant that lets both be true at once, and the order
of operations that enforces it.

Naught is not the first system to hold this shape. It retains immutable
observations forever, compacts them in the background, and answers questions
across the whole range — which is Prometheus data in a Grafana Mimir bucket,
arrived at from a different direction. Mimir's block lifecycle is therefore the
model, rather than something invented here.

## Decision

**Compaction changes how many files sit under an axis, and never the multiset of
rows in them. It proves that before an original is deleted.**

Mimir compacts in two directions, and only one of them has an analog here.
*Vertical* compaction merges blocks covering the same time range from different
replicas and deduplicates their samples; Naught has no replicas — no two runs
are copies of each other — and so needs none of it. *Horizontal* compaction
merges adjacent time ranges into larger blocks to shrink the index; that is
exactly the day-into-month merge, and it is the half that is borrowed.

The lifecycle, in order:

1. **Write a new file.** No existing file is ever opened for writing.
   *Immutable* is a claim about files on disk, and compaction does not break
   it — it adds one.
2. **Record the sources** in the compacted file's manifest, so any row can be
   traced back to the run that observed it. Mimir keeps the same lineage in each
   block's `meta.json`.
3. **Mark the sources for deletion.** Do not delete them. A reader that has
   already planned a query against them finishes against them.
4. **Delete after a grace period.** Mimir's `-compactor.deletion-delay` exists
   so that readers discover the compacted block before its inputs disappear;
   Naught's delay is its own value with the same purpose.

Two conditions gate step 3. The compacted file must hold exactly the rows of its
sources, verified by per-source row count and by checksum. The sources must
still be readable when that check runs. A source that fails either check is left
in place and marked, so the compactor does not retry it in a loop.

A lake that stops compacting is slow. A lake that drops a row it cannot prove it
copied is wrong about the only thing it cannot rebuild. That asymmetry decides
every judgement call in this area.

## Consequences

- The compactor does not exist yet, and this decision is deliberately made
  before it does. The invariant is cheap to state now and expensive to retrofit
  onto code written without it.
- Observations and blind spots compact separately, because they are separate
  files for a reason (§4) and merging them would union *could not see it* into a
  list of things that were seen.
- A compacted file's manifest is not a run manifest: it describes a merge, not a
  collection, and carries no coverage of its own. Coverage stays a property of
  the runs it came from, which is why step 2 records them by name.
- The grace period is an operator-visible setting, and its floor is the longest
  query the API will run. Too short, and a reader loses its inputs mid-plan.
- The rewriter that ADR 0005 requires for a schema version change uses this same
  lifecycle. Rewriting the lake is compaction that changes columns instead of
  file count, and it is subject to the same proof before anything is dropped.
- Old month partitions may still be moved to cold storage (§6). Moving a
  verified, compacted file is a copy and a delete under the same rules, not an
  exception to them.
