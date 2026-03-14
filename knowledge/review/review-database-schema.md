---
name: review-database-schema
description: Failure modes and review passes specific to database schema design artifacts
topics: [review, database, schema, data-modeling]
---

# Review: Database Schema

The database schema translates domain entities and their relationships into persistent storage structures. It must faithfully represent domain models while also optimizing for real query patterns, enforcing invariants through constraints, and providing safe migration paths. This review uses 8 passes targeting the specific ways database schema designs fail.

Follows the review process defined in `review-methodology.md`.

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

API contracts (Phase 5) can be built on this schema. The schema provides everything needed to design API endpoints, query patterns, and response shapes.

### Why This Matters

API endpoints translate database operations into client-facing contracts. If the schema cannot efficiently serve the queries that API endpoints need, the API layer must work around schema limitations — adding application-level joins, filtering, or transformations that belong in the database.

### How to Check

Phase 5 (API Contracts) specifically needs:
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
