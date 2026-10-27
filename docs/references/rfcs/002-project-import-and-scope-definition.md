# RFC: Project Import, Scope Definition, and Collector Resolution

- **Status:** Proposed
- **Date:** 2026-10-28
- **Target Component:** `apps/api`, `packages/shared`, `apps/web`
- **Related Documents:**
  - [ARCHITECTURE §8 Deployment](../../explanation/ARCHITECTURE.md#8-deployment)
  - [ADR 0003: Actions on Naught's Own Collection](../adr/0003-actions-on-naughts-own-collection.md)
  - [Lake Schema Reference](../lake-schema.md)

---

## 1. Summary

This RFC proposes a standardized mechanism to import projects into Naught, declare their target files (such as `pnpm-lock.yaml` or `package-lock.json`), and map them to appropriate collectors (e.g., `deps.osv`). 

Currently, Naught requires at least one previous run to exist in its lake (`runs/`) to repeat a collection on any axis. On a fresh deployment or clean volume, Naught suffers from a **cold-start failure**: the Web interface returns `409 Conflict (NoRecordedScopeError)` because no scope was ever recorded, yet the interface provides no mechanism to import a project or establish an initial scope.

This document outlines:
1. A declarative project manifest specification (`naught.config.yaml` / project descriptor).
2. An automated collector resolution pipeline (matching ecosystems like npm/pnpm to `deps.osv`).
3. An onboarding and ingestion API/CLI to eliminate out-of-band data seeding.

---

## 2. Motivation: The Cold-Start Problem

In [ADR 0003](../adr/0003-actions-on-naughts-own-collection.md), Naught established a core constraint:

> *"The scope is not an input. A run repeats the scope of the most recent run that recorded one. An operator supplies no path, so no path arrives over HTTP, and there is nothing to traverse. An axis whose runs never recorded a scope refuses and says so."*

This is enforced in `apps/api/src/runs/collection-starter.ts`:
```typescript
const scope = await latestScope(this.manifests, axis);
if (scope === null) throw new NoRecordedScopeError(axis);
```

When an operator launches Naught via Docker Compose (`docker compose up`) with a fresh data volume (`naught-data` mounted at `/var/lib/naught`):
1. The lake is empty (`/var/lib/naught/runs` has 0 manifests).
2. When the operator opens the web UI and clicks to start a collection, the browser sends `POST /runs {"axis":"deps"}`.
3. The API throws `NoRecordedScopeError` and responds with `409 Conflict`:
   > *"no run on axis deps has recorded a scope, so there is nothing to repeat; record one by running a collection against this data directory from the command line (in a checkout, 'make poc-here')"*
4. **The Deadlock:** The UI cannot initiate a run because no scope exists, and no scope can be recorded because the UI cannot initiate an initial run. An operator is forced to drop into the container shell to manually execute internal CLI scripts.

Furthermore, Naught has no formal way to watch multiple projects or register non-default targets across multiple repositories.

---

## 3. Goals and Non-Goals

### Goals
- **Eliminate the Cold-Start Deadlock:** Enable Naught to perform initial collections on newly deployed instances without manual script executions.
- **Declarative Project Definition:** Define a clear schema for registering observed projects, their file targets, and their operational environment.
- **Collector Matching:** Automatically match declared project assets to supported collectors (e.g. mapping `package-lock.json` or `pnpm-lock.yaml` to npm/OSV dependency collectors).
- **Preserve Read-Only & Append-Only Guarantees:** Ensure project importing remains strictly read-only and does not compromise Parquet lake immutability.

### Non-Goals
- **Repository Mutation:** Naught will never write to or modify target repositories.
- **Arbitrary Remote File Execution:** Naught will not download and execute arbitrary build scripts or unvetted dependencies during import.
- **Replacing IaC / Monolithic Inventories:** Naught monitors software supply chain drift; it does not replace fleet management or asset management tools.

---

## 4. Proposed Solution

### 4.1 Declarative Project Manifest (`naught.config.yaml`)

As foreshadowed in [ARCHITECTURE §8](../../explanation/ARCHITECTURE.md#8-deployment):
> *"Configuration by environment variables and one config file listing enabled collectors and their scopes."*

We define a configuration schema loaded on API startup or updated via an ingestion interface:

(But noted that this is just a reference to show a possible implementation. If this approach is not feasible, we should figure out a better way to make this file.)

```yaml
version: "1"

projects:
  - id: "naught"
    name: "Naught Core Observer"
    root: "/workspace/naught" # Path mounted into Naught container
    axes:
      deps:
        collector: "deps.osv"
        strategy: "auto" # Or explicit
        targets:
          - "pnpm-lock.yaml"
      base_images:
        collector: "base_images.dockerhub"
        targets:
          - "apps/api/Dockerfile"
          - "apps/web/Dockerfile"

  - id: "payment-service"
    name: "Payment Gateway Service"
    root: "/workspace/projects/payment-service"
    axes:
      deps:
        collector: "deps.osv"
        targets:
          - "package-lock.json"
```

### 4.2 Auto-Detection and Collector Matching

When a project root is registered with `strategy: "auto"`, Naught inspects the project root to detect package managers and artifact files:

| Detected File | Ecosystem | Collector ID | Target Spec |
|:---|:---|:---|:---|
| `pnpm-lock.yaml` | npm / pnpm | `deps.osv` | `{ path: "pnpm-lock.yaml", parser: "pnpm" }` |
| `package-lock.json` | npm | `deps.osv` | `{ path: "package-lock.json", parser: "npm-v2/v3" }` |
| `yarn.lock` | npm / yarn | `deps.osv` | `{ path: "yarn.lock", parser: "yarn-berry" }` |
| `requirements.txt` / `poetry.lock` | PyPI | `deps.osv` (planned) | `{ path: "poetry.lock", parser: "poetry" }` |
| `Dockerfile` | OCI Images | `base_images.dockerhub` | `{ path: "Dockerfile", parser: "dockerfile" }` |

If multiple lockfiles are present or ambiguous, explicit configuration in `naught.config.yaml` takes precedence.

### 4.3 Resolving the Scope Lifecycle

We adapt `latestScope(manifestStore, axis, projectId?)` to follow a fallback hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Check Lake Manifests: latest recorded scope for project  │
└──────────────────────────────┬──────────────────────────────┘
                               │ (null: no previous runs)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Check Project Config: declared scope from naught.config  │
└──────────────────────────────┬──────────────────────────────┘
                               │ (null: not configured)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Refuse with NoRecordedScopeError (409 Conflict)          │
└─────────────────────────────────────────────────────────────┘
```

When an operator triggers a run on an axis with no historical runs in the lake, Naught falls back to the declared scope in `naught.config.yaml` to seed the baseline run. Once written to `{stem}.run.json`, all subsequent "Look again" operations have a recorded scope on disk.

### 4.4 Ingestion Endpoints (API & CLI)

To support dynamic environments (such as CI/CD runners or container orchestrators):

1. **CLI Ingestion Command:**
   ```bash
   # Register or import a project directory directly into Naught
   naught import --project naught --path /workspace/naught
   ```
2. **Management API Route (`POST /projects`):**
   ```http
   POST /projects
   Content-Type: application/json

   {
     "id": "external-app",
     "rootPath": "/mounted-volumes/external-app",
     "detectCollectors": true
   }
   ```
   *Security Note:* Paths must be restricted to explicitly whitelisted mount roots (e.g., `NAUGHT_PROJECTS_DIR`) to prevent directory traversal attacks outside the container boundary.

3. **Web UI Project Onboarding Wizard:**
   - Displays imported projects in a workspace dropdown.
   - Shows project health: `Uninitialized (Needs Baseline Run)` vs `Observed (Active)`.
   - The initial "Run Baseline Collection" button is enabled by default using the declared scope.

---

## 5. Security & Architectural Considerations

1. **Path Traversal Protection:**
   Accepting file paths over HTTP was prohibited by ADR 0003. When accepting project import configurations:
   - File paths must be strictly resolved relative to a predefined base directory (`NAUGHT_PROJECTS_DIR`).
   - Symlinks pointing outside the project root must be refused (`EACCES_OUT_OF_BOUNDS`).
2. **Append-Only Lake Integrity:**
   Project definitions and scopes do not mutate existing lake partitions. Each completed run packages its completed scope inside `{stem}.run.json` as immutable provenance.

---

## 6. Implementation Stages

- **Phase 1: Static Scope Config Fallback**
  - Implement parsing of `naught.config.yaml` in `apps/api`.
  - Update `latestScope` to fall back to `naught.config.yaml` when lake manifests are empty.
  - Mount project directory in `docker-compose.yml` so Naught can observe itself by default.

- **Phase 2: Collector Detection Logic**
  - Implement detector routines in `@naught/shared` for npm (`pnpm-lock.yaml`, `package-lock.json`).
  - Automatically infer collector parameters from detected files.

- **Phase 3: Dynamic Project Import & UI Support**
  - Add `GET /projects` and `POST /projects` in `apps/api`.
  - Add Project Selector and Import modal in `apps/web`.
