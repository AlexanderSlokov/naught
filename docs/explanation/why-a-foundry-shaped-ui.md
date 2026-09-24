# Why the UI is an object explorer and not a dashboard

Naught's screen is laid out the way a Foundry Workshop application is laid out:
a persistent header, an axis rail, an object table, a detail panel. That is a
deliberate choice against the obvious alternative, which would have been a
dashboard of counters.

## The operator's question is a selection, not an aggregate

A dashboard answers "how many". The questions in [ARCHITECTURE](../../ARCHITECTURE.md)
§9 are not of that kind:

- *What is this project made of?* — a list of objects.
- *Which of those has a known problem right now?* — a filter over that list.
- *What changed since the previous run?* — a diff between two versions of it.
- *What could it not see, and why?* — a second list, of a different type.

Every one of those resolves to "show me these things, and let me pick one".
A counter that reads **6 findings** is the answer to none of them. The number is
where the operator starts, not where they stop, and a layout that has nowhere to
go after the number is a layout that ends the investigation at its first step.

## The data is already object-shaped

An observation is a `subject` (a purl) seen in a `container` (a project) on an
`axis` at an `observedAt`. That is an object type with properties and a
timestamp, which is the shape Palantir's Ontology is built around: typed objects,
their properties, and the links between them. The table-plus-panel arrangement is
what that shape looks like on a screen. Inventing a different one would mean
flattening the data on the way out and losing the identity of the thing being
looked at.

## What is borrowed and what is not

Borrowed: the Page → Section → Widget tiering, the persistent header, the density
budget, the F-shaped scan, and the intent palette — recorded in
[`docs/references/palantir-*.md`](../references/).

Not borrowed: actions. A Workshop application exists to *change* the objects it
displays. Naught is read-only outward by the rule in ARCHITECTURE §2, so the
screen has no write path, and the Action vocabulary of Workshop has no analogue
here. The resemblance stops at the point where Foundry starts editing.

## The one rule the shape must not break

Coverage travels with every verdict (§7). A dashboard makes this easy to lose —
a big number reads as complete whether or not it is. In the object explorer the
coverage figure is rendered by exactly one component, sits in the header beside
the run it belongs to, and reads `unknown` rather than `100%` when the collector
could not know its own denominator.
