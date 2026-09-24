# Changelog

All notable changes to Naught are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are written for an operator: what changed, and why it mattered.

## [Unreleased]

### Added

- **The deps axis is readable without a terminal.** A read-only HTTP API over
  the lake (`GET /axes`, `/axes/:axis/{projects,latest,subjects,blind-spots,delta}`)
  and a web application that presents one project's dependency axis: its
  subjects, the coverage the verdict was measured at, what moved since the
  previous run, and what the run could not see. The first project it displays is
  Naught itself.
- **Run manifests.** Each run now writes `{stem}.run.json` beside its Parquet
  files, holding the collector's own `RunSummary`. Coverage is read from it
  rather than reconstructed by counting rows — a count derived from the rows
  would be at the mercy of the same collector that failed to count them. A run
  with no manifest reports its coverage as unknown, never as complete.
- **`GET /axes` reports which axes hold data**, so the interface can show the
  four unimplemented axes as inert rather than hiding them. Hiding them would
  imply a completeness Naught does not have.
- **Documentation flow.** `ROADMAP.md`, `BACKLOG.md` and this file now exist, so
  a capability has somewhere to descend from and finished work has somewhere to
  land. Phase 1 is `deps`, end to end.
- **Palantir design references.** The Foundry material behind the interface is
  summarized in `docs/references/palantir-*.md` with source URLs and retrieval
  dates, and the reasoning for adopting that shape is in
  `docs/explanation/why-a-foundry-shaped-ui.md`. Layout decisions are traceable
  to a source rather than to taste.

### Changed

- **`LakeService.hasFiles(axis, kind)`** lets a reader ask whether the lake holds
  anything before querying it. DuckDB raises `IO Error: No files found that match
  the pattern` on an empty glob, so without this an axis no collector has run
  answers with a 500. An empty lake is a state, not a failure.
- **`ParquetRunSink.seal()` now takes the run's `RunSummary`**, which it records
  in the manifest. The only caller is the collection entry point, which already
  had it in hand.

### Fixed

- **An empty lake no longer reads as an unreachable API.** Nest returns a bare
  200 with no body for a null result, and `Response.json()` throws on an empty
  body, so "no collector has run" surfaced as "Naught cannot see its own lake".
  Those are the two states this project exists to keep apart.
- **Text in the dark theme was very nearly invisible.** Blueprint 6's `.bp6-dark`
  redefines its surface variables but declares no `color`, while its own
  `body { color: #1c2127 }` stands — dark text on a dark page.
- **Colours are now chosen by measurement.** Blueprint's `--bp-intent-*-rest`
  values are tuned as fills on a light surface; as text on the dark theme they
  measure between 3.0 and 4.2 against the page, under the 4.5 that small text
  needs. The drift column is 12px, and a number nobody can read is a number that
  is not being reported. Step 4 of each palette family is used instead.

### Removed

- **`@naught/web`'s `start` script.** `next start` does not work with
  `output: 'standalone'`; it silently served a stale build. Production is the
  container, whose `CMD` runs the standalone server directly.
