# 3. Actions on Naught's own collection

**Status:** accepted
**Date:** 2026-09-26

## Context

`../explanation/ARCHITECTURE.md` §2 states the first design constraint as **read-only
outward**: every credential Naught holds for an external system is read-only,
and write access is a bug rather than a feature.

`docs/explanation/why-a-foundry-shaped-ui.md` then read that constraint one step
wider than it was written:

> Not borrowed: actions. A Workshop application exists to *change* the objects
> it displays. Naught is read-only outward by the rule in ARCHITECTURE §2, so
> the screen has no write path.

Those are two different claims. The constraint is about other people's systems.
The explanation turned it into a claim about Naught's own, and a rule that
forbids an operator from asking Naught to look again is not the rule §2 states.

The cost of leaving it as written is concrete. Collection happens on a schedule
or when someone with shell access types `make poc-here`. An operator who has
just merged a dependency bump, or who has just been told an advisory landed,
can see only what the last scheduled run saw, and has no way to ask for a
current answer from the screen they are already looking at.

## Decision

**An operator may act on Naught's own collection. Naught still writes nothing to
the systems it observes.**

The line is drawn at the boundary of Naught's own process:

- Starting a collection run is allowed. A run issues read requests to external
  systems and changes none of them.
- Writing to an observed system remains forbidden, in every form, including the
  remediation the README rules out.
- The interface gains one control and no more. It starts a run; it does not
  edit an observation, retract a finding, suppress a blind spot, or change what
  a run is pointed at.

Three consequences of that line shape the implementation:

- **The scope is not an input.** A run repeats the scope of the most recent run
  that recorded one. An operator supplies no path, so no path arrives over HTTP,
  and there is nothing to traverse. An axis whose runs never recorded a scope
  refuses and says so.
- **In-flight state does not enter the lake.** `runs/` is immutable and
  append-only (§4). A manifest written as `running` and rewritten as `complete`
  would be an edit inside the one directory that is not allowed to have any. The
  queue holds the run while it is in flight; the lake gains one sealed manifest
  when it succeeds and nothing at all when it fails.
- **The API gains one origin, not a wildcard.** The browser posts from its own
  origin, so the API declares that origin. Read-only outward is a statement
  about the credentials Naught holds, not a reason to accept any caller.

## Consequences

- `POST /runs` and `GET /runs/current` exist alongside the read routes, and the
  API is no longer GET-only.
- `CollectionRun` records the scope it ran with. Manifests sealed before this
  decision carry `null` and cannot be repeated; the refusal names the axis and
  the command that fixes it, rather than guessing a scope.
- Redis moves from provisioned-but-unused to load-bearing. Losing it costs at
  most a run that has to be asked for again — the lake is untouched, which is
  what `docker-compose.yml` already claimed of that volume.
- `docs/explanation/why-a-foundry-shaped-ui.md` is amended to cite this ADR
  rather than to assert that no write path exists.
- This does not reopen remediation. The distinction that permits a collection
  run — that it only reads the systems it touches — is exactly the distinction
  that continues to forbid patching, upgrading and restarting them.
