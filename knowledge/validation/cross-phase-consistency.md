---
name: cross-phase-consistency
description: Auditing consistency across pipeline phases — naming, assumptions, data flows, interface contracts
topics: [validation, consistency, naming, data-flow, contracts]
---

# Cross-Phase Consistency

Cross-phase consistency validation ensures that artifacts produced across different pipeline phases agree with each other. Inconsistencies compound: a renamed entity in one phase propagates confusion into every downstream artifact. This document covers what to check, how to check it, and what findings look like.

## Why Inconsistencies Happen

Each pipeline phase is authored at a different time, possibly by different agents, with evolving understanding of the project. Common causes:

- An entity gets renamed during architecture but the domain model still uses the old name.
- A field is added to an API contract that does not exist in the database schema.
- An ADR constrains behavior that is contradicted by a later UX specification.
- A domain event defined in modeling is never consumed by any component in architecture.
- Units or formats differ (e.g., timestamps as ISO strings in the API but Unix integers in the schema).

## What to Check

### 1. Naming Consistency

Trace every named concept through all artifacts where it appears.

**Process:**
1. Extract all named entities from the domain model (aggregates, entities, value objects, events, invariants).
2. For each name, search every downstream artifact: ADRs, architecture, schema, API contracts, UX spec, implementation tasks.
3. Flag any spelling variations, abbreviations, or synonyms (e.g., "User" vs "Account" vs "Member" referring to the same concept).
4. Flag any name that appears in a downstream artifact but not in the domain model (potential undocumented concept).

**What findings look like:**
- "Domain model uses `PaymentTransaction` but API contracts call it `Payment` and database schema calls it `payment_txn`."
- "The entity `SubscriptionPlan` appears in the implementation tasks but is not in the domain model."

**Resolution:** Establish one canonical name per concept. Update all artifacts to use it.

### 2. Shared Assumptions

Later phases often assume properties that earlier phases did not explicitly specify.

**Process:**
1. For each phase from architecture onward, identify every assumption about earlier artifacts.
2. Verify each assumption is actually stated in the referenced artifact.
3. Pay special attention to: cardinality (one-to-many vs many-to-many), optionality (required vs optional), ordering (ordered vs unordered), uniqueness constraints, temporal assumptions (real-time vs eventual consistency).

**What findings look like:**
- "Architecture assumes `Order` has a `status` field with enum values, but the domain model defines `Order` without specifying lifecycle states."
- "API contracts assume paginated results, but architecture data flow diagrams show unbounded queries."

**Resolution:** Either add the assumption to the source artifact or update the downstream artifact to not depend on it.

### 3. Data Shape Consistency

Trace a data shape from domain model through schema through API through UI.

**Process:**
1. Pick a core entity (e.g., `User`).
2. Extract its shape from each layer:
   - Domain model: attributes, relationships, invariants
   - Database schema: columns, types, constraints, indexes
   - API contract: request/response fields, types, validation rules
   - UX spec: displayed fields, form inputs, validation messages
3. Verify field-by-field alignment:
   - Every domain attribute should map to a schema column (or have a documented reason for omission).
   - Every schema column exposed externally should appear in an API contract field.
   - Every API response field displayed to users should appear in UX spec.
   - Types should be compatible (e.g., domain `Money` value object maps to `DECIMAL(10,2)` in schema, `string` formatted as currency in API, formatted display in UX).

**What findings look like:**
- "Domain model `Product.price` is a `Money` value object (amount + currency), but schema has only `price_cents INTEGER` — currency is missing."
- "API returns `created_at` as ISO 8601 string but UX spec references `createdAt` as a Unix timestamp."

### 4. Interface Contract Matching

Verify that component interfaces defined in architecture match their implementations in API contracts and database schema.

**Process:**
1. Extract every component interface from the architecture document (method signatures, event subscriptions, data flows).
2. For each interface, find its concrete definition in API contracts or internal service contracts.
3. Verify:
   - All interface methods have corresponding endpoints or functions.
   - Parameter names and types match.
   - Return types match.
   - Error cases defined at the interface level are handled at the implementation level.

**What findings look like:**
- "Architecture defines `NotificationService.sendBatch(notifications[])` but API contracts only define `POST /notifications` for single notifications."
- "Architecture component `PaymentGateway` has an `onPaymentFailed` event handler, but no component publishes `PaymentFailed` events."

### 5. Data Flow Completeness

Verify that data flows described in architecture are implementable with the defined APIs and schemas.

**Process:**
1. For each data flow diagram in architecture, walk through step by step.
2. At each step, verify:
   - The source component has an API or interface that provides the data.
   - The target component has an API or interface that accepts the data.
   - The data shape at the source matches the data shape at the target.
   - Any transformation between source and target is documented.
3. Check for orphaned components — components that appear in data flows but have no API endpoints or database tables.

**What findings look like:**
- "Data flow shows `OrderService -> InventoryService: reserve items`, but InventoryService API has no reservation endpoint."
- "Data flow shows `AnalyticsCollector` receiving events from `UserService`, but the architecture has no event bus or pub/sub mechanism defined."

### 6. Constraint Propagation

ADR constraints should be respected in all downstream artifacts.

**Process:**
1. Extract all constraints from ADRs (technology choices, architectural patterns, non-functional requirements).
2. For each constraint, verify it is reflected in relevant downstream artifacts:
   - Technology choice ADRs should align with architecture component technology annotations.
   - Pattern ADRs (e.g., "use event sourcing for Order aggregate") should be reflected in schema design and API contracts.
   - NFR ADRs should have corresponding test criteria in testing strategy.

**What findings look like:**
- "ADR-007 mandates PostgreSQL, but database schema uses MongoDB-style document references."
- "ADR-012 requires CQRS for order processing, but architecture shows a single read/write path."

## How to Structure the Audit

### Pass 1: Build an Entity Registry

Create a table of every named concept with its appearance in each artifact:

| Concept | Domain Model | ADRs | Architecture | Schema | API | UX | Tasks |
|---------|-------------|------|-------------|--------|-----|-----|-------|
| User | `User` entity | — | `UserService` | `users` table | `/users` resource | User Profile screen | Task #12-#15 |
| Order | `Order` aggregate | ADR-012 CQRS | `OrderService` | `orders` table | `/orders` resource | Order History screen | Task #20-#28 |

Flag any row with missing cells or naming inconsistencies.

### Pass 2: Data Shape Tracing

For each entity in the registry, trace its shape layer by layer. Build a field-level comparison table:

| Field | Domain | Schema | API | UX |
|-------|--------|--------|-----|-----|
| id | UUID | `id UUID PK` | `id: string (uuid)` | hidden |
| email | Email (value object) | `email VARCHAR(255) UNIQUE` | `email: string (email)` | text input, validated |
| role | UserRole enum | `role VARCHAR(20) CHECK(...)` | `role: "admin" | "user"` | dropdown |

Flag mismatches in type, optionality, naming, or format.

### Pass 3: Flow Walking

Walk each data flow end-to-end, verifying every step has concrete API/schema support.

### Pass 4: Constraint Verification

Cross-reference every ADR constraint against downstream artifacts.

## Output Format

Findings should be structured as:

```
## Finding: [Short Description]

**Severity:** Critical | Major | Minor
**Phases Involved:** [list of phases]
**Description:** [What the inconsistency is]
**Evidence:**
- In [artifact]: [what it says]
- In [artifact]: [what it says differently]
**Recommended Fix:** [Which artifact to update and how]
```

## Common Patterns Worth Special Attention

1. **Enum drift** — Enum values defined in domain model, schema, API, and UX often diverge. One phase adds a new status value without updating others.
2. **Optionality mismatch** — Domain model says a field is required, but API contract makes it optional, or vice versa.
3. **Orphaned events** — Domain events defined but never consumed (or consumed but never published).
4. **Ghost requirements** — Features appear in UX spec or implementation tasks that trace to no PRD requirement.
5. **Format divergence** — Dates, money, identifiers represented differently across layers without documented transformation rules.
6. **Soft-delete vs hard-delete** — One phase assumes records are soft-deleted, another assumes they are gone.
7. **Pagination assumptions** — API paginates but UX assumes all data is available; or API returns all but architecture assumed streaming.
