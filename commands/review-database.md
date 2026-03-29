---
description: "Review database schema for correctness and completeness"
long-description: "Review database schema targeting schema-specific failure modes: entity coverage"
---

## Purpose
Review database schema targeting schema-specific failure modes: entity coverage
gaps, normalization trade-off issues, missing indexes, migration safety, and
referential integrity vs. domain invariants.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/database-schema.md (required) — schema to review
- docs/domain-models/ (required) — for entity coverage
- docs/system-architecture.md (required) — for query pattern coverage

## Expected Outputs
- docs/reviews/review-database.md — findings and resolution log
- docs/database-schema.md — updated with fixes
- docs/reviews/database/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/database/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/database/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every domain entity has a corresponding table/collection or documented denormalization rationale
- (mvp) Normalization decisions justified
- (deep) Index coverage for known query patterns verified
- (deep) Migration safety assessed
- (mvp) Referential integrity matches domain invariants
- (mvp) Every finding categorized P0-P3 with specific table, column, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to database-schema.md and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before API contracts proceed
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review targeting all schema failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Entity coverage check only.
- **custom:depth(1-5)**: Depth 1: entity coverage and normalization pass only. Depth 2: add index strategy and migration safety passes. Depth 3: add query performance and data integrity passes. Depth 4: add external model review. Depth 5: multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/database/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-database.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

---

### review-database-design

*Failure modes and review passes specific to database schema design artifacts*

# Review: Database Schema

The database schema translates domain entities and their relationships into persistent storage structures. It must faithfully represent domain models while also optimizing for real query patterns, enforcing invariants through constraints, and providing safe migration paths. This review uses 8 passes targeting the specific ways database schema designs fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Entity Coverage**: Every domain entity requiring persistence maps to a table; no domain concept is missing from the schema.
- **Pass 2 — Relationship Fidelity**: Schema relationships accurately reflect domain model cardinality and direction; no missing or fabricated foreign keys.
- **Pass 3 — Normalization Justification**: Normalization level of each table is justified; deliberate denormalization has documented rationale tied to access patterns.
- **Pass 4 — Index Coverage**: Indexes cover known query patterns from architecture data flows; no critical query requires a full table scan.
- **Pass 5 — Constraint Enforcement**: Database constraints (NOT NULL, UNIQUE, CHECK, FK) enforce domain invariants where possible.
- **Pass 6 — Migration Safety**: Migration plan handles rollbacks and data preservation; destructive operations identified; data migrations separated from schema migrations.
- **Pass 7 — Cross-Schema Consistency**: Multi-database naming conventions, shared identifiers, and cross-database references are consistent.
- **Pass 8 — Downstream Readiness**: Schema supports efficient CRUD, list/search queries, relationship traversal, and aggregates needed by API contracts.

## Deep Guidance

---

## Pass 1: Entity Coverage

### What to Check

Every domain entity that requires persistence maps to a table, collection, or storage structure. No domain entity is missing from the schema.

### Why This Matters

A missing table means an entire domain concept has no home in the database. Implementing agents will either create ad hoc tables (diverging from the schema design) or try to shoehorn entities into existing tables (violating domain boundaries). Entity coverage is the most fundamental check — everything else assumes the right tables exist.

### How to Check

1. List every entity and aggregate root from domain models
2. For each entity, find the corresponding table or collection in the schema
3. Flag entities with no mapping — these are gaps
4. Check value objects: do any require their own table (one-to-many embedded values), or are they correctly embedded in the parent entity's table?
5. Verify domain events: if events are persisted (event sourcing, audit log), check that event storage tables exist
6. Check reference/lookup data: enums, categories, and status values — are they stored as tables, enum types, or inline constants? Is the choice justified?

### What a Finding Looks Like

- P0: "'AuditLog' entity exists in domain models with defined lifecycle and attributes, but no audit_logs table appears in the schema."
- P1: "'Address' is a value object used by three entities (User, Order, Warehouse) but there is no consistent approach — some embed it as columns, some reference a separate table."
- P2: "Domain events are documented as 'persisted for replay' in the architecture, but no event storage table exists in the schema."

---

## Pass 2: Relationship Fidelity

### What to Check

Schema relationships (foreign keys, join tables, embedded documents) accurately reflect domain model relationships. Cardinality matches. Direction matches. No relationship is inverted, missing, or fabricated.

### Why This Matters

A one-to-many relationship modeled as many-to-many creates unnecessary complexity and ambiguity. A missing foreign key means referential integrity is not enforced by the database, leaving it to application code (which is less reliable). Relationship fidelity errors cause subtle bugs — the system appears to work but produces incorrect data under edge conditions.

### How to Check

1. For each relationship in domain models, find the corresponding schema relationship
2. Verify cardinality: one-to-one, one-to-many, many-to-many match between domain and schema
3. Verify direction: the foreign key is on the correct table (the "many" side in one-to-many)
4. For many-to-many relationships, verify a join table exists with appropriate foreign keys
5. Check for missing relationships: domain models show A relates to B, but no foreign key or join table connects them in the schema
6. Check for fabricated relationships: schema has a foreign key between tables whose domain entities have no documented relationship

### What a Finding Looks Like

- P0: "Domain model shows Order has many LineItems (one-to-many), but the schema has no foreign key from line_items to orders. The relationship is unenforceable."
- P1: "Domain model shows User has one Profile (one-to-one), but the schema implements it as one-to-many (profiles table has user_id without a unique constraint)."
- P2: "Join table 'user_roles' exists but the domain model shows Role as a value object embedded in User, not a separate entity. Either the model or the schema should change."

---

## Pass 3: Normalization Justification

### What to Check

The normalization level of each table is justified. Deliberate denormalization has documented rationale (performance, read patterns). Accidental denormalization (duplicate data without awareness) is flagged.

### Why This Matters

Over-normalization causes excessive joins for common queries, degrading performance. Under-normalization causes data anomalies (update a value in one place but not another). Neither extreme is inherently wrong — but the choice must be deliberate and justified by the access patterns documented in the architecture's data flows.

### How to Check

1. For each table, assess its normalization level (1NF through 3NF/BCNF)
2. Identify any tables below 3NF — is the denormalization intentional?
3. For intentional denormalization, verify the justification references a specific query pattern or performance requirement
4. Check for duplicate data across tables: does the same business data exist in two tables? If so, is there a synchronization mechanism?
5. Look for tables with many nullable columns — these often indicate merged entities that should be separate tables
6. Check computed/derived columns: are they cached values? How are they updated?

### What a Finding Looks Like

- P0: "Customer address is stored in both 'customers' and 'orders' tables with no documented synchronization. If a customer updates their address, historical orders show the new address instead of the address at time of order."
- P1: "The 'orders' table stores product_name and product_price directly instead of referencing the products table. This is presumably for historical accuracy (price at time of purchase), but the rationale is not documented."
- P2: "The 'user_stats' table has 12 computed columns (total_orders, lifetime_value, etc.) with no documentation of how or when they are recalculated."

---

## Pass 4: Index Coverage

### What to Check

Indexes cover the known query patterns from architecture data flows. Primary access paths have supporting indexes. No critical query requires a full table scan on a large table.

### Why This Matters

Missing indexes cause performance degradation that only appears at scale — the system works fine with test data but becomes unusable with production data volumes. Index coverage must be designed proactively based on known query patterns, not discovered reactively in production.

### How to Check

1. List every data flow from the architecture document that involves database reads
2. For each read, identify the query pattern: what table, what filter columns, what sort order
3. Verify an index exists that supports each query pattern
4. Check for queries that filter on multiple columns: do composite indexes exist in the correct column order?
5. Look for common patterns that always need indexes: foreign keys (for joins), status columns (for filtering), timestamp columns (for sorting/range queries), unique business identifiers
6. Check for over-indexing: too many indexes on a write-heavy table degrade write performance

### What a Finding Looks Like

- P0: "Architecture data flow shows 'find all orders by customer, sorted by date' as a primary query, but orders table has no index on (customer_id, created_at)."
- P1: "Foreign key column 'order_id' on 'line_items' table has no index. Every order retrieval with line items will require a full scan of line_items."
- P2: "The 'events' table has 7 indexes but the architecture describes it as append-only with rare reads. Excessive indexing will slow writes."

---

## Pass 5: Constraint Enforcement

### What to Check

Database constraints enforce domain invariants where possible. NOT NULL, UNIQUE, CHECK, and FOREIGN KEY constraints reflect business rules from domain models.

### Why This Matters

Every invariant not enforced by the database must be enforced by application code. Application-level enforcement is less reliable: it can be bypassed by direct database access, missed in one code path, or broken during refactoring. Database constraints are the last line of defense against invalid data.

### How to Check

1. List every domain invariant from domain models
2. For each invariant, determine: can it be enforced by a database constraint? (Some invariants require multi-table coordination and cannot be database-enforced)
3. For enforceable invariants, verify the corresponding constraint exists in the schema
4. Check NOT NULL constraints: which columns are nullable? Does that match domain model optionality?
5. Check UNIQUE constraints: which business identifiers must be unique? Is that constraint in the schema?
6. Check CHECK constraints: value ranges, valid states, format rules — are they enforced?
7. Verify FOREIGN KEY constraints exist for all documented relationships

### What a Finding Looks Like

- P0: "Domain invariant 'email must be unique per tenant' has no UNIQUE constraint in the schema. Application code may enforce it, but concurrent requests could create duplicates."
- P1: "Domain model says 'order status must be one of: draft, submitted, approved, shipped, delivered' but the status column is VARCHAR with no CHECK constraint."
- P2: "Column 'quantity' on 'line_items' should have a CHECK (quantity > 0) constraint per domain invariant 'line items must have positive quantity'."

---

## Pass 6: Migration Safety

### What to Check

The migration plan handles rollbacks and data preservation. Destructive operations are identified. Data migrations are separated from schema migrations.

### Why This Matters

Schema migrations that cannot be rolled back are production risks. A failed deployment with an irreversible migration leaves the database in a state incompatible with both the old and new code. Data migrations mixed with schema changes make rollbacks impossible (schema can be reverted, but data transformations cannot).

### How to Check

1. Identify all schema changes that are destructive: dropping columns, dropping tables, changing column types, removing constraints
2. For each destructive change, verify a rollback strategy exists (how to undo it)
3. Check that data migrations (backfilling columns, transforming data) are separate from schema migrations
4. Verify the migration ordering: dependencies between migrations are correct (cannot add a foreign key before the referenced table exists)
5. Check for migrations that lock tables: ALTER TABLE on large tables can lock the table for the duration. Is this addressed (online DDL, batch processing)?
6. Verify that the migration plan addresses zero-downtime deployment requirements if applicable

### What a Finding Looks Like

- P0: "Migration 005 drops the 'legacy_orders' table with no data export or rollback plan. If this migration runs and the new orders system has bugs, historical data is lost."
- P1: "Migration 003 adds a NOT NULL column to a table with existing data but does not specify a default value or data backfill. The migration will fail on non-empty tables."
- P2: "Migration 007 alters the type of 'amount' from INTEGER to DECIMAL. This is a potentially lossy change on large tables. Should use a blue-green column approach."

---

## Pass 7: Cross-Schema Consistency

### What to Check

If the system uses multiple databases or schemas, naming conventions, shared reference data, and cross-database relationships are consistent.

### Why This Matters

Multi-database architectures often evolve organically, with each database using its own conventions. When a concept (like user_id) exists in multiple databases with different types (UUID in one, integer in another) or different names (user_id vs. account_id), integration becomes fragile and error-prone.

### How to Check

1. List all databases or schemas in the architecture
2. Verify naming conventions are consistent across all schemas (snake_case everywhere, or camelCase everywhere — not mixed)
3. Check for shared identifiers: the same business entity referenced in multiple databases should use the same column name and data type
4. Verify reference data consistency: if 'countries' or 'currencies' exist in multiple schemas, is there a single source of truth?
5. Check for cross-database foreign key assumptions: if service A references service B's data by ID, is the ID type guaranteed to match?
6. Verify that cross-schema query patterns are documented — direct cross-schema queries, API calls, or event-based synchronization?

### What a Finding Looks Like

- P0: "UserService uses UUID for user_id (CHAR(36)) but OrderService uses INTEGER for user_id. These are fundamentally incompatible — joins and references will fail."
- P1: "Both AuthDB and MainDB have a 'users' table with overlapping but different columns. Which is the source of truth for user data?"
- P2: "AuthDB uses snake_case (user_id) and MainDB uses camelCase (userId). Inconsistent naming will cause confusion."

---

## Pass 8: Downstream Readiness

### What to Check

The API contracts step can be built on this schema. The schema provides everything needed to design API endpoints, query patterns, and response shapes.

### Why This Matters

API endpoints translate database operations into client-facing contracts. If the schema cannot efficiently serve the queries that API endpoints need, the API layer must work around schema limitations — adding application-level joins, filtering, or transformations that belong in the database.

### How to Check

The API contracts step specifically needs:
1. **CRUD operations** are straightforward on the schema — no endpoint requires a 5-table join for a basic read
2. **List/search queries** have index support for filtering and pagination
3. **Relationship traversal** is possible: "get order with its line items" does not require multiple disconnected queries
4. **Aggregate queries** (counts, sums, averages) can be performed efficiently
5. **Write operations** map cleanly to table inserts/updates without requiring complex multi-table transactions for basic operations
6. **Soft delete vs. hard delete** is consistent across tables and matches API behavior expectations

### What a Finding Looks Like

- P0: "API will need 'get all orders for a customer with their line items and product details.' This requires joining orders -> line_items -> products, but line_items has no index on order_id, and the relationship from line_items to products is missing."
- P1: "The schema supports 'get user by email' but the API will also need 'search users by name.' No index exists on user name columns."
- P2: "Some tables use soft delete (deleted_at column) and some use hard delete. The API contract needs to know which approach applies to determine whether 'delete' operations return 204 or 200."

### Example Review Finding

```markdown
### Finding: Missing composite index for primary order query pattern

**Pass:** 4 — Index Coverage
**Priority:** P0
**Location:** orders table, schema.sql lines 45-72

**Issue:** Architecture data flow DF-003 ("Customer views order history") describes
the primary query as "find all orders by customer, sorted by most recent first." This
query filters on customer_id and sorts on created_at DESC. The orders table has a
single-column index on customer_id but no composite index on (customer_id, created_at).

**Impact:** Without a composite index, PostgreSQL will use the customer_id index to
filter, then perform a filesort on the matching rows. At projected volume (50K orders
per customer for enterprise accounts), this filesort will cause multi-second response
times on the most frequently executed query.

**Recommendation:** Add composite index: CREATE INDEX idx_orders_customer_date
ON orders (customer_id, created_at DESC). The DESC matches the sort direction,
enabling an index-only scan for this query pattern.

**Trace:** Architecture data flow DF-003 → PRD Feature 2.1 "Order History"
```

---

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### review-step-template

*Shared template pattern for review pipeline steps including multi-model dispatch, finding severity, and resolution workflow*

# Review Step Template

## Summary

This entry documents the common structure shared by all 15+ review pipeline steps. Individual review steps customize this structure with artifact-specific failure modes and review passes, but the scaffolding is consistent across all reviews.

**Purpose pattern**: Every review step targets domain-specific failure modes for a given artifact — not generic quality checks. Each pass has a specific focus, concrete checking instructions, and example findings.

**Standard inputs**: Primary artifact being reviewed, upstream artifacts for cross-reference validation, `review-methodology` knowledge + artifact-specific review knowledge entry.

**Standard outputs**: Review document (`docs/reviews/review-{artifact}.md`), updated primary artifact with P0/P1 fixes applied, and at depth 4+: multi-model artifacts (`codex-review.json`, `gemini-review.json`, `review-summary.md`) under `docs/reviews/{artifact}/`.

**Finding severity**: P0 (blocking — must fix), P1 (significant — fix before implementation), P2 (improvement — fix if time permits), P3 (nitpick — log for later).

**Methodology scaling**: Depth 1-2 runs top passes only (P0 focus). Depth 3 runs all passes. Depth 4-5 adds multi-model dispatch to Codex/Gemini with finding synthesis.

**Mode detection**: First review runs all passes from scratch. Re-review preserves prior findings, marks resolved ones, and reports NEW/EXISTING/RESOLVED status.

**Frontmatter conventions**: Reviews are order = creation step + 10, always include `review-methodology` in knowledge-base, and are never conditional.

## Deep Guidance

### Purpose Pattern

Every review step follows the pattern:

> Review **[artifact]** targeting **[domain]**-specific failure modes.

The review does not check generic quality ("is this document complete?"). Instead, it runs artifact-specific passes that target the known ways that artifact type fails. Each pass has a specific focus, concrete checking instructions, and example findings.

### Standard Inputs

Every review step reads:
- **Primary artifact**: The document being reviewed (e.g., `docs/domain-models.md`, `docs/api-contracts.md`)
- **Upstream artifacts**: Documents the primary artifact was built from (e.g., PRD, domain models, ADRs) -- used for cross-reference validation
- **Knowledge base entries**: `review-methodology` (shared process) + artifact-specific review knowledge (e.g., `review-api-design`, `review-database-design`)

### Standard Outputs

Every review step produces:
- **Review document**: `docs/reviews/review-{artifact}.md` -- findings organized by pass, with severity and trace information
- **Updated artifact**: The primary artifact with fixes applied for P0/P1 findings
- **Depth 4+ multi-model artifacts** (when methodology depth >= 4):
  - `docs/reviews/{artifact}/codex-review.json` -- Codex independent review findings
  - `docs/reviews/{artifact}/gemini-review.json` -- Gemini independent review findings
  - `docs/reviews/{artifact}/review-summary.md` -- Synthesized findings from all models

### Finding Severity Levels

All review steps use the same four-level severity scale:

| Level | Name | Meaning | Action |
|-------|------|---------|--------|
| P0 | Blocking | Cannot proceed to downstream steps without fixing | Must fix before moving on |
| P1 | Significant | Downstream steps can proceed but will encounter problems | Fix before implementation |
| P2 | Improvement | Artifact works but could be better | Fix if time permits |
| P3 | Nitpick | Style or preference | Log for future cleanup |

### Finding Format

Each finding includes:
- **Pass**: Which review pass discovered it (e.g., "Pass 3 -- Auth/AuthZ Coverage")
- **Priority**: P0-P3
- **Location**: Specific section, line, or element in the artifact
- **Issue**: What is wrong, with concrete details
- **Impact**: What goes wrong downstream if this is not fixed
- **Recommendation**: Specific fix, not just "fix this"
- **Trace**: Link back to upstream artifact that establishes the requirement (e.g., "PRD Section 3.2 -> Architecture DF-005")

### Example Finding

```markdown
### Finding F-003 (P1)
- **Pass**: Pass 2 — Entity Coverage
- **Location**: docs/domain-models/order.md, Section "Order Aggregate"
- **Issue**: Order aggregate does not include a `cancellationReason` field, but PRD
  Section 4.1 requires cancellation reason tracking for analytics.
- **Impact**: Implementation will lack cancellation reason; analytics pipeline will
  receive null values, causing dashboard gaps.
- **Recommendation**: Add `cancellationReason: CancellationReason` value object to
  Order aggregate with enum values: USER_REQUEST, PAYMENT_FAILED, OUT_OF_STOCK,
  ADMIN_ACTION.
- **Trace**: PRD §4.1 → User Story US-014 → Domain Model: Order Aggregate
```

### Review Document Structure

Every review output document follows a consistent structure:

```markdown
  # Review: [Artifact Name]

  **Date**: YYYY-MM-DD
  **Methodology**: deep | mvp | custom:depth(N)
  **Status**: INITIAL | RE-REVIEW
  **Models**: Claude | Claude + Codex | Claude + Codex + Gemini

  ## Findings Summary
  - Total findings: N (P0: X, P1: Y, P2: Z, P3: W)
  - Passes run: N of M
  - Artifacts checked: [list]

  ## Findings by Pass

  ### Pass 1 — [Pass Name]
  [Findings listed by severity, highest first]

  ### Pass 2 — [Pass Name]
  ...

  ## Resolution Log
  | Finding | Severity | Status | Resolution |
  |---------|----------|--------|------------|
  | F-001   | P0       | RESOLVED | Fixed in commit abc123 |
  | F-002   | P1       | EXISTING | Deferred — tracked in ADR-015 |

  ## Multi-Model Synthesis (depth 4+)
  ### Convergent Findings
  [Issues found by 2+ models — high confidence]

  ### Divergent Findings
  [Issues found by only one model — requires manual triage]
```

### Methodology Scaling Pattern

Review steps scale their thoroughness based on the methodology depth setting:

### Depth 1-2 (MVP/Minimal)
- Run only the highest-impact passes (typically passes 1-3)
- Single-model review only
- Focus on P0 findings; skip P2/P3
- Abbreviated finding descriptions

### Depth 3 (Standard)
- Run all review passes
- Single-model review
- Report all severity levels
- Full finding descriptions with trace information

### Depth 4-5 (Comprehensive)
- Run all review passes
- Multi-model dispatch: send the artifact to Codex and Gemini for independent analysis
- Synthesize findings from all models, flagging convergent findings (multiple models found the same issue) as higher confidence
- Cross-artifact consistency checks against all upstream documents
- Full finding descriptions with detailed trace and impact analysis

### Depth Scaling Example

At depth 2 (MVP), a domain model review might produce:

```markdown
  # Review: Domain Models (MVP)
  ## Findings Summary
  - Total findings: 3 (P0: 1, P1: 2)
  - Passes run: 3 of 10
  ## Findings
  ### F-001 (P0) — Missing aggregate root for Payment bounded context
  ### F-002 (P1) — Order entity lacks status field referenced in user stories
  ### F-003 (P1) — No domain event defined for order completion
```

At depth 5 (comprehensive), the same review would run all 10 passes, dispatch to
Codex and Gemini, and produce a full synthesis with 15-30 findings across all
severity levels.

### Mode Detection Pattern

Every review step checks whether this is a first review or a re-review:

**First review**: No prior review document exists. Run all passes from scratch.

**Re-review**: A prior review document exists (`docs/reviews/review-{artifact}.md`). The step:
1. Reads the prior review findings
2. Checks which findings were addressed (fixed in the artifact)
3. Marks resolved findings as "RESOLVED" rather than removing them
4. Runs all passes again looking for new issues or regressions
5. Reports findings as "NEW", "EXISTING" (still unfixed), or "RESOLVED"

This preserves review history and makes progress visible.

### Resolution Workflow

The standard workflow from review to resolution:

1. **Review**: Run the review step, producing findings
2. **Triage**: Categorize findings by severity; confirm P0s are genuine blockers
3. **Fix**: Update the primary artifact to address P0 and P1 findings
4. **Re-review**: Run the review step again in re-review mode
5. **Verify**: Confirm all P0 findings are resolved; P1 findings are resolved or have documented justification for deferral
6. **Proceed**: Move to the next pipeline phase

For depth 4+ reviews, the multi-model dispatch happens in both the initial review and the re-review, ensuring fixes do not introduce new issues visible to other models.

### Frontmatter Pattern

Review steps follow a consistent frontmatter structure:

```yaml
---
name: review-{artifact}
description: "Review {artifact} for completeness, consistency, and downstream readiness"
phase: "{phase-slug}"
order: {N}20  # Reviews are always 10 after their creation step
dependencies: [{creation-step}]
outputs: [docs/reviews/review-{artifact}.md, docs/reviews/{artifact}/review-summary.md, docs/reviews/{artifact}/codex-review.json, docs/reviews/{artifact}/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-{artifact-domain}]
---
```

Key conventions:
- Review steps always have order = creation step order + 10
- Primary output uses `review-` prefix; multi-model directory uses bare artifact name
- Knowledge base always includes `review-methodology` plus a domain-specific entry
- Reviews are never conditional — if the creation step ran, the review runs

### Common Anti-Patterns

### Reviewing Without Upstream Context
Running a review without loading the upstream artifacts that define requirements.
The review cannot verify traceability if it does not have the PRD, domain models,
or ADRs that establish what the artifact should contain.

### Severity Inflation
Marking everything as P0 to force immediate action. This undermines the severity
system and causes triage fatigue. Reserve P0 for genuine blockers where downstream
steps will fail or produce incorrect output.

### Fix Without Re-Review
Applying fixes to findings without re-running the review. Fixes can introduce new
issues or incompletely address the original finding. Always re-review after fixes.

### Ignoring Convergent Multi-Model Findings
When multiple models independently find the same issue, it has high confidence.
Dismissing convergent findings without strong justification undermines the value
of multi-model review.

### Removing Prior Findings
Deleting findings from a re-review output instead of marking them RESOLVED. This
loses review history and makes it impossible to track what was caught and fixed.

---

## After This Step

Continue with: `/scaffold:platform-parity-review`
