---
description: "Database schema review for completeness and quality"
long-description: "Performs a structured multi-pass review of the database schema design, targeting failure modes specific to data modeling artifacts. Covers entity coverage, relationship fidelity, normalization justification, index coverage, constraint enforcement, migration safety, cross-schema consistency, and downstream readiness."
---

Perform a structured multi-pass review of the database schema, targeting failure modes specific to database schema artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-database.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated schema
3. Run all review passes again on the current database schema
4. Focus on: remaining unresolved findings, regressions from fixes, and any new tables or migrations added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/database-schema.md` completely. Also read `docs/domain-models/` for entity coverage and `docs/system-architecture.md` for query pattern and data flow cross-reference.

### Step 2: Multi-Pass Review

Execute 8 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Entity Coverage**
List every entity and aggregate root from domain models. For each, find the corresponding table or collection. Flag entities with no mapping. Check value objects: do any require their own table (one-to-many embedded values), or are they correctly embedded? Verify domain event storage tables exist if events are persisted. Check reference/lookup data handling (tables, enum types, or inline constants).

**Pass 2: Relationship Fidelity**
For each domain model relationship, find the corresponding schema relationship. Verify cardinality matches (one-to-one, one-to-many, many-to-many). Verify direction (foreign key on the "many" side). Check many-to-many join tables exist with appropriate foreign keys. Flag missing relationships and fabricated relationships (schema FK with no domain relationship).

**Pass 3: Normalization Justification**
Assess each table's normalization level (1NF through 3NF/BCNF). For tables below 3NF, verify denormalization is intentional with a justification referencing specific query patterns. Check for duplicate business data across tables without synchronization. Look for tables with many nullable columns (possibly merged entities). Check computed/derived columns for update mechanisms.

**Pass 4: Index Coverage**
List every architecture data flow involving database reads. Identify query patterns: table, filter columns, sort order. Verify supporting indexes exist. Check composite index column order matches query patterns. Verify common patterns: foreign keys for joins, status columns for filtering, timestamps for sorting, unique business identifiers. Flag over-indexing on write-heavy tables.

**Pass 5: Constraint Enforcement**
List every domain invariant and determine which can be database-enforced. Verify NOT NULL constraints match domain optionality. Check UNIQUE constraints for business identifiers. Verify CHECK constraints for value ranges, valid states, and format rules. Verify FOREIGN KEY constraints for all relationships. Flag enforceable invariants missing constraints.

**Pass 6: Migration Safety**
Identify all destructive schema changes: dropping columns/tables, changing types, removing constraints. Verify rollback strategy for each. Check data migrations are separate from schema migrations. Verify migration ordering respects dependencies. Flag table-locking operations on large tables. Check zero-downtime deployment compatibility.

**Pass 7: Cross-Schema Consistency**
If multiple databases or schemas exist: verify naming conventions are consistent across all schemas. Check shared identifiers use the same column name and data type (UUID vs integer mismatch is a P0). Verify reference data has a single source of truth. Document cross-schema query patterns (direct queries, API calls, event sync).

**Pass 8: Downstream Readiness**
Verify API contracts can be built on this schema. Check: CRUD operations are straightforward (no 5-table join for a basic read), list/search queries have index support for filtering and pagination, relationship traversal is possible ("get order with line items"), aggregate queries are efficient, write operations map cleanly to table inserts/updates, and soft/hard delete approach is consistent.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| DB-001 | P0 | Pass 1 | [description] | [table/section] |
| DB-002 | P1 | Pass 4 | [description] | [table/section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing entity — fix once
- **Same table**: Findings affecting the same table — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected schema sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/database-schema.md`. For each fix, verify it does not break alignment with domain models or architecture data flows.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break domain model alignment or architecture data flow support
3. Check for normalization or constraint issues introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-database.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Process

1. Read `docs/database-schema.md`, `docs/domain-models/`, and `docs/system-architecture.md`
2. Execute all 8 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-database.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Database schema review findings documented in `docs/reviews/review-database.md`.

**Next:** Run `/scaffold:api-contracts` to define API contracts informed by the reviewed schema.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
