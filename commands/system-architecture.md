---
description: "Design and document system architecture"
long-description: "Designs the system blueprint — which components exist, how data flows between them, where each module lives in the directory tree, and where extension points allow custom behavior."
---

## Purpose
Design and document the system architecture, translating domain models and ADR
decisions into a concrete component structure, data flows, and module
organization. Project directory structure and module organization are defined
here. This is the blueprint that agents reference when deciding where code
lives and how components communicate.

## Inputs
- docs/domain-models/ (required) — domain models from modeling phase
- docs/adrs/ (required) — architecture decisions from decisions phase
- docs/plan.md (required) — requirements driving architecture

## Expected Outputs
- docs/system-architecture.md — architecture document with component design,
  data flows, module structure, and extension points

## Quality Criteria
- (mvp) Every domain model lands in a component or module
- (mvp) Every ADR constraint is respected in the architecture
- (mvp) All components appear in at least one data flow diagram
- (deep) Each extension point has interface definition, example usage scenario, and constraints on what can/cannot be extended
- (mvp) System components map to modules defined in docs/project-structure.md
- (deep) Component diagram shows all system components from domain models plus infrastructure
- (deep) Data flow diagrams cover all happy-path user journeys from Must-have stories

## Methodology Scaling
- **deep**: Full architecture document. Component diagrams, data flow diagrams,
  module structure with file-level detail, state management design, extension
  point inventory, deployment topology.
- **mvp**: High-level component overview. Key data flows. Enough structure for
  an agent to start building without ambiguity.
- **custom:depth(1-5)**: Depth 1: high-level component overview with key data
  flows. Depth 2: component overview with module boundaries and primary data
  flows. Depth 3: add component diagrams, module boundaries, and state
  management design. Depth 4: full architecture with extension point inventory,
  deployment topology, and file-level module detail. Depth 5: full architecture
  with cross-cutting concern analysis, failure mode documentation, and
  scalability annotations.

## Mode Detection
If outputs already exist, operate in update mode: read existing content, diff
against current project state and new ADRs, propose targeted updates rather
than regenerating.

## Update Mode Specifics
- **Detect prior artifact**: docs/system-architecture.md exists
- **Preserve**: component structure, data flow diagrams, module organization,
  extension points, deployment topology decisions
- **Triggers for update**: new ADRs introduced (technology or pattern changes),
  domain models added new bounded contexts, PRD requirements changed system
  boundaries, implementation revealed architectural gaps
- **Conflict resolution**: if a new ADR contradicts the current architecture,
  update the affected components and data flows while preserving unaffected
  sections; flag breaking changes for user review

---

## Domain Knowledge

### system-architecture

*Architecture patterns, component design, and project structure*

## Summary

## Architecture Patterns

### Layered Architecture

Organizes code into horizontal layers where each layer depends only on the layer directly below it. Common layers: presentation, application/business logic, domain, infrastructure/data access.

**When to use:** Simple CRUD applications, small teams, projects where the domain logic is straightforward. Good starting point when requirements are unclear.

**Trade-offs:**
- (+) Easy to understand and implement. Clear separation of concerns.
- (+) Well-represented in AI training data; AI generates correct layered code reliably.
- (-) Tends toward anemic domain models (logic drifts to service layers).
- (-) Changes to a feature often touch every layer (vertical changes cut across horizontal layers).
- (-) Can become a "big ball of mud" without discipline as layers accumulate cross-cutting dependencies.

### Hexagonal / Ports and Adapters

The domain logic sits at the center, surrounded by ports (interfaces defining how the domain interacts with the outside) and adapters (implementations of those interfaces). External concerns (databases, APIs, UIs) plug in via adapters.

**When to use:** Applications where the domain logic is the core value, where you want to test domain logic in isolation, or where you anticipate switching infrastructure components (database, message broker, external APIs).

**Trade-offs:**
- (+) Domain logic is testable without infrastructure. Swapping a database or API client requires only a new adapter.
- (+) Forces clean separation between domain and infrastructure.
- (-) More boilerplate: interfaces for every external dependency, adapter implementations, dependency injection wiring.
- (-) Over-engineering for simple CRUD. The ceremony doesn't pay off if the domain logic is trivial.
- (-) Less AI-familiar than layered architecture; AI may generate code that violates the port/adapter boundaries.

### Event-Driven Architecture

Components communicate by producing and consuming events rather than direct calls. An event represents something that happened. Producers don't know or care who consumes their events.

**When to use:** Systems with complex workflows, multiple consumers for the same business event, requirements for audit trails or event replay, systems that need to scale components independently.

**Trade-offs:**
- (+) Loose coupling between components. Adding a new consumer doesn't require changing the producer.
- (+) Natural fit for audit logs, analytics, and undo/redo.
- (-) Harder to reason about: the flow of control is distributed across event handlers.
- (-) Eventual consistency: events are processed asynchronously, so the system may be temporarily inconsistent.
- (-) Debugging is harder: you need to trace events across services to understand what happened.

### Microservices

Each bounded context or business capability is deployed as an independent service with its own data store, communicating via network calls (REST, gRPC, messaging).

**When to use:** Large teams that need independent deployment cycles, systems with dramatically different scaling requirements per component, organizations with multiple autonomous teams.

**Trade-offs:**
- (+) Independent deployment, scaling, and technology choices per service.
- (+) Failure isolation: one service going down doesn't take down the entire system.
- (-) Enormous operational complexity: service discovery, distributed tracing, network failure handling, data consistency across services, deployment coordination.
- (-) Over-engineering for most projects. If you can deploy a monolith, you should.
- (-) AI agents struggle with cross-service coordination, distributed debugging, and service mesh configuration.

### Modular Monolith

A single deployable unit internally organized into well-defined modules with explicit boundaries and interfaces. Modules communicate through defined interfaces, not arbitrary cross-module calls.

**When to use:** Most projects. Provides the organizational benefits of microservices (clean boundaries, independent development) without the operational complexity of distributed systems. Can be split into microservices later if genuinely needed.

**Trade-offs:**
- (+) Single deployment, single database, simple operations.
- (+) Clean module boundaries enable parallel development with low merge conflict risk.
- (+) Easy to refactor boundaries — moving code between modules is a code change, not a service migration.
- (-) Requires discipline to maintain module boundaries. Without enforcement, modules leak into each other.
- (-) Scaling is all-or-nothing (the whole monolith scales together).

### Choosing a Pattern

For most scaffold pipeline projects:

1. Start with **modular monolith** as the default. It gives you clean boundaries, testability, and low operational complexity.
2. Consider **hexagonal** if the domain logic is the primary value and you need infrastructure independence.
3. Consider **event-driven** if the domain naturally involves reactive workflows, audit requirements, or multiple consumers of business events.
4. Use **microservices** only if you have multiple teams that need independent deployment, or specific services with dramatically different scaling needs.
5. Avoid **layered** unless the application is genuinely simple (CRUD with minimal business logic).

## Deep Guidance

## Component Design

### Identifying Components from Domain Models

Each bounded context from the domain model typically maps to a top-level component or module. Within each bounded context:

- Aggregates map to services or sub-modules
- Domain events define the interfaces between components
- Repositories define the data access boundaries

**Mapping rules:**

| Domain Concept | Architecture Component |
|----------------|----------------------|
| Bounded Context | Top-level module/package |
| Aggregate | Service class or sub-module |
| Domain Event | Event interface / message type |
| Repository | Data access interface |
| Domain Service | Application service |
| Value Object | Shared type/library within the module |

### Defining Interfaces Between Components

Every component exposes a public interface (its API) and hides its internals. The interface is the contract that other components depend on.

**Interface design principles:**

- **Explicit over implicit.** Document what a component provides and what it requires. No hidden dependencies.
- **Narrow interfaces.** Expose the minimum necessary. More surface area means more coupling.
- **Stable interfaces.** Interfaces should change less frequently than implementations. Design for extension without interface changes.
- **Domain-language interfaces.** Use domain terminology, not infrastructure terminology. `orderService.place(order)` not `orderManager.insertAndNotify(orderDTO)`.

### Dependency Management

**Dependency inversion:** High-level modules should not depend on low-level modules. Both should depend on abstractions. The domain module defines an interface for data access; the infrastructure module implements it.

**Dependency direction rules:**

```
Presentation -> Application -> Domain <- Infrastructure
```

- Domain has zero external dependencies.
- Application orchestrates domain objects and depends on domain interfaces.
- Infrastructure implements domain interfaces and depends on external libraries.
- Presentation depends on application services.

**Preventing circular dependencies:**

- Dependencies must be acyclic. If module A depends on module B and module B depends on module A, extract the shared concept into a new module C.
- Use dependency analysis tools (e.g., madge for JavaScript, import-linter for Python) in CI to enforce dependency rules.
- When two modules need to communicate bidirectionally, use events or callbacks instead of direct references.

## Data Flow Design

### Request/Response Flows

Document the path of a user request through the system:

```
Client Request
  -> API Gateway / Router
    -> Controller (input validation, auth check)
      -> Application Service (orchestration, business rules)
        -> Domain Model (invariant enforcement, state changes)
          -> Repository (persistence)
        <- Domain Events (side effects)
      <- Response DTO (shape for client)
    <- HTTP Response
  <- Client Response
```

For each major user flow identified in the PRD, trace the request through every component it touches. This reveals:
- Missing components (the request needs something that doesn't exist)
- Unnecessary components (the request passes through components that add no value)
- Coupling points (where changes to the flow would ripple)

### Event Flows

For event-driven interactions, document:

```
Producer Aggregate
  -> Event (OrderPlaced)
    -> Event Bus / Queue
      -> Consumer 1 (InventoryService.reserveStock)
      -> Consumer 2 (NotificationService.sendConfirmation)
      -> Consumer 3 (AnalyticsService.recordPurchase)
```

Event flow documentation should include:
- The producing aggregate and triggering action
- The event name and payload schema
- All consumers and their resulting actions
- Error handling: what happens if a consumer fails?
- Ordering guarantees: must events be processed in order?

### Data Transformation Pipelines

When data moves between layers or components, it often changes shape:

```
HTTP Request Body (JSON)
  -> Validated Input DTO (type-safe, validated)
    -> Domain Command (domain language)
      -> Domain Entity mutations
        -> Domain Event (payload)
          -> Persistence Model (database row)
    -> Response DTO (client-facing shape)
```

Document each transformation point and what changes. This prevents the common mistake of passing database models directly to the client or accepting raw JSON deep in the domain layer.

## Module Organization

### Project Directory Structure

Directory structure is part of the architecture. A well-organized directory structure makes the architecture visible in the file system.

**Feature-based (vertical slices):**

```
src/
  features/
    auth/
      controllers/
      services/
      models/
      repositories/
      events/
      tests/
    orders/
      controllers/
      services/
      models/
      repositories/
      events/
      tests/
  shared/
    middleware/
    utils/
    types/
```

Best for: most projects, especially with parallel agents. Each feature is self-contained, reducing merge conflicts.

**Layer-based (horizontal slices):**

```
src/
  controllers/
  services/
  models/
  repositories/
  middleware/
  utils/
```

Best for: very small projects where the feature count is low and layered separation is the primary organizational concern.

**Hybrid (layers within features):**

```
src/
  features/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.model.ts
      auth.repository.ts
      auth.test.ts
    orders/
      ...
  shared/
    middleware/
    utils/
  infrastructure/
    database/
    messaging/
    external-apis/
```

Best for: projects that want feature isolation but also need clear infrastructure separation.

### File Naming Conventions

Consistency matters more than any specific convention. Pick one and enforce it:

- **kebab-case:** `user-profile.service.ts`, `order-item.model.ts` (most common in Node.js/TypeScript)
- **snake_case:** `user_profile_service.py`, `order_item_model.py` (standard in Python)
- **PascalCase:** `UserProfileService.java`, `OrderItemModel.java` (standard in Java/C#)

File names should include the component type as a suffix: `.controller`, `.service`, `.model`, `.repository`, `.test`, `.middleware`.

### Module Boundaries

Enforce that modules only interact through their public interfaces:

- Each module has an index/barrel file that exports only public API
- Internal files/classes are not exported
- Linter rules or import restrictions prevent reaching into another module's internals
- Module tests verify the public API; they don't test internals directly

### Import/Dependency Rules

Define a strict import ordering convention:

```
1. Standard library / Node.js built-ins
2. Third-party packages (npm/pip)
3. Internal shared modules (@shared/, @infrastructure/)
4. Feature-local modules (./relative paths)
```

Use path aliases to make imports readable: `@features/auth/service` instead of `../../../../features/auth/service`.

## State Management

### Where State Lives

State must have a clear, single owner. Distributed state with no clear owner leads to inconsistencies.

**Server-side state:**
- Database: persistent state (user data, orders, configuration)
- Cache (Redis, in-memory): derived or frequently-accessed state
- Session store: per-user session state
- Application memory: request-scoped transient state

**Client-side state (if applicable):**
- URL/query params: navigational state (current page, filters, sort order)
- Component state: UI-specific transient state (form inputs, open/closed toggles)
- Client-side store (Redux, Zustand, etc.): application state shared across components
- Local storage: persistent client state (preferences, draft saves)

### Consistency Strategies

- **Strong consistency** (single source of truth, synchronous reads): Use for data where correctness matters more than performance. Financial balances, inventory counts, access permissions.
- **Eventual consistency** (multiple sources, asynchronous sync): Acceptable for analytics, recommendations, activity feeds, notification counts.
- **Optimistic updates** (update UI immediately, reconcile with server): Good for user experience in low-conflict scenarios. Must handle conflicts gracefully.

### Caching

Add caching only when you have evidence of a performance problem, not speculatively.

When caching:
- Define the cache key scheme
- Define the invalidation strategy (TTL, event-based, write-through)
- Define what happens on cache miss (load from source, return stale data, error)
- Define maximum cache size and eviction policy (LRU, LFU, FIFO)

## Extension Points

Extension points allow the system to evolve without modifying core code. They must be designed, not just documented.

### Types of Extension Points

**Plugin systems:** Third-party or internal code hooks into defined interfaces. Example: a notification system with pluggable channels (email, SMS, push, Slack).

**Middleware/pipeline:** Processing steps that can be inserted, removed, or reordered. Example: request processing middleware (auth, logging, rate limiting, CORS).

**Configuration-driven behavior:** System behavior changes based on configuration without code changes. Example: feature flags, A/B tests, tenant-specific settings.

**Event hooks:** External code subscribes to events and reacts. Example: "after user creation, trigger welcome email" — the welcome email logic is decoupled from user creation.

### Design Rules

- Extension points must have a defined interface (not just "call any function")
- Document what extensions can and cannot do (security constraints, performance expectations)
- Provide default implementations for all extension points
- Test the extension mechanism itself, not just specific extensions
- Don't add extension points speculatively — add them when you have a concrete need for extensibility

## Cross-Cutting Concerns

### Logging

- **Structured logging** (JSON format) for machine parsability
- **Log levels:** DEBUG (verbose tracing), INFO (significant operations), WARN (recoverable issues), ERROR (failures requiring attention)
- **What to log:** Request/response metadata (not bodies), authentication events, business operations, errors with stack traces
- **What NEVER to log:** PII, passwords, tokens, credit card numbers, session cookies
- **Correlation IDs:** Every request gets a unique ID that propagates through all logs for that request, enabling end-to-end tracing

### Error Handling

- **Fail fast:** Detect errors as early as possible. Validate inputs at the boundary.
- **Error types:** Distinguish between client errors (bad input, 4xx), server errors (bugs, infrastructure failures, 5xx), and domain errors (business rule violations).
- **Error propagation:** Errors at lower layers should be translated to meaningful errors at higher layers. A "connection refused" database error becomes a "service unavailable" to the client.
- **Error recovery:** Define retry strategies for transient errors (with exponential backoff and jitter). Define circuit breakers for failing external services.

### Configuration Management

- **Environment-based:** Configuration varies by environment (dev, staging, production)
- **Hierarchical:** Default values < environment config < runtime overrides
- **Validated at startup:** All required configuration is checked at application start, not at first use
- **Typed:** Configuration values are parsed into proper types, not used as raw strings throughout the codebase
- **Secrets separated:** Sensitive values (API keys, database passwords) come from secure sources (environment variables, vault), never from config files committed to source control

### Feature Flags

- **Runtime toggles:** Enable/disable features without deployment
- **Scoped:** Feature flags apply globally, per-tenant, per-user, or per-percentage
- **Cleanup:** Feature flags are temporary. Set a removal date. Old feature flags become technical debt.
- **Testable:** Tests can exercise both flag-on and flag-off paths

## Common Pitfalls

**Over-architecting.** Microservices, event sourcing, CQRS, and distributed caching for a todo app with one user. Match architecture complexity to problem complexity. Start simple and add complexity only when the simpler approach demonstrably fails.

**Under-specifying interfaces.** "The auth module provides authentication" is not an interface specification. Specify the exact methods/endpoints, their parameters, their return types, and their error conditions. An AI agent implementing against a vague interface will guess wrong.

**Orphaned components.** A component that appears in the architecture diagram but in no data flow. If no request ever touches it, it either shouldn't exist or there's a missing data flow. Every component must appear in at least one data flow.

**Diagram/prose drift.** The architecture diagram shows three services but the prose describes four. Or the diagram shows a direct database connection but the prose describes a repository pattern. Keep diagrams and text synchronized. When one changes, update the other.

**Speculative generalization.** Adding layers of abstraction "in case we need it later" — an adapter for a database you'll never switch, a plugin system nobody will extend, a message queue for messages that could be function calls. Each abstraction has a maintenance cost. Add abstractions when you have a concrete need.

**Missing error paths in data flows.** Data flow diagrams that only show the happy path. What happens when the database is down? When the external API returns an error? When the message queue is full? Document error paths for every external dependency.

**Ignoring project structure.** Defining a beautiful hexagonal architecture but using a flat directory structure that doesn't reflect the architecture's boundaries. The file system should make the architecture visible. If modules can't be identified from the directory listing, the structure doesn't serve the architecture.

---

### domain-modeling

*Domain-driven design patterns for identifying and modeling project domains*

## Summary

## Strategic DDD Patterns

Strategic DDD operates at the system level, answering where domain boundaries fall and how domains communicate.

### Bounded Contexts

A bounded context is a linguistic and conceptual boundary within which a particular domain model is defined and consistent. The same real-world concept (e.g., "User") may appear in multiple bounded contexts with different attributes, behaviors, and meaning.

**Identifying bounded contexts:**

- Look for where the same word means different things to different teams or subsystems. "Order" in a sales context (line items, pricing, discounts) differs from "Order" in a fulfillment context (warehouse location, shipping label, tracking number). This semantic divergence marks a boundary.
- Organizational boundaries often align with context boundaries. Teams that communicate frequently typically share a context; teams that don't typically shouldn't.
- A good bounded context has high internal cohesion (its entities reference each other freely) and low external coupling (references to other contexts go through explicit integration points).
- When two entities need to maintain mutual consistency in a single transaction, they belong in the same bounded context. When eventual consistency is acceptable, they can live in separate contexts.

**Context boundary signals:**

- Different stakeholders use different vocabulary for overlapping concepts
- Two entities share an ID but have incompatible lifecycles
- A change to one subsystem routinely forces changes in another (sign of a missing or wrong boundary)
- A single database table serves two clearly different read patterns with different column subsets

### Context Mapping

Context mapping describes the relationships between bounded contexts. Each relationship type has different coupling and team dynamics implications.

**Shared Kernel** — Two contexts share a small, explicitly defined subset of the domain model (types, events, or entities). Changes to the shared kernel require agreement from both teams. Use sparingly; every shared kernel is a coupling point. Best for closely collaborating teams that share ownership.

**Customer-Supplier** — One context (supplier) provides data or services that another (customer) consumes. The supplier's model drives the interface. The customer can request changes but the supplier decides priority. Appropriate when one context clearly serves another and the supplier team has capacity to respond to customer needs.

**Conformist** — Like customer-supplier, but the customer has no influence over the supplier. The customer conforms entirely to the supplier's model. Common with external APIs or legacy systems you can't change. Accept the coupling or introduce an anticorruption layer.

**Anticorruption Layer (ACL)** — A translation layer that converts between two contexts' models. The ACL prevents one context's model from leaking into another. Essential when integrating with legacy systems, external APIs, or contexts with incompatible models. Place the ACL on the consumer side.

**Open Host Service** — A context exposes a well-defined protocol (API, message format) for any consumer. The protocol is versioned and documented. The serving context commits to supporting the protocol. Appropriate when many consumers integrate with a single provider.

**Published Language** — A shared, documented data format (JSON schema, Protobuf definition, Avro schema) used for integration between contexts. Often combined with open host service. The language is versioned independently from either context.

### Subdomains

Not all parts of a system are equally important or complex. Classify domains by their strategic value:

**Core Domain** — The part that differentiates your product. This is where the business invests the most. It deserves the most rigorous modeling, the best developers, and the most comprehensive testing. If your app is a scheduling tool, the scheduling algorithm is the core domain.

**Supporting Domain** — Necessary for the core domain to function but not a competitive differentiator. User management, notification systems, and file storage are common supporting domains. These deserve solid engineering but not the same modeling investment as the core domain.

**Generic Domain** — Solved problems that are the same across industries. Authentication, email delivery, payment processing, and logging. Use existing solutions (libraries, services, SaaS) rather than building custom implementations.

**Classification decisions matter because they drive resource allocation.** Over-investing in a generic domain (building a custom auth system when Auth0 exists) wastes effort. Under-investing in a core domain (using a generic CRUD framework for your competitive advantage) produces mediocre software.

## Deep Guidance

## Tactical DDD Patterns

Tactical DDD patterns structure the code within a bounded context.

### Entities

An entity is an object with a distinct identity that persists through time and across state changes. Two entities are equal if they have the same identity, regardless of their attributes.

**Identity design:**

- Use a domain-meaningful ID when one exists naturally (ISBN for books, SSN for citizens). Otherwise use a generated ID (UUID, ULID, or database-generated).
- UUIDs are safe for distributed systems (no coordination needed). ULIDs add time-ordering. Auto-increment IDs leak information about record count and creation order.
- Identity must be immutable once assigned. Never reuse identities.

**Lifecycle:**

- Entities are created, go through state transitions, and may be deactivated or archived (prefer soft-delete over hard-delete for audit trails).
- Each state transition should be explicit, validated against invariants, and emit a domain event.
- Define valid state transitions as a state machine. Invalid transitions should be rejected, not silently ignored.

**Example:**

```typescript
interface User {
  id: UserId;              // Identity - never changes
  email: Email;            // Can change (but must remain unique)
  status: UserStatus;      // Created -> Active -> Suspended -> Deactivated
  createdAt: Timestamp;    // Lifecycle marker
  lastLoginAt: Timestamp;  // State changes over time
}
```

### Value Objects

A value object has no identity. Two value objects are equal if all their attributes are equal. Value objects are immutable — to change a value, you create a new one.

**When to use value objects:**

- The concept has no meaningful identity (an address, a date range, a monetary amount, a color)
- You compare instances by their attributes, not by an ID
- The concept is replaceable — swapping one "Amount(100, USD)" for another "Amount(100, USD)" changes nothing

**Design rules:**

- Immutable after creation. All "modification" operations return a new instance.
- Self-validating. A value object that contains invalid data should never exist. Validate in the constructor.
- Side-effect free. Methods on value objects compute and return values; they never modify external state.

**Common value objects:**

- `Money(amount, currency)` — never represent money as a bare number; the currency is part of the value
- `EmailAddress(value)` — validates format on construction; impossible to hold an invalid email
- `DateRange(start, end)` — validates start < end; provides overlap/contains logic
- `Address(street, city, state, zip, country)` — full equality comparison by all fields

**Anti-pattern: primitive obsession.** Using raw strings for emails, bare numbers for money, or plain dates for date ranges loses domain meaning and validation. Wrap primitives in value objects.

### Aggregates

An aggregate is a cluster of entities and value objects with a defined consistency boundary. All changes to the aggregate go through the aggregate root, which enforces invariants.

**Aggregate root:**

- The single entry point for all modifications to the aggregate
- External objects may hold a reference to the aggregate root but not to internal entities
- The root enforces all invariants that span multiple entities within the aggregate

**Sizing aggregates:**

- Keep aggregates small. A large aggregate locks more data, limits concurrency, and makes the model harder to reason about.
- Rule of thumb: an aggregate should represent the smallest cluster of objects that must be consistent in a single transaction.
- Cross-aggregate references use IDs, not direct object references. This enforces the boundary.
- If you find yourself needing a transaction that spans multiple aggregates, either your aggregate boundaries are wrong or you need a domain event with eventual consistency.

**Invariant enforcement:**

- An invariant is a business rule that must always be true within the aggregate. Example: "An Order must have at least one OrderLine" or "A Wallet balance must never go negative."
- The aggregate root's methods check invariants before allowing state changes. Invalid operations throw domain exceptions.
- Invariants that span aggregates cannot be enforced transactionally. Use domain events and sagas for cross-aggregate invariants, accepting eventual consistency.

**Example:**

```typescript
// Order is the aggregate root
interface Order {
  id: OrderId;
  customerId: CustomerId;     // Reference by ID, not by entity
  lines: OrderLine[];         // Internal entities, not directly accessible
  status: OrderStatus;

  addLine(product: ProductId, quantity: number, price: Money): void;
  removeLine(lineId: OrderLineId): void;
  submit(): void;             // Enforces: must have >= 1 line, status must be Draft
}

// OrderLine is an internal entity — not accessible outside the Order aggregate
interface OrderLine {
  id: OrderLineId;
  productId: ProductId;
  quantity: number;           // Invariant: must be > 0
  unitPrice: Money;
}
```

### Domain Events

A domain event represents something that happened in the domain that other parts of the system may need to react to. Events are named in past tense to indicate they've already occurred.

**Naming conventions:**

- Past tense: `OrderPlaced`, `UserRegistered`, `PaymentProcessed`, `InventoryReserved`
- Include the aggregate that produced the event: `Order.Placed`, not just `Placed`
- Be specific: `InvoicePastDue` is better than `InvoiceUpdated`

**Payload design:**

- Include enough data for consumers to act without querying back. At minimum: the aggregate ID, the event timestamp, and the data that changed.
- Avoid including the entire aggregate state in every event (bloated, couples consumers to producer's model). Include only what changed and what consumers need.
- Include a correlation ID for tracing event chains across services.
- Events are immutable facts. Never modify an event after publication. If the data was wrong, publish a corrective event.

**Event flows:**

- Document which aggregates produce which events and which aggregates/services consume them
- Use event flow diagrams to visualize the reactive chains: Order.Placed -> InventoryService.ReserveStock -> Inventory.Reserved -> ShippingService.PrepareShipment
- Identify event storms — situations where one event triggers a cascade that eventually loops back. These indicate a modeling problem.

### Domain Services

A domain service is a stateless operation that doesn't naturally belong to any single entity or value object.

**When to use:**

- The operation involves multiple aggregates (e.g., transferring money between two accounts)
- The operation requires external information (e.g., currency conversion using an exchange rate)
- Placing the operation on an entity would give that entity knowledge it shouldn't have

**When NOT to use:**

- If the operation can live on an entity without violating single responsibility, put it there
- Don't create a service just because the operation is complex. Complexity within an entity is fine if the entity owns the relevant data.

### Repositories

A repository provides a collection-like interface for retrieving and persisting aggregates. The domain layer defines the repository interface; the infrastructure layer provides the implementation.

**Design rules:**

- One repository per aggregate root. Never create a repository for an internal entity.
- The interface uses domain language: `findByEmail(email: Email)`, not `getWhere({ column: 'email', value: '...' })`
- Repositories return fully reconstituted aggregates, not raw data. The consumer never sees database rows.
- Keep the interface small: `find`, `save`, `delete`, and a few domain-specific queries. Don't replicate a generic ORM interface.

## Domain Discovery Process

### Event Storming

Event storming is a collaborative modeling technique that maps out domain events, commands, and aggregates on a timeline.

**Process:**

1. **Big Picture** — Identify all domain events (things that happen) on a timeline. No filtering, no organizing — just capture everything. Use orange sticky notes.
2. **Commands** — For each event, identify what command triggered it (blue sticky notes). A command is an action a user or system takes: "Place Order," "Cancel Subscription."
3. **Aggregates** — Group related events and commands around the aggregate that processes them (yellow sticky notes). This reveals aggregate boundaries.
4. **Policies** — Identify reactive behaviors: "When X happens, do Y" (purple sticky notes). These become event handlers or sagas.
5. **Read Models** — Identify what information users need to make decisions that trigger commands (green sticky notes). These inform query design.
6. **Bounded Contexts** — Draw boundaries around clusters of aggregates that share language and models. Where language changes, a context boundary exists.

### Discovering Domains from User Stories

User stories (`docs/user-stories.md`) are a primary input for domain discovery. User actions in acceptance criteria reveal entities (nouns), events (state transitions), and aggregate boundaries (transactional consistency requirements). For example, "Given a teacher assigns homework to a class" reveals Teacher, Homework, and Class entities, an AssignmentCreated event, and a Classroom aggregate.

- Extract nouns from story acceptance criteria — these are candidate entities
- Extract state changes ("when X happens, Y changes to Z") — these are candidate domain events
- Identify where multiple entities must change atomically in acceptance criteria — these suggest aggregate boundaries
- Group stories by the entities they reference — entity clusters suggest bounded contexts

### Identifying Bounded Contexts from Requirements

When event storming isn't practical (e.g., solo development or AI-driven development), use these heuristics:

- Group features by the nouns they operate on. Features that share nouns likely share a context.
- Look for natural transaction boundaries. Features that must be atomically consistent share a context.
- Identify where the same word means different things. That's a context boundary.
- Consider the PRD's feature groupings — they often align with bounded contexts, though not always.

### Finding Aggregate Boundaries

- Start with entities that have invariants spanning multiple objects. Those objects form an aggregate.
- If an invariant only involves a single entity, that entity is its own aggregate.
- If deleting an entity should cascade-delete related objects, those objects likely belong in the same aggregate.
- If related objects have independent lifecycles (can exist without each other), they're separate aggregates connected by ID references.

## Modeling Artifacts

A complete domain model document should contain:

### Entity Definitions

For each entity, define:
- Name and bounded context
- Identity mechanism (UUID, natural key, etc.)
- Attributes with types (use TypeScript-style interfaces for precision)
- State machine (valid states and transitions)
- Invariants (business rules that must always hold)
- Relationships to other entities (with cardinality and direction)

### Relationship Diagrams

- Entity relationship diagrams showing all entities within a bounded context
- Cross-context relationship diagrams showing how contexts communicate
- Use standard notations (crow's foot for cardinality, solid lines for direct references, dashed lines for event-based relationships)

### Invariant Specifications

For each invariant:
- A testable assertion (e.g., "Order.lines.length >= 1 when Order.status == Submitted")
- When the invariant must hold (always? only in certain states?)
- What happens on violation (exception type, error message, recovery path)
- Which aggregate enforces it

### Event Flow Diagrams

- Source aggregate and event name
- Consumer service/aggregate and resulting action
- Data carried in the event payload
- Timing expectations (synchronous reaction? eventual consistency? time-bounded?)

### Context Map

- All bounded contexts with their relationships (shared kernel, customer-supplier, etc.)
- Integration mechanisms (REST API, message queue, shared database, file export)
- Data flow direction

## Common Pitfalls

**Anemic domain models.** Entities that are pure data containers with no behavior. All logic lives in service classes that manipulate entity data from outside. This loses the benefit of encapsulation and invariant enforcement. Fix: move behavior onto the entities that own the data.

**Leaky abstractions across context boundaries.** When one context directly references another context's internal entities, changes in one context force changes in the other. Fix: use anticorruption layers or published language at boundaries.

**Over-sized aggregates.** An aggregate that contains too many entities causes lock contention, complicates persistence, and makes the model hard to understand. If you're loading dozens of related entities to change one field, the aggregate is too large. Fix: split into smaller aggregates connected by ID references and domain events.

**Missing domain events for state transitions.** Every meaningful state change should produce an event. If an order moves from "pending" to "confirmed" with no event, other parts of the system have no way to react. Fix: audit all state transitions and ensure each produces a domain event.

**Conflating entities with database rows.** Domain entities model business concepts; database rows store data. They may look similar but serve different purposes. An entity may span multiple tables or a single table may hold data from multiple entities. Fix: design the domain model first, then map it to persistence.

**Premature domain modeling.** Modeling domains in detail before understanding the business problem leads to wrong abstractions that are expensive to change. Fix: start with the core domain, model it thoroughly, and model supporting/generic domains only as needed.

**Ignoring ubiquitous language.** Using technical terms (UserDAO, SessionEntity, OrderDTO) instead of business terms (Subscriber, Practice, Purchase) makes the model opaque to stakeholders and drifts from the business reality. Fix: use the same terms the business uses, everywhere.

## Quality Indicators

A domain model is likely correct when:

- **Ubiquitous language is consistent.** Every term in the model maps to a concept that stakeholders recognize. There are no synonyms (two words for the same thing) or homonyms (one word for two things) within a bounded context.
- **Aggregate boundaries match transaction boundaries.** Each business operation that must be atomic maps to a single aggregate. No transaction spans multiple aggregates.
- **Domain events capture all business-meaningful state changes.** You can reconstruct the business history from the event stream. No silent state mutations.
- **Invariants are explicit and testable.** Every business rule is specified as a concrete assertion, assigned to an aggregate, and enforced in code.
- **Cross-context communication is explicit.** No context reaches into another's internals. All integration goes through documented mechanisms (events, APIs, shared language).
- **The model explains the business.** A new team member can read the domain model and understand what the business does, what its rules are, and how its parts interact.
- **Value objects outnumber entities.** Most concepts in a well-modeled domain are values, not identities. If nearly everything is an entity, you may be confusing data containers with identity-bearing objects.

## See Also

- [task-decomposition](../core/task-decomposition.md) — DDD entities map to implementation tasks

---

## After This Step

Continue with: `/scaffold:review-architecture`, `/scaffold:review-testing`
