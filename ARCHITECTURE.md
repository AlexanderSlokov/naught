# Naught — Architecture

**Status:** design document. This file is the brief.

Read `README.md` first for what Naught is and why it exists. This document covers *how* it is built and the reasoning behind each choice, so that a future contributor (human or agent) does not re-litigate settled decisions or violate a constraint without knowing it was deliberate.

---

## 1. What Naught does, mechanically

1. **Collect.** Scheduled jobs pull facts from many sources: git repositories (lock files), artifact registries, vulnerability feeds...
2. **Normalize.** Everything lands in one shape, regardless of source.
3. **Compare.** Each axis has a *declared* reference and an *observed* reality. The difference is drift.
4. **Remember.** Every collection run is retained, so "what changed since I last trusted this?" is always answerable.
5. **Show.** A dense, readable interface for the operator.
6. **Knock once.** When a drift number crosses an operator-set threshold, one notification. Otherwise, silence.

Naught never writes to the systems it observes. See README, *What Naught will never do*.

---

## 2. Design constraints

These are load-bearing. Breaking one requires an ADR that explains why.

| Constraint                         | Meaning in practice                                                                                                                                                                                    |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Read-only outward**              | Every credential Naught holds for an external system is read-only. Write access is a bug, not a feature.                                                                                                |
| **Complex inside, simple outside** | Naught may be internally elaborate — many collectors, a large graph, heavy processing. What must stay simple is the operator's surface: one thing to deploy, one place to look, one decision per event. |
| **Easy to throw away**             | Truth is a directory of immutable files. Backup is a file copy. Restore is a file copy. No hand-tended state, no clustering, no quorum.                                                                 |
| **Rebuildable from source data**   | Anything derived — the graph, aggregates, drift scores — can be dropped and recomputed from retained raw collection runs. There is exactly one command for this, and it is exercised in CI.             |
| **No sibling is required**         | Naught works alone. If a sibling Naughtian tool (or GUAC) is present, a richer collector for that axis becomes available. Neither is mandatory.                                                         |
| **Blind spots are declared**       | What a collector cannot see is recorded as `unknown`, never silently omitted. A map that lies by omission is worse than no map.                                                                         |
| **No verdict without coverage**    | Every number Naught renders carries the coverage it was computed at. "Nothing found" alone is not a sentence Naught is allowed to say.                                                                  |

**On being a service.** Naught is an always-on server, and the README's *Inert* principle is scoped accordingly: Naught never writes to the systems it observes, and its own state is append-only files it can rebuild from. It is not scoped to mean "no daemon". Watching global decay across many sources requires scheduled collection and retained history; a tool that only runs when you remember to run it is a tool that tells you about decay you already noticed.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **NestJS** (TypeScript) | Module per collector; dependency injection makes collectors swappable; built-in scheduler and queue integration; GraphQL is first-class, which matters if we ever federate with GUAC. |
| Frontend | **Next.js** + **Blueprint** (`@blueprintjs/*`) | Blueprint is Palantir's React toolkit, Apache-2.0, built for data-dense analytical interfaces. It is the correct aesthetic and functional fit for this application. |
| Storage of record | **Parquet files on disk**, Hive-partitioned | Raw runs are immutable, append-only, columnar, and compress extremely well against repetitive data. No database owns the truth, so no database can corrupt it. |
| Query engine | **DuckDB** | Reads the Parquet lake directly (`SELECT * FROM 'runs/**/*.parquet'`), supports `WITH RECURSIVE` for transitive dependency closure, and is embedded — no server, no port, no operator surface. |
| Derived cache | **One `naught.duckdb` file** | Materialized entities, edges, and drift, indexed for the UI. Pure cache. `rm naught.duckdb && naught rebuild` is always safe and is a tested path. |
| Queue | **Redis** + BullMQ | Collection is bursty and retryable. Collectors call rate-limited external APIs; retry with backoff, blocked-job visibility, and survival across restarts are worth one container. |
| Validation | **zod** | TypeScript types vanish at runtime. Every external payload is validated at the boundary before it is trusted. |
| Shared types | A `packages/shared` workspace | One set of types across collectors, API, and UI. This is the main reason the whole stack is TypeScript. |

**Why not Postgres.** Postgres was the first candidate and remains the fallback if the graph outgrows recursive CTEs. It lost on shape, not on capability: Naught's central question is *"what is true now versus at time T"*, which is a columnar scan over immutable history — DuckDB's home ground and Postgres's worst case. DuckDB also removes a server, a port, a connection pool, and a backup procedure from the operator's surface, which is constraint #2 paying out. **If graph traversal becomes the bottleneck rather than history scanning, revisit this with an ADR.**

**Why not Go/Rust:** Naught is network-bound, not compute-bound. It waits on APIs. The advantage of a compiled runtime would be single-binary deployment, and an accepted server already removes most of that benefit. Schema sharing and UI velocity matter more here.

**Why not Laravel:** a strong contender on capability, rejected on toolchain preference and because a split-language stack loses end-to-end shared types.

**The npm paradox is intentional.** Naught runs on the ecosystem it exists to watch. This is not an embarrassment — it is the acceptance test. Point Naught at Naught's own repository. If it cannot find the rot in itself, it does not work.

**Do not mix design systems.** Blueprint has its own visual language. Do not introduce shadcn/ui, Material, or Chakra alongside it.

---

## 4. Repository layout

```
naught/
├── apps/
│   ├── api/             # NestJS: collectors, scheduler, ingest, compactor, GraphQL/REST, notifier
│   └── web/             # Next.js + Blueprint
├── packages/
│   └── shared/          # zod schemas + inferred types, shared by both apps
├── docs/adr/            # architecture decision records
├── docker-compose.yml
└── ARCHITECTURE.md
```

Three containers: `api`, `web`, `redis`. One volume, holding the lake and the cache:

```
/var/lib/naught/
├── runs/                        # truth. immutable, append-only
│   ├── axis=deps/date=2026-09-24/osv--0300.parquet
│   ├── axis=image/date=2026-09-24/registry--0300.parquet
│   └── axis=deps/month=2026-08/part-0000.parquet    # compacted
└── naught.duckdb                # cache. droppable
```

There is no `migrations/` directory. Parquet files carry their own schema; the derived cache is rebuilt, never migrated.

---

## 5. Collectors

A collector is a NestJS module implementing one interface. It fetches, validates with zod, and streams normalized observations plus an explicit record of what it could not see.

```ts
interface Collector {
  readonly id: string;              // "deps.osv", "deps.guac", "image.registry"
  readonly axis: Axis;
  collect(scope: Scope, sink: RunSink): Promise<RunSummary>;
}

interface RunSink {
  observation(o: Observation): Promise<void>;   // buffered into Parquet row groups
  blindSpot(b: BlindSpot): Promise<void>;       // what it knew it could not see, and why
}

interface RunSummary {
  observed: number;
  expected: number | null;          // null means the collector cannot know the denominator
  coverage: number | null;          // observed / expected — travels with every verdict downstream
}
```

Observations stream to the sink rather than accumulating in a return value: a monorepo lock file can carry tens of thousands of entries, and the run must survive being larger than memory. `expected` is deliberately nullable — a collector that does not know how much it was supposed to see must say so rather than report 100%.

### Axes

| Axis | Status | Declared | Observed | Lightweight collector | Advanced collector (optional) |
|---|---|---|---|---|---|
| **Dependency rot** | **v1** | what you built against | what upstream now says about it | Read lock files from git, query OSV batch API | Query a running GUAC instance over GraphQL |
| **Base image tag drift** | **v1** | base image digest at build time | digest that same tag resolves to now | Read Dockerfile/build metadata, resolve tag against registry | — |
| Placement drift | later | the scheduling blueprint | where workloads actually run | Compare a scheduling blueprint to actual placement | — |
| Configuration drift | later | declared node state | node state now | Read declared state from a repo, compare to observed | Read from a sibling tool if present |
| Credential staleness | later | intended lifetime | time since last rotation | Age since last rotation, from metadata only | — |

The three `later` axes exist in the `Axis` enum and in the data model from day one, but ship without collectors. They are not speculative — they are the reason the model is multi-axis — but nothing in v1 depends on them.

The lightweight path must always exist and must never require another service to be deployed.

### Base image tag drift, specifically

`FROM node:20-alpine` is a promise that ages badly. The tag is mutable; the thing it named at build time is not the thing it names today.

```
declared:   sha256:a1b2…   # digest the tag resolved to when the image was built
observed:   sha256:f9e8…   # digest the same tag resolves to now
drift:      the tag moved under you

           + age of the digest actually running: 47 days
```

Two numbers fall out: whether the tag has moved, and how old the running digest is. Both need only registry read access.

---

## 6. Data model, in outline

Three layers, in increasing derivation:

1. **Raw runs** — immutable Parquet, partitioned `axis=…/date=…`. Every collection run is stored as received (post-validation). This is the source of truth and the only thing that cannot be recomputed.
2. **Entities and edges** — the graph, materialized in `naught.duckdb`. Components, versions, origins, dependencies, and what contains what. Derived from raw runs; can be dropped and rebuilt.
3. **Drift** — per axis, per entity, over time. A number, a timestamp, and the coverage it was computed at. Derived.

The interesting query is never "what is true now" alone. It is always "what is true now *versus* what was true at time T". The partition layout exists to make that question cheap: a query bounded by date touches only the files in those partitions.

### The unit of the graph

**A node is a package at a specific version, identified by Package URL (purl).**

```
node:   pkg:npm/left-pad@1.3.0
        pkg:oci/node@sha256:f9e8…?repository_url=docker.io/library
        pkg:deb/debian/openssl@3.0.11-1~deb12u2

contains edge:
        repo:github/acme/api@<commit-sha>
          └── pkg:npm/left-pad@1.3.0
```

Repositories, image digests, and builds are **containers** that hold nodes, not nodes themselves.

This is deliberately one level finer than GUAC, which treats the OS package as its smallest unit. Naught cannot work at that granularity: "is this compromised" and "has this been abandoned" are both properties of a *version*, not of a package name. A vulnerability feed says `left-pad@1.3.0`, not `left-pad`. Dropping the version would mean re-deriving it on every query from data we chose not to keep.

Being finer-grained than GUAC is also what keeps federation coherent: a GUAC node maps onto a Naught node by widening, which is lossless. The reverse would not be.

### Retention

Raw runs are kept **forever**. They are not deleted, rolled up, or summarized away.

This is affordable because of the format, not in spite of it: consecutive runs of the same scope are nearly identical, and Parquet's dictionary and run-length encoding compress that to very little. A monthly **compactor** merges the day's files into month partitions, which keeps the file count flat and query planning fast. Old month partitions may be moved to cold storage; they are never dropped.

The alternative — a retention window — puts an expiry date on the one question Naught exists to answer. *"What changed since I last trusted this?"* must not have a floor of "since March".

### Coverage

Every drift number carries the coverage it was computed at, all the way to the interface. There is no hard threshold below which Naught refuses to answer; there is no answer that arrives without its coverage attached.

> Nothing found. Scanned 82% of what was declared. *18% unknown — 4 vendored binaries, 1 unresolvable registry.*

is a sentence Naught may render. "Nothing found." alone is not.

---

## 7. Notification

One rule: **an event costs the operator at most one decision, or none.**

- A finding fires when a drift value crosses a threshold the operator set, or when a new finding appears that was not in the previous run.
- A finding that was already reported and has not changed does not fire again.
- Every notification states: what changed, which entities are affected, how far it spreads, the coverage it was found at, and what decision is being asked for.
- Channels are pluggable. Start with one (webhook), add more later.

If Naught ever becomes a thing the operator must remember to check, it has failed.

---

## 8. Deployment

`docker-compose up`. Three services, one volume. Configuration by environment variables and one config file listing enabled collectors and their scopes.

Credentials: read-only tokens for every external system. The API holds them; nothing else does.

There is no schema migration step. On startup the API ensures `naught.duckdb` matches the current code's schema version; if it does not, it rebuilds the cache from the lake. A fresh deployment and a stale cache take the same code path.

Backup is copying `runs/`. `naught.duckdb` is never backed up — restoring it would be slower than rebuilding it.

---

## 9. Acceptance test

Point Naught at the Naught repository itself, plus one real registry and one real project.

It passes when it can answer, without manual work:

- What is this project made of, including transitive dependencies?
- Which of those has a known problem right now?
- Has the base image tag moved since we built against it?
- What changed since the previous run?
- What could it not see, and why — and what coverage does that leave?

Then delete `naught.duckdb`, run `naught rebuild`, and get identical answers.

And when a week of running produces no notifications on a quiet week, and exactly one notification on the day something actually broke.

---

## 10. Open questions

Unresolved. Do not guess — write an ADR when deciding.

- **Accreted state.** How does Naught detect things that exist but were never declared — the VM someone configured by hand, the realm added through a UI? Every axis so far compares a declaration to reality; this is the class of decay with no declaration to compare against.
- **The coverage denominator.** Coverage is now a first-class output, which means `expected` must be defined per collector. For a lock file it is the entry count. For a container image, what? An honest `null` is allowed, but a collector that always returns `null` renders the guarantee decorative.
- **Where `declared` comes from for base images.** Build-time digest requires build metadata, an SBOM, or image config inspection. Which of those is the lightweight path, and what does the collector do when none are present?
- **Parquet schema evolution.** Files written years apart must remain queryable in one `SELECT`. Additive columns are fine; renames and type changes are not. What is the rule, and where is the schema version recorded?
- **Compaction and immutability.** Compaction rewrites files. Raw runs are supposed to be immutable. Reconciling these needs a stated invariant — probably that compaction preserves rows exactly and is verified by row-count and checksum before the originals are dropped.
- **Graph traversal at scale.** Recursive CTEs in DuckDB are the bet. At what depth or breadth do they stop being adequate, and what is the signal to revisit Postgres?

### Settled, do not reopen without an ADR

Unit of the graph (package version, purl) · retention (indefinite, compacted) · storage engine (Parquet + DuckDB) · blind spot handling (coverage on every verdict, no refusal threshold) · first axes (dependency rot, base image tag drift) · always-on service.

---

## 11. Non-goals

- Not a remediation tool. It never patches, upgrades, or restarts anything.
- Not a dashboard. A dashboard is a snapshot; Naught's product is the difference between snapshots.
- Not a provisioning or wiring layer. Standing up infrastructure and connecting services to each other is a separate problem and not Naught's.
- Not an Internal Developer Platform. Naught serves the person who operates the systems, not the person who ships applications onto them.
- Not a replacement for GUAC. GUAC goes deeper on one axis. Naught spans several, works one level finer, keeps history, and comes to you.
