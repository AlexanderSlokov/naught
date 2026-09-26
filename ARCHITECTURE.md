# Naught — Architecture

**Status:** design document. This file is the brief.

Read `README.md` first for what Naught is and why it exists. This document covers *how* it is built and the reasoning behind each choice, so that a future contributor (human or agent) does not re-litigate settled decisions or violate a constraint without knowing it was deliberate.

Terms of art — coverage, drift, subject, blind spot — are defined in §12. Where a word used elsewhere in this repository disagrees with §12, §12 is the one that is right.

---

## 1. What Naught does, mechanically

1. **Collect.** Scheduled jobs pull facts from many sources: git repositories (lock files), artifact registries, vulnerability feeds...
2. **Normalize.** Consolidates sources of information to point out important aspects.
3. **Compare.** Each axis ( a.k.a. the attribute) has a *declared* reference and an *observed* reality. The difference is drift.
4. **Remember.** Every collection run is retained, so "what changed since I last know?" is always answerable.
5. **Show.** A dense, readable interface for the operator.
6. **Knock once.** When a drift number crosses an operator-set threshold, only one notification. No more requests spamming.

Naught never take actions to mutate the systems it observes. See README, *What Naught will never do*.

---

## 2. Design constraints

These are load-bearing. Breaking one requires an ADR that explains why.

| Constraint                         | Meaning in practice                                                                                                                                                                                                                                                      |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Read-only**                      | Every credential Naught holds for an external system is read-only.                                                                                                                                                                                                       |
| **Complex inside, simple outside** | Naught may be internally elaborate many collectors, a large graph, heavy processing. But It must stay simple is the operator's surface: one thing (a bunble in Helmchart that can be thrown in Kind is counted to) to deploy, one place to look, one decision per event. |
| **Easy to throw away**             | Truth is a directory of immutable files. Backup and Restore is just file copy. No hand-tended state, no clustering, no quorum.                                                                                                                                           |
| **Rebuildable from source data**   | Anything derived — the graph, aggregates, drift scores — can be dropped and recomputed from retained raw collection runs. One command or CI trigger will do.                                                                                                             |
| **No sibling is required**         | Naught works alone. If a sibling Naughtian tool (or GUAC) is present, a richer collector for that axis becomes available.                                                                                                                                                |
| **Blind spots are declared**       | What a collector cannot see is recorded as `unknown`, never silently omitted. A map that lies by omission is worse than no map.                                                                                                                                          |
| **No verdict without coverage**    | Every number Naught renders carries the coverage it was computed at. "Nothing found" alone is not a sentence Naught is allowed to say.                                                                                                                                   |

**On being a service.** Naught is an always-on server, and the README's *Inert* principle is scoped accordingly: Naught never writes to the systems it observes, and its own state is append-only files it can rebuild from. It is not scoped to mean "no daemon". Watching global decay across many sources requires scheduled collection and retained history; a tool that only runs when you remember to run it is a tool that tells you about decay you already noticed.

---

## 3. Stack

| Layer             | Choice                                         | Why                                                                                                                                                                                                                |
|-------------------|------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Backend           | **NestJS** (TypeScript)                        | Module per collector; dependency injection makes collectors swappable; built-in scheduler and queue integration; GraphQL is first-class (which matters if we ever federate with GUAC).                              |
| Frontend          | **Next.js** + **Blueprint** (`@blueprintjs/*`) | Blueprint is Palantir's React toolkit, Apache-2.0, built for data-dense analytical interfaces. It is the correct aesthetic and functional fit for this application.                                                |
| Storage of record | **Parquet files on disk**, Hive-partitioned    | Raw runs are immutable, append-only, columnar, and compress extremely well against repetitive data. No database owns the truth, so no database can corrupt it.                                                     |
| Query engine      | **DuckDB**                                     | Reads the Parquet lake directly (`SELECT * FROM 'runs/**/*.parquet'`), supports `WITH RECURSIVE` for transitive dependency closure, and is embedded — no server, no port, no operator surface.                     |
| Derived cache     | **One `naught.duckdb` file**                   | Materialized entities, edges, and drift, indexed for the UI. Pure cache. `rm naught.duckdb && naught rebuild` is always safe and is a tested path.                                                                 |
| Queue             | **Redis** + BullMQ                             | Collection is bursty and retryable. Collectors call rate-limited external APIs; retry with backoff, blocked-job visibility, and survival across restarts are worth one container.                                  |
| Run events        | **WebSocket** (`ws`), on the API's own port    | A run started from the interface outlives its request. The browser uses its native `WebSocket`, so the interface gains no dependency for it; the API shares the HTTP port, so deployment gains no second listener. |
| Validation        | **zod**                                        | TypeScript types vanish at runtime. Every external payload is validated at the boundary before it is trusted.                                                                                                      |
| Shared types      | A `packages/shared` workspace                  | One set of types across collectors, API, and UI. This is the main reason the whole stack is TypeScript.                                                                                                            |

**Why not Postgres.** Postgres was the first candidate and remains the fallback if the graph outgrows recursive CTEs. Naught's central question is *"what is true now versus at time T"*, which is a columnar scan over immutable history — DuckDB's home ground and Postgres's worst case. DuckDB also removes a server, a port, a connection pool, and a backup procedure from the operator's surface, which is constraint #2 paying out. **If graph traversal becomes the bottleneck rather than history scanning, revisit this with an ADR.**

**Why not Go/Rust:** Naught is network-bound, it waits on APIs and no need to ingest some Petabytes of JSON API. The advantage of a compiled runtime would be single-binary deployment, but a server run in container already removes most of that benefit. Schema sharing and UI velocity matter more here.

**Why not Laravel:** a strong contender on capability, rejected on toolchain preference and because a split-language stack loses end-to-end shared types. Composer is quite flaky, PHP interpreter requires more effort just to make it run as fast as V8 engine.

**The npm paradox.** Naught runs on the ecosystem it exists to watch. This is not an embarrassment — it is the acceptance test. Point Naught at Naught's own repository. If it cannot find the rot in itself, it does not work.

**Do not mix design systems.** Blueprint has its own visual language. Do not introduce shadcn/ui, Material, or Chakra alongside it.

---

## 4. Repository layout

```
naught/
├── apps/
│   ├── api/             # NestJS: collectors, lake, scheduler, compactor, API, notifier
│   └── web/             # Next.js + Blueprint
├── packages/
│   └── shared/          # zod schemas + inferred types, shared by both apps
├── fixtures/            # lockfiles known to be rotten, so the detector stays tested
├── docs/                # Diátaxis: adr/, references/, explanation/
├── ROADMAP.md           # capabilities, by phase and target version
├── BACKLOG.md           # tasks, with the files they touch and their done-when
├── CHANGELOG.md         # what landed, written for an operator
├── Makefile             # every command a person actually runs
├── docker-compose.yml
└── ARCHITECTURE.md
```

Three containers: `api`, `web`, `redis`. One volume, holding the lake and the cache:

```
/var/lib/naught/
├── runs/                        # truth. immutable, append-only
│   ├── axis=deps/date=2026-09-24/
│   │   ├── deps-osv--030412-811d6f.obs.parquet      # what the run saw
│   │   ├── deps-osv--030412-811d6f.blind.parquet    # what it could not see
│   │   └── deps-osv--030412-811d6f.run.json         # what it set out to see
│   ├── axis=image/date=2026-09-24/
│   │   └── image-registry--030507-4a91c2.obs.parquet
│   └── axis=deps/month=2026-08/part-0000.parquet    # compacted
└── naught.duckdb                # cache. droppable
```

A run file is named `{collector}--{HHMMSS}-{nonce}.{obs|blind}.parquet`. The seconds and the nonce are not decoration: two runs of the same collector inside one clock tick would otherwise write the same name, and `COPY TO` overwrites silently — append-only in this document, last-write-wins on disk. The writer refuses to overwrite an existing run file rather than trusting the name to be unique.

Beside them sits the run's manifest, `{stem}.run.json`, holding the collector's
own `RunSummary` and the `Scope` the run was pointed at. Rows record what was seen; they cannot record what the
collector expected to see, and so they cannot answer *at what coverage*. A lake
of 313 clean rows looks identical whether the collector read 313 packages or
read 313 of 400 and gave up. Reconstructing the denominator from the rows would
put the count at the mercy of the same collector that failed to count, which is
what `RunSummary.expected` is nullable to prevent. The run states its coverage
once, and every reader reads it rather than deriving it.

The scope is recorded for a different reason: so that a run can be repeated
without anyone naming a target again. The interface's one action is *look
again*, and it can only mean that honestly if the lake remembers what was
looked at. A manifest written before the field existed carries `null`, and a
run that cannot say what it read is not repeated on a guess.

Observations and blind spots are separate files because they share column names. A glob that matches both unions a *could not see it* row into a list of things that were seen, which is the lie by omission this project exists to refuse.

There is no `migrations/` directory. Parquet files carry their own schema; the derived cache is rebuilt, never migrated. The lake nonetheless has a schema *version*, stated by each run in its manifest: what may change inside one version, and what requires an upgrade stop, is settled in §10.

---

## 5. Collectors

A collector is a NestJS module implementing one interface. It fetches, validates with zod, and streams normalized observations plus an explicit record of what it could not see.

Observations stream to the sink rather than accumulating in a return value: a monorepo lock file can carry tens of thousands of entries, and the run must survive being larger than memory. `expected` is deliberately nullable — a collector that does not know how much it was supposed to see must say so rather than report 100%.

### Axes

| Axis                     | Status | Declared                        | Observed                             | Lightweight collector                                        | Advanced collector (optional)              |
|--------------------------|--------|---------------------------------|--------------------------------------|--------------------------------------------------------------|--------------------------------------------|
| **Dependency rot**       | **v1** | what you built against          | what upstream now says about it      | Read lock files from git, query OSV batch API                | Query a running GUAC instance over GraphQL |
| **Base image tag drift** | **v1** | base image digest at build time | digest that same tag resolves to now | Read Dockerfile/build metadata, resolve tag against registry | —                                          |
| Placement drift          | later  | the scheduling blueprint        | where workloads actually run         | Compare a scheduling blueprint to actual placement           | —                                          |
| Configuration drift      | later  | declared node state             | node state now                       | Read declared state from a repo, compare to observed         | Read from a sibling tool if present        |
| Credential staleness     | later  | intended lifetime               | time since last rotation             | Age since last rotation, from metadata only                  | —                                          |

The three `later` axes exist in the `Axis` enum and in the data model from day one, but ship without collectors. Need to re-evaluate if Naught really need to collect 3 of them as "decay axis".

Just use the Occam's Razor, or YNGNI to decide.

### Base image tag drift, specifically

`FROM node:20-alpine` is a promise that ages badly. The tag is mutable.

```
declared:   sha256:a1b2…   # digest the tag resolved to when the image was built
observed:   sha256:f9e8…   # digest the same tag resolves to now
drift:      the tag moved under you

           + age of the digest actually running: 47 days
```

Two numbers fall out: whether the tag has moved, and how old the running digest is. Both need only registry read access.

Where the *declared* digest is read from, and what this axis renders when nothing recorded it, is settled in §10. It renders neither a guess nor an empty panel.

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

This is affordable because of the format, not in spite of it: consecutive runs of the same scope are nearly identical, and Parquet's dictionary and run-length encoding compress that to very little. A monthly **compactor** merges the day's files into month partitions, which keeps the file count flat and query planning fast. Compaction is row-preserving and verified before any original is dropped; the invariant is stated in §10. Old month partitions may be moved to cold storage; they are never dropped.

The alternative — a retention window — puts an expiry date on the one question Naught exists to answer. *"What changed since I last trusted this?"* must not have a floor of "since March".

### Coverage

Every drift number carries the coverage it was computed at, all the way to the interface. There is no hard threshold below which Naught refuses to answer; there is no answer that arrives without its coverage attached.

Coverage means one thing only — how much of what a run set out to read it actually read — and §12 defines it, with a worked example. It is not a health score and it is not a confidence score; those readings are the reason the definition is written down.

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

The lake is checked on the same startup and handled differently. A stale cache is rebuilt without asking anyone; a lake written at a schema version this code cannot read stops the API, which names the upgrade stop that can read it (§10). The cache is disposable and the lake is not, so only one of the two may be dealt with silently.

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

Of the six questions this section opened with, three are answered below, two are deferred on purpose, and one is still open.

Each answer is the decision of record. It is owed an ADR under `docs/adr/`, and the reasoning is written here first so that none of it is lost while `docs/` is reorganized into Diátaxis. Reversing one of these means writing the ADR that says why — not editing the paragraph.

### Answered

#### Where `declared` comes from for base images

`declared` is the digest the tag resolved to when the image was built. Naught reads it from the first of three sources that is present:

1. **The image's own config** — the `org.opencontainers.image.base.digest` and `…base.name` annotations, which BuildKit writes at build time. The cheapest path by a wide margin: it needs the registry read access this axis already requires, and nothing else deployed.
2. **Build metadata** — a provenance record or CI artifact naming the digest that was resolved when the image was built. The most authoritative source, and available only where the builder was configured to record it.
3. **An SBOM** — when it lists the base image as a component and carries its digest.

When none of the three is present, the axis does not guess, does not resolve the tag twice and call the agreement "no drift", and does not render an empty panel. It renders **unavailable**, naming what it looked for and what would make it work:

> Base image drift unavailable for `acme/api:2026.9`. No build-time digest recorded. This axis needs one of: base-image annotations in the image config, a provenance record from the build, or an SBOM naming the base image.

*Unavailable* is a third state beside zero and unknown (§12) and is reported as itself. "The tag has not moved" and "nobody wrote down where the tag pointed" are exactly the two facts this project exists to keep apart.

#### Parquet schema evolution

Raw runs are kept forever (§6), so files written years apart must answer one `SELECT`, and the lake outlives the code that wrote it. The rule follows GitLab's upgrade path (`docs.gitlab.com/update/upgrade_paths/`): most upgrades are unremarkable, a few are **required stops**, and the operator is told which rather than being allowed to skip one.

- **Within a schema version, additions only.** A new column is appended, and files written before it read as `NULL` — readers union by name, which `apps/api/src/lake/schema.ts` declares rather than infers. No stop, no rewrite, any version to any version.
- **A rename or a type change is a new schema version**, and the release carrying it is an upgrade stop. That release ships a rewriter: it reads the lake at the old version, writes it at the new one, verifies the result by the compaction invariant below, and only then lets the API serve. An operator may not jump across a stop, in the same way GitLab requires the latest patch of the current minor and every stop in between before a major.
- **The version is recorded by the run**, in its manifest, beside the coverage figure and for the same reason: the writer states what it wrote and readers read it, rather than sniffing columns and inferring a generation. The column set in `schema.ts` as of this document is schema version **1**; a manifest that names no version is read as 1, and so is a run that has no manifest at all.
- **The API refuses rather than improvises.** On startup it compares the lake's schema versions against what the code can read. Older and rewritable: it names the upgrade stop to install. Newer than the code: it refuses to serve, because reading tomorrow's columns under today's assumptions is how a lake starts lying quietly.

This is deliberately the unglamorous option. The alternative — a reader clever enough to reconcile any two generations of the schema on the fly — puts the integrity of the one irreplaceable artifact into the hands of the most complicated code in the repository. Making an operator install `0.7` before `0.8` costs them one command. Mis-typing a column in a file nobody will read for two years costs them the history.

#### Compaction and immutability

Compaction rewrites files; `runs/` is immutable. The invariant that reconciles the two is Grafana Mimir's, whose block storage solved this problem for Prometheus data — and Naught, one retained run at a time, is coming to resemble Prometheus.

Mimir compacts in two directions. **Vertical** compaction merges blocks that cover the same time range from different replicas and deduplicates their samples; Naught has no analog and needs none, because no two runs are replicas of each other. **Horizontal** compaction merges adjacent time ranges into larger blocks to shrink the index; that is precisely Naught's day-into-month merge, and it is the only half that is borrowed.

The lifecycle is the part that carries the invariant:

1. The compactor **writes a new file**. No existing file is opened for writing. *Immutable* is a claim about files on disk, and compaction does not break it — it adds one.
2. The compacted file's manifest **records its sources**, so any row can be traced back to the run that observed it. Mimir keeps the same lineage in each block's `meta.json`.
3. The sources are **marked** for deletion, not deleted. A reader that has already planned a query against them finishes against them.
4. The hard delete follows **after a grace period** — Mimir's `-compactor.deletion-delay`, which exists so that readers discover the compacted block before its inputs disappear. Naught's grace period is its own value with the same purpose.

Two conditions gate step 3: the compacted file must hold exactly the rows of its sources, verified by per-source row count and by checksum; and the sources must still be readable when that check runs. A source that fails verification is left in place and marked so the compactor does not retry it forever. A lake that stops compacting is merely slow. A lake that drops a row it cannot prove it copied is wrong, and it is wrong about the only thing it cannot rebuild.

Stated once: **compaction changes how many files sit under an axis, and never the multiset of rows in them.** Anything that cannot say that of itself is not compaction, and does not get to delete an original.

### Still open

- **The coverage denominator.** Coverage now has one definition and one computation (§12), which narrows this question to its hard part: what `expected` *is*, collector by collector. For a lock file it is the entry count, known before the first OSV request is sent. For a container image there is no equally obvious unit — layers, declared base images, packages resolved out of the filesystem are three different denominators that yield three different percentages of the same run. An honest `null` remains permitted; a collector that always returns `null` makes the guarantee decorative. The image collector must therefore name its denominator, or state in this document why it has none.

### Deferred on purpose

- **Accreted state.** Leaning out of scope, and heading for a cold backlog rather than an answer. Undeclared *infrastructure* is found far more cheaply by the IaC that was supposed to create it: a plan that reports a resource it does not manage is the same finding, reached without Naught. Naught observes software — what a system is assembled from, and how far those parts have drifted from what was declared. Growing an inventory axis to catch the hand-made VM widens the tool past the question it exists to answer, and §11 already refuses the neighbouring job of standing infrastructure up. What would reopen this: an axis where the *software* accretes undeclared, such as a package present in a running image and in no lock file. That case has a declaration to compare against, which is what makes it Naught's.
- **Graph traversal at scale.** Recursive CTEs in DuckDB are the bet, and the POC has not yet proved the bet needs hedging. Naming a depth or a breadth now would be designing against an imagined load, and §3 already records what to do instead — revisit Postgres with an ADR when traversal, rather than history scanning, is the bottleneck. The signal is a measured one: a traversal the interface visibly waits on, against a real lake. Until then this sits where §5 puts the three unimplemented axes, on YAGNI, on purpose.

### Settled, do not reopen without an ADR

Unit of the graph (package version, purl) · retention (indefinite, compacted) · storage engine (Parquet + DuckDB) · blind spot handling (coverage on every verdict, no refusal threshold) · first axes (dependency rot, base image tag drift) · always-on service · `declared` for base images (three sources in order, then *unavailable*) · schema evolution (additive within a version, upgrade stops across one) · compaction (row-preserving, verified, mark before delete).

---

## 11. Non-goals

- Not a remediation tool. It never patches, upgrades, or restarts anything.
- Not a dashboard. A dashboard is a snapshot; Naught's product is the difference between snapshots.
- Not a provisioning or wiring layer. Standing up infrastructure and connecting services to each other is a separate problem and not Naught's.
- Not an Internal Developer Platform. Naught serves the person who operates the systems, not the person who ships applications onto them.
- Not a replacement for GUAC. GUAC goes deeper on one axis. Naught spans several, works one level finer, keeps history, and comes to you.

---

## 12. Glossary

Naught's vocabulary is small and each word carries weight. A term means here what this section says it means; where another document, a code comment, or a panel in the interface uses one loosely, that place is the one to fix.

### Axis

One kind of decay, and the attribute measured for it: `deps`, `image`, `placement`, `config`, `credentials`. Every axis asks the same question in a different vocabulary — *what was declared, what is observed, how far apart are they* — which is why one data model serves all five (§6).

### Collector

A replaceable adapter that reads one external system and writes rows: `deps.osv`, `image.registry`. An axis may have a **lightweight** collector, which requires nothing else to be deployed, and an **advanced** one, which is richer because a sibling tool is present (§5). A collector holds no state between runs and is never given a credential that can write.

### Subject

The thing an axis measures, identified by Package URL: `pkg:npm/left-pad@1.3.0`. One observation row is one subject at one moment. A subject is a package *at a version*, because "is this compromised" and "has this been abandoned" are properties of a version, not of a name (§6).

### Container

Where a subject was found: a repository at a commit, an image digest, a host. Containers hold subjects and are not subjects themselves. For the deps axis, the container is the lock file the collector was pointed at.

### Declared, observed, drift

- **Declared** — what a source of truth says should be there: the version a lock file pinned, the digest a tag resolved to when an image was built.
- **Observed** — what reality says now: what OSV reports about that version today, what the tag resolves to today.
- **Drift** — the distance between them, as a number. Comparable within an axis and meaningless across axes: on `deps` it counts advisories, on `image` it reports a digest that moved and how old the running one is. A `null` drift is a subject the collector saw but could not place on the scale — which is not zero.

### Run

One execution of one collector against one scope. The run is the unit of everything: it writes its own Parquet files, states its own coverage, and is never edited afterwards. Runs are not merged into a current state. The state *is* the newest run, and the run before it is what makes a delta possible.

### Scope

What a run was pointed at: `targets`, plus an optional `since`. Recorded in the run manifest so that the interface's one action — *look again* — can repeat a run without an operator naming a target, and therefore without a path arriving over HTTP (ADR 0003).

### Run manifest

`{stem}.run.json`, written beside the Parquet files of the run it describes. It holds what the rows cannot: the collector's own `RunSummary`, the `Scope` the run was pointed at, the artifacts it produced, and — once the field exists — the schema version it was written at (§10). A manifest that names no version reads as version 1. A run with no manifest is not invalid; it is a run whose coverage is permanently unknown.

### Coverage

**How much of what a run set out to read, it actually read.** Nothing else.

```
coverage = observed / expected
```

- `observed` — subjects the run wrote an observation for.
- `expected` — subjects the run knew it was supposed to read, stated by the collector itself the moment it knows (`RunSink.expected(n)`), never counted back out of the rows.
- `coverage` — the quotient, and `null` when `expected` is unknown.

The figure is computed once, by the run, and recorded in its manifest. Every reader reads it from there; nothing downstream recomputes it, because a denominator derived from the rows would be at the mercy of the same collector that failed to read them (§4).

A worked example. A lock file holds 400 entries. Thirteen of its keys are not `name@version`, and one batch of 74 packages dies on an OSV rate limit:

```
expected  400      # counted from the lock file, before a single question was asked
observed  313      # rows the run managed to write
coverage  0.78
blind      87      # 13 unparseable + 74 rate-limited, each a row carrying its reason
```

If none of those 313 subjects carries an advisory, Naught's verdict is *nothing found, at 78% coverage*, and the missing 22% is itemized. It is not *nothing found*.

What coverage is **not**:

- **Not a health score.** 100% coverage with forty advisories is a fully-read, rotten project. 78% coverage with none is three-quarters of a project, read.
- **Not a confidence score**, not a share of anything fixed, and not a measure of Naught's own quality.
- **Not a threshold.** There is no level below which Naught refuses to answer (§6). There is no answer that arrives without coverage attached.

`coverage: null` means *this run cannot say*. The interface renders it as `coverage unknown` and never as complete, and keeping those apart is why `expected` is nullable everywhere it appears.

### Blind spot

Something a run knew it could not see, written as a row carrying a reason from a closed vocabulary: `unparseable`, `rate-limited`, `unreachable-upstream`, `access-denied`, `unsupported-ecosystem`, `opaque-layer`, `vendored-binary`, `other`. Blind spots live in their own `.blind.parquet` file so that no glob can union *could not see it* into a list of things that were seen (§4).

An empty blind-spot list does not mean everything was read. It means the run knew of nothing it had missed, and the reader is handed to the coverage figure to learn whether those are the same thing.

### Zero, unknown, unavailable

Three states Naught is never allowed to conflate:

| State | Means | Rendered as |
|---|---|---|
| **Zero** | It was read, and there is nothing wrong with it | a number, beside its coverage |
| **Unknown** | It could not be read, and Naught says which part and why | a blind spot, and coverage below 100% |
| **Unavailable** | The axis cannot be computed at all, because an input it requires is absent | the axis states what is missing and what it needs (§10) |

### Finding

A subject whose drift is worth an operator's attention on its axis — for `deps`, a subject carrying at least one advisory. Findings are counted per run (`openFindings`) and travel with the delta, so that "nothing changed" can never be read as "nothing is wrong".

### Delta

What moved between the two most recent runs of an axis: subjects whose drift changed, appeared, or went away. What did not move is deliberately absent (§7). The delta, not the snapshot, is the product (§11).

### Lake

`runs/`. Immutable, append-only Parquet plus one manifest per run, Hive-partitioned `axis=…/date=…`. The only thing in the system that cannot be recomputed, and therefore the only thing that is backed up (§8).

### Derived cache

`naught.duckdb`. Everything the lake implies, materialized and indexed for the interface. Droppable at any moment by design, and dropping it is a tested path (§2).

### Compaction

Merging a day's run files into a month partition to keep the file count flat and query planning fast. It writes a new file, verifies it holds exactly the rows of its sources, and only then marks the sources for deletion. It never edits a file in place (§10).

### Schema version

Which generation of the Parquet column set a run was written against, stated by the run in its manifest. Adding a column does not change it. A rename or a type change does, and crossing that boundary requires an upgrade stop (§4, §10).

### Upgrade stop

A release an operator must pass through in order, rather than skipping. Because the lake is retained forever, it outlives the code that wrote it; a release that changes the column set therefore ships the rewriter that migrates the lake, and refuses to be jumped over. Borrowed, name and all, from GitLab's upgrade path (§10).

### Accreted state

Something that exists but was never declared: the VM configured by hand, the realm added through a UI. Named here because every Naught axis compares a declaration against reality, and this is the class of decay with no declaration to compare against. Currently deferred, and leaning out of scope (§10).

---

```text

                                 BROWSER
        │                           │                           ▲
        │ (1) GET /                 │ (2) POST /runs            │ (3) ws /runs/stream
        │     trang                 │     bấm "Collect"         │     tiến độ + kết quả
        ▼                           │                           │
┌───────────────────┐               │        CORS: NAUGHT_WEB_ORIGIN (một origin)
│  web   :3000      │               │                           │
│  Next 16 · RSC    │               │                           │
│                   │               └───────────┬───────────────┘
│  page.tsx  ───────┼──── lib/api.ts            │   NEXT_PUBLIC_NAUGHT_API_URL
│  (force-dynamic)  │     NAUGHT_API_URL        │   (nướng vào bundle lúc BUILD)
└─────────┬─────────┘     http://api:3001       │
          │              (chỉ server thấy)      │
          ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  api   :3001                    NestJS                                      │
│                                                                             │
│  ĐƯỜNG ĐỌC (GET, stateless)            ĐƯỜNG CHẠY (POST stateful)           │
│  ──────────────────────────            ──────────────────────────           │
│  FindingsController                    RunsController ── RunBroadcaster ────┼──► ws
│        │                                     │           (ws gateway,       │
│        ▼                                     ▼           snapshot 30s)      │
│  FindingsService                       CollectionStarter         ▲          │
│        │                                │    │    │               │         │
│        │                     latestScope│    │    │refuse         │         │
│        │                   (đọc .run.json)   │    │ nếu chạy      │         │
│        ▼                                ▼    ▼                    │         │
│  LakeService.query()              BullRunQueue ──► Redis ──┐      │         │
│  DuckDB :memory:                  jobId = collectorId      │      │         │
│        │                          (trùng id ⇒ bị từ chối)  │      │         │
│        │                                                   ▼      │         │
│        │                     CollectionProcessor (concurrency 1)  │         │
│        │                                     │                    │         │
│        │                    DepsOsvCollector.collect(scope, sink) │         │
│        │                                     │  └── OSV API (đọc) │         │
│        │                          ProgressReportingSink ──────────┘         │
│        │                            (đếm, throttle 250ms)                   │
│        │                                     │                              │
│        │                             ParquetRunSink                         │
│        │                          seal() ─┬─ .obs.parquet                   │
│        ▼                                  └─ .run.json  (summary + scope)   │
│    glob Parquet ◄─────────────────────────┘   discard()  nếu run hỏng       │
└──────────┬──────────────────────────────────────────────┬───────────────────┘
           │                                              │
           ▼                                              ▼
┌──────────────────────────────┐              ┌────────────────────────────┐
│  volume  /var/lib/naught     │              │           redis            │
│    --- True state ---        │              │  Giữ trạng thái điều phối  │
│                              │              │  của lượt chạy,            │    
│  runs/axis=deps/date=…/      │              │  không persist             │
│    *.obs.parquet   bất biến  │              │  mất = chạy lại là xong    │
│    *.blind.parquet append    │              └────────────────────────────┘
│    *.run.json      only      │
│  ── disposable cache ──      │      Run đang chạy không được ingest vào lake.
│       naught.duckdb          │      Lake chỉ nhận đúng 1 manifest khi seal,
└──────────────────────────────┘      và không nhận gì khi thất bại.

Hai storage có trạng thái định hình toàn bộ thiết kế:

┌─────────────┬───────────────────────────┬────────────────────────────────────────────┐
│             │      Parquet lake         │            Redis + broadcaster             │
├─────────────┼───────────────────────────┼────────────────────────────────────────────┤
│Write attempt│ seal() thành công         │ ngay khi enqueue                           │
├─────────────┼───────────────────────────┼────────────────────────────────────────────┤
│ Mất thì sao │ không khôi phục được      │ chạy lại là xong                           │
├─────────────┼───────────────────────────┼────────────────────────────────────────────┤
│ Ai đọc      │ mọi GET, qua glob Parquet │ GET /runs/current, socket                  │
└─────────────┴───────────────────────────┴────────────────────────────────────────────┘
```
