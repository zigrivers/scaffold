---
name: system-architecture
description: Architecture patterns, component design, and project structure
topics: [architecture, components, modules, data-flow, project-structure, state-management]
---

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

## Reading ADRs to Derive Architectural Constraints

The `system-architecture` pipeline step consumes ADR decision records as direct inputs. Each accepted ADR represents a binding constraint on the architecture — not a suggestion, but a committed decision that component choices must honor.

### How to Extract Constraints from ADRs

For each ADR, read the **Decision** and **Consequences** sections:

1. **Identify the affected component scope.** An ADR about the database engine constrains the data access layer and all repository implementations. An ADR about the messaging system constrains all async communication patterns.
2. **Extract the affirmative constraint.** "We will use PostgreSQL" → every database component must use the `pg` driver (Node.js) or `psycopg2` (Python), not a generic ORM that could target SQLite.
3. **Extract the prohibitive constraint.** "We will not use a microservice architecture" → no service discovery, no inter-service REST calls, no per-service databases.
4. **Note the rationale.** If an ADR says "because of GDPR data residency requirements," this rationale extends to related decisions not explicitly stated in the ADR (e.g., no third-party analytics SDKs that exfiltrate data).

### Mapping ADR Outcomes to Component Decisions

Document constraints inline with component definitions:

```
Component: UserRepository
Constraint source: ADR-003 (PostgreSQL as the database)
Implementation requirement: Must use pg driver. ORM must target PostgreSQL dialect.
  Cannot use SQLite, MySQL, or a generic query builder that doesn't validate SQL dialect.

Component: NotificationService
Constraint source: ADR-007 (async via Redis pub/sub, not a message broker)
Implementation requirement: Must use ioredis for pub/sub.
  Cannot use RabbitMQ, Kafka, or in-process EventEmitter for cross-service notifications.
```

### Cross-Referencing ADR Status

ADR status affects how strictly to apply constraints:

- **Accepted**: Binding. The architecture must comply. Any component that would violate this decision requires a new ADR to supersede it.
- **Proposed**: Treat as intended but not yet locked. Note the dependency — if the ADR is rejected, the architecture may need revision.
- **Deprecated** or **Superseded**: The old constraint no longer applies; the superseding ADR's constraint applies instead. Remove any component requirements derived from the deprecated ADR.

When a component's implementation would conflict with an accepted ADR, that conflict must be surfaced explicitly — either by revising the component design or by drafting a new ADR before proceeding.

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
