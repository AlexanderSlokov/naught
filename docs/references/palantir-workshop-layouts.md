# Foundry Workshop: how an application is composed on screen

> **Source.** Condensed from
> [Workshop · Core concepts · Layouts](https://www.palantir.com/docs/foundry/workshop/concepts-layouts),
> retrieved 2026-09-24. A summary of the structural vocabulary only.

## The pieces

**Header** — a persistent toolbar at the top of a module (or down its left side
when vertical), holding module-wide title, tabs and buttons. It survives every
page change; nothing else does.

**Page** — one screen canvas within a module, with its own widget arrangement.
Pages are selected from the header.

**Section** — a subdivision of a page that organizes and contains widgets.
Sections nest.

**Widget** — one interactive component. The leaf.

**Overlay** — a layer above the page: a drawer that slides from the side, or a
modal at the centre. Used for content that is only conditionally relevant.

## Section layouts

A section arranges its children as one of: **Columns** (vertical splits),
**Rows** (horizontal splits), **Tabs**, **Flow** (a scrolling container),
**Toolbar** (compact widgets), or **Loop** (a repeated embedded module).

## The resulting hierarchy

```
Module Header            persistent
└── Page                 selected from the header
    └── Section          columns / rows / tabs / flow / toolbar / loop
        └── Widget
```

Multi-screen applications stay navigable because the header is the one fixed
point.
