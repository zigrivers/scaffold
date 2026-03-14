---
name: review-domain-modeling
description: Failure modes and review passes specific to domain modeling artifacts
topics: [review, domain-modeling, ddd, bounded-contexts]
---

# Review: Domain Modeling

Domain models are the foundation of the entire pipeline. Every subsequent phase builds on them. A gap or error here compounds through ADRs, architecture, database schema, API contracts, and implementation tasks. This review uses 10 passes targeting the specific ways domain models fail.

Follows the review process defined in `review-methodology.md`.

---

## Pass 1: PRD Coverage Audit

### What to Check

Every feature and requirement in the PRD maps to at least one domain. No PRD requirement exists without a domain home. No domain exists without PRD traceability.

### Why This Matters

Orphaned requirements — PRD features that no domain covers — mean the system literally cannot implement those features. Phantom domains — domains with no PRD traceability — indicate scope creep or misunderstanding of the problem space. Both cause expensive rework when discovered during implementation.

### How to Check

1. List every feature from the PRD (use the feature list, user stories, or requirements section)
2. For each feature, identify which domain(s) it touches
3. Mark features that have no domain mapping — these are orphaned
4. List all domains and bounded contexts from the domain models
5. For each domain, trace back to at least one PRD feature
6. Mark domains with no PRD traceability — these are phantoms
7. Check that non-functional requirements (performance, security, scalability) are reflected in domain constraints where relevant

### What a Finding Looks Like

- P0: "PRD feature 'Multi-tenant billing' has no domain mapping. No bounded context addresses tenant isolation or billing lifecycle."
- P1: "Domain 'Analytics' has no PRD traceability. The PRD mentions reporting but not analytics as a separate concern."
- P2: "PRD non-functional requirement 'sub-200ms API response' is not reflected in any domain model constraint."

---

## Pass 2: Bounded Context Integrity

### What to Check

Context boundaries are clean. No entity appears in multiple contexts without an explicit integration relationship. Shared kernels are documented. Anticorruption layers exist at context boundaries.

### Why This Matters

Leaky context boundaries are the most common domain modeling failure. When an entity like "User" appears in three contexts with slightly different meanings, implementing agents build tight coupling between modules. This causes merge conflicts, circular dependencies, and change amplification — modifying one context breaks others.

### How to Check

1. For each bounded context, list its entities and value objects
2. Search for entity names that appear in multiple contexts
3. For each shared name, determine: is it genuinely shared (shared kernel), or is it a different concept with the same name (homonym indicating a boundary)?
4. Verify shared kernel entities have explicit documentation of what is shared and who owns changes
5. At every context boundary, verify the integration mechanism is specified (domain events, API calls, shared database, anticorruption layer)
6. Check that no context directly references another context's internal entities

### What a Finding Looks Like

- P0: "'Order' entity appears in Catalog, Checkout, and Fulfillment contexts with different attributes but no integration relationship documented."
- P1: "Shared kernel between Auth and User Profile contexts exists but does not specify ownership of the 'email' field."
- P2: "Context map exists but does not specify whether upstream/downstream relationships use conformist, anticorruption layer, or open host patterns."

---

## Pass 3: Entity vs Value Object Classification

### What to Check

Entities have identity and lifecycle. Value objects are immutable and compared by value. Misclassification is a common error that propagates into database schema and API design.

### Why This Matters

Misclassifying an entity as a value object means losing its lifecycle tracking — no history, no identity-based lookups. Misclassifying a value object as an entity means unnecessary database tables, unnecessary IDs, and unnecessary complexity. Both lead to schema rework.

### How to Check

For each entity, ask:
1. Does this concept need to be tracked over time? (If not, it may be a value object)
2. Are two instances with identical attributes the same thing or different things? (If same, it is a value object)
3. Does this concept have a lifecycle with distinct states? (If not, it may be a value object)

For each value object, ask:
1. Would the system ever need to update this independently? (If yes, it may be an entity)
2. Does this concept appear in domain events as a subject (not just data)? (If yes, it may be an entity)
3. Does this concept need a unique identifier for reference? (If yes, it is an entity)

### What a Finding Looks Like

- P1: "'Address' is modeled as an entity with an ID, but two addresses with the same street/city/zip are semantically identical. Should be a value object."
- P1: "'Price' is modeled as a value object, but the system needs to track price history and price changes. Should be an entity with a lifecycle."
- P2: "'Currency' is modeled as an entity but has no lifecycle — it is a static reference value. Consider value object or reference data."

---

## Pass 4: Aggregate Boundary Validation

### What to Check

Aggregates enforce consistency boundaries. Each aggregate is the right size — large enough to enforce its invariants, small enough to avoid contention.

### Why This Matters

Too-large aggregates lock too much data during updates, causing concurrency bottlenecks and unnecessary transaction scope. Too-small aggregates cannot enforce their invariants, leading to inconsistent state. Wrong aggregate boundaries are the most expensive domain modeling error to fix post-implementation because they affect database schema, API contracts, and transaction boundaries.

### How to Check

1. For each aggregate, list its invariants (from Pass 6 if already done, or identify them now)
2. Verify each invariant can be enforced within the aggregate's boundary without reaching into other aggregates
3. Check for aggregates that reference other aggregates by direct object reference (should use ID reference instead)
4. Look for aggregates with more than 5-7 entities — these are likely too large
5. Look for invariants that span multiple aggregates — these indicate either wrong boundaries or the need for a domain service/saga
6. Check that aggregate roots are clearly identified and that all access to aggregate internals goes through the root

### What a Finding Looks Like

- P0: "Invariant 'order total must equal sum of line items minus discounts' spans Order aggregate and Discount aggregate. Either Discount should be inside Order aggregate, or this invariant needs a domain service."
- P1: "Customer aggregate contains Order history directly. This means updating an order locks the entire customer. Order should be a separate aggregate referencing Customer by ID."
- P2: "Product aggregate root is not explicitly identified. Three entities (Product, Variant, Pricing) could each be the root."

---

## Pass 5: Domain Event Completeness

### What to Check

Every meaningful state transition produces a domain event. Events capture business-meaningful changes (not CRUD operations). Event payloads carry sufficient context for consumers.

### Why This Matters

Missing domain events mean downstream consumers cannot react to state changes. In event-driven architectures, missing events create invisible data synchronization gaps. Even in non-event-driven systems, domain events document the system's behavior contract — what happens when state changes.

### How to Check

1. For each entity with a lifecycle, trace through its state transitions
2. Verify each transition has a corresponding domain event
3. Check that events are named in past tense business language ("OrderPlaced" not "CreateOrder" or "OrderCreated")
4. Verify event payloads include enough context for consumers to act without querying back to the source
5. Check for state transitions that happen implicitly (timer-based, batch, external trigger) — these often lack events
6. Verify events do not carry the entire entity state (anti-pattern) — they should carry what changed and context

### What a Finding Looks Like

- P0: "Order has states Draft, Submitted, Approved, Shipped, Delivered but only OrderPlaced and OrderShipped events exist. Missing: OrderApproved, OrderDelivered."
- P1: "UserRegistered event carries only userId. Downstream services (email, analytics) need email address and registration source. Payload is insufficient."
- P2: "Events use inconsistent naming: 'OrderPlaced' (past tense) vs 'ShipOrder' (imperative). Standardize to past tense."

---

## Pass 6: Invariant Specification

### What to Check

Invariants are testable assertions with clear conditions. Each specifies what must be true, when it applies, and what happens on violation.

### Why This Matters

Vague invariants like "orders must be valid" are unimplementable. Implementing agents need precise, testable rules to write validation logic and tests. Missing invariants mean missing validation — the system accepts invalid state.

### How to Check

1. For each aggregate, list all invariants
2. For each invariant, verify it is a testable boolean assertion (not a vague statement)
3. Check that the invariant specifies its scope: always true? Only in certain states? Only for certain entity types?
4. Verify violation behavior is specified: reject the operation? Compensate? Log and continue?
5. Look for implicit invariants that are obvious to domain experts but not documented (uniqueness constraints, ordering constraints, temporal constraints)
6. Check for invariants that reference external state — these may need special handling

### What a Finding Looks Like

- P0: "Invariant 'an order must be valid' is not testable. What constitutes validity? Minimum one line item? Non-negative total? Valid shipping address?"
- P1: "Uniqueness of email within an account is implied by the registration flow but not stated as an invariant. This needs explicit specification."
- P1: "Invariant 'discount cannot exceed order total' does not specify violation behavior. Should the operation be rejected, or should the discount be capped?"

---

## Pass 7: Ubiquitous Language Consistency

### What to Check

Terminology is consistent across all domain models. No synonyms (different words for the same concept). No homonyms (same word for different concepts — these indicate a context boundary).

### Why This Matters

Inconsistent terminology causes implementing agents to build the wrong thing. If "Customer" means "authenticated user" in one context and "billing entity" in another without clarification, the agent picks one interpretation and builds to it. Synonyms cause duplicate implementations — two services doing the same thing under different names.

### How to Check

1. Build a glossary from all domain models: every noun (entity, value object, event, service)
2. Search for synonyms: different terms that seem to mean the same thing (Customer/Client/User, Order/Purchase/Transaction)
3. For each synonym pair, determine: truly the same concept (pick one term) or subtly different concepts (define the distinction)
4. Search for homonyms: same term used in different contexts with different attributes or behavior
5. For each homonym, determine: should be the same concept (align definitions) or should be different concepts (this is a context boundary — document it)
6. Check that event names, aggregate names, and relationship names use terms from the glossary

### What a Finding Looks Like

- P0: "'User' means an authenticated identity in the Auth context but a customer profile in the Commerce context. This is a valid context boundary but is not documented as such."
- P1: "Domain models use both 'Order' and 'Purchase' to refer to the same concept. Pick one and use it everywhere."
- P2: "'Item' is used informally in narrative sections but the formal model uses 'LineItem'. Align informal usage."

---

## Pass 8: Cross-Domain Relationship Clarity

### What to Check

Relationships between domains are explicit. Direction of dependency is clear. Communication mechanism is specified.

### Why This Matters

Implicit cross-domain relationships become implicit runtime dependencies. If Domain A references Domain B's entities without specifying the mechanism, implementing agents create tight coupling. During implementation, this manifests as import cycles, deployment ordering issues, and cascading failures.

### How to Check

1. List all relationships between bounded contexts (the context map)
2. For each relationship, verify: upstream/downstream direction, communication mechanism (events, direct API, shared database), data that flows across the boundary
3. Check for undocumented relationships: does Domain A reference concepts from Domain B without a documented relationship?
4. Verify that no domain depends on another domain's internal structure (only on its published interface)
5. Look for circular dependencies between domains — these usually indicate incorrect boundaries
6. Check that relationship multiplicity is specified (one-to-one, one-to-many, many-to-many)

### What a Finding Looks Like

- P0: "Billing domain references Order domain entities directly but no relationship is documented. Is Billing downstream of Orders? Does it receive events or query an API?"
- P1: "Context map shows Inventory upstream of Orders, but Orders also writes to Inventory (stock reservation). This is a bidirectional dependency that needs explicit handling."
- P2: "Relationship between Auth and Notification domains specifies 'events' but does not name the specific events."

---

## Pass 9: Downstream Readiness

### What to Check

Phase 2 (ADRs) needs specific information from domain models. Verify that information is present and sufficient.

### Why This Matters

ADRs make technology and pattern decisions informed by domain complexity. If domain models do not surface the constraints and characteristics that drive those decisions, ADRs are made on assumptions rather than analysis.

### How to Check

Phase 2 specifically needs:
1. **Clear domain boundaries** — To decide on module/service decomposition strategy
2. **Technology-relevant constraints** — Real-time requirements, data volume projections, consistency requirements that influence technology selection
3. **Performance-sensitive operations** — Operations with latency, throughput, or data volume requirements that affect architecture decisions
4. **Integration complexity** — How many cross-domain interactions exist, their frequency, their consistency requirements
5. **Data storage characteristics** — Relational vs. document vs. graph patterns visible in the domain models
6. **Security boundaries** — Which domains handle sensitive data, authentication, authorization

For each item, verify it is explicitly present in the domain models or can be reasonably inferred.

### What a Finding Looks Like

- P0: "No domain model mentions data volume or throughput characteristics. Phase 2 cannot make database technology decisions without this information."
- P1: "Real-time requirements are mentioned in the PRD but not reflected in any domain model's constraints section."
- P2: "Data storage patterns are implicit (relational structure visible) but not explicitly stated as a constraint or preference."

---

## Pass 10: Internal Consistency

### What to Check

Cross-references resolve. Terminology does not drift within a single model. No contradictions between entity definitions and relationship diagrams.

### Why This Matters

Internal inconsistencies within a single domain model erode trust in the artifact. If an entity's attributes list says one thing and the relationship diagram says another, the implementing agent must guess which is correct. Cumulative small inconsistencies make the entire model unreliable.

### How to Check

1. For each cross-reference (entity A "references" entity B), verify entity B exists and the reference direction matches
2. Check that entity attribute lists match what the relationship diagrams show
3. Verify that invariants reference entities and attributes that actually exist in the model
4. Check that domain events reference entities and state transitions defined in the model
5. Look for terminology drift: same concept called different things in different sections of the same document
6. Verify that aggregates contain exactly the entities they claim to contain — not more, not fewer

### What a Finding Looks Like

- P0: "Invariant 'PaymentAmount must not exceed OrderTotal' references PaymentAmount, but the Payment entity has an attribute called 'amount', not 'paymentAmount'."
- P1: "Relationship diagram shows Order -> Customer as one-to-many, but the Order entity definition says 'each order belongs to one customer' (many-to-one). Direction is inverted."
- P2: "The Inventory domain model calls the same concept 'stock level' in the overview and 'quantity on hand' in the entity definition."
