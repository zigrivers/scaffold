---
name: backend-architecture
description: Monolith vs microservices decision framework, layered architecture patterns, CQRS, event sourcing, hexagonal architecture, and service mesh considerations
topics: [backend, architecture, microservices, monolith, cqrs, event-sourcing, hexagonal, clean-architecture]
---

Backend architecture is the set of structural decisions that determine how the system scales, how teams work independently, and how expensive future changes will be. The single most common backend architecture mistake is choosing microservices before the problem demands them. Start with the simplest architecture that solves the current problem, and evolve to complexity only when specific pain points — not hypothetical future ones — force the change.

## Summary

### Monolith vs Microservices Decision Framework

The choice is not philosophical — it is economic. Evaluate on these axes:

**Choose a monolith when:**
- Team size is under 10–15 engineers; coordination overhead of microservices exceeds the benefit
- The domain boundaries are not yet clear; premature decomposition creates the wrong service boundaries that are expensive to undo
- Operational maturity is low; microservices require observability, deployment pipelines, and network failure handling that monoliths do not
- The project is new; a well-structured monolith can be extracted into services later, at a fraction of the cost of rebuilding distributed services into a monolith

**Choose microservices when:**
- Different parts of the system have genuinely different scaling requirements (image processing vs user authentication vs real-time chat)
- Teams have hard ownership boundaries with independent release cadences; shared deployment is blocking velocity
- Specific services need different technology choices (ML inference in Python, payment processing in Go, main app in Node.js)
- The monolith's deployment coupling is causing real incidents — a change to a low-risk module blocking a high-stakes deployment

The "modular monolith" is the underrated middle path: a single deployment with strong internal module boundaries, co-located services with strict import rules, and a clear extraction path to microservices when the time comes.

### Layered Architecture (Controller → Service → Repository)

The foundational pattern for backend organization separates concerns across three layers:

- **Controller / Handler layer**: Owns HTTP. Parses requests, validates inputs, calls services, formats responses. Zero business logic.
- **Service layer**: Owns business logic. Orchestrates domain operations. Depends on repository interfaces. Returns domain objects or throws domain errors. No knowledge of HTTP, SQL, or external API SDKs.
- **Repository layer**: Owns data access. Translates between domain objects and persistence format. Exposes a domain-language interface: `findById`, `save`, `delete`.

This separation enables unit testing services with mocked repositories — the most valuable test in the suite.

### CQRS (Command Query Responsibility Segregation)

CQRS separates read and write models. Commands mutate state; queries return state. This is not a default pattern — apply it when reads and writes have meaningfully different performance, consistency, or complexity requirements:

- **Separate models**: The write model enforces invariants and emits events. The read model is denormalized for query performance — often a materialized view or a read-optimized document.
- **When to use**: High-read / low-write ratios where the read query complexity is a bottleneck, systems where read and write consistency requirements differ, event-driven systems where the write side already produces events.
- **When NOT to use**: Simple CRUD with no complex business rules; small teams where the dual-model overhead is not justified.

### Event Sourcing

Event sourcing stores the full history of state changes as an immutable event log, deriving current state by replaying events. This is a specialized pattern for specific use cases:

- **When justified**: Audit trails are a hard requirement (financial transactions, medical records), temporal queries ("what was the account balance at 3pm Tuesday?"), complex event-driven workflows where the event history has business value.
- **Cost**: Event replay infrastructure, eventual consistency complexity, developer mental overhead. Do not adopt speculatively.

### Hexagonal / Clean Architecture

Hexagonal architecture (Ports and Adapters) places the domain model at the center, surrounded by ports (interfaces) that define how the domain interacts with the outside world, and adapters that implement those interfaces for specific technologies:

- **Core domain**: Pure business logic with no framework or infrastructure dependencies.
- **Ports**: Interfaces the core defines. `UserRepository` is a port; `PostgresUserRepository` is an adapter.
- **Adapters**: HTTP controllers, database repositories, message queue consumers, external API clients.

The benefit: the domain is testable in isolation from all infrastructure. The cost: more interfaces and indirection. Apply when the domain is complex and long-lived; overkill for simple CRUD services.

## Deep Guidance

### Service Mesh Considerations

Service meshes (Istio, Linkerd, Consul Connect) add a sidecar proxy to each service pod, providing mTLS, traffic management, circuit breaking, and observability without application code changes. Consider only when:

- You have 10+ microservices and the operational complexity of per-service networking configuration is unsustainable
- Zero-trust networking is a compliance requirement
- You need traffic splitting for canary deployments at the infrastructure level

A service mesh adds significant operational overhead. Validate the need against simpler alternatives (application-level circuit breakers with Resilience4j / Polly / opossum, API gateway traffic management) before committing.
