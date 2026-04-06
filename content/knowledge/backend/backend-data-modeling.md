---
name: backend-data-modeling
description: Relational vs document modeling tradeoffs, migration strategies, connection pooling, ORM vs query builder tradeoffs, multi-tenancy patterns, and eventual consistency
topics: [backend, data-modeling, database, migrations, orm, multi-tenancy, eventual-consistency, connection-pooling]
---

Data modeling decisions have the highest reversal cost of any backend choice. A schema design that seemed reasonable at launch can become an operational crisis at scale — queries that worked at 10,000 rows fail at 100 million. The goal is to match the data model to the access patterns of the application, not to normalize for its own sake or to denormalize prematurely. Design the schema with the queries in mind from day one.

## Summary

Data modeling decisions have the highest reversal cost of any backend choice. Choose relational databases for transactional integrity and complex queries, document stores for hierarchical data read as a unit. Use versioned migrations for all schema changes with non-destructive patterns for zero-downtime deploys. Every production backend requires connection pooling; pool exhaustion under load is a complete outage.

Multi-tenancy, eventual consistency, and ORM vs query builder selection are load-bearing choices that must be made with explicit tradeoff acknowledgment before the first schema ships.

## Deep Guidance

### Relational vs Document Modeling

Choose based on your access patterns and data structure, not familiarity:

**Relational (PostgreSQL, MySQL):**
- Strong fit for: highly relational data with many join paths, transactional integrity across multiple entities (financial records, inventory), complex queries with ad hoc filter combinations, strict schema enforcement.
- Use normalized forms (3NF) as the default. Denormalize only for specific, measured performance bottlenecks, not speculatively.
- PostgreSQL's JSONB column type gives you document storage inside a relational database — defer the choice of full document store until the access pattern clearly demands it.

**Document (MongoDB, DynamoDB, Firestore):**
- Strong fit for: hierarchical or nested data read as a unit (a blog post with all its comments), schema-less or rapidly evolving schemas, single-entity lookups by a known ID, extreme write throughput.
- Weak fit for: ad hoc querying across multiple attributes, transactions spanning multiple documents, highly relational data with many access patterns.
- The most common document modeling mistake is replicating relational joins via application-level fetching — this is an N+1 at the data layer and scales poorly.

### Migration Strategies

Every schema change must go through a versioned migration:

- **Non-destructive first**: Add new columns as nullable or with defaults. Only make existing columns NOT NULL after backfilling all rows. This enables zero-downtime deployments where the old and new app versions run simultaneously.
- **Expand-contract pattern**: For large schema changes — (1) expand: add new column/table while keeping old; (2) backfill data; (3) deploy code that writes to both; (4) contract: remove old column/table once all consumers use the new one.
- **Irreversible migrations**: Some changes cannot be undone (dropping a column, deleting data). Flag these explicitly in code and in your migration changelog. Require explicit human sign-off before running in production.
- **Test migrations against production data size**: A migration that runs in 2 ms on 1,000 rows may lock a table for 20 minutes on 100 million rows. Use `pt-online-schema-change` (MySQL) or `pg_repack` / `CREATE INDEX CONCURRENTLY` (PostgreSQL) for zero-lock migrations on large tables.

### Connection Pooling

Every production backend must use a connection pool. Direct connections to the database at high concurrency exhaust database connection limits within minutes:

- **Application-level pooling**: PgBouncer (PostgreSQL), ProxySQL (MySQL), or the ORM's built-in pool (Prisma, Sequelize, Knex). Configure `min`, `max`, and `idleTimeoutMillis`.
- **Right-sizing the pool**: A pool larger than the database can handle is worse than no pool. PostgreSQL supports ~100 active connections by default before performance degrades. Rule of thumb: pool size = (number of CPU cores × 2) + effective spindle count.
- **Monitor pool saturation**: Alert when `waiting_clients` exceeds zero for more than a few seconds. Pool exhaustion under load is a complete service outage.

### ORM vs Query Builder

| | ORM (Prisma, TypeORM, Hibernate) | Query Builder (Knex, JOOQ, Drizzle) |
|---|---|---|
| Productivity | Higher for standard CRUD | Higher for complex SQL |
| Complex queries | Awkward, often forces raw SQL | Natural SQL expression |
| Type safety | High (Prisma) to medium | Medium to high (Drizzle) |
| Performance | Can hide N+1s | Explicit, predictable |
| Migration | Built-in (Prisma) | Manual or separate tool |

Use an ORM for standard CRUD-heavy domains. Use a query builder or raw SQL for analytics, reporting, or any service where query control is critical. Do not mix ORMs in the same service — pick one.

### Multi-Tenancy Patterns

Three approaches, ordered by isolation strength:

- **Shared schema / shared tables**: Row-level isolation via a `tenant_id` column. Simplest to operate; strongest risk of data leakage if a query omits the tenant filter. Always enforce tenant filtering via a middleware or database row-level security (PostgreSQL RLS).
- **Shared database / separate schemas**: Each tenant gets their own schema. Better isolation, more complex migrations (must apply to all tenant schemas), good balance for B2B SaaS.
- **Separate databases per tenant**: Full isolation. High operational overhead — connection pools multiply by tenant count. Justified for enterprise customers with contractual data isolation requirements.

### Eventual Consistency

Distributed systems and event-driven architectures introduce eventual consistency:

- **Identify consistency requirements explicitly**: Which operations require immediate consistency (payment confirmation, inventory reservation) vs eventual (email notification, analytics event)? Document this per use case.
- **Idempotency**: All event consumers and queue workers must be idempotent — processing the same message twice produces the same outcome as processing it once. Use an idempotency key stored in the database to detect duplicates.
- **Sagas for distributed transactions**: When a business operation spans multiple services with no shared transaction, use the Saga pattern — a sequence of local transactions with compensating transactions for rollback. Choreography (event-driven) or orchestration (central coordinator) variants.

### Index Strategy

An unindexed query on a large table is a latency spike and a database lock. Index columns that appear in `WHERE`, `ORDER BY`, `GROUP BY`, and `JOIN ON` clauses. Over-indexing is also a problem — indexes slow writes. Review the query plan (`EXPLAIN ANALYZE`) for every significant query before shipping. Index maintenance is a recurring task, not a one-time setup.

### Soft Deletes vs Hard Deletes

- **Soft deletes**: Add a `deleted_at` timestamp column. Rows are never physically removed; queries filter with `WHERE deleted_at IS NULL`. Benefits: audit trail, easy recovery, referential integrity preserved. Cost: every query must include the filter (use a database view or ORM default scope to enforce this), storage grows indefinitely.
- **Hard deletes**: Rows are physically removed with `DELETE`. Benefits: simpler queries, smaller tables, no filter overhead. Cost: data is gone, referential integrity may break if foreign keys exist.
- **Archive pattern**: Move deleted rows to a separate `_archive` table in the same transaction. Active table stays clean; historical data is preserved. Best of both worlds at the cost of archive table maintenance.

Default to soft deletes for business entities (users, orders, products). Use hard deletes for ephemeral data (sessions, temp tokens, analytics events past retention).

### Data Retention and Purging

Define retention policies explicitly for each table:

- **Regulatory**: Financial records may require 7-year retention. Medical records vary by jurisdiction. Document the legal basis for each retention period.
- **Operational**: Log tables, event tables, and session tables should have automated purging. Use database partitioning by date and drop old partitions — this is orders of magnitude faster than `DELETE WHERE created_at < ?`.
- **Implementation**: Schedule a recurring job (cron, pg_cron, Kubernetes CronJob) that purges expired data. Alert if the job fails silently — unpurged data grows disk usage and degrades query performance over months.

### Query Optimization Fundamentals

Before optimizing, measure. Use `EXPLAIN ANALYZE` (PostgreSQL) or `EXPLAIN FORMAT=JSON` (MySQL) to understand the query plan:

- **Sequential scans on large tables**: Add an index on the filtered column. A sequential scan on a million-row table that should be an index scan is the most common performance bug.
- **Index-only scans**: When the query only needs columns in the index, the database reads the index without touching the table. Use covering indexes (`CREATE INDEX ... INCLUDE (col)`) for frequently queried column combinations.
- **Join order**: The query planner usually picks the right join order, but with 5+ joins, it may choose poorly. Use `EXPLAIN` to verify. If the planner is wrong, consider rewriting as CTEs or materializing intermediate results.
