## Documentation flow

A change moves through them in order; skipping a stage loses the reason the work exists:

1. `ROADMAP.md`: A new capability appears here first, attached to a phase
   and a target version. Nothing enters the backlog without a roadmap item to descend from,
   except corrections to artifacts that already exist (a wrong figure, a stale path).

2. `BACKLOG.md`: Roadmap items decompose into tasks here. Each task
   names the files it touches, its dependencies on other tasks, and an explicit
   "done when" condition. Group tasks by the artifact they modify. Link the GitHub
   issue when one exists — the issue holds the discussion, the backlog item holds the
   plan of record.
3. `CHANGELOG.md`: When a backlog task is complete, remove it from
   BACKLOG.md and describe the result under `[Unreleased]`, following Keep a Changelog.
   They will be release notes verbatim, so write them for an operator: state what changed and why it mattered.

## Documentation layout

`docs/` follows [Diátaxis](https://diataxis.fr/). Put a document where its *purpose*
belongs

- `docs/tutorials/` — learning-oriented. A beginner following steps to a first result.
- `docs/how-to/` — task-oriented. A competent user achieving one specific goal.
- `docs/references/` — information-oriented. Facts to look up: schemas, measured
  numbers, the paper, session records. Descriptive and accurate, never instructive.
- `docs/explanation/` — understanding-oriented. Why the design is the way it is.
- UI work follows the captured Palantir/Foundry material in `docs/references/palantir-*.md`.

## Constraints

- Use the POV of a technical writer writing documents for k8s to write `*.md` artifacts,
  like CHANGELOG, ROADMAP,.etc. Focus on clarity, accuracy explanations.

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `<project-specific>`.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.

## Structure

- Follow the framework's convention (Rails, Django, Next.js, etc.).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.

## Formatting

- Use the language default formatter (`cargo fmt`, `gofmt`, `prettier`,
  `black`, `rubocop -A`). Don't discuss style beyond that.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.