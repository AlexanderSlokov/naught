# Changelog

All notable changes to Naught are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are written for an operator: what changed, and why it mattered.

## [Unreleased]

> **This release is an upgrade stop.** It changes the lake to schema version 2.
> Before starting the API on an existing lake, run `make migrate-lake` (in the
> API container: `node dist/lake/migrate-lake.js`). The command rewrites every
> schema version 1 run beside the original, verifies each rewrite against the
> original rows, and deletes nothing. Until it has run, the API exits at startup
> with a message naming the command. A partition directory the API cannot write
> to is reported and skipped; fix its permissions and run the command again.

### Added

- **Every claim in the lake now names its source and how far it is trusted.**
  A schema version 1 run stored `pkg:npm/lodash@4.17.20, drift 5`: five OSV
  claims merged into one number, with no record of when OSV made each claim
  or how much weight it can bear. A run now writes one evidence row per claim
  to `{stem}.evidence.parquet`. Each row records its source (`osv`), the
  original database behind it (`ghsa` for a `GHSA-` id), the source's
  reliability for that kind of claim (A–F), the claim's credibility (1–6),
  OSV's own `modified` timestamp, and when the claim goes stale. A package
  OSV lists nothing for is recorded as *absent from a source that covers it*,
  which is a narrower statement than "clean", and a package OSV did not answer
  for is recorded as *not assessable*, with the reason. Drift, findings and
  the delta are derived from these rows, so the interface shows exactly what
  it showed before.
  [ADR 0007](docs/references/adr/0007-evidence-replaces-observations-and-blind-spots.md),
  [ADR 0008](docs/references/adr/0008-two-axis-source-grading.md),
  [column reference](docs/references/lake-schema.md)
- **`GET /axes/:axis/assessments`** returns, for every subject in the latest
  run, how settled the answer is: `established`, `stale` (older than 24 hours),
  `conflicting`, `missing` or `not_assessable`, with the ids of the evidence
  rows it rests on and its best grades. A package seen only as not assessable
  is reported as `not_assessable`, never as clean. Assessments are computed per
  request and never cached, because staleness depends on the time of asking.
- **`GET /axes/:axis/evidence?subject=<purl>`** returns every evidence row
  about one subject across all runs, newest first. A request without
  `subject` is refused with `400`.
- **`make migrate-lake`**, the rewriter for this upgrade stop. It can be run
  repeatedly: a run already rewritten is skipped. Run `make migrate-lake` again
  after fixing whatever caused a refusal.
- **Run manifests record what the run actually read.** `scopeCompleted` lists the
  targets the collector could open, and a run that could not open one of
  them seals as `partial` instead of `complete`. Manifests also record
  `schemaVersion`, `collectorVersion` and `gradingVersion`. A manifest written
  before these fields existed reads as schema version 1.

- **A definition of coverage that stands on its own.** Coverage appears on every
  verdict Naught renders, and an operator reading *"nothing found, at 82%
  coverage"* had nowhere to learn what the other 18% was measured against.
  ARCHITECTURE §6 now works one run through in full — 400 dependencies found in
  a lock file, an answer back for 375 of them, coverage 0.94 — and §12 is a
  glossary of the rest of the vocabulary: axis, subject, drift, blind spot, the
  difference between zero, unknown and unavailable, and what a run manifest
  holds.
- **Future releases may be marked as required upgrade stops.** Raw runs are kept
  forever, so the lake outlives the code that wrote it, and a release that
  changes the Parquet column set has to migrate what is already on disk. Such a
  release is an upgrade stop: it carries the rewriter, it verifies the result,
  and it may not be skipped over — the shape GitLab's upgrade path uses, for the
  same reason. Columns added without a rename or a type change require nothing of
  anyone. When a release is a stop, these notes will say so, because an operator
  cannot discover that from the artifact they are installing.
  [ADR 0005](docs/references/adr/0005-parquet-schema-evolution-and-upgrade-stops.md)
- **The image axis will say when it cannot answer, and what would fix it.** Base
  image drift needs the digest a tag resolved to at build time, which an image is
  under no obligation to carry. It is read from base-image annotations in the
  image config, a provenance record from the build, or an SBOM — the first of the
  three that is present. An image carrying none of them produces an *unavailable*
  axis that names all three, rather than a drift of zero: resolving the tag twice
  and finding the two answers agree would report every image in the estate as
  current at the moment the axis knows least.
  [ADR 0004](docs/references/adr/0004-where-declared-comes-from-for-base-images.md)
- **Compaction will prove itself before deleting anything.** Merging a day's runs
  into a month partition writes a new file, records which runs it came from,
  verifies the rows by per-source count and checksum, and only then marks the
  originals — which are deleted after a grace period long enough for a query
  already in flight to finish. No file is ever opened for writing, so backup
  stays `cp -r` and a run's evidence stays the run's evidence. The lifecycle is
  Grafana Mimir's, whose block storage holds the same shape of data.
  [ADR 0006](docs/references/adr/0006-compaction-preserves-rows.md)

- **A collection can be started from the interface.** The header carries one
  control, `Collect`, which queues a run and reports it as it happens: queued,
  started, a progress bar once the collector knows its denominator, and then
  either the sealed run or the reason it failed. When the run seals the whole
  screen re-renders from it — coverage, subjects, delta and blind spots — so
  the loop from "look again" to "here is what changed" closes without a
  terminal. A second click while a run is in flight is refused, by the queue
  and by the button both. The reasoning for an action existing at all in a
  read-only tool is in
  [ADR 0003](docs/references/adr/0003-actions-on-naughts-own-collection.md): a run reads
  external systems and writes to none of them.
- **`POST /runs` and `GET /runs/current`**, beside a WebSocket at
  `/runs/stream`. The API is no longer GET-only. It accepts cross-origin
  requests from one named origin, `NAUGHT_WEB_ORIGIN`, and not from `*`.
- **A run records what it was pointed at.** `CollectionRun.scope` is what lets
  the interface repeat a run without an operator typing a path — and therefore
  without a path arriving over HTTP. Runs sealed before the field existed carry
  `null` and cannot be repeated; `POST /runs` says so and names the command
  that fixes it, rather than guessing a scope.
- **Tests.** The first in the repository: 35 of them, over scope resolution,
  the duplicate-run refusal, the progress sink, the manifest's backward
  compatibility, the sink's behaviour on a lake it cannot write to, and the
  interface's run-state fold. `make check` runs them; it previously claimed to
  be "everything CI would run" and ran none.

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

- **The API refuses to serve a lake it cannot read correctly.** At startup it
  exits with status 1 when the lake holds schema version 1 runs that have not
  been rewritten, or any run written at a schema version newer than this build
  reads, and prints which run, which version, and what to do. Before this, the
  API would have shown the history it could not read as empty.
- **The latest run is the newest run, whatever it saw.** Runs are now identified
  by `runId` instead of by their `observedAt` timestamp. A run whose every
  request failed is the latest run and shows its blind spots, instead of being
  passed over in favour of the last run that saw something.
- **`GET /health` counts runs, not files.** `runs` is now the number of
  evidence files, one per run. It used to count every Parquet file, which was
  up to two per run.

- **Panels state their conclusion before their evidence.** The delta strip used
  to read *"Nothing changed since 2026-09-24 17:05:50 UTC. 0 findings still
  open."* — accurate, and it asked the operator to combine a timestamp and a
  count to arrive at *nothing to act on*. It now says that first, in one line,
  with the timestamp beneath it. Blind spots likewise: *"Nothing this run knew
  it could not see"* needed three negations resolved before it meant *nothing
  went wrong*. The honesty is unchanged — an empty blind-spot list still hands
  the reader to the coverage figure, because zero things unread is not the same
  as everything looked at.
- **`GET /runs/current` consults the queue, not only this process.** The event
  stream's memory dies with the API; Redis does not. An operator who reloads
  after a restart is told that a run is still in flight, rather than that
  nothing is happening.
- **The CLI no longer requires Redis.** `AppModule` gained a queue, and booting
  it became a Redis connection — which hung `make poc-here` on a machine that
  has none. The CLI entry points now boot `StandaloneCollectionModule`, which
  carries the lake and the collectors and nothing that needs a service beside
  it. ARCHITECTURE §5 requires the lightweight path to stay lightweight.
- **`RunSink` gained `expected(n)`**, so a collector can state its denominator
  when it learns it rather than only in its final summary. Without it a
  progress reading has no ceiling, and a count climbing towards nothing is not
  progress an operator can act on.
- **`ParquetRunSink` takes its `runId` from the caller** instead of minting one
  at seal, so the id an operator watches is the id in the manifest; and gained
  `discard()`, which removes staging when a run dies.

- **`LakeService.hasFiles(axis, kind)`** lets a reader ask whether the lake holds
  anything before querying it. DuckDB raises `IO Error: No files found that match
  the pattern` on an empty glob, so without this an axis no collector has run
  answers with a 500. An empty lake is a state, not a failure.
- **`ParquetRunSink.seal()` now takes the run's `RunSummary` and its `Scope`**,
  both of which it records in the manifest. Its callers — the CLI entry point
  and the queue worker — each have both in hand already.

### Fixed

- **A short answer from OSV no longer counts as clean.** When OSV's batch
  response held fewer results than queries, `deps.osv` read each missing result
  as "no advisories". The whole batch is now recorded as not assessable
  (`unreachable-upstream`), which lowers coverage instead of reporting packages
  nobody answered for as clean. OSV responses are now validated before use.

- **An unwritable lake took the API down with it.** `createWriteStream` reports
  a failed open as an asynchronous `'error'` event, and an unhandled one of
  those ends the Node process. That was survivable while a collection was only
  ever a CLI script. It stopped being survivable the moment a run could be
  started from a button: one read-only partition, one full disk, and the whole
  API exits instead of one run failing. The sink now owns its stream errors and
  reports them to the caller, which reports them to the operator.
- **A run whose rows never reached disk could still seal.** With no stream
  there were no rows, no artifacts, and nothing to refuse on — so a manifest
  would be written claiming a coverage figure with no Parquet behind it. The
  sink now refuses to seal when a collector reports observations that never
  arrived. A verdict with no rows under it still reads as a verdict.
- **`.gitignore` silently excluded `apps/api/src/runs/`.** The pattern `runs/`
  was meant for the lake and matched any directory of that name at any depth.
  It is now anchored to the repository root.

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
