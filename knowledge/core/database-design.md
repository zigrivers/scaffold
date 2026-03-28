---
name: database-design
description: Database schema design, normalization, indexing, and migration patterns
topics: [database, schema, sql, nosql, migrations, indexing, data-modeling]
---

## From Domain Models to Schema

The domain model defines what the business cares about. The database schema defines how that information is stored. The mapping between them is deliberate, not automatic.

### Mapping Entities to Tables

Each entity in the domain model typically maps to a database table. The entity's attributes become columns. The entity's identity becomes the primary key.

**Identity columns:**

- **UUID/ULID:** Best for distributed systems, no coordination needed. ULIDs add time-ordering which helps with index locality. Use `uuid` or `text` column type.
- **Auto-increment integer:** Simpler, smaller, faster joins. Leaks information (total count, creation order). Requires a single sequence source.
- **Natural key:** Use the business identifier if one exists and is truly immutable (ISBN, country code). Rarely appropriate for mutable business concepts.

**Recommendation:** Default to UUIDs for new projects. They work everywhere, don't leak information, and avoid coordination issues in multi-agent development (two agents can create records simultaneously without ID conflicts).

### Handling Aggregates

An aggregate's internal structure doesn't necessarily map to a single table. Common patterns:

**Single table per aggregate** — When the aggregate is simple (root entity + value objects), store everything in one table with column groups or JSON columns for value objects.

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  -- Shipping address (value object) stored as columns
  shipping_street TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT,
  shipping_country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Multiple tables per aggregate** — When the aggregate has internal entities (e.g., Order with OrderLines), use a parent table and child tables. The child table's foreign key to the parent enforces the aggregate boundary.

```sql
CREATE TABLE order_lines (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The `ON DELETE CASCADE` expresses that order lines have no lifecycle independent of their order — they're internal to the aggregate.

### Representing Value Objects

Value objects have no identity. Storage options:

**Embedded columns** — Store the value object's attributes as columns in the parent entity's table. Best when the value object is always loaded with the entity.

```sql
-- Money value object embedded in order_lines
unit_price_cents INTEGER NOT NULL,
unit_price_currency TEXT NOT NULL DEFAULT 'USD'
```

**JSON/JSONB column** — Store the value object as a JSON document. Best when the value object is complex, rarely queried directly, or has a variable structure.

```sql
metadata JSONB NOT NULL DEFAULT '{}'
```

**Lookup table** — Store value objects with limited valid values in a reference table. Best for enums with associated data (status codes with descriptions, country codes with names).

### Modeling Relationships

**One-to-one:** Use a foreign key in either table (typically the dependent side). Consider: could this be columns in the same table instead?

**One-to-many:** Foreign key on the "many" side referencing the "one" side. The most common relationship type.

**Many-to-many:** Junction table with two foreign keys. Include created_at to track when the relationship was established. Consider whether the junction table needs its own identity (entity) or is purely a relationship (value).

```sql
-- Junction table for many-to-many
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

**Self-referencing:** An entity that relates to other instances of itself (organizational hierarchy, comment threads, category trees). Use a nullable foreign key to the same table.

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

## Normalization Decisions

### Normal Forms in Practice

**First normal form (1NF):** Each column holds atomic values (no arrays, no comma-separated lists). In SQL databases, this is usually enforced by the type system. Exception: PostgreSQL arrays and JSON columns deliberately violate 1NF for good reasons.

**Second normal form (2NF):** Every non-key column depends on the entire primary key, not just part of it. Violations typically appear in tables with composite primary keys.

**Third normal form (3NF):** Every non-key column depends on the primary key, not on another non-key column. Example violation: storing both `zip_code` and `city` when city is determined by zip code.

**Practical rule:** Normalize to 3NF by default. Denormalize deliberately with documented rationale.

### When to Denormalize

Denormalization trades data integrity for read performance. Only do it when:

- You have measured a performance problem (not assumed one)
- The read-to-write ratio strongly favors reads (>10:1)
- The denormalized data has a clear update strategy (triggers, application logic, async sync)
- The inconsistency window is acceptable for the use case

**Common denormalization patterns:**

**Computed columns:** Store a calculated value (order total, item count, average rating) instead of computing it on every read.

```sql
ALTER TABLE orders ADD COLUMN total_cents INTEGER;
-- Updated by application logic when order lines change
```

**Duplicated attributes:** Copy frequently-joined data into the table that reads it. Store `customer_name` in the orders table to avoid joining to customers on every order list query.

**Materialized views / read models:** Create a dedicated read-optimized table (or materialized view) that denormalizes across multiple source tables. Updated asynchronously when source data changes.

### Read Model vs. Write Model Separation

In complex domains, the shape of data for writing (enforcing invariants) differs from the shape for reading (displaying to users). Separating these concerns:

- **Write model:** Normalized, invariant-enforcing, aggregate-aligned. Optimized for correctness.
- **Read model:** Denormalized, query-optimized, possibly pre-aggregated. Optimized for speed.

This doesn't require full CQRS — it can be as simple as a materialized view or a denormalized table refreshed by triggers.

## Indexing Strategy

### Primary Keys

Every table must have a primary key. The primary key automatically gets a unique index.

- Use UUID or ULID for application-generated IDs
- Use `SERIAL`/`BIGSERIAL` only for internal sequences (migration version numbers, internal counters)
- Composite primary keys are appropriate for junction tables; avoid them for entity tables

### Foreign Keys

Every foreign key should reference a primary key or unique constraint on the target table. Foreign keys automatically enforce referential integrity.

**Cascade behavior decisions:**

- `ON DELETE CASCADE` — When the parent is deleted, delete the children. Appropriate for aggregate internals (order lines deleted with order).
- `ON DELETE SET NULL` — When the parent is deleted, null out the reference. Appropriate for optional relationships.
- `ON DELETE RESTRICT` (default) — Prevent parent deletion if children exist. Appropriate when orphaned children would be a data integrity problem.

Foreign key columns should almost always be indexed. Without an index, any operation on the parent table requires a full scan of the child table to check for references.

### Covering Indexes

A covering index contains all columns needed to satisfy a query, eliminating the need to access the table's heap. Useful for frequently-executed queries with predictable column access patterns.

```sql
-- Covers: SELECT id, status, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC
CREATE INDEX idx_orders_customer_status ON orders (customer_id, created_at DESC)
  INCLUDE (status);
```

### Partial Indexes

An index on a subset of rows, defined by a WHERE clause. Smaller, faster, and more specific than a full-table index.

```sql
-- Only index active subscriptions (most queries filter for active)
CREATE INDEX idx_active_subscriptions ON subscriptions (user_id, plan_id)
  WHERE status = 'active';
```

### Composite Indexes

Multi-column indexes follow the "leftmost prefix" rule: the index on `(a, b, c)` can satisfy queries filtering on `a`, `a + b`, or `a + b + c`, but not `b` or `c` alone.

**Column order matters:** Put the most selective column first (the one that eliminates the most rows). For range queries, put the equality column first, then the range column.

```sql
-- For queries: WHERE tenant_id = ? AND created_at > ?
-- tenant_id (equality) comes before created_at (range)
CREATE INDEX idx_events_tenant_date ON events (tenant_id, created_at);
```

### Deriving Index Needs from Query Patterns

Before creating indexes, enumerate the application's query patterns:

| Query | Used By | Frequency | Current Performance |
|-------|---------|-----------|-------------------|
| Orders by customer, newest first | Order list page | High | Needs index |
| Active subscriptions by user | Auth middleware | Every request | Critical path |
| Products by category with price range | Browse page | High | Needs composite index |

Create indexes to cover the high-frequency and critical-path queries. Resist creating indexes for every possible query — each index slows down writes and consumes storage.

### Index Anti-Patterns

- **Over-indexing:** An index for every column. Slows writes, wastes storage, confuses the query planner.
- **Redundant indexes:** An index on `(a)` when an index on `(a, b)` already exists. The composite index covers single-column queries on `a`.
- **Unused indexes:** Indexes created during development that no query uses. Audit with `pg_stat_user_indexes` (PostgreSQL) or equivalent.

## Constraint Design

### CHECK Constraints from Domain Invariants

Every domain invariant that can be expressed as a column-level or row-level constraint should be:

```sql
-- Domain invariant: quantity must be positive
quantity INTEGER NOT NULL CHECK (quantity > 0)

-- Domain invariant: end date must be after start date
CHECK (end_date > start_date)

-- Domain invariant: status must be one of defined values
status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'suspended', 'cancelled'))

-- Domain invariant: discount percentage between 0 and 100
discount_percent NUMERIC NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100)
```

### Unique Constraints from Business Rules

Business rules that require uniqueness should be enforced at the database level, not just the application level:

```sql
-- Business rule: email must be unique per tenant
ALTER TABLE users ADD CONSTRAINT uq_users_tenant_email
  UNIQUE (tenant_id, email);

-- Business rule: only one active subscription per user
CREATE UNIQUE INDEX uq_one_active_sub ON subscriptions (user_id)
  WHERE status = 'active';
```

### Foreign Key Constraints from Relationships

Every relationship in the domain model should have a corresponding foreign key constraint. Unconstrained references allow orphaned data.

### NOT NULL Discipline

Default to `NOT NULL` for every column. Allow NULL only when the domain explicitly models the absence of a value (e.g., "user has not set a phone number"). If NULL is allowed, document what it means.

**Anti-pattern: NULL as a default.** Columns that allow NULL because nobody thought about whether the value is optional. This leads to unexpected NULLs propagating through queries and application logic.

## Migration Patterns

### Schema Versioning

Every schema change is a migration with a unique version identifier. Migrations are ordered and applied sequentially. Common approaches:

- **Timestamp-based:** `20260314120000_create_users.sql` — prevents ordering conflicts between developers
- **Sequential:** `001_create_users.sql`, `002_add_orders.sql` — simpler but conflicts when two developers create the next migration simultaneously

### Backwards-Compatible Migrations

Migrations that can be applied without breaking the running application:

**Safe operations:**
- Adding a column with a default value or allowing NULL
- Adding a new table
- Adding an index (CONCURRENTLY in PostgreSQL)
- Adding a CHECK constraint (NOT VALID initially, then VALIDATE separately)

**Unsafe operations (require coordination):**
- Dropping a column (application may still reference it)
- Renaming a column (breaks existing queries)
- Changing a column type (may fail if data can't be converted)
- Adding a NOT NULL constraint to an existing column with NULL values

### Data Migrations

Schema changes that also require data transformation:

```sql
-- Schema migration: add new column
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Data migration: populate from existing columns
UPDATE users SET full_name = first_name || ' ' || last_name;

-- Schema migration: make it non-nullable after population
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
```

Data migrations should be idempotent (safe to run twice) and tested with production-like data volumes. A migration that runs in 1 second on 1000 rows may take 30 minutes on 10 million rows.

### Rollback Strategies

Every migration should have a reverse migration (down migration). Test rollbacks before deploying:

```sql
-- Up: add status column
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';

-- Down: remove status column (data loss — document this)
ALTER TABLE orders DROP COLUMN status;
```

Some migrations are irreversible (dropping a column deletes data permanently). Document these clearly and ensure backups exist before running.

### Zero-Downtime Migrations

For production systems that cannot tolerate downtime:

1. **Expand:** Add new column/table without removing old one
2. **Migrate:** Dual-write to both old and new. Backfill historical data.
3. **Contract:** Remove old column/table after verification

This three-phase approach prevents data loss and allows rollback at each step.

## NoSQL Considerations

### When to Use NoSQL

- **Document databases (MongoDB, DynamoDB):** When the data is naturally document-shaped, schema varies between records, or you need horizontal scaling for simple key-value or key-document access patterns.
- **Key-value stores (Redis, Memcached):** Caching, session storage, rate limiting. Not a primary data store.
- **Wide-column stores (Cassandra, ScyllaDB):** Time-series data, write-heavy workloads, multi-region replication.
- **Graph databases (Neo4j):** When the primary queries traverse relationships (social networks, recommendation engines, fraud detection).

### Document Design

In document databases, design around query patterns rather than entity relationships:

**Embedding vs. referencing:**

- **Embed** when the child data is always read with the parent, has a bounded size, and doesn't need independent access. Example: embed OrderLines within an Order document.
- **Reference** when the child data has its own lifecycle, is accessed independently, or could grow unboundedly. Example: reference User from Order by ID.

**Denormalization by default:** Document databases expect denormalized data. Duplicating data across documents is normal and expected. The trade-off: faster reads, more complex writes (must update all copies).

### Partition Key Selection

For distributed databases (DynamoDB, Cassandra), the partition key determines data distribution and query capability:

- Choose a partition key with high cardinality (many distinct values) for even distribution
- Queries must include the partition key — design around your access patterns
- Avoid hot partitions (one key receiving disproportionate traffic)
- Common choices: tenant_id, user_id, date-based for time-series

## Common Pitfalls

**Over-normalization.** Splitting every concept into its own table produces a schema that requires 10 joins to answer a simple question. The join cost exceeds any benefit from reduced data duplication. Fix: denormalize when read patterns consistently need the joined data.

**Missing indexes for common queries.** Every page load runs a full table scan because nobody added an index for the query that drives it. Fix: enumerate query patterns before deployment. Add indexes for high-frequency queries.

**Migration ordering issues.** Two developers create migrations that conflict — both add a column with the same name, or one depends on a table the other creates. Fix: use timestamp-based migration names. Review migration PRs for conflicts. In parallel agent development, sequence migrations through task dependencies.

**Not testing rollbacks.** A migration runs successfully in development but the rollback fails in staging, leaving the database in an inconsistent state. Fix: every migration must have a tested rollback. Include rollback testing in CI.

**Storing money as floating point.** `FLOAT` and `DOUBLE` cannot represent all decimal values exactly. `19.99` becomes `19.989999999999998`. Fix: store money as integer cents or use `DECIMAL`/`NUMERIC` types.

**Missing timestamps.** Tables without `created_at` and `updated_at` columns. When something goes wrong, you can't tell when the data was created or last changed. Fix: add timestamp columns to every table, populated automatically by defaults or triggers.

**Allowing unbounded growth in aggregate tables.** An events or logs table that grows without limit, eventually consuming all storage and degrading query performance. Fix: define a retention policy and implement it (archival, partitioning, or deletion).

**Using the database as a message queue.** Polling a table for new rows to process. This creates lock contention, wastes resources, and scales poorly. Fix: use a proper message queue (Redis, RabbitMQ, SQS) for event-driven processing.

## See Also

- [domain-modeling](../core/domain-modeling.md) — Domain entities map to database schema
