---
name: review-system-architecture
description: Failure modes and review passes specific to system architecture documents
topics: [review, architecture, components, data-flow, modules]
---

# Review: System Architecture

The system architecture document translates domain models and ADR decisions into a concrete component structure, data flows, and module organization. It is the primary reference for all subsequent phases — database schema, API contracts, UX spec, and implementation tasks all derive from it. Errors here propagate everywhere.

This review uses 10 passes targeting the specific ways architecture documents fail.

Follows the review process defined in `review-methodology.md`.

---

## Pass 1: Domain Model Coverage

### What to Check

Every domain model (entity, aggregate, bounded context) maps to at least one component or module in the architecture. No domain concept is left without an architectural home.

### Why This Matters

Unmapped domain concepts are features that have nowhere to live. When an implementing agent encounters a domain entity with no architectural home, it either creates an ad hoc module (fragmenting the architecture) or shoehorns it into an existing module (creating a god module). Both outcomes degrade system structure.

### How to Check

1. List every bounded context from domain models
2. For each context, verify there is a corresponding module, service, or component in the architecture
3. List every aggregate root within each context
4. For each aggregate, verify its data and behavior are housed in the identified component
5. Check that domain relationships (context map) are reflected in component interactions
6. Verify that domain events map to communication channels between components

### What a Finding Looks Like

- P0: "Bounded context 'Notifications' from domain models has no corresponding component in the architecture. Six domain events reference notification delivery but no component handles them."
- P1: "Aggregate 'SubscriptionPlan' is in domain models but its behavior is split between 'BillingService' and 'UserService' without clear ownership."
- P2: "Domain event 'InventoryReserved' is documented but the architecture does not show which component publishes it."

---

## Pass 2: ADR Constraint Compliance

### What to Check

The architecture respects every accepted ADR decision. Technology choices, pattern decisions, and constraints documented in ADRs are reflected in the architecture.

### Why This Matters

ADRs are binding decisions. An architecture that ignores an ADR creates a contradiction that implementing agents must resolve on the fly. If ADR-005 says "PostgreSQL for all persistent data" but the architecture shows a MongoDB component, agents face a contradiction with no resolution path.

### How to Check

1. List every accepted ADR and its core decision
2. For each ADR, trace its impact on the architecture: which components, data flows, or patterns does it constrain?
3. Verify the architecture conforms to each constraint
4. For ADRs with negative consequences, verify the architecture accounts for mitigation strategies
5. Check that architectural patterns match ADR decisions (if ADR says "hexagonal architecture," verify port/adapter structure)
6. Verify technology selections in the architecture match ADR technology decisions

### What a Finding Looks Like

- P0: "ADR-007 decides 'event-driven communication between bounded contexts' but the architecture shows synchronous REST calls between Order and Inventory services."
- P1: "ADR-003 specifies 'monolith-first approach' but the architecture describes five separate services without explaining the planned extraction path."
- P2: "ADR-011 notes 'caching adds invalidation complexity' as a negative consequence, but the architecture's caching component does not address invalidation strategy."

---

## Pass 3: Data Flow Completeness

### What to Check

Every component appears in at least one data flow. All data flows have a clear source, destination, protocol, and payload description. No orphaned components exist.

### Why This Matters

Components that appear in no data flow are either unnecessary (dead architecture) or have undocumented interactions (hidden coupling). Both are problems. Missing data flows mean the implementing agent does not know how data gets into or out of a component — they must invent the integration at implementation time.

### How to Check

1. List every component in the architecture
2. For each component, verify it appears as source or destination in at least one data flow
3. For each data flow, verify: source is a real component, destination is a real component, protocol/mechanism is specified (HTTP, events, database, file), data shape or payload is described
4. Check for bidirectional flows that are only documented in one direction
5. Verify error flows: what happens when a data flow fails? Is the error path documented?
6. Check for external system interactions: are third-party APIs, external databases, or external services documented as data flow endpoints?

### What a Finding Looks Like

- P0: "Component 'AnalyticsEngine' appears in the component diagram but is not referenced in any data flow. It has no documented inputs or outputs."
- P1: "Data flow from 'OrderService' to 'NotificationService' does not specify the communication mechanism. Is it synchronous HTTP, async events, or direct function calls?"
- P2: "Error flow for payment processing failure is missing. What happens when the payment gateway returns an error? Where does the error propagate?"

---

## Pass 4: Module Structure Integrity

### What to Check

The module/directory structure has no circular dependencies, reasonable sizes, clear boundaries, and follows the patterns specified in ADRs.

### Why This Matters

Circular module dependencies make the system impossible to build, test, or deploy independently. Overly large modules become maintenance nightmares. Unclear boundaries lead to feature leakage, where functionality drifts into the wrong module because the right one is ambiguous.

### How to Check

1. Trace the import/dependency direction between modules — draw the dependency graph
2. Check for cycles in the dependency graph (A depends on B depends on C depends on A)
3. Verify the dependency direction aligns with the domain model's upstream/downstream relationships
4. Check module sizes: are any modules housing too many responsibilities? (More than one bounded context worth of functionality)
5. Verify that shared/common modules are minimal — they tend to become dumping grounds
6. Check that the file/directory structure matches the module boundaries (not split across directories or merged into one)

### What a Finding Looks Like

- P0: "'auth' module imports from 'orders' module, and 'orders' module imports from 'auth'. This circular dependency must be broken — introduce an interface or event."
- P1: "The 'core' module contains entities from three different bounded contexts. It should be split to maintain domain boundaries."
- P2: "The 'utils' module has grown to 15 files. Consider whether these utilities belong in the modules that use them."

---

## Pass 5: State Consistency

### What to Check

State management design covers all identified state stores and their interactions. State transitions are consistent with domain events. No state is managed in two places without synchronization.

### Why This Matters

Inconsistent state is the source of the most difficult-to-debug production issues. When the same conceptual state is managed in two places (database and cache, two services, client and server), they drift apart. State management must be explicit about what is the source of truth and how consistency is maintained.

### How to Check

1. List every state store in the architecture (databases, caches, session stores, client-side state, queues)
2. For each state store, identify what data it holds and which component owns it
3. Check for the same data appearing in multiple stores — is synchronization documented?
4. Verify that state transitions correspond to domain events
5. Check for derived state: is it cached? How is it invalidated?
6. Look for implicit state: component memory, local files, environment variables that hold state between requests

### What a Finding Looks Like

- P0: "User preferences are stored in both the UserService database and a client-side cache with no documented synchronization mechanism. These will drift."
- P1: "Order status is derived from the last OrderEvent, but the architecture also shows an 'order_status' column in the orders table. Two sources of truth."
- P2: "Session state is described as 'in-memory' but the deployment section mentions multiple instances. In-memory session state does not work with horizontal scaling."

---

## Pass 6: Diagram/Prose Consistency

### What to Check

Architecture diagrams and narrative prose describe the same system. Component names match. Relationships match. No components appear in diagrams but not prose, or vice versa.

### Why This Matters

Diagrams and prose inevitably drift when maintained independently. Implementing agents read both and expect them to agree. When a diagram shows four services but the prose describes three, the agent does not know which is correct. Consistent diagram/prose is the minimum bar for a trustworthy architecture document.

### How to Check

1. List every component named in diagrams
2. List every component named in prose
3. Verify 1:1 correspondence — every diagrammed component has a prose description, every prose-described component appears in a diagram
4. Check component names: do diagrams and prose use the same names?
5. Check relationships: do diagrams and prose describe the same connections between components?
6. Check directionality: do arrows in diagrams match the dependency/data flow direction described in prose?

### What a Finding Looks Like

- P0: "The component diagram shows a 'Gateway' component that is not mentioned anywhere in the prose sections. Is this the API Gateway described in the 'Request Routing' section under a different name?"
- P1: "The prose describes data flowing from Frontend to Backend to Database, but the data flow diagram shows Frontend connecting directly to Database for reads."
- P2: "Component is called 'AuthService' in the diagram and 'Authentication Module' in the prose. Use one name."

---

## Pass 7: Extension Point Integrity

### What to Check

Extension points are designed with concrete interfaces, not merely listed. Each extension point specifies what can be extended, how to extend it, and what the constraints are.

### Why This Matters

"This is extensible" without design details is useless to implementing agents. They need to know the extension mechanism (plugin interface, middleware chain, event hooks, configuration), the contract (what an extension receives, what it returns, what it must not do), and examples of intended extensions.

### How to Check

1. List all claimed extension points in the architecture
2. For each, check: is there a concrete interface or contract? (Not just "this module is extensible")
3. Verify the extension mechanism is specified: plugin pattern, event hooks, middleware, strategy pattern, etc.
4. Check that the extension contract is clear: what inputs, what outputs, what side effects are allowed?
5. Verify at least one example use case for each extension point
6. Check that extension points align with likely future requirements from the PRD

### What a Finding Looks Like

- P1: "Architecture says 'the payment system supports multiple payment providers via plugins' but does not define the plugin interface, lifecycle, or registration mechanism."
- P1: "Authentication extension point lists 'social login providers can be added' but does not specify the provider interface or token exchange contract."
- P2: "Notification extension point is well-designed but lacks an example of how a new channel (e.g., SMS) would be added."

---

## Pass 8: Invariant Verification

### What to Check

The architecture preserves domain invariants. Invariants identified in domain models are enforceable within the architecture's component and transaction boundaries.

### Why This Matters

An invariant that requires two components to coordinate atomically cannot be enforced if those components are separate services with no transaction mechanism. The architecture must ensure that invariant enforcement boundaries match component boundaries — or provide explicit mechanisms (sagas, compensating transactions) for cross-boundary invariants.

### How to Check

1. List every domain invariant from domain models
2. For each invariant, identify which architectural component(s) are responsible for enforcing it
3. If the invariant spans a single component, verify the component has access to all required state
4. If the invariant spans multiple components, verify a coordination mechanism is documented (distributed transaction, saga, event-driven consistency)
5. For cross-component invariants, check the consistency model: strong consistency (must be atomic) or eventual consistency (can tolerate temporary violations)?
6. Verify that the consistency model aligns with the business tolerance stated in domain models

### What a Finding Looks Like

- P0: "Invariant 'order total must equal sum of line items minus discounts' requires Order and Pricing data, but these are in separate services with no documented coordination mechanism."
- P1: "Invariant 'user cannot have duplicate email' spans UserService and AuthService. Which service enforces this? What happens if both create a user simultaneously?"
- P2: "Invariant enforcement is documented but the consistency model (strong vs. eventual) is not specified."

---

## Pass 9: Downstream Readiness

### What to Check

Phases 4-7 (Database Schema, API Contracts, UX Spec, Implementation Tasks) can proceed with this architecture document.

### Why This Matters

Four phases consume the architecture document simultaneously or in rapid succession. Gaps in the architecture create cascading ambiguity across all four downstream phases.

### How to Check

Phase 4 (Database Schema) needs:
1. Data storage components identified with their technology and role
2. Entity-to-storage mapping clear enough to design tables/collections
3. Data relationships explicit enough to define foreign keys or references

Phase 5 (API Contracts) needs:
1. Component interfaces defined at operation level
2. Communication protocols specified (REST, GraphQL, gRPC)
3. Auth/authz architecture clear enough to define per-endpoint requirements

Phase 6 (UX Spec) needs:
1. Frontend component architecture defined
2. State management approach specified
3. API integration points identified from the frontend perspective

Phase 7 (Implementation Tasks) needs:
1. Module boundaries clear enough to define task scope
2. Dependencies between modules explicit enough to define task ordering
3. Component complexity visible enough to estimate task sizing

### What a Finding Looks Like

- P0: "No data storage architecture section. Phase 4 cannot begin database design without knowing what databases exist and what data each holds."
- P1: "Frontend architecture section describes 'a React app' without component structure. Phase 6 needs at least a high-level component hierarchy."
- P2: "Module dependencies are clear but not explicitly listed in a format that Phase 7 can directly use for task dependency ordering."

---

## Pass 10: Internal Consistency

### What to Check

Terminology, cross-references, and structural claims are internally consistent. The document does not contradict itself.

### Why This Matters

Architecture documents are long. Inconsistencies between early and late sections indicate that the document was written incrementally without reconciliation passes. Each inconsistency is a potential source of confusion for implementing agents.

### How to Check

1. Build a terminology list from the document — every component name, pattern name, and technology reference
2. Check for variant names (same component called different things in different sections)
3. Verify cross-references: when one section says "as described in the Data Flow section," check that the Data Flow section actually describes it
4. Check for quantitative consistency: if Section 2 says "three services" and Section 5 describes four, which is correct?
5. Verify that the module structure section and the component diagram describe the same set of modules
6. Check that technology versions, library names, and tool references are consistent throughout

### What a Finding Looks Like

- P1: "Section 3 describes the system as having five microservices, but the component diagram shows six. The 'Scheduler' component appears in the diagram but not in the prose."
- P1: "The architecture uses 'API Gateway' in sections 2-4 and 'Reverse Proxy' in section 6 for what appears to be the same component."
- P2: "Node.js version is stated as 18 in section 1 and 20 in the deployment section."
