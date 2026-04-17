---
name: multi-service-data-ownership
description: Table ownership, shared-nothing data patterns, and event-driven synchronization
topics: [table-ownership, shared-nothing, event-driven-sync, data-partitioning, eventual-consistency]
---

## Summary

Data ownership is the most consequential architectural decision in a multi-service system. Getting it wrong causes cascading failures, data inconsistency, and coupling that defeats the purpose of service decomposition.

**Core principle:** Each service owns its data exclusively — no service reads another service's database directly, and no two services write to the same table.

**Data isolation levels** (strongest to weakest): separate clusters, separate databases, separate schemas, table prefix within a shared schema (not recommended).

**Cross-boundary data access patterns:**
- **Synchronous API call:** Simple but adds latency and temporal coupling.
- **Event-driven projection:** Service subscribes to events and maintains a local read-optimized copy. Eliminates runtime dependency but introduces eventual consistency.
- **API composition:** Gateway fans out to multiple services and merges results.

**Reliable event publishing** requires the outbox pattern: write the event to an `outbox` table in the same database transaction as the state change, then a relay process publishes to the message broker. This prevents the dual-write problem (lost or phantom events).

**Eventual consistency** is non-negotiable in event-driven systems. Design for it: define lag budgets per data type, make all event consumers idempotent, and implement explicit conflict resolution rules.

**Event schemas are public API:** never remove fields, never change field meaning, add only optional fields for backward-compatible evolution, and introduce new event type versions for breaking changes.

## Deep Guidance

## Shared-Nothing Data Patterns

### The Shared-Nothing Principle

Each service owns its data exclusively. No service reads another service's database directly. No two services write to the same table. This is the foundational rule of multi-service data architecture.

**What shared-nothing means in practice:**
- Service A's Postgres instance is not accessible to service B — different credentials, different connection strings, potentially different infrastructure.
- Service A's database schema is an implementation detail of service A. Other teams do not get schema access.
- Service A's ORM models and migration files are not importable from service B's codebase.

**What shared-nothing does NOT mean:**
- Services cannot share a physical database server (they can — using separate schemas or separate databases on the same instance, in a cost-conscious environment).
- Services cannot share a cache like Redis (they can, using separate key namespaces).
- Data cannot flow between services (it can — through APIs and events).

**Enforcing shared-nothing:**
- CI/CD linting rule: no cross-service ORM model imports.
- Database credentials are distributed per-service — the order service's DB password is never in the user service's environment.
- Integration tests verify that removing service B does not break service A's database operations (only service A's API calls to B would break).

### Data Isolation Levels

From strongest to weakest isolation (choose based on team size, cost, and compliance requirements):

| Level | Isolation | Cost | Use When |
|---|---|---|---|
| Separate clusters | Fully independent DB instances | High | PCI/HIPAA compliance, dramatically different scaling, full blast-radius isolation |
| Separate databases | Same cluster, different databases | Medium | Strong isolation without full infrastructure cost |
| Separate schemas | Same database, different schemas | Low | Small teams, cost-sensitive, still provides logical separation |
| Same schema, table prefix | Weakest logical separation | Lowest | Not recommended — one migration can affect all services |

### Table Ownership Mapping

Create an explicit ownership registry. Every table in your system must have one owning service. If a table doesn't have a clear owner, the boundary is drawn incorrectly.

```yaml
# data-ownership.yaml — committed to the monorepo root
# Single source of truth for data ownership decisions

services:
  user-service:
    owns:
      - users
      - user_profiles
      - email_verifications
      - sessions
      - password_reset_tokens
    publishes_events:
      - user.registered
      - user.email_verified
      - user.profile_updated
      - user.deactivated
    reads_from_apis:
      - order-service: [GET /orders?userId=]  # for user dashboard

  order-service:
    owns:
      - orders
      - order_items
      - order_status_history
    publishes_events:
      - order.placed
      - order.confirmed
      - order.fulfilled
      - order.cancelled
    reads_from_apis:
      - catalog-service: [GET /products/:id]  # price/availability check at placement
      - user-service: [GET /users/:id]        # shipping address at placement

  catalog-service:
    owns:
      - products
      - product_variants
      - categories
      - pricing_rules
    publishes_events:
      - product.created
      - product.price_changed
      - product.discontinued
    reads_from_apis: []  # catalog is a leaf service — no upstream dependencies

  inventory-service:
    owns:
      - inventory_levels
      - reservations
      - warehouse_locations
    publishes_events:
      - inventory.reserved
      - inventory.released
      - inventory.low_stock
      - inventory.out_of_stock
    reads_from_apis:
      - catalog-service: [GET /products/:id]  # product metadata
```

When you fill in this registry and find ambiguity — a table that "could" belong to two services — that ambiguity is a design signal. Either the table belongs to one service and the other service accesses it via API, or the services should be merged.

## Event-Driven Data Sync Strategies

### The Outbox Pattern

The most reliable way to publish events from a service: write the event to an `outbox` table in the same database transaction as the state change, then a background process reads the outbox and publishes to the message broker.

**Why outbox is necessary:**
Without it, you face the dual-write problem: write to DB, then publish to Kafka. If the publish fails after the DB write, the event is lost. If the DB write fails after the publish, the event is published for a change that never happened. The outbox solves this by making both the state change and the event record part of the same ACID transaction.

```sql
-- Outbox table schema (per-service, in the service's own database)
CREATE TABLE outbox_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id  UUID        NOT NULL,
  aggregate_type TEXT       NOT NULL,  -- e.g., 'Order', 'User'
  event_type    TEXT        NOT NULL,  -- e.g., 'order.placed'
  payload       JSONB       NOT NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,           -- NULL = not yet published
  failed_at     TIMESTAMPTZ,
  retry_count   INT         NOT NULL DEFAULT 0
);

CREATE INDEX outbox_events_unpublished_idx
  ON outbox_events (created_at)
  WHERE published_at IS NULL AND failed_at IS NULL;
```

**Outbox publishing flow:**

```
1. Application transaction:
   BEGIN;
   UPDATE orders SET status = 'confirmed' WHERE id = $1;
   INSERT INTO outbox_events (aggregate_id, aggregate_type, event_type, payload)
     VALUES ($1, 'Order', 'order.confirmed', $2);
   COMMIT;

2. Outbox relay process (runs every 100ms):
   SELECT * FROM outbox_events
   WHERE published_at IS NULL AND failed_at IS NULL
   ORDER BY created_at
   LIMIT 100;

3. For each event:
   publish_to_kafka(event);
   UPDATE outbox_events SET published_at = now() WHERE id = $event_id;
```

**Trade-offs:**
- (+) Exactly-once event publishing tied to the state change. No lost or phantom events.
- (+) Events are ordered within an aggregate (sequential IDs, ordered by created_at).
- (+) The outbox is a queryable audit log of all published events.
- (-) Adds a background relay process to every service.
- (-) Outbox table grows without cleanup — add a retention policy (delete events older than N days after publication).
- (-) Slight latency: events are published within the relay poll interval, not instantaneously.

### Event-Driven Projections (Read Replicas)

When service A frequently needs data owned by service B, rather than calling B's API on every request, service A subscribes to B's events and maintains a local projection (a read-optimized copy of the subset of B's data that A needs).

**Example: Order service needs user shipping addresses**

Without projection: every order placement triggers a synchronous call to user-service to fetch the address.

With projection: order-service subscribes to `user.profile_updated` events and maintains a local `user_shipping_addresses` table. Order placement reads from this local table — no synchronous dependency on user-service.

```typescript
// Order service: event handler for user profile updates
async function handleUserProfileUpdated(event: UserProfileUpdatedEvent): Promise<void> {
  const { userId, shippingAddress } = event.payload;

  await db.query(`
    INSERT INTO user_shipping_addresses (user_id, street, city, state, postal_code, country, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) DO UPDATE SET
      street      = EXCLUDED.street,
      city        = EXCLUDED.city,
      state       = EXCLUDED.state,
      postal_code = EXCLUDED.postal_code,
      country     = EXCLUDED.country,
      updated_at  = EXCLUDED.updated_at
  `, [
    userId,
    shippingAddress.street,
    shippingAddress.city,
    shippingAddress.state,
    shippingAddress.postalCode,
    shippingAddress.country,
    new Date()
  ]);
}
```

**Trade-offs:**
- (+) Eliminates runtime dependency on user-service for order placement. Order service works even if user-service is down.
- (+) Local reads are faster than cross-service API calls.
- (-) The projection is eventually consistent — there's a lag between a user updating their address and the order service seeing it (usually milliseconds to seconds, but could be longer if the consumer lags).
- (-) Schema must be managed carefully: if user-service changes the event payload, order-service's handler must be updated.
- (-) The projection table needs to be bootstrapped when first deployed (snapshot + replay historical events, or call the API to seed initial data).

### Event Schema Management

Events are the public API of a service. They must be versioned and evolved carefully.

**Event schema rules:**
1. **Never remove fields from a published event.** Consumers may depend on any field.
2. **Never change the meaning of an existing field.** Rename by adding a new field alongside the old one.
3. **Adding optional fields is backward-compatible.** Consumers that don't know about the new field ignore it.
4. **Introduce new event types for breaking changes.** Publish `order.placed.v2` alongside `order.placed.v1` during a migration window; deprecate v1 after all consumers are updated.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "order.placed",
  "description": "Published when a customer places a new order",
  "version": "1.2.0",
  "type": "object",
  "required": ["eventId", "eventType", "timestamp", "aggregateId", "payload"],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid",
      "description": "Unique event identifier — use for idempotency"
    },
    "eventType": {
      "type": "string",
      "const": "order.placed"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "aggregateId": {
      "type": "string",
      "format": "uuid",
      "description": "The order ID"
    },
    "payload": {
      "type": "object",
      "required": ["customerId", "items", "totalAmountCents", "currency"],
      "properties": {
        "customerId": { "type": "string", "format": "uuid" },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["productId", "quantity", "unitPriceCents"],
            "properties": {
              "productId": { "type": "string" },
              "quantity": { "type": "integer", "minimum": 1 },
              "unitPriceCents": { "type": "integer", "minimum": 0 }
            }
          }
        },
        "totalAmountCents": { "type": "integer", "minimum": 0 },
        "currency": { "type": "string", "pattern": "^[A-Z]{3}$" },
        "shippingAddressId": {
          "type": "string",
          "format": "uuid",
          "description": "Added in v1.1.0 — optional for backward compatibility"
        }
      }
    }
  }
}
```

## Cross-Service Query Patterns

### API Composition

A gateway or BFF assembles responses from multiple services in parallel, then merges the results for the client.

**When to use:** Read-heavy endpoints that need data from multiple services for a single screen. The composition is done at the edge (gateway/BFF) rather than in any individual service.

**Implementation:**
```
GET /api/v1/dashboard
  → Parallel requests (fan-out):
      order-service:    GET /orders?userId=123&limit=5   → recent orders
      user-service:     GET /users/123                   → user profile
      catalog-service:  GET /products?featured=true      → featured products
  → Merge results into single response
  ← 200 OK { user: {...}, recentOrders: [...], featured: [...] }
```

**Trade-offs:**
- (+) No data replication — always reads current data from each service.
- (+) Simple to implement at the BFF layer.
- (-) Response time = slowest service + network overhead.
- (-) If any upstream service fails, the composed response fails or degrades.
- (-) Doesn't scale to complex queries (filtering, sorting, pagination across services).

### CQRS (Command Query Responsibility Segregation)

Separate the write model (commands that change state) from the read model (queries optimized for reads). The read model is a denormalized projection maintained by consuming events.

**CQRS in a multi-service context:**

The write side lives in service A (owns the data, enforces invariants). The read side is a separate projection — either in service A (separate read DB) or in a dedicated read service that consumes service A's events.

```typescript
// CQRS read model: Search service consumes events to maintain a product search index

// Write side: catalog-service handles product mutations
// catalog-service publishes events: product.created, product.updated, product.discontinued

// Read side: search-service consumes events and maintains Elasticsearch index
class ProductSearchProjection {
  async handleProductCreated(event: ProductCreatedEvent): Promise<void> {
    await this.searchClient.index({
      index: 'products',
      id: event.payload.productId,
      document: {
        id:          event.payload.productId,
        name:        event.payload.name,
        description: event.payload.description,
        price:       event.payload.priceCents / 100,
        category:    event.payload.categorySlug,
        tags:        event.payload.tags,
        inStock:     true,  // default; updated by inventory events
        indexedAt:   new Date().toISOString()
      }
    });
  }

  async handleInventoryOutOfStock(event: InventoryOutOfStockEvent): Promise<void> {
    await this.searchClient.update({
      index: 'products',
      id: event.payload.productId,
      doc: { inStock: false }
    });
  }
}

// Query side: users query search-service for product discovery
// GET /search?q=shoes&category=footwear&inStock=true
// → Elasticsearch query — fast, full-text, faceted — no joins needed
```

**Trade-offs:**
- (+) Read models are optimized for their specific query patterns — no impedance mismatch.
- (+) Read and write sides scale independently.
- (+) Multiple read models can consume the same events for different query patterns.
- (-) Eventual consistency: writes appear in the read model after event propagation delay.
- (-) More moving parts: write DB + event bus + read DB + projection consumer.
- (-) Projection failures must be monitored and recovered (consumer lag, dead-letter events).

### Saga Pattern for Cross-Service Writes

When a business transaction spans multiple services, coordinate it with a saga — a sequence of local transactions, each publishing events to trigger the next step. If any step fails, compensating transactions undo previous steps.

**Choreography saga (event-driven, no central coordinator):**
```
1. order-service:    order.placed →
2. inventory-service: inventory.reserved (or inventory.insufficient) →
3. payment-service:   payment.processed (or payment.failed) →
4. order-service:    order.confirmed

On failure at step 3 (payment failed):
payment.failed →
inventory-service: releases reservation (compensating transaction)
order-service: cancels order
```

**Orchestration saga (central coordinator):**
```
OrderSaga (coordinator):
  1. Command inventory-service: ReserveInventory
     ← InventoryReserved or InventoryInsufficient
  2. If reserved: Command payment-service: ProcessPayment
     ← PaymentProcessed or PaymentFailed
  3. If paid: Command order-service: ConfirmOrder
     ← OrderConfirmed
  On failure: issue compensating commands in reverse order
```

**Trade-offs of choreography:**
- (+) No central coordinator — services are decoupled.
- (-) Saga flow is distributed across service event handlers — hard to visualize and debug.
- (-) Adding a new step requires changing multiple services.

**Trade-offs of orchestration:**
- (+) Saga flow is in one place — the orchestrator. Easier to reason about.
- (+) Easier to add steps, error handling, and timeouts.
- (-) Orchestrator service is a potential bottleneck and single point of failure.
- (-) Orchestrator must be highly available and idempotent.

**Rule:** Use choreography for simple 2-3 step flows. Use orchestration for flows with 4+ steps, complex branching, or strict timeout requirements.

## Eventual Consistency Handling

### Designing for Lag

Eventual consistency means there is a window of time during which different services have different views of the same fact. Design the user experience and business logic to tolerate this lag.

**Lag budgets:** Define the acceptable consistency window for each data flow.

| Data Type | Acceptable Lag | Pattern |
|---|---|---|
| Shopping cart → order totals | < 100ms | Synchronous API call |
| Product price display | < 5 minutes | Event-driven projection with short TTL |
| Inventory count display | < 1 minute | Event-driven projection |
| User activity feed | < 10 minutes | CQRS read model |
| Analytics dashboard | Hours | Batch ETL acceptable |

### Idempotency

Every event consumer and API mutation must be idempotent — processing the same event twice produces the same result as processing it once. This is non-negotiable in eventual consistency systems because at-least-once delivery means duplicate delivery is guaranteed to happen.

**Idempotency implementation patterns:**

1. **Natural idempotency:** The operation is inherently idempotent. `UPDATE users SET email = $1 WHERE id = $2` — running it 10 times produces the same result as running it once.

2. **Idempotency key table:** For operations that are not naturally idempotent (e.g., sending an email, charging a card), record the idempotency key and skip reprocessing if already done.

```sql
CREATE TABLE processed_events (
  event_id    UUID        PRIMARY KEY,
  event_type  TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In the event handler:
BEGIN;
INSERT INTO processed_events (event_id, event_type)
VALUES ($eventId, $eventType)
ON CONFLICT (event_id) DO NOTHING;

-- Check if the insert was a no-op (already processed)
GET DIAGNOSTICS rows_affected = ROW_COUNT;
IF rows_affected = 0 THEN
  ROLLBACK;
  RETURN;  -- Skip duplicate
END IF;

-- Perform the actual work
-- ...
COMMIT;
```

3. **Optimistic locking with version:** For state machines (order status transitions), only apply the transition if the entity's current version matches what the event was generated against.

### Conflict Resolution

When the same data can be modified by multiple services or clients concurrently, define explicit conflict resolution rules.

**Last-writer-wins (LWW):** The update with the most recent timestamp wins. Simple but can silently discard updates.

**Vector clocks:** Track causality across distributed writes. Complex to implement but preserves all updates.

**Domain-specific merge:** Inventory counts use addition/subtraction rather than SET — `UPDATE inventory SET quantity = quantity - $reserved WHERE product_id = $1` is conflict-safe in ways that `UPDATE inventory SET quantity = $new_quantity WHERE product_id = $1` is not.

## Data Migration Between Services

### When to Migrate Data Between Services

Service boundary changes are expensive but sometimes necessary:

- A table that belongs to two services (wrong boundary) needs to be moved to one.
- A service is being split (feature extraction) and some tables belong to the new service.
- A service is being merged (two services are always deployed together) and their data stores need to be consolidated.

### Migration Strategy: Parallel Write, Incremental Cutover

Never do a big-bang migration. Use incremental cutover with a parallel write phase.

**Phase 1: Dual write.** The owning service writes to both the old location and the new location simultaneously. Reads still go to the old location. This establishes confidence that the new location is getting complete data.

**Phase 2: Backfill.** Migrate historical data from the old location to the new location. Validate completeness (row counts, checksums on key fields).

**Phase 3: Read switchover.** Switch reads to the new location. Keep dual writes active. Monitor for errors.

**Phase 4: Stop old writes.** Remove the write to the old location. The new location is now authoritative.

**Phase 5: Cleanup.** After a validation period, delete the old table/schema and remove any migration scaffolding.

```
Timeline:
  Day 0:  Deploy dual-write. New writes go to both old and new DB.
  Day 1:  Run backfill job for historical data.
  Day 2:  Validate: compare row counts and sample records.
  Day 3:  Switch reads to new DB. Monitor error rates.
  Day 7:  Stop writes to old DB. New DB is authoritative.
  Day 14: Delete old table. Remove migration code.
```

### Data Partitioning for Tenancy

In multi-tenant systems, data can be partitioned at different levels:

**Schema-per-tenant:** Each tenant gets their own schema (within a shared database). Strong isolation for compliance, simple to backup/restore per tenant. Operational overhead scales with tenant count.

**Row-level tenant isolation:** All tenants share tables; every table has a `tenant_id` column. Row-level security (Postgres RLS) enforces isolation in the database. Simple to operate but cross-tenant isolation depends on correct query predicates.

**Database-per-tenant (silo model):** Maximum isolation. Required for compliance contexts (healthcare, finance). Highest operational cost — N databases to manage.

**Rule:** Start with row-level isolation (simplest to operate). Move to schema-per-tenant if a tenant's data volume or compliance requirements demand it. Move to database-per-tenant only for enterprise/regulated customers.

## Common Pitfalls

**Sharing database credentials across services.** Service A should not have connection credentials for service B's database. This is the shared-nothing violation most commonly enforced informally rather than technically. Fix: use a secrets manager (Vault, AWS Secrets Manager) that distributes credentials per-service, never in shared environment files.

**Missing idempotency on event consumers.** "We have at-least-once delivery, but we've designed consumers assuming exactly-once." This causes duplicate emails, double charges, and inventory over-releases. Fix: idempotency keys table in every event consumer before any non-idempotent side effect.

**Projections without bootstrap strategy.** A new service subscribes to events, but there are two years of historical events. The projection is empty or stale on first deploy. Fix: every projection service must have a documented bootstrap procedure (API snapshot + event replay from snapshot timestamp, or bulk seed via API).

**Saga without compensating transactions.** Starting a saga without defining what happens when step N fails. Partial state changes across services become orphaned. Fix: before implementing any saga, write out the full compensation matrix — for each step, what is the compensating transaction?

**Treating eventual consistency as a synchronization problem.** Trying to make an eventually consistent system look strongly consistent by adding polling, timeouts, and retry loops at the API layer. This adds latency and complexity without fixing the root issue. Fix: design the UX to reflect consistency guarantees — optimistic UI updates with reconciliation, not blocking spinners waiting for consistency.

**Over-normalizing event payloads.** Publishing events with minimal data (just an ID) and requiring consumers to call back to the owning service to get details. This creates temporal coupling — if the owning service is unavailable, the consumer can't process the event. Fix: events should be self-contained — include all data the consumer needs to process the event without additional API calls.
