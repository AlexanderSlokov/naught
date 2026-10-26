# Lake schema, version 2

The column set of `{stem}.evidence.parquet`, the claim vocabulary its rows are
written in, the source grades stamped onto them, and the files a run leaves on
disk. The column types are declared in
[`apps/api/src/lake/schema.ts`](../../apps/api/src/lake/schema.ts); the
vocabulary and grades in
[`packages/shared/src/vocabulary.ts`](../../packages/shared/src/vocabulary.ts)
and [`packages/shared/src/sources.ts`](../../packages/shared/src/sources.ts).
When this page and the code disagree, the code is correct and this page is
out of date.

Decisions: [ADR 0005](adr/0005-parquet-schema-evolution-and-upgrade-stops.md)
(versioning), [ADR 0007](adr/0007-evidence-replaces-observations-and-blind-spots.md)
(the evidence table), [ADR 0008](adr/0008-two-axis-source-grading.md) (grading).

## Files per run

| File | Written | Contents |
|---|---|---|
| `{stem}.evidence.parquet` | at seal, when the run produced at least one row | one row per claim |
| `{stem}.run.json` | at seal, after the evidence file | the run manifest, `schemaVersion: 2` |
| `{stem}.v2.run.json` | by `make migrate-lake`, after verification | the manifest of a rewritten version 1 run |

`{stem}` is `{collector}--{HHMMSS}-{nonce}`, for example `deps-osv--162826-a88bc7`.
Files are under `runs/axis={axis}/date={YYYY-MM-DD}/`.

A version 1 run left `{stem}.obs.parquet`, `{stem}.blind.parquet` and
`{stem}.run.json`. After `make migrate-lake`, those three files remain beside the
rewrite and no reader opens them.

## Evidence columns

| Column | Type | Null | Meaning |
|---|---|---|---|
| `evidenceId` | VARCHAR | no | sha256 of run, subject, container, claim type, observation kind and claim value. Deterministic. |
| `runId` | VARCHAR | no | UUID of the run that saw the claim. Equals the manifest's `runId`. |
| `observedAt` | TIMESTAMP | no | When Naught looked, in UTC. One value per run. |
| `collectorId` | VARCHAR | no | For example `deps.osv`. |
| `axis` | VARCHAR | no | `deps`, `image`, `placement`, `config`, `credentials`. |
| `subject` | VARCHAR | no | What the claim is about. A purl for `package_version`. |
| `subjectKind` | VARCHAR | no | `package_version`, `lockfile_key` or `container`. |
| `objectId` | VARCHAR | yes | The other end, when the claim is an edge. Null on `deps`. |
| `container` | VARCHAR | yes | Where the subject was found. On `deps`, the lockfile path. Null when the subject *is* the lockfile. |
| `claimType` | VARCHAR | no | The question the claim answers. See [Claim types](#claim-types). |
| `claimValue` | JSON | no | The content. `{"declared": "4.17.20"}`, `{"vuln": "GHSA-35jh-r3h4-6jhm"}`, or `{}`. |
| `observationKind` | VARCHAR | no | `observed`, `absent_in_scope` or `not_assessable`. |
| `notAssessableReason` | VARCHAR | yes | Set exactly when `observationKind` is `not_assessable`. See [Reasons](#not-assessable-reasons). |
| `note` | VARCHAR | yes | Free text from the collector, such as `OSV responded 503`. |
| `sourceId` | VARCHAR | no | The source Naught asked. See [Sources](#sources). |
| `originSourceId` | VARCHAR | no | The most original source behind `sourceId`. For an OSV advisory, the database its id belongs to. |
| `reliability` | VARCHAR | no | A–F, for `(sourceId, claimType)`, stamped at write time. |
| `credibility` | TINYINT | no | 1–6, by rule `credibility-v0`, stamped at write time. |
| `gradingVersion` | VARCHAR | no | The grading the two grades came from. Currently `grading-v0`. |
| `sourceAssertedAt` | TIMESTAMP | yes | When the source made the claim. OSV's `modified` for an advisory. Null in rows rewritten from version 1. |
| `validFrom` | TIMESTAMP | yes | When the claim became true in the world. Null on `deps`. |
| `validTo` | TIMESTAMP | yes | When it stopped being true. Null on `deps`. |
| `staleAfter` | TIMESTAMP | no | `observedAt` plus the TTL of the claim type. |
| `derivedFrom` | VARCHAR[] | no | `evidenceId`s this row was derived from. Empty for direct claims. |
| `extractorVersion` | VARCHAR | no | The collector build that wrote the row. `migrate-v1` for rewritten rows. |
| `modelVersion` | VARCHAR | yes | The model that produced a score, such as an EPSS model. Null on `deps`. |
| `sensitivity` | VARCHAR | yes | A label that derived rows inherit. Unused on `deps`. |
| `supersedes` | VARCHAR | yes | An `evidenceId` this row withdraws. Unused on `deps`. |

## Claim types

| Claim type | Source on `deps` | Question | `claimValue` |
|---|---|---|---|
| `contains` | `pnpm-lock` | Does the lockfile pin this subject? | `{"declared": version}` when observed |
| `advisory` | `osv` | Does the source list an advisory against this subject? | `{"vuln": id}` when observed, `{}` otherwise |

What one `deps.osv` run writes for each lockfile entry:

| Entry | Rows |
|---|---|
| Pinned, OSV lists *n* advisories | 1 `contains`/`observed`, *n* `advisory`/`observed` |
| Pinned, OSV lists none | 1 `contains`/`observed`, 1 `advisory`/`absent_in_scope` |
| Pinned, OSV did not answer | 1 `contains`/`observed`, 1 `advisory`/`not_assessable` (`unreachable-upstream`) |
| Key is not `name@version` | 1 `contains`/`not_assessable` (`unparseable`), `subjectKind: lockfile_key` |
| Lockfile cannot be read | 1 `contains`/`not_assessable` (`unparseable`), `subjectKind: container`, `container: null` |

For `fixtures/rotten-lock.yaml` (8 keys, 7 pinned, 12 advisories across 6
packages, 1 clean, 1 unparseable key) a run writes 21 rows: 8 `contains`, 12
`advisory`/`observed`, 1 `advisory`/`absent_in_scope`.

## Not-assessable reasons

`unsupported-ecosystem`, `unparseable`, `unreachable-upstream`, `rate-limited`,
`access-denied`, `opaque-layer`, `vendored-binary`, `other`. These are the
version 1 blind spot reasons, unchanged.

## Sources

| `sourceId` | Name | Aggregator | Upstreams |
|---|---|---|---|
| `osv` | OSV.dev | yes | `ghsa`, `ossf-malicious-packages`, `nvd` |
| `pnpm-lock` | pnpm lockfile | no | — |
| `ghsa` | GitHub Advisory Database | no | — |
| `ossf-malicious-packages` | OpenSSF Malicious Packages | no | — |
| `nvd` | NVD | no | — |

`originSourceId` for an OSV advisory is taken from the id prefix: `GHSA-` →
`ghsa`, `MAL-` → `ossf-malicious-packages`, `CVE-` → `nvd`. Any other prefix
keeps `osv`.

## Grades, `grading-v0`

**Reliability** by `(sourceId, claimType)`. An ungraded pair is `F`.

| Source | Claim type | Reliability | Rationale |
|---|---|---|---|
| `osv` | `advisory` | A | For "OSV lists this advisory", OSV is the authority on its own index. |
| `pnpm-lock` | `contains` | A | The lockfile is the declaration itself; it cannot misreport what it pins. |

**Credibility**, rule `credibility-v0`, by observation kind:

| Observation kind | Credibility | Admiralty meaning |
|---|---|---|
| `observed` | 2 | probably true |
| `absent_in_scope` | 3 | possibly true |
| `not_assessable` | 6 | cannot be judged |

Credibility 1 (confirmed) is never stored. The assessment layer reports it as
`bestCredibility: 1` when two or more rows with the same claim value have
different `originSourceId` values.

STIX 2.1 `confidence` on export: 1→90, 2→70, 3→50, 4→30, 5→10, 6→no field.

## Time to stale

| Claim type | TTL |
|---|---|
| `contains` | 24 hours |
| `advisory` | 24 hours |

## Derived views

Defined in [`apps/api/src/lake/evidence-views.ts`](../../apps/api/src/lake/evidence-views.ts).
Every query in the API starts from one of these.

| View | Rows |
|---|---|
| `evidence` | every row |
| `evidence_seen` | `observed` and `absent_in_scope` |
| `evidence_unseen` | `not_assessable` |
| `runs` | one per `runId`, with its `observedAt` |
| `latest_run`, `previous_run` | the newest and second-newest run |
| `subject_drift` | one per run and answered subject: `declared`, `observed` (`clean` or the sorted ids), `drift`, `advisories` |

## Assessment states, `assess-v0`

Returned by `GET /axes/:axis/assessments`, one per subject in the latest run.
Each names the evidence ids it rests on (`supportingIds`, `conflictingIds`) and
every source asked about the factor (`sources`). States are evaluated in this
order:

| State | Condition |
|---|---|
| `conflicting` | at least one `advisory`/`observed` row and one `advisory`/`absent_in_scope` row |
| `not_assessable` | no seen `advisory` row, and at least one `not_assessable` row |
| `missing` | no `advisory` row at all |
| `stale` | seen, and the earliest `staleAfter` of the seen rows is before the request time |
| `established` | otherwise |
