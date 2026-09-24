# Backlog

Tasks decomposed from [ROADMAP.md](./ROADMAP.md), grouped by the artifact they
modify. Each names the files it touches, what it depends on, and an explicit
condition for being done.

A task leaves this file when it is complete, and is described in
[CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]`.

---

## Phase 1 · Read the deps axis without a terminal

**W5 — Choose the axis from the rail**
*Files:* `apps/web/components/AxisRail.tsx`, `apps/web/app/page.tsx`
*Depends on:* nothing outstanding
The rail shows all five axes and marks which hold data, but the page is fixed
to `deps`; the other four are not selectable. Harmless while only one collector
exists, and a dead control the moment a second one lands.
**Done when** clicking an axis with data loads it, and an axis without data
explains that nothing has looked rather than doing nothing.

**W6 — Linkable selection**
*Files:* `apps/web/components/Explorer.tsx`
*Depends on:* W5
Selection lives in component state, so a view cannot be sent to anyone. A
`?axis=&subject=` URL parameter would fix it, at the cost of a Suspense
boundary.
**Done when** pasting a copied URL opens the same subject on the same axis.

---

## Phase 2 · A second axis, and the loop that closes itself

**X1 — Trigger a collection from the interface**
*Files:* `apps/api/src/collectors/` (a queue producer), `apps/web/components/Header.tsx`
*Depends on:* nothing outstanding
A Workshop application attaches Actions to the objects it displays; the nearest
analogue here is a control that starts a collection run rather than waiting for
the schedule or for someone to type `make poc-here`. It is read-only outward —
a run only reads external systems — so ARCHITECTURE §2 does not forbid it.

Held back from Phase 1 because it is not a button. It needs BullMQ and Redis in
the request path, a job whose state outlives the response, and a way for the
interface to report the progress and the failure of something asynchronous.
That is a larger surface than the entire read path it would sit beside, and it
belongs with scheduled collection rather than as an exception inside a
read-only POC.
**Done when** a run can be started from the interface, its progress is visible,
its failure is visible, and a second click while a run is in flight does not
start a second run.

**X2 — Manifests for runs written before manifests existed**
*Files:* `apps/api/src/lake/run-manifest.ts`
*Depends on:* nothing outstanding
A run sealed by an earlier build has Parquet files and no `.run.json`. The API
reports its coverage as unknown, which is correct and is also permanent — there
is no way to recover a denominator that was never recorded. Either accept that
those runs read as unknown forever, or write a one-off tool that backfills a
manifest with `expected: null` so the gap is explicit rather than incidental.
**Done when** the intended behaviour for pre-manifest runs is decided and
written down, whichever way it goes.
