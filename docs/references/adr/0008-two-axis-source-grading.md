# 8. Two-axis grading of evidence

**Status:** accepted
**Date:** 2026-10-26

## Context

ADR 0007 makes every evidence row name its source. A source name alone does not
tell an operator how much weight a claim can bear. Two questions remain, and
they are separate questions:

1. **How far is this source trusted for this kind of claim?** OSV is close to
   authoritative for "OSV has a published advisory for this purl". It is not the
   original author of most of those advisories: it aggregates GHSA and the
   ecosystem databases.
2. **How believable is this particular claim?** One source asserting an advisory
   is weaker than two independent sources asserting the same advisory. A claim
   Naught could not assess at all cannot be judged either way.

Intelligence tradecraft separated these questions decades ago. The NATO
Admiralty code (STANAG 2511, AJP-2.1) grades **source reliability** A–F and
**information credibility** 1–6, independently, so that a trusted source does not
make a doubtful claim look confirmed. F and 6 mean "cannot be judged", which is
different from "unreliable" and "improbable". STIX 2.1 publishes a mapping from
Admiralty credibility to its 0–100 `confidence` field. Palantir does not publish
an equivalent field (`../rfcs/Palantir_and_Naught.en.md`, question 5), so the
grading is taken from the open standard.

## Decision

**Every evidence row carries `reliability` (A–F) and `credibility` (1–6) as two
separate columns, plus the `gradingVersion` that produced them. The two values
are never combined into one score.**

- **Reliability is graded per `(sourceId, claimType)` pair, not per source.** The
  grade and its rationale live in `packages/shared/src/sources.ts`. The sink
  stamps the grade at write time. Under `grading-v0`, OSV is graded `A` for
  `advisory`: for the claim "OSV lists this advisory", OSV is the authority on its
  own index. A later claim type such as "the fixed version is X" can grade the
  same source lower without changing the grade of `advisory`.
- **Credibility of a single claim is set by rule `credibility-v0`.** An
  `observed` claim from one source is 2 ("probably true"). An `absent_in_scope`
  claim is 3 ("possibly true"), because a source can only report the absence of
  what it has indexed. A `not_assessable` claim is 6 ("cannot be judged").
- **Credibility 1 ("confirmed") is assigned only in the assessment layer.** It
  requires at least two evidence rows that agree and that have different
  `originSourceId` values. OSV and GHSA asserting the same advisory are not two
  confirmations, because OSV's origin for that advisory is GHSA.
- **A grade is not edited after it is written.** If a grade changes, the change
  is recorded as a new `gradingVersion`. The assessment layer can then
  re-grade stored rows. The rows themselves stay as written.
- **On export, credibility maps to STIX `confidence`** with the standard table:
  1→90, 2→70, 3→50, 4→30, 5→10. 6 maps to no field.

## Consequences

- An interface that displays a grade must display both values, for example
  `A2`. Neither value is a substitute for the other.
- The grades in `grading-v0` are starting values. Each one carries a written
  rationale, so an operator who disagrees with a grade can find the reason and
  dispute it.
- Grading is not freshness. A grade-A claim from nine days ago is still grade A,
  and is also stale once its `staleAfter` has passed. Version 2 stores freshness
  separately, in `staleAfter`. Admiralty grading has no column for it.
- The `deps` axis has one advisory source, so credibility 1 is never reached in
  practice yet. The rule is tested with a fake second source, so it is correct
  on the day a second source is added.
