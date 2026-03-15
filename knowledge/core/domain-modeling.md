---
name: domain-modeling
description: Domain-driven design patterns for identifying and modeling project domains
topics: [ddd, domain-modeling, entities, aggregates, bounded-contexts, domain-events, value-objects]
---

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
