# RFC 003: Migrating Collectors to Golang (Project Fenrir)

- **Status:** Proposed
- **Date:** 2026-10-28
- **Codename:** **Fenrir** (*Fenrisúlfr*)
- **Target Component:** `collectors`, `apps/api`, `core-architecture`
- **Related Documents:**
  - [ARCHITECTURE §2 Principles & §5 Isolation](../../explanation/ARCHITECTURE.md)
  - [ADR 0003: Actions on Naught's Own Collection](../adr/0003-actions-on-naughts-own-collection.md)
  - [ADR 0007: Evidence Replaces Observations and Blind Spots](../adr/0007-evidence-replaces-observations-and-blind-spots.md)
  - [RFC 002: Project Import and Scope Definition](./002-project-import-and-scope-definition.md)

---

## 1. Summary

This RFC proposes rewriting Naught's collectors as independent, statically compiled **Golang** binaries under the project codename **Fenrir** (*Fenrisúlfr*), and establishes an architectural evaluation path for migrating Naught's core API server from TypeScript/Node.js to Golang.

The primary driver is eliminating the **JavaScript dependency treadmill**: maintaining Naught in Node.js forces operators into an endless cycle of patching OSV advisories across hundreds of transitive dependencies (e.g., Express, Body-Parser, Multer, Next.js). By shifting collector execution and eventually the API core to Golang, Naught achieves near-zero runtime supply-chain rot, predictable memory allocation, native concurrency, and single-binary deployment.

---

## 2. Motivation: The Node.js Supply Chain Paradox

Naught's founding premise is that *"everything decays, even your software."* Yet, Naught's current implementation is severely burdened by the very rot it watches:

1. **Self-Inflicted Decay & Vulnerability Fatigue:**
   - As documented in [README.md](../../../README.md#naught-watching-naught), a single collection of Naught's own lockfile reveals over 325 dependencies, with 24 advisories across packages like `next`, `body-parser`, and `multer`.
   - The team spends disproportionate engineering hours upgrading transient npm dependencies, troubleshooting broken peer dependencies, and resolving vulnerability alerts rather than expanding Naught's observation capabilities.
2. **The "Thin Adapter" Principle Violated:**
   - [ARCHITECTURE §2](../../explanation/ARCHITECTURE.md#principles) states: *"Each collector is a thin, replaceable adapter small enough to read in one sitting. It reads one external system, writes rows, and exits."*
   - Currently, collectors are tightly bound to the NestJS runtime (`apps/api/src/collectors/`), pulling in heavy framework dependencies, reflection metadata, and Node's event-loop concurrency model for what should be simple pipeline transformations.
3. **Concurrency Bottlenecks:**
   - Querying vulnerability databases (e.g., OSV batch queries) and parsing multi-megabyte lockfiles under Node.js consumes substantial heap memory and blocks the event loop. Go's native goroutines and channel-based worker pools can execute hundreds of external queries in parallel with negligible memory overhead.

---

## 3. Codename: Project Fenrir

In Norse mythology, **Fenrir** (*Fenrisúlfr*) is the giant wolf whose ferocity could not be contained by ordinary chains (*Læðingr* and *Drómi*), destined to break free and devour decaying cosmic structures during Ragnarök.

In Naught, **Fenrir** symbolizes breaking free from the suffocating chains of the npm dependency ecosystem:
- **`fenrir-core`:** The shared Go library providing DuckDB/Parquet sink writers, claim models, and manifest generators.
- **`fenrir-deps` (*Sköll*):** The wolf that chases the sun — scans dependency trees (npm, PyPI, Go modules, Cargo) and queries vulnerability sources (OSV, GitHub Advisory).
- **`fenrir-images` (*Hati*):** The wolf that chases the moon — inspects container base images, digests, and registry drifts.

---

## 4. Architectural Design

### 4.1 The Golang Collector Interface

Collectors are decoupled into standalone CLI programs or internal Go packages conforming to a minimalist Unix-style interface:

```go
package fenrir

import (
	"context"
	"time"
)

// Axis corresponds to Naught's observation dimensions.
type Axis string

const (
	AxisDeps       Axis = "deps"
	AxisBaseImages Axis = "base_images"
)

// Claim represents a single evidence row written to the Parquet lake.
type Claim struct {
	SubjectDigest        string    `parquet:"subject_digest"`
	ObservationKind      string    `parquet:"observation_kind"` // observed, absent_in_scope, not_assessable
	NotAssessableReason  *string   `parquet:"not_assessable_reason"`
	ClaimSource          string    `parquet:"claim_source"`
	SourceRecordedAt     time.Time `parquet:"source_recorded_at"`
	AdvisoryID           *string   `parquet:"advisory_id"`
	Payload              string    `parquet:"payload"`
}

// RunSink abstracts row buffering and Parquet emission.
type RunSink interface {
	Expected(total int) error
	Claim(claim Claim) error
	Close() error
}

// Collector defines an executable collection engine.
type Collector interface {
	ID() string
	Axis() Axis
	Version() string
	Collect(ctx context.Context, scope Scope, sink RunSink) (*RunReport, error)
}
```

### 4.2 Independent Execution Models

Fenrir collectors can be deployed and invoked in two modes:

#### Mode 1: Subprocess CLI Execution (Phased Migration)
The existing NestJS BullMQ worker spawns the Go binary as an isolated child process:
```bash
./fenrir-deps-osv \
  --scope-target="./pnpm-lock.yaml" \
  --lake-dir="/var/lib/naught/runs" \
  --run-id="1c9693bb-7729-4c55-bfa7-3c58e578c785"
```
- **Complete Isolation:** If a collector crashes or exhausts memory, the parent API process remains unaffected.
- **Zero JS Dependencies:** The collector binary contains its own lockfile parser, HTTP client, and Parquet writer (`github.com/parquet-go/parquet-go`).

#### Mode 2: Unified Native Go Core (Target State)
The entire `apps/api` service is replaced with a single static Go daemon:
```
┌─────────────────────────────────────────────────────────────┐
│                       apps/web (Next.js)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WebSocket (:3001)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Naught Go Core Daemon                    │
│                                                             │
│   ┌─────────────────────┐       ┌────────────────────────┐  │
│   │   HTTP/WS Router    │       │   In-Memory Job Queue  │  │
│   │   (Chi / Gin)       │       │   (Redis / Asynq)      │  │
│   └──────────┬──────────┘       └───────────┬────────────┘  │
│              │                              │               │
│              ▼                              ▼               │
│   ┌─────────────────────┐       ┌────────────────────────┐  │
│   │   DuckDB Querying   │       │     Fenrir Workers     │  │
│   │   (go-duckdb)       │       │  (deps.osv, images)    │  │
│   └──────────┬──────────┘       └───────────┬────────────┘  │
└──────────────┼──────────────────────────────┼───────────────┘
               ▼                              ▼
        /var/lib/naught/               /var/lib/naught/runs/
        naught.duckdb                  axis=deps/.../*.parquet
```

---

## 5. Comparative Trade-offs

| Dimension | Current Node.js / NestJS | Proposed Golang (Project Fenrir) |
|:---|:---|:---|
| **Transitive Dependencies** | 300+ packages (`node_modules`) | 5-10 pinned Go modules |
| **Vulnerability Exposure** | Frequent high/critical CVEs in web/parser stack | Minimal; pure standard library + vetted parsers |
| **Binary Artifact** | Multi-layer container (~250MB+) | Single static binary (~20MB scratch image) |
| **Concurrency** | Single-threaded event loop | Native Goroutines (O(10,000) concurrent queries) |
| **Memory Footprint** | ~150MB - 300MB idle heap | ~15MB - 30MB resident set size (RSS) |
| **Type Integrity** | TypeScript erased at runtime | Compiled static types, native struct alignment |

---

## 6. Migration Roadmap

1. **Phase 1: Fenrir Prototype (`fenrir-deps-osv`)**
   - Implement `lockfile` parsing (`pnpm-lock.yaml`, `package-lock.json`) in Go.
   - Implement OSV batch client in Go with goroutine concurrency.
   - Write `.obs.parquet` and `{stem}.run.json` using `parquet-go`.
   - Verify byte-for-byte and row-for-row equivalence with TypeScript collector.

2. **Phase 2: Hybrid Integration**
   - Package Fenrir binary into the API container.
   - Update `apps/api`'s collection runner to execute `fenrir-deps-osv` via subprocess instead of internal TypeScript classes.

3. **Phase 3: Core API Evaluation & Replacement**
   - Re-implement DuckDB analytical query routes in Go.
   - Re-implement WebSocket stream for live run progression.
   - Deprecate `apps/api` (Node.js) entirely, retaining only `apps/web` (Next.js) for user interface rendering.
