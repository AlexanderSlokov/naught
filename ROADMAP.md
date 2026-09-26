# Roadmap

Capabilities, grouped by phase, each attached to a target version. A phase is
complete when every capability under it can be demonstrated against real data,
not when its code exists.

Tasks descend from these items into [BACKLOG.md](./BACKLOG.md). Completed work
is described in [CHANGELOG.md](./CHANGELOG.md).

---

## Phase 1 — See one axis, end to end

**Target: v0.1.0**

One axis — `deps` — carried the whole way from collection to a screen an operator
can read, so that the architecture is proven by a working path rather than by
five half-built ones. The acceptance test in [ARCHITECTURE](./ARCHITECTURE.md) §9
is the definition of done for this phase.

| Capability | State |
|---|---|
| Collect dependency observations from a pnpm lockfile via OSV | Done |
| Write them to an append-only Parquet lake, blind spots included | Done |
| Answer §9's five questions from the lake, on the command line | Done |
| Drop the derived cache and rebuild it to identical answers | Done |
| **Read the deps axis without a terminal** | In progress |

### Read the deps axis without a terminal

An operator who does not run `make poc` currently cannot see anything Naught
knows. This capability closes that: a read-only HTTP API over the lake, and a web
application that presents one project's dependency axis — its subjects, its
findings, what moved since the previous run, and what could not be seen.

The first project it displays is Naught itself. Naught pointed at Naught is §9's
acceptance test; this renders it instead of printing it.

The interface follows the Foundry Workshop structure recorded in
[`docs/references/palantir-*.md`](./docs/references/) and explained in
[`docs/explanation/why-a-foundry-shaped-ui.md`](./docs/explanation/why-a-foundry-shaped-ui.md).

**Done when** a browser at `:3000`, against a lake holding two runs, shows the
subject count, the coverage the count was measured at, the findings, the delta,
and the blind spots — and shows a non-100% coverage correctly when pointed at
`fixtures/rotten-lock.yaml`.

---

## Phase 2 — A second axis, and the loop that closes itself

**Target: v0.2.0**

One axis proves the path. A second proves the path is not shaped around the
first. `image` is the candidate: it has a different upstream, a different notion
of a subject, and blind spots of a kind `deps` never produces (opaque layers).

| Capability | State |
|---|---|
| Observe base image tags and digests; detect a moved tag | Not started |
| Say plainly when an axis cannot be computed at all | Not started |
| Record the schema version every run is written at | Not started |
| Run collection on a schedule rather than by hand | Not started |
| Trigger a collection from the interface | Done |
| Notify once, with coverage, when something crosses a threshold (§7) | Not started |

### Say plainly when an axis cannot be computed at all

The image axis needs a build-time digest, and an image is under no obligation to
carry one. [ADR 0004](./docs/adr/0004-where-declared-comes-from-for-base-images.md)
decides where that digest is read from — base-image annotations, a provenance
record, an SBOM, in that order — and what happens when an image carries none of
the three: the axis reports itself unavailable and names every source that would
have worked.

That state has nowhere to live today. `GET /axes` answers `hasData` as a boolean,
which puts "nothing has looked yet" and "this cannot be computed here" in the
same box. They are different sentences to an operator: one is answered by
pressing Collect, the other by changing how images are built.

**Done when** an axis pointed at images with no recorded build-time digest shows
an unavailable panel naming the three sources, and an axis nothing has collected
yet still reads as it does now — with the two states distinguishable in the API
response, not only in the interface.

### Record the schema version every run is written at

Runs are kept forever, so the lake outlives the code that wrote it, and a file
that cannot say which generation of the column set it belongs to has to be
guessed at. [ADR 0005](./docs/adr/0005-parquet-schema-evolution-and-upgrade-stops.md)
settles the rule: additions are free within a version, anything else is a new
version reached through an upgrade stop, and the version is stated by the run in
its manifest.

This is listed here rather than later because every run sealed before the field
exists is a run with no version on it. The cost of the delay is paid in files,
not in code.

**Done when** a sealed manifest carries its schema version, a manifest written
before the field existed reads as version 1, and an API booted against a lake
written at a version it does not know refuses to serve and names what it found.

---

## Phase 3 — The remaining axes

**Target: v0.3.0**

`placement`, `config` and `credentials`. Listed so the shape of the whole is
visible; not designed yet, and deliberately so — the first two phases are
expected to change what these should be.
