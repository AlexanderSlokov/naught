# How Palantir turns many messy data sources into decisions, and what Naught should learn from it

The core of Palantir is a data discipline made up of five parts:

(1) raw data is ingested and kept version by version, never overwritten;
(2) the data is mapped onto a shared model of "real-world objects" called the Ontology;
(3) every value can be traced back to its source and to the transformation step that produced it (lineage);
(4) the freshness and correctness of each source is monitored openly (Data Health);
(5) every human decision is recorded as its own transaction, with history.

For Naught, the thing most worth learning is: **keep every claim from every source as immutable, source-attributed evidence, then derive assessments and conclusions as layers that can be recomputed**.

## TL;DR

Palantir treats data as versioned raw datasets (transactions in a "Git for data" style) → mapped onto the Ontology (dataset ≈ object type, each data row/record ≈ object, join ≈ link type) → lineage and security labels (markings) travel with the data through every transformation step → data health checks (freshness, schema) → humans make decisions through "Actions", and every Action is written to a immutable log. When two sources talk about the same entity, Gotham merges them but **keeps the history of each original record separate so they can be split apart again (unresolve)**, and a single property can carry multiple values, from multiple sources.

**Palantir does not publicly document any Admiralty/ICD 203-style reliability grading inside its products.** That is general intelligence tradecraft (NATO AJP-2.1, ICD 203/206). If Naught wants this part, it should take it directly from the open standards (Admiralty A–F/1–6, the STIX 2.1 0–100 confidence scale).

**Applied to Naught:** add an append-only `evidence` table as the center of the system. Each row is one claim about one subject (purl/digest) and carries: the source, the reliability of the source (A–F), the credibility of the information (1–6), the observation kind (seen / absent from a source whose coverage includes the subject / not assessable), two timestamps (when it was true in reality and when Naught access it), an expiry, a run_id, and a provenance chain. The `assessment` layer keeps contradictions. The `conclusion` layer is only produced when the conditions of the SSVC decision tree are met; otherwise it is "not ranked", with a list of the missing evidence. Reuse OSV, OpenVEX, SSVC/Vulnrichment, KEV, EPSS, Scorecard, GUAC, OpenLineage, in-toto/SLSA; don't invent your own.

## Key Findings

1. **The Ontology is a semantic layer sitting on top of datasets.**

The Foundry documentation defines the Ontology as the organization's "digital twin", mapping datasets and models into object types, properties, link types and action types.\[1\] The data types were designed "inspired by RDF, OWL and XSD".\[2\] This is documented fact.

1. **The two products handle multiple sources differently.** Gotham allows one property to have multiple sources: to overwrite it, the client must set `applyToAllSources`, otherwise it gets the error `UnclearMultiSourcePropertyUpdateRequest`.\[3\] Foundry, in multi-datasource object types (MDOs), only supports column-wise combination and does **not** support multiple sources supplying data for the same property ("property multiplicity is not supported"), so contradictions must be resolved in the pipeline before reaching the Ontology.\[4\] This is documented fact; the framing of "two philosophies" is my inference.
2. **Entity resolution must be reversible.** The arXiv paper 2304.14975 "Concept-Centric Software Development" (Peter Wilczynski of Palantir, Taylor Gregoire-Wright of Ontologize and Daniel Jackson of MIT) writes: "When rebuilding Palantir's entity resolution system in the mid-2010s, a critical requirement was solving not only the problem of resolution but also of unresolution." According to Appendix A.0.2 of the paper, in the old design "the provenance of individual properties within an object container was lost", so "it was hard to perform unresolution completely reversibly". The fix was two concepts, "Atom" and "Bag", in which "properties retain their connection to the Atoms from which they came". The current Gotham API states explicitly: when resolving, "the independent history of the objects is preserved" so they can be unresolved.\[5\]
3. **Git-style data versioning is the foundation.** Each dataset transaction is "analogous to a commit in Git". There are SNAPSHOT (replace everything) and APPEND (add only) types.\[6\] Branching combines code branches with data branches.\[7\] Data Connection provides "full lineage of data versions across time", i.e. you know which sync produced which version.\[8\]
4. **Freshness is measured in three different ways, and separating these three is very much worth learning.** One is "time since last updated" (when the dataset was last updated, even if that update brought no new data). Two is "data freshness" (how recent the data inside is, comparing the max timestamp column with the last transaction). Three is "sync freshness" (the gap between the most recent sync and the newest timestamp from the source).\[9\]
5. **Security travels with lineage.** A marking is a mandatory control and "propagates along data lineage".\[10\] At the property level, users who don't pass the policy see a null value.\[11\] Naught doesn't need multi-tier permissions, but the principle "labels follow derived data" is still usable for flagging sensitive data (e.g. credential information).
6. **Recording human decisions is a separate layer.** An Action is "a single transaction" that changes objects.\[12\] You can enable an action log and Edit History, described as an "immutable audit trail" that end users cannot delete or modify.\[13\]\[14\] For Naught (read-only), the equivalent is: an operator's judgement (e.g. a VEX "not_affected") is stored as evidence in Naught's own store, and is never written into the system being observed.
7. **Open software supply chain standards already provide almost every piece Naught needs.** GUAC already has an "evidence tree" model with the fields `justification`, `origin`, `collector`, `knownSince`, `documentRef`.\[15\] OpenVEX has 4 statuses and 5 justifications.\[16\] CISA SSVC has 5 decision points leading to Track/Track*/Attend/Act. STIX 2.1 has a standard mapping table from Admiralty to the 0–100 confidence scale.\[17\]\[18\]\[19\]

## Details

### Question 1 — Palantir's Ontology: objects, properties, links, actions; time; the decision surface

**Documented:**
- The Foundry Ontology consists of object types, properties, link types, action types, interfaces and shared properties. The official correspondence table is: Dataset ↔ Object type, Row ↔ Object, Join ↔ Link type.\[1\]\[20\] The Ontology "sits on top of digital assets" (datasets, models) and connects them to their "real-world counterparts", from factories and equipment to orders.\[21\]
- A link type has two sides. The cardinality can be 1–1, 1–many or many–many. Many–many links are "backed" by a separate datasource. You can define several different link types between the same two object types, each one a distinct real-world relationship.\[22\]\[23\]
- Interfaces allow polymorphism: many object types sharing the same "shape".\[2\] This maps directly onto Naught's "container" idea (repo, image, build, service, runner all "contain" nodes).
- An action type defines how to change objects: parameters, rules (create/modify/delete objects, create/delete links), permission checks, side effects. The edited data is stored in a "writeback dataset".\[12\]\[24\] Actions can also create a "historical action log for analysis of user decisions".\[21\]
- **Time and change history:** (a) the dataset tier has transactions and versions, so data can be "time-traveled"; (b) the object tier has "Track user edit history". This history **only records user edits**, not changes made by pipelines, and turning the feature off permanently deletes the history;\[13\]\[25\] (c) a "time series property" stores the sequence of values of a property over time; (d) events are modeled as object types with start/end time properties.\[26\] The document "How user edits are applied" describes comparing the timestamp of the source row against the time of the user's edit to decide the final value.\[27\] In other words, there are explicit rules for when the source and the user "argue".
- Gotham, the earlier product, grew out of the idea of a "dynamic ontology". A patent Palantir filed in 2006 (US 7,962,495) describes storing the ontology together with parsers that transform incoming data to fit the property types.\[28\] I got this information through a secondary source. Section 6.1.1 of arXiv paper 2304.14975 writes "our ontology system was designed as a skeuomorphic parallel to the classic 'detective's pinboard'", and the caption of Figure 3 says "Almost every one of Palantir's early customers had one of these pinboards hanging in their meeting rooms."

**Inference for Naught:** Palantir's "decision surface" is really the Ontology plus Actions, i.e. the place where users *see* objects and *do* something with them. Naught deliberately drops the "do" half. So Naught's decision surface must put all its effort into the "see" half: showing which evidence stands behind each conclusion, and what is still missing.

### Question 2 — Multi-source integration and entity resolution

**Documented (Gotham):**
- Object resolution is "the act of merging two or more objects", for example from two source systems describing the same entity. When merged, "the independent history is preserved" and updates to each child object are kept, in case it has to be unresolved because of a wrong merge. The metadata includes `canonicalObjectPrimaryKey`, `winnerObjectPrimaryKey` (new writes made after the merge are attached here so that splitting still divides cleanly) and `otherObjectPrimaryKeys`.\[5\]
- A property can have multiple sources. The "Update object property" API says: "By default, writes to property values from multiple sources will fail", and the client must set `applyToAllSources` to be able to write.\[3\] Search responses return `properties` as an *array of values* for each property type.\[29\] Adding a property value requires attaching security, e.g. `portionMarkings`.\[30\]
- Gotham has "federated sources": querying third-party systems in place, and federated objects cannot be edited.\[31\]
- The article "Data integration and analysis platforms as digital platforms: a conceptual proposal" (Information, Communication & Society, DOI 10.1080/1369118X.2024.2442394) writes that "according to Palantir, every property and relationship can be traced back to the document sources at any time", citing Palantir material (n.d.-b, p. 10). I took this sentence from a search result snippet and have not opened the full text of the article.

**Documented (Foundry):** MDOs only combine column-wise, and multiple sources supplying the same property is not supported.\[4\]

**Not found in public documentation:** a "data source"-type field attached to each property value in Gotham responses (the sub-fields of `Property` are collapsed on the documentation page), and rules for ranking or resolving contradictions between sources. I found no documentation showing that Palantir automatically "picks a winning source". The documented mechanism is *keep multiple values and force the writer to state their intent explicitly*.

**Lesson for Naught (inference):** a contradiction is data, not an error. Keep every value with its source, flag where contradictions exist, and resolve them only in the derived layer using versioned rules. Make sure a "merge" can always be split again: Naught's identifiers (purl, digest) are mostly deterministic, but merges such as CVE↔GHSA aliases or tag↔digest must still be source-attributed evidence, not hard-coded facts.

### Question 3 — Provenance, lineage, versioning, auditing

**Documented:**
- Dataset transactions are "the basis for data versioning, sometimes called 'Git for data'".\[6\] On each branch, transactions are ordered by start time and commit. A code commit in a Code Repository publishes a JobSpec to the corresponding branch of the build system, i.e. code branches are tied to data branches.\[7\]
- The Data Lineage application displays the upstream/downstream dependency graph, can color datasets by health check status, and has a "simulation mode" to test how far a marking would propagate.\[10\]\[32\]
- Global Branching extends branching to the Ontology, Actions, Workshop, functions, etc.\[33\]
- Palantir's privacy governance document (2024) says the platform can "preserve an audit trail of all actions taken by users". This is a marketing/policy document, not a technical specification.\[34\]

**Auditing backwards from a conclusion:** the documented procedure is to go from object → datasource → lineage → transaction → the sync/job that produced it. I found no documentation of an automatic "explain this conclusion" feature in the style of an evidence tree. Naught has to build that part itself (see the Application section).

**Connection to Naught:** Naught's append-only Parquet lake is already equivalent to "APPEND transactions + keep forever". What's missing is a complete **run** record (like a Run in OpenLineage or a sync in Data Connection) and an **explicit link from each derived row back to the input evidence rows**.

### Question 4 — Data quality, freshness, coverage; "unknown" is different from "negative"

**Documented:**
- Data Health has groups of checks: status (job/build/schedule), time (freshness), size, content, schema. Severity is Moderate or Critical. Alerts are sent via notifications, email, PagerDuty, Slack.\[32\]\[35\]\[36\]
- The three kinds of freshness as described above (time since last updated / data freshness / sync freshness). The documentation recommends using a timestamp column that reflects *when the row was added in the source system*.\[9\]
- The guidance recommends placing checks on **inputs**: "Input staleness or schema breaks happen". Combining the three kinds of check helps distinguish (a) the dataset not updating on schedule, (b) the dataset updating but the source providing no new data, (c) the data being new but the sync not having run yet.\[37\]
- "Monitoring views" monitor by scope: resources newly added to the scope are automatically monitored.\[38\]
- Lineage can display health status. That is, quality is attached onto the provenance graph itself.\[32\]

**"Unknown" is different from "negative":** I found no Palantir documentation defining three-state semantics for property values. The only thing documented is at the display layer: a permission-blocked property shows up as null, and a 1–1 link can be "undefined" if there is no linked object.\[11\]\[23\] Meanwhile, the open security standards separate these very clearly: OpenSSF Scorecard uses -1 for "inconclusive, not failing"; STIX states that a missing confidence field means "unspecified"; GUAC has a whole guide on querying "What is Known and Unknown".\[39\]\[40\]\[41\]\[42\]\[43\] **Conclusion: on this point Naught should take its model from the open standards, not from Palantir.**

### Question 5 — Reliability grading in intelligence (Gotham and its customers)

**General intelligence tradecraft, NOT a Palantir feature:**
- **Admiralty/NATO (STANAG 2511, AJP-2.1):** source reliability A–F (A: completely reliable … E: unreliable, F: "cannot be judged") and information credibility 1–6 (1: confirmed by other sources, 2: probably true, 3: possibly true, 4: doubtful, 5: improbable, 6: "cannot be judged"). The two axes are graded **independently** so that the reliability of the source does not skew the assessment of the information. F and 6 mean "no basis for evaluation", not "low reliability".\[44\]\[45\]\[46\]
- **ICD 203 (Analytic Standards):** uncertainty must be stated and explained along two separate axes: *likelihood* (on a scale from "remote" to "nearly certain") and *confidence* (high/moderate/low) in the basis of the judgement. Analytic products **must not** combine a confidence level and a likelihood level in the same sentence.\[47\]\[48\]
- **ICD 206 (Sourcing):** whenever an analysis relies on a source there must be a Source Reference Citation, and the citation should point to the "most original source". Source descriptors for intelligence sources must be taken from the original document. For publicly available information, the analyst may write their own descriptor.\[49\]\[50\] ICS 206-01 (2024) requires stating explicitly when a public/commercial data provider is *not* the original source: who created the original data, where it is hosted, what enrichment or changes have been made.\[51\]
- **STIX 2.1:** the `confidence` field is an integer 0–100. The standard appendix maps Admiralty credibility: 1→90, 2→70, 3→50, 4→30, 5→10, and 6→no field. A missing confidence field means "unspecified".\[17\]\[18\]\[19\]\[39\]\[40\]\[43\]

**Palantir-specific:** public documentation shows that Gotham has security/markings at the property and link level (`portionMarkings`), has multi-source properties, and has a "Target Workbench" with "Intel" attached to targets.\[30\]\[52\] I did **not** find any public documentation showing that Gotham has a standard field like "source reliability A–F" or "confidence" on properties. If intelligence customers use Admiralty in Gotham, the most plausible way (inference) is that they model it as properties or objects they define themselves in the dynamic ontology, not as a built-in feature. The Gotham whitepaper says it can export "intelligence products with provenance", but that is marketing language and does not describe the structure.\[53\]\[54\]

### Question 6 — Security and access control coexisting with lineage

**Documented:**
- There are two kinds of controls. Mandatory controls (markings, CBAC, organizations) "follow each unit of data through derivation steps, thanks to provenance and lineage capabilities". Discretionary controls (roles, projects) are granted on each resource.\[55\]
- Markings are conjunctive: a user must have *all* the markings. CBAC is used for government classification. Markings can be applied to datasets, transactions, files, columns.\[56\]\[57\]
- Object security policies give row-level permissions, property security policies give column-level permissions, and combined they give cell-level permissions. Anyone who doesn't pass the property policy sees null. A mandatory control property is a column containing the marking for each row.\[11\]\[58\]\[59\]

**Meaning for Naught:** Naught is a read-only tool for a single operator, so it doesn't need this permission model. Two ideas are still worth keeping: (1) a `sensitivity` column on evidence (e.g. credential/secret metadata) **propagates** to the assessments and conclusions derived from it; (2) a masked value must be different from a value that doesn't exist. This is the same unknown/negative problem as in question 4.

### Question 7 — Palantir's open source

**Documented:** The GitHub page github.com/palantir says "Palantir Technologies has 268 repositories available." Notable projects include Blueprint (a React UI toolkit; the repo page github.com/palantir/blueprint currently shows 22.2k stars and 2.4k forks), Conjure (define APIs in YAML and then generate clients/servers for Java, TypeScript, Go…), AtlasDB (a distributed transactional database layer, once the backend for their products, the repo is now **archived**), Tritium (instrumentation), and platform SDKs such as `foundry-platform-python`.

**Assessment:** none of Palantir's OSS projects implements the Ontology, lineage or entity resolution. For Naught (Go/Python, DuckDB), the reuse value is low. Conjure could be a reference if you need strictly typed API definitions, but JSON Schema or protobuf is enough. **The two documents with real design value** are the arXiv paper "Concept-centric Software Development" (lessons about resolution/unresolution and losing provenance) and the Gotham API pages about resolution and multi-source properties.

### Question 8 — Equivalent open standards and tools: what each one gives Naught

| Standard/tool | Main content (verified) | Where Naught uses it |
|---|---|---|
| **GUAC** | Ontology consisting of Package/Source/Artifact/Builder nodes and an "evidence tree" (IsDependency, HasSourceAt, CertifyBad/Good, CertifyVEXStatement, HashEqual…). Each piece of evidence has `justification`, `origin` (original document), `collector`, `knownSince`, `documentRef`\[15\]\[60\] | Direct template for the `evidence` table and the `claim_type` catalog. Can export to GUAC for compatibility |
| **OSV schema** | `id`, `modified`, `published`, `withdrawn`, `aliases`, `upstream`, `affected[].ranges[].events` (introduced/fixed/last_affected), `database_specific`\[61\]\[62\]\[63\] | Source of "known advisory present/absent" claims. `modified` is "source_asserted_at". `withdrawn` must generate retraction evidence. `aliases`/`upstream` for checking independence between sources |
| **OpenVEX** | 4 statuses `not_affected`, `affected`, `fixed`, `under_investigation`. `not_affected` requires a `justification` (5 values: component_not_present, vulnerable_code_not_present, vulnerable_code_not_in_execute_path, vulnerable_code_cannot_be_controlled_by_adversary, inline_mitigations_already_exist) or an `impact_statement`\[16\]\[64\] | Standard format for "not affected" judgements, both from vendors and from the operator |
| **CSAF 2.0 / CycloneDX / SPDX 3** | All carry VEX: CSAF via `product_status`, CycloneDX via `analysis.state`, SPDX 3 via `VexNotAffectedVulnAssessmentRelationship`\[65\] | Additional readers for vendor VEX. SBOMs (SPDX/CycloneDX) are the source of "contains component" claims for images/artifacts |
| **CISA SSVC** | The decision tree CISA uses, with 5 decision points (Exploitation, Technical Impact, Automatable, Mission Prevalence, Public Well-being Impact) to output Track / Track* / Attend / Act. CISA's Vulnrichment program publishes SSVC decision points into CVE records\[66\]\[67\]\[68\] | Replace a home-made "priority score" with a named decision tree. Whichever decision point is missing is exactly the "missing evidence" |
| **CISA KEV** | Fields `cveID`, `dateAdded`, `dueDate`, `knownRansomwareCampaignUse` ("Known"/"Unknown"), `requiredAction`…\[69\]\[70\] | Strong evidence for Exploitation = active. Note: a CVE being absent from KEV does **not** prove it hasn't been exploited |
| **FIRST EPSS** | The API returns `cve`, `epss` (probability 0–1), `percentile`, `date`. The model version is in the comment line at the top of the daily CSV file; the API has no dedicated field for the model version\[71\]\[72\] | A dated likelihood signal. Must store `model_version`, because scores between v3/v4/v5 are not directly comparable |
| **OpenSSF Scorecard** | Each check 0–10. -1 = "inconclusive, not failing". A -1 score is not counted in the aggregate score\[41\]\[73\]\[74\] | Evidence about upstream project health. A semantic template for "inconclusive ≠ bad" |
| **deps.dev** | API v3 (stable) for package information, versions, dependencies, links to source repos. Supports npm, PyPI, Go, Maven, Cargo, NuGet, RubyGems\[75\]\[76\] | A second cross-check source for the dependency graph and HasSourceAt |
| **in-toto / SLSA provenance** | A Statement consists of `subject` (name + digest), `predicateType`, `predicate`. SLSA v1 has `buildDefinition` and `runDetails` (builder.id…) | Evidence that "artifact X was built from source Y by builder Z", i.e. a signed built_from edge |
| **W3C PROV** | Entity / Activity / Agent and the relations `wasGeneratedBy`, `used`, `wasDerivedFrom`, `wasAttributedTo` | Vocabulary for the provenance columns: evidence (Entity) ← run (Activity) ← Fenrir collector (Agent) |
| **OpenLineage** | Job / Run (ID is a UUID) / Dataset together with extensible "facets" (schema, dataQualityMetrics/Assertions, parent run…). Re-emitting a facet with the same name completely replaces the old facet\[77\]\[78\]\[79\] | Model for the `runs` table. Fenrir could emit OpenLineage events so external lineage tools can read them |
| **STIX 2.1 / TAXII** | `confidence` 0–100, standard mapping from Admiralty credibility. Missing field = unspecified\[17\]\[19\]\[39\]\[43\] | Export format. Use the standard mapping table instead of inventing one |

Note: the descriptions of CSAF, in-toto/SLSA and W3C PROV above are based on general knowledge of these standards. During this round of research I did not re-open their original specifications, so field names need to be cross-checked before implementation.

## Application to Naught

### Design principles (drawn from Palantir and the standards)

1. **Three layers, only the first one is "truth":** `evidence` (immutable, kept forever) → `assessment` (derived, deletable, recomputable) → `conclusion` (derived, can be withheld from publication). This matches how Palantir separates versioned datasets from the Ontology. Derived layers must record a `rule_version` so they can be recomputed exactly as before.
2. **Don't mix the two reliability axes.** Store `reliability` (A–F, a property of *source × claim type*) and `credibility` (1–6, a property of *the specific claim*) as two separate columns, exactly as Admiralty requires independent grading.\[45\] Don't collapse them into a single score. When exporting externally, map credibility to STIX `confidence` using the standard table.
3. **Source reliability depends on the claim type.** OSV deserves grade A for the claim "there is/isn't a published advisory for this purl". But the same source should only be at a lower grade for the claim "the fix version is X" in some ecosystems. So store a `source_grading` table keyed by `(source_id, claim_type)`, versioned and with a rationale, instead of one fixed letter per source. This is an inference, consistent with the spirit of ICD 206's "source descriptor".
4. **Credibility is computed by rules, and independence must be checked.** Credibility = 1 ("confirmed") only when at least two **independent** sources say the same thing. OSV re-aggregates from GHSA and other sources, so OSV and GHSA saying the same thing is *not* two independent confirmations. Use OSV's `aliases`/`upstream` and an `origin_source_id` column (the most original source, per ICD 206 / ICS 206-01) to detect this.
5. **The wording of a claim must be precise.** "OSV has no known advisory for pkg:npm/x@1.2.3 as of time T" is a grade-A claim about *the absence of a published advisory*, **not** a claim that "this package has no vulnerabilities". The UI must say exactly that.

### Entity / container / edge model

- **Entities (nodes):** `package_version` (full purl, with version), `artifact` (OCI/sha256 digest), `source_repo` (normalized URL + commit), `vulnerability` (primary ID, e.g. GHSA/CVE/OSV), `certificate` (fingerprint), `credential` (an ID containing no secret), `image_tag` (registry/repo:tag; a tag is a *movable pointer*, not a stable entity).
- **Containers (like Palantir's interfaces):** `repository`, `build`, `service`/workload, `runner`, `cluster/namespace`. Each container has a `container_kind` and an identifying key. The "contains" relationship is an **evidence-backed edge**, not a fixed foreign key.
- **Edges (also evidence):** `contains` (artifact→package_version, source SBOM/lockfile), `depends_on` (package→package, source lockfile/deps.dev), `built_from` (artifact→source commit, source in-toto/SLSA or CI log), `built_by` (build→runner, source GitLab API), `resolves_to` (image_tag→digest at time T), `runs_as` (workload→artifact, source Kubernetes API), `alias_of` (vuln↔vuln, source OSV aliases), `affects` (vuln→package_version, source OSV), `has_source_at` (package→repo, source deps.dev/registry). Each edge carries all the evidence columns (source, grade, time).
- **The "unresolve" lesson:** every non-deterministic identity merge (alias, tag→digest, package→repo) is evidence that can be superseded. Never overwrite the original identifier.

### Proposed schema (append-only Parquet + DuckDB)

Suggested Hive partitioning: `table=<name>/axis=<axis>/date=<YYYY-MM-DD>/part-*.parquet`. Derived tables live in a deletable cache.

**1. `runs`** (immutable, one row per Fenrir run; modeled on OpenLineage's Run)

| Column | Type | Meaning |
|---|---|---|
| run_id | UUID | Key of the run |
| collector | VARCHAR | Name of the Fenrir agent (e.g. `fenrir-osv`) |
| collector_version | VARCHAR | Code/image version (digest) |
| source_id | VARCHAR | The source that was queried |
| scope | JSON | The *intended* scope (e.g. list of purls, namespaces, projects) |
| scope_completed | JSON | The scope *actually* completed |
| started_at / finished_at | TIMESTAMP | |
| status | ENUM | success / partial / failed |
| error_summary | VARCHAR | |
| parent_run_id | UUID | Batch or DAG runs |

The difference between `scope` and `scope_completed` is precisely the "coverage" information in structured form. It is better than a vague % number.

**2. `sources`** and **`source_grading`** (immutable, versioned)

`sources(source_id, name, kind, base_url, original_or_aggregator, upstream_source_ids[], notes)`
`source_grading(source_id, claim_type, reliability CHAR(1) A–F, rationale, effective_from, grading_version)`

**3. `raw_documents`** (immutable; raw copies stored on Garage/S3)

`doc_id (sha256 of content), run_id, source_id, uri, fetched_at, http_status, etag, content_type, blob_path`

**4. `evidence`** (the central table, immutable)

| Column | Type | Meaning |
|---|---|---|
| evidence_id | VARCHAR | Deterministic hash of (run_id, subject, claim_type, claim_value, doc_id) |
| run_id | UUID | The run that produced the evidence |
| doc_id | VARCHAR | The original raw document (like GUAC's `origin`/`documentRef`) |
| subject_id | VARCHAR | Versioned purl, digest, cert ID… |
| subject_kind | ENUM | package_version / artifact / image_tag / cert / credential / container / edge |
| object_id | VARCHAR NULL | The other end if the claim is an edge |
| axis | ENUM | dependency_rot / base_image / placement / config / credential |
| claim_type | VARCHAR | Controlled catalog: `advisory_present`, `advisory_absent`, `in_kev`, `epss_score`, `vex_status`, `tag_resolves_to`, `declared_digest`, `cert_expires_at`, `scorecard_check`… |
| claim_value | JSON | Structured value (e.g. `{"vuln":"GHSA-…","fixed":"1.4.7"}`) |
| observation_kind | ENUM | `observed` (seen) / `absent_in_scope` (queried a source whose coverage includes the subject and didn't find it) / `not_assessable` (could not be assessed) |
| not_assessable_reason | ENUM NULL | `out_of_source_scope` (internal package, git dep) / `fetch_failed` / `parse_failed` / `auth_denied` / `rate_limited` |
| source_id | VARCHAR | Direct source |
| origin_source_id | VARCHAR | Most original source (ICD 206) |
| reliability | CHAR(1) | A–F, taken from `source_grading` at write time |
| credibility | TINYINT | 1–6, by rule |
| grading_version | VARCHAR | For re-grading later |
| observed_at | TIMESTAMP | When Naught saw it (transaction time) |
| source_asserted_at | TIMESTAMP NULL | When the source asserted it (e.g. OSV `modified`, KEV `dateAdded`, EPSS date) |
| valid_from / valid_to | TIMESTAMP NULL | Real-world validity time (e.g. cert notBefore/notAfter; since when a tag has pointed to a digest) |
| stale_after | TIMESTAMP | observed_at + TTL per claim_type |
| derived_from | LIST<VARCHAR> | Input evidence_ids (if this is derived evidence) |
| extractor_version | VARCHAR | Parser version |
| model_version | VARCHAR NULL | e.g. EPSS model v2025.03.14 |
| sensitivity | VARCHAR NULL | Propagating label (e.g. `secret-metadata`) |
| supersedes | VARCHAR NULL | Superseded evidence (e.g. OSV withdrawn) |

**5. `operator_judgements`** (immutable; equivalent to Palantir's Action log, but only written to Naught's own store)

`judgement_id, subject_id, vuln_id, status (per OpenVEX), justification, impact_statement, author, created_at, expires_at, supersedes`. These records are fed into `evidence` with `source_id='operator'`. They should be exportable to an OpenVEX file.

**6. `assessments`** (derived, deletable)

`subject_id, factor, as_of, state ENUM(established | conflicting | stale | missing | not_assessable), value JSON, supporting_ids[], conflicting_ids[], best_reliability, best_credibility, freshness_age, rule_version, computed_at`

**7. `conclusions`** (derived, deletable)

`subject_id (or a subject×vuln pair), as_of, decision_model ('CISA-SSVC-…'), decision ENUM(Track | Track* | Attend | Act | WITHHELD), decision_points JSON (value + evidence_id for each point), blocking JSON (list of what's missing), topo_rank, policy_version, computed_at`

### Distinguishing "clean", "unknown", "not assessed"

| Displayed state | Condition | Example |
|---|---|---|
| **Has a problem (affected)** | There is a negative `observed` claim, not expired, grade meets the threshold | OSV has an advisory matching the version |
| **Clean according to source X (clean-as-of)** | There is an `absent_in_scope` from a source whose coverage includes the subject, not expired | OSV has no advisory for pkg:npm/x@1.2.3 at T → grade A, credibility depends on the rules |
| **Not applicable (not affected)** | There is a VEX `not_affected` with a justification | Vendor's VEX or the operator's VEX |
| **Old (stale)** | The best evidence is past `stale_after` | The last OSV query was 9 days ago |
| **Not assessable** | Only `not_assessable` exists; F/6 | Internal package, git dependency, fetch error |
| **Missing** | No evidence at all for the factor | No collector yet for this axis |

The most important distinction is: a *failed* run (`runs.status=failed`) may **never** produce `absent_in_scope`, only `not_assessable/fetch_failed`. We must separate "the source has nothing new" from "we haven't managed to ask yet".

### Handling contradictions between sources

1. **Keep everything, overwrite nothing** (like Gotham's multi-source properties).
2. When building the assessment, if still-valid claims contradict each other then `state=conflicting`, and both sides go into `supporting_ids`/`conflicting_ids`.
3. The resolution rules are **explicit and versioned**, for example: (a) retraction evidence (OSV `withdrawn`) beats older evidence from the same source; (b) at the same time, higher reliability wins *only if* the two sources are independent; (c) a VEX `not_affected` with a justification from the product vendor (CISA KEV/SSVC treat the vendor as the authoritative party) only lowers the priority, it doesn't delete the "affected" claim; (d) if no rule matches, keep `conflicting` and **block the conclusion**.
4. The UI shows contradictions as their own item, like "OSV says fixed in 1.4.7, the registry advisory says 1.4.8", rather than silently choosing one.

### Time model: "true at T" and "known at T"

Use two time axes (bitemporal):
- **Valid time** (`valid_from`/`valid_to`): what was true and when *in the real world* . For example, tag `nginx:1.25` pointed to digest D1 from day 1 to day 10, then pointed to D2.
- **Transaction time** (`observed_at`): when *Naught learned* about it.

Example DuckDB queries:
- "At T, what is the reality right now?" → filter `valid_from <= T AND (valid_to IS NULL OR valid_to > T)`.
- "At T, what did Naught know?" → add the condition `observed_at <= T`. This makes it possible to reproduce exactly the screen the operator saw at time T, like Foundry's dataset "time-travel".
- Base image drift is detected by compare `declared_digest` (evidence from the build, valid at build time) with `tag_resolves_to` (the latest evidence). Both are evidence, so the drift vector naturally has provenance.

**Suggested TTL per claim_type** (these are proposals, need tuning): Kubernetes placement about a few minutes to 1 hour; tag→digest about 1 day; OSV advisory about 1 day; KEV about 1 day; EPSS 1 day (published daily);\[72\] Scorecard about 7 days; cert expiry doesn't need a long observation TTL, but must have alerts based on `valid_to`.

### Deriving conclusions and when they must be withheld

1. **Structural layer (keep the existing idea):** collapse dependency cycles with Tarjan SCC into a DAG, then sort topologically. The resulting `topo_rank` is only used to **order the fixes** within the same decision level, not to decide urgency. This is a design inference.
2. **Urgency layer = CISA's SSVC decision tree**, with an evidence source for each decision point:
   - *Exploitation* (none / PoC / active): `in_kev` → active. PoC comes from exploit references in OSV or Vulnrichment. EPSS is **not** an SSVC decision point; store it as a secondary signal for tie-breaking and display.
   - *Automatable* and *Technical Impact*: from CISA's Vulnrichment (published into CVE records).\[66\]
   - *Mission Prevalence / Public Well-being*: taken from Naught's own graph (is the workload exposed externally, blast radius via the number of dependent services). This is the part where Naught has its own advantage.
3. **Withholding rule (WITHHELD):** a conclusion is only produced when *every* required decision point has an assessment with `state=established`, the grade meets the threshold (e.g. reliability ∈ {A,B,C} and credibility ≤ 3) and it is not stale. Otherwise, `decision=WITHHELD`, and the `blocking` column lists each missing point.
4. **Display language per ICD 203:** separate "urgency/likelihood" from "confidence in the basis". For example, write "Attend" on one line and "Confidence: moderate — Automatable comes from a single source" on another line, rather than combining them into one sentence.

### Showing the operator exactly which evidence is blocking a conclusion

Each element in `blocking` should be structured:

```json
{
  "decision_point": "automatable",
  "state": "missing",
  "needed": "claim_type=ssvc_automatable for CVE-2026-12345",
  "candidate_sources": ["cisa-vulnrichment"],
  "last_attempt": {"run_id": "…", "status": "failed", "reason": "rate_limited", "at": "…"},
  "how_to_unblock": "Re-run fenrir-vulnrichment; or add an operator judgement"
}
```

The detail screen for a subject should read like an "intelligence dossier" (in the spirit of ICD 206): conclusion (or WITHHELD) → each decision point → supporting and contradicting evidence (source, grade A–F/1–6, age, link to the raw document) → the related runs. A "time-travel" mode resets `as_of`.

### Which standards to reuse instead of inventing

- **Identifiers:** purl (already used), OCI digest, OSV/CVE/GHSA IDs with `aliases`.
- **Advisories:** read the OSV schema directly and store `modified`/`withdrawn`.
- **Not-affected judgements:** OpenVEX (also read CSAF/CycloneDX VEX).
- **Prioritization:** the CISA SSVC tree plus Vulnrichment; KEV; EPSS with `model_version`.
- **Upstream health:** Scorecard (keep the -1 semantics as-is), deps.dev.
- **Build provenance:** in-toto/SLSA provenance.
- **Lineage vocabulary:** W3C PROV for the provenance columns; OpenLineage for `runs` (can emit events).
- **Reliability grading:** Admiralty A–F/1–6; map to STIX `confidence` on export.\[18\]
- **Graph:** consider exporting to GUAC, or at least name `claim_type`s to match GUAC's evidence tree.

## Recommendations (in priority order)

1. **Immediately:** add `runs` (with `scope` and `scope_completed`) and `observation_kind` to the evidence. These two things definitively solve the clean / unknown / not-assessed distinction, which is the biggest risk for a system that "doesn't conclude when evidence is missing".
2. **Next:** split `source_grading` by (source × claim_type), add `origin_source_id` to check independence, and compute credibility with versioned rules.
3. **After that:** add the two time axes (`valid_*` and `observed_at`) together with `stale_after` by TTL; build the `assessments` layer with a `conflicting` state.
4. **Finally:** replace the priority score with the CISA SSVC tree with a `WITHHELD` state and a `blocking` list; keep topo order as a secondary criterion; store operator judgements as OpenVEX.
5. **Don't:** try to "imitate the Ontology" with a separate graph database. At Naught's volume, Parquet + DuckDB with the tables above is enough, and is true to the spirit of Foundry's versioned datasets.

## Caveats

- **Palantir is very secretive.** Everything above labeled "documented" comes from public product documentation (palantir.com/docs), the Gotham API, arXiv paper 2304.14975 co-authored by Peter Wilczynski (Palantir), and company whitepapers. The whitepapers (e.g. "AI-Enabled Operations", "Privacy and Governance") are marketing in nature. Third-party blogs and consultants were only used for orientation, not as primary evidence.
- **There is no public documentation** on: how Gotham attaches sources to each property value at the field level, automatic contradiction resolution rules (if any), and whether Gotham has a standard field for source reliability or confidence. Every statement about these points in the report is labeled as inference.
- **Admiralty and ICD 203/206 are general intelligence tradecraft**, not Palantir features. The report does not claim Palantir implements them.
- **Some standard descriptions** (CSAF, in-toto/SLSA, W3C PROV) are based on general knowledge rather than re-reading the specifications in this round. The KEV field list was taken from labels on the CISA page and secondary analyses, not cross-checked against the official JSON schema file. FIRST's EPSS API documentation contradicts itself, writing `created` in the description but `date` in the example.\[71\]
- **The TTLs, grade thresholds and credibility rules** in the Application section are starting proposals. They need tuning against Naught's real data.
- Grading machine sources (APIs, feeds) A–F/1–6 is itself different from grading human sources (HUMINT), which is what Admiralty was designed for. In the article "Beyond the Admiralty Code: Rethinking Information Evaluation in Civil Affairs" (Small Wars Journal, 02/10/2026), David F. Mitchell observes that current doctrine "offers no means of accounting for temporal currency" (no way of accounting for how up to date the information is), and proposes tying each level to concrete criteria. This further shows that Naught needs a separate freshness column beyond A–F/1–6. Naught should record the reason for each grade in `source_grading.rationale`, so the operator can challenge it.

## Sources

1. [Core concepts • Palantir](https://www.palantir.com/docs/foundry/ontology/core-concepts)
2. [Object and link types • Types reference • Palantir](https://www.palantir.com/docs/foundry/object-link-types/type-reference)
3. [Update object property • API Reference • Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/objects/update-object-property)
4. [Object permissioning • Multi-datasource object types (MDOs) • Palantir](https://www.palantir.com/docs/foundry/object-permissioning/multi-datasource-objects)
5. [Object resolution basics • API Reference • Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/resolution/resolution-basics)
6. [Core concepts • Datasets • Palantir](https://www.palantir.com/docs/foundry/data-integration/datasets)
7. [Core concepts • Branching • Palantir](https://www.palantir.com/docs/foundry/data-integration/branching)
8. [Connecting to data • Palantir](https://www.palantir.com/docs/foundry/data-integration/connecting-to-data)
9. [Health checks • Types of checks • Palantir](https://www.palantir.com/docs/foundry/health-checks/check-types)
10. [Getting started • Protecting sensitive data • Palantir](https://www.palantir.com/docs/foundry/security/protecting-sensitive-data)
11. [Object permissioning • Object security policies • Palantir](https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies)
12. [Action types • Overview • Palantir](https://www.palantir.com/docs/foundry/action-types/overview)
13. [Workshop • Visualization widgets • Edit History • Palantir](https://www.palantir.com/docs/foundry/workshop/widgets-edits-history)
14. [Question on Backups for Palantir Foundry Ontology Edits - Ask the Community - Palantir Developer Community](https://community.palantir.com/t/question-on-backups-for-palantir-foundry-ontology-edits/5888)
15. [model package - github.com/guacsec/guac/pkg/assembler/graphql/model - Go Packages](https://pkg.go.dev/github.com/guacsec/guac/pkg/assembler/graphql/model)
16. [VEX, CSAF and OpenVEX: Turning SBOM Noise into Exploitabilit](https://iotdigitaltwinplm.com/vex-csaf-openvex-vulnerability-exploitability-sbom-triage-automation-2026/)
17. [STIX 2.1 bundles · CTIPilot](https://ctipilot.ch/stix/)
18. [Representing Admiralty Codes in STIX Without Giving Up Interoperability](https://www.dogesec.com/blog/representing_admiralty_codes_in_stix/)
19. [scales — stix2 3.0.1 documentation](https://stix2.readthedocs.io/en/latest/api/confidence/stix2.confidence.scales.html)
20. [Ontologies • Overview • Palantir](https://www.palantir.com/docs/foundry/ontologies/ontologies-overview)
21. [Overview and getting started • Overview • Palantir](https://www.palantir.com/docs/foundry/object-backend/overview)
22. [Object and link types • Link types • Overview • Palantir](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview)
23. [Functions • Functions on objects • Objects and links • Palantir](https://www.palantir.com/docs/foundry/functions/api-objects-links)
24. [Action types • Rules - Ontology building](https://www.palantir.com/docs/foundry/action-types/rules)
25. [Object edits and materializations • Enable user edit history • Palantir](https://www.palantir.com/docs/foundry/object-edits/user-edit-history)
26. [Practical Ontologies & How to Build Them - Part 3](https://fourthage.substack.com/p/practical-ontologies-and-how-to-build-355)
27. [Object edits and materializations • How user edits are applied • Palantir](https://www.palantir.com/docs/foundry/object-edits/how-edits-applied)
28. [Palantir Gotham: Uses, Contracts, vs Foundry](https://www.bdemerson.com/article/palantir-gotham)
29. [Search objects • API Reference • Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/objects/search-objects)
30. [Add property to object • API Reference • Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/objects/add-object-property)
31. [Federated sources basics • API Reference • Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/federated-sources/federated-source-basics)
32. [Data Health • Palantir](https://www.palantir.com/docs/foundry/observability/data-health)
33. [Global Branching • Integrations • Palantir](https://www.palantir.com/docs/foundry/foundry-branching/best-practices-and-technical-details)
34. [Palantir Privacy and Governance Whitepaper PALANTIR.COM COPYRIGHT © 2024](https://www.palantir.com/assets/xrfr7uokpv1b/6pey1VnYHULqeggNbPKqP0/9f577de3e3dfb9fc031bd75dc7526517/Palantir_Privacy_and_Governance_Whitepaper__1_.pdf)
35. [Health checks • Checks reference • Palantir](https://palantir.com/docs/foundry/data-health/checks-reference//)
36. [Data Health • Overview • Palantir](https://www.palantir.com/docs/foundry/data-health/overview)
37. [Maintaining pipelines • Recommended health checks • Palantir](https://www.palantir.com/docs/foundry/maintaining-pipelines/recommended-health-checks)
38. [Monitoring views • Monitoring FAQ • Palantir](https://www.palantir.com/docs/foundry/monitoring-views/monitoring-faq)
39. [stix-v2.1-csprd01 26 July 2019 Standards Track Work Product](https://docs.oasis-open.org/cti/stix/v2.1/csprd01/stix-v2.1-csprd01.pdf)
40. [stix-v2.1-cs01.pdf - STIX Version 2.1 - OASIS Open](https://docs.oasis-open.org/cti/stix/v2.1/cs01/stix-v2.1-cs01.pdf)
41. [GitHub - ossf/scorecard-infra: OpenSSF Scorecard infrastructure · GitHub](https://github.com/ossf/scorecard-infra)
42. [What is Known and Unknown about your software supply chain?](https://docs.guac.sh/guac/known-and-unknown/)
43. [STIX Version 2.1 - Index of / - OASIS Open](https://docs.oasis-open.org/cti/stix/v2.1/cs03/stix-v2.1-cs03.html)
44. [Admiralty code](https://military-history.fandom.com/wiki/Admiralty_code)
45. [Admiralty code](https://en.wikipedia.org/wiki/Admiralty_code)
46. [rate-source-admiralty: Grades sources on the NATO Admiralty Code reliability and credibility axes](https://skills.rest/skill/rate-source-admiralty-radarist)
47. [Analytic Standards](https://irp.fas.org/dni/icd/icd-203.pdf)
48. [Analytic Standards A. PURPOSE:](https://archive.dni.gov/files/documents/ICD/ICD-203.pdf)
49. [Analytic Tradecraft Standard 1: Sourcing - Jessica Stutzman](https://pangearesearch.substack.com/p/analytic-tradecraft-standard-1-sourcing)
50. [Show Your Work: The Intelligence Standard for Sourcing](https://pangearesearch.substack.com/p/show-your-work-the-intelligence-standard)
51. [Sourcing for OSINT: ICS 206-01 - Jessica Stutzman](https://pangearesearch.substack.com/p/sourcing-for-osint-icd-206-01)
52. [Palantir](https://www.palantir.com/docs/gotham/api/revdb-resources/objects/get-object-properties)
53. [(PDF) Palantir Gotham A Critical Technical Review of Architecture, Data Integration, Artificial Intelligence, Security, and Technology-Sector Applications Palantir Gotham Technical Review](https://www.researchgate.net/publication/412229812_Palantir_Gotham_A_Critical_Technical_Review_of_Architecture_Data_Integration_Artificial_Intelligence_Security_and_Technology-Sector_Applications_Palantir_Gotham_Technical_Review)
54. [AI-Enabled Operations Palantir Technologies → palantir.com](https://www.palantir.com/assets/xrfr7uokpv1b/3A0y10xksgXENvRMNaAsUu/ed8f7f1ed534c0101f64536a85f7297b/Gotham_AI-Enabled_Operations_White_Paper.pdf)
55. [Overview • Security • Palantir](https://www.palantir.com/docs/foundry/security/overview)
56. [Concepts • Access control propagation • Palantir](https://www.palantir.com/docs/foundry/security/access-control-propagation)
57. [How Palantir Foundry connects to your data](https://vanyar.com/articles/what-is-palantir-part-2)
58. [Object permissioning • Managing object security • Palantir](https://www.palantir.com/docs/foundry/object-permissioning/managing-object-security)
59. [Palantir Foundry Data Governance: Markings and Policies](https://pal4c.com/palantir-foundry-data-governance/)
60. [GraphQL - GUAC Project Docs](https://docs.guac.sh/guac/graphql/)
61. [osv-schema/docs/schema.md at main · ossf/osv-schema · GitHub](https://github.com/ossf/osv-schema/blob/main/docs/schema.md)
62. [Open Source Vulnerability format - Open Source Vulnerability schema](https://ossf.github.io/osv-schema/)
63. [Open Source Vulnerability format - Open Source Vulnerability schema](https://hayleycd.github.io/osv-schema/)
64. [VEX Vulnerability Management](https://devguard.org/blog/vex-schwachstellenmanagement-cra)
65. [VEX in SPDX 3.0 Security Profile vs CSAF, OpenVEX and CycloneDX](https://safeguard.sh/resources/blog/vex-in-spdx-3-security-profile-compared-with-csaf-openvex-and-cyclonedx)
66. [Vulnerability Prioritization: Modern Methods & Tools Vulnerability Prioritization: Methods](https://orca.security/resources/blog/vulnerability-prioritization/)
67. [Transforming the Vulnerability Management Landscape](https://www.cisa.gov/news-events/news/transforming-vulnerability-management-landscape)
68. [CISA releases Stakeholder-Specific Vulnerability Categorization methodology to prioritize vulnerabilities - CISSP.COM - The web portal for cybersecurity professionals](https://www.cissp.com/security-news/state-and-government-security/1016-cisa-releases-stakeholder-specific-vulnerability-categorization-methodology-to-prioritize-vulnerabilities)
69. [CISA KEV: The Known Exploited Vulnerabilities Catalog](https://craci.com/cisa-kev)
70. [CISA KEV JSON API: Automate Alerts Without a SIEM](https://www.decryptiondigest.com/blog/cisa-kev-automated-alerts-guide)
71. [FIRST.Org REST API: GET /epss](https://api.first.org/epss/)
72. [Get the Data](https://www.first.org/epss/data)
73. [GitHub - ossf/scorecard: OpenSSF Scorecard - Security health metrics for Open Source · GitHub](https://github.com/ossf/scorecard)
74. [OpenSSF Scorecard: On the Path Toward Ecosystem-wide Automated Security Metrics](https://arxiv.org/pdf/2208.03412)
75. [deps.dev API](https://docs.deps.dev/api/v3/)
76. [google/deps.dev](https://deepwiki.com/google/deps.dev)
77. [OpenLineage/spec/OpenLineage.md at main · OpenLineage/OpenLineage · GitHub](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md)
78. [Extending OpenLineage with Facets](https://openlineage.io/blog/extending-with-facets/)
79. [Object Model](https://openlineage.io/docs/spec/object-model/)
