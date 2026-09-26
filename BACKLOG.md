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

**W5a — `@blueprintjs/table` does not render under React 19**
*Files:* `apps/web/components/SubjectTable.tsx`
*Depends on:* an upstream fix
Tried and reverted on 2026-09-25. `Table2` mounts its chrome — quadrants,
scroll containers, a body sized correctly at `numRows × rowHeight` — and then
renders zero cells and zero column headers, with no console error. Reproduced
in isolation on a bare three-row table outside the application's layout, with
and without `reactStrictMode`, on both 6.2.4 and 6.2.6 (the newest release past
the release-age window). `componentDidMount` only builds its locator when all
three element refs are non-null, and without a locator `viewportRect` stays
undefined and the body is never rendered; something in React 19.3 or Turbopack
leaves one of those refs null.

The hand-rolled `<table>` stays. It is denser than Table2's default, it reads
correctly, and it works. What it gives up is virtualization and copy-out of a
selected cell — neither of which matters at 313 rows, both of which will matter
on the image axis.
**Done when** a release of `@blueprintjs/table` renders cells under this
toolchain, or the reason it cannot is understood well enough to work around.

**W6 — Linkable selection**
*Files:* `apps/web/components/Explorer.tsx`
*Depends on:* W5
Selection lives in component state, so a view cannot be sent to anyone. A
`?axis=&subject=` URL parameter would fix it, at the cost of a Suspense
boundary.
**Done when** pasting a copied URL opens the same subject on the same axis.

---

## Phase 2 · A second axis, and the loop that closes itself

**X3 — A deployed Naught has no way to record its first scope**
*Files:* `apps/api/src/collectors/`, `docker-compose.yml`, ARCHITECTURE §8
*Depends on:* nothing outstanding
Found while verifying X1 against `docker compose up`. The run button repeats the
scope of the last run that recorded one, and on a fresh deployment no run has.
`make poc-here` does not help: it runs on the host against `./data`, while the
containers read a volume. The only way to seed a scope today is to exec into the
API container and run the CLI by hand, which is not a thing an operator should
have to know.

ARCHITECTURE §8 already promises the fix — "one config file listing enabled
collectors and their scopes" — and it does not exist. Until it does, a deployed
Naught cannot collect anything without a shell.
**Done when** a fresh `docker compose up` can run a collection from the
interface without anyone entering a container.

**X2 — Manifests for runs written before manifests existed**
*Files:* `apps/api/src/lake/run-manifest.ts`
*Depends on:* nothing outstanding
A run sealed by an earlier build has Parquet files and no `.run.json`. The API
reports its coverage as unknown, which is correct and is also permanent — there
is no way to recover a denominator that was never recorded. Either accept that
those runs read as unknown forever, or write a one-off tool that backfills a
manifest with `expected: null` so the gap is explicit rather than incidental.
Since X1 this has a second face. Manifests written before `CollectionRun.scope`
existed carry `null`, so the run they describe cannot be repeated from the
interface; `POST /runs` refuses and names `make poc-here`. That refusal is
correct and is also permanent for those runs, which is the same shape of problem
one level along. Whatever is decided here should cover both.
**Done when** the intended behaviour for pre-manifest runs is decided and
written down, whichever way it goes.
