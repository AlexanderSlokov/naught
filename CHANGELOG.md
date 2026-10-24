# Changelog

All notable changes to Naught are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are written for an operator: what changed, and why it mattered.

## [Unreleased]
### Added

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
  [ADR 0005](./docs/adr/0005-parquet-schema-evolution-and-upgrade-stops.md)
- **The image axis will say when it cannot answer, and what would fix it.** Base
  image drift needs the digest a tag resolved to at build time, which an image is
  under no obligation to carry. It is read from base-image annotations in the
  image config, a provenance record from the build, or an SBOM — the first of the
  three that is present. An image carrying none of them produces an *unavailable*
  axis that names all three, rather than a drift of zero: resolving the tag twice
  and finding the two answers agree would report every image in the estate as
  current at the moment the axis knows least.
  [ADR 0004](./docs/adr/0004-where-declared-comes-from-for-base-images.md)
- **Compaction will prove itself before deleting anything.** Merging a day's runs
  into a month partition writes a new file, records which runs it came from,
  verifies the rows by per-source count and checksum, and only then marks the
  originals — which are deleted after a grace period long enough for a query
  already in flight to finish. No file is ever opened for writing, so backup
  stays `cp -r` and a run's evidence stays the run's evidence. The lifecycle is
  Grafana Mimir's, whose block storage holds the same shape of data.
  [ADR 0006](./docs/adr/0006-compaction-preserves-rows.md)

- **A collection can be started from the interface.** The header carries one
  control, `Collect`, which queues a run and reports it as it happens: queued,
  started, a progress bar once the collector knows its denominator, and then
  either the sealed run or the reason it failed. When the run seals the whole
  screen re-renders from it — coverage, subjects, delta and blind spots — so
  the loop from "look again" to "here is what changed" closes without a
  terminal. A second click while a run is in flight is refused, by the queue
  and by the button both. The reasoning for an action existing at all in a
  read-only tool is in
  [ADR 0003](./docs/adr/0003-actions-on-naughts-own-collection.md): a run reads
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
