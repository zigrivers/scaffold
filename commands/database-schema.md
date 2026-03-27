---
description: "Design database schema from domain models with indexes, constraints, and migrations"
long-description: "Reads domain models and architecture, then creates docs/database-schema.md defining tables, relationships, indexes, constraints, normalization decisions, and migration strategy."
---

Read `docs/domain-models/`, `docs/system-architecture.md`, `docs/adrs/`, and `docs/plan.md`, then design the database schema. Create `docs/database-schema.md` translating domain entities into concrete tables/collections with relationships, indexes, constraints, and a migration strategy.

## Mode Detection

Before starting, check if `docs/database-schema.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:database-schema v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing schema against what this prompt would produce fresh. Categorize:
   - **ADD** — Tables, indexes, or constraints missing from existing schema
   - **RESTRUCTURE** — Exists but doesn't match current domain models or best practices
   - **PRESERVE** — Project-specific denormalization decisions, custom indexes, migration history
3. **Cross-doc consistency**: Read related docs and verify schema aligns with current domain models and architecture. Skip any that don't exist.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Update schema, respecting preserve rules.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:database-schema v<ver> <date> -->`
7. **Post-update summary**: Report tables added, sections restructured, content preserved, and cross-doc issues.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/database-schema.md`
- **Preserve**: Denormalization decisions with documented rationale, custom indexes with query pattern justification, migration history, seed data strategy
- **Related docs**: `docs/domain-models/`, `docs/system-architecture.md`, `docs/adrs/`
- **Special rules**: Never remove an index without verifying it's unused. Preserve all migration files and rollback strategies. Keep denormalization rationale intact.

---

## What the Document Must Cover

### 1. Entity-to-Table Mapping

For each domain entity, define the corresponding table:

**Identity columns** — default to UUIDs for new projects (no coordination issues in multi-agent development). Use ULID if time-ordering helps index locality. Auto-increment only for internal sequences.

**Column definitions** with types, nullability, and defaults:
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Timestamp discipline** — every table gets `created_at` and `updated_at` columns. Always.

**NOT NULL discipline** — default to `NOT NULL` for every column. Allow NULL only when the domain explicitly models absence. Document what NULL means when allowed.

### 2. Aggregate Handling

- **Single table per simple aggregate**: Root entity + value objects stored as column groups or JSONB.
- **Multiple tables per complex aggregate**: Parent table + child tables with foreign key expressing the boundary. Use `ON DELETE CASCADE` for aggregate internals.
- **Value objects**: Embed as columns (always loaded with entity), JSONB (complex/rarely queried), or lookup table (limited valid values).

### 3. Relationships

- **One-to-one**: Foreign key on dependent side. Consider if it should be columns in the same table.
- **One-to-many**: Foreign key on the "many" side.
- **Many-to-many**: Junction table with two foreign keys and `created_at`.
- **Self-referencing**: Nullable foreign key to the same table (hierarchies, trees).

Every relationship in the domain model must have a corresponding foreign key constraint.

### 4. Normalization Decisions

Normalize to 3NF by default. Document every deliberate denormalization with:
- What is denormalized and why
- The read-to-write ratio that justifies it
- The update strategy (triggers, application logic, async sync)
- The acceptable inconsistency window

Common patterns: computed columns (order totals), duplicated attributes (customer name on orders), materialized views.

### 5. Indexing Strategy

**Derive indexes from query patterns.** Before creating indexes, enumerate the application's queries:

| Query | Used By | Frequency | Index Needed |
|-------|---------|-----------|-------------|
| Orders by customer, newest first | Order list page | High | `(customer_id, created_at DESC)` |
| Active subscriptions by user | Auth middleware | Every request | `(user_id) WHERE status = 'active'` |

**Index types to consider:**
- Foreign key indexes (almost always needed)
- Covering indexes (INCLUDE columns to avoid heap access)
- Partial indexes (WHERE clause for hot subsets)
- Composite indexes (leftmost prefix rule — equality columns first, then range columns)

**Anti-patterns to avoid:** Over-indexing, redundant indexes, unused indexes.

### 6. Constraint Design

- **CHECK constraints** from domain invariants: `quantity > 0`, `end_date > start_date`, status enums
- **UNIQUE constraints** from business rules: unique email per tenant, one active subscription per user
- **Foreign key constraints** from every relationship
- **Money**: Store as integer cents or DECIMAL/NUMERIC — never floating point

### 7. Migration Strategy

- **Schema versioning**: Timestamp-based migration names (`20260314120000_create_users.sql`)
- **Backwards-compatible migrations**: Safe operations (add column, add table, add index CONCURRENTLY) vs. unsafe operations (drop column, rename column, change type)
- **Data migrations**: Idempotent, tested with production-like data volumes
- **Rollback strategy**: Every migration has a tested reverse migration. Document irreversible migrations clearly.
- **Zero-downtime pattern**: Expand -> Migrate (dual-write + backfill) -> Contract

### 8. NoSQL Considerations (if applicable)

If the project uses a document database:
- Design around query patterns, not entity relationships
- Embedding vs. referencing decision for each relationship
- Partition key selection for distributed databases
- Denormalization is expected — document the update strategy for duplicated data

---

## Quality Criteria

- Every domain entity maps to a table/collection (or has a justified denormalization)
- Relationships match domain model relationships exactly
- Indexes cover all known query patterns from architecture data flows
- Constraints enforce domain invariants at the database level
- Migration strategy handles schema evolution with rollback
- Money is never stored as floating point
- Every table has timestamp columns
- NULL is only allowed with documented meaning

---

## Process

1. **Read all inputs** — Read `docs/domain-models/`, `docs/system-architecture.md`, and `docs/adrs/` completely.
2. **Use AskUserQuestionTool** for these decisions:
   - **Database engine**: Confirm the database choice from ADRs (PostgreSQL, SQLite, MongoDB, etc.)
   - **Schema depth**: Full CREATE TABLE statements with index justification, or entity-to-table mapping with key relationships?
   - **Migration tooling**: Preferred migration tool (Prisma, Drizzle, Alembic, raw SQL, etc.)?
3. **Use subagents** to research schema patterns for the project's database engine and ORM
4. **Map entities to tables** — translate every domain entity, value object, and relationship
5. **Design indexes** — enumerate query patterns from data flows, create covering indexes for high-frequency queries
6. **Define constraints** — translate every domain invariant to a database constraint
7. **Document migration strategy** — including rollback and zero-downtime patterns
8. **Cross-validate** — verify every domain entity is represented, every relationship has a FK, every invariant has a constraint
9. If using Beads: create a task (`bd create "docs: database schema" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)

## After This Step

When this step is complete, tell the user:

---
**Specification phase in progress** — `docs/database-schema.md` created with tables, indexes, constraints, and migration strategy.

**Next:** Run `/scaffold:api-contracts` — Define API contracts for all system interfaces, or `/scaffold:ux-spec` — Specify the user experience.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
