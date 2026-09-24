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
| Run collection on a schedule rather than by hand | Not started |
| Trigger a collection from the interface | Not started |
| Notify once, with coverage, when something crosses a threshold (§7) | Not started |

---

## Phase 3 — The remaining axes

**Target: v0.3.0**

`placement`, `config` and `credentials`. Listed so the shape of the whole is
visible; not designed yet, and deliberately so — the first two phases are
expected to change what these should be.
