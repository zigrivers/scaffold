---
name: backend-async-patterns
description: Message queue patterns, event-driven architecture, saga patterns, retry strategies, and idempotency keys
topics: [backend, async, message-queues, event-driven, saga, retry, idempotency, cqrs]
---

## Message Queue Patterns

**Pub/sub (publish-subscribe):** Publishers emit events to a topic without knowing who consumes them. Multiple subscribers independently receive each message. Use for fan-out scenarios — an order placed event triggers inventory update, email notification, and analytics simultaneously.

**Work queues (competing consumers):** Messages are distributed across multiple workers; each message is processed by exactly one worker. Use for task distribution — image processing, email sending, PDF generation. Enables horizontal scaling: add workers to increase throughput.

**Dead letter queues (DLQ):** Messages that fail after the maximum retry attempts are moved to a DLQ instead of being dropped. Monitor DLQ depth as a health signal. Inspect failed messages, fix the root cause, then replay from the DLQ. Always configure a DLQ — without one, unprocessable messages either loop forever or are silently lost.

## Event-Driven Architecture

**Event sourcing:** Store the sequence of state-changing events as the system of record, not the current state. The current state is a projection derived by replaying events. Benefits: complete audit history, ability to reconstruct past state, event replay for debugging. Cost: more complex reads (projections), eventual consistency, snapshot management for performance.

**CQRS (Command Query Responsibility Segregation):** Separate the write model (commands that change state) from the read model (queries optimized for display). Commands go through validation and business logic; read models are denormalized for query performance. Event sourcing and CQRS are often paired but are independent patterns — CQRS is valuable without event sourcing when read and write workloads have very different shapes.

**Event schema evolution:** Version event schemas from the start. Consumers must handle older event versions gracefully. Use a schema registry (Confluent Schema Registry, AWS Glue Schema Registry) to enforce compatibility. Prefer additive changes (new optional fields) over breaking changes.

## Saga Pattern for Distributed Transactions

Sagas coordinate multi-step transactions across services without two-phase commit. Each step has a compensating transaction that undoes its effect.

**Choreography:** Each service emits events and other services react. No central coordinator. Simpler but harder to trace and reason about for long workflows.

**Orchestration:** A saga orchestrator service drives the workflow, calling each participant and issuing compensating calls on failure. Easier to trace and monitor; the orchestrator is a single point of failure.

Use sagas when: a business operation spans multiple services or databases, and full ACID transactions are not available. Always design compensating transactions before implementing the forward path.

## Retry Strategies

**Exponential backoff:** After a failure, wait before retrying. Double the wait on each subsequent attempt: 1s, 2s, 4s, 8s, 16s. Add jitter (randomness of ±25%) to prevent retry storms — without jitter, all callers retry simultaneously and overwhelm the recovering service.

**Maximum attempts:** Cap total retries (typically 3–5). After the maximum, either raise the error to the caller, move the message to a DLQ, or trigger an alert.

**Circuit breaker:** Track the failure rate of calls to a dependency. When failures exceed a threshold (e.g., 50% of calls in the last 10 seconds), open the circuit and immediately return an error without attempting the call. After a cooldown period, allow a single probe request — if it succeeds, close the circuit; if it fails, stay open. Circuit breakers prevent cascading failures when a downstream service is slow or down.

## Idempotency Keys

Make all mutating operations idempotent so they can be safely retried. The client generates a unique idempotency key (UUID) and sends it with the request. The server records the key and the response. On a duplicate request with the same key, return the stored response without re-executing the operation.

**Storage:** Store idempotency keys in Redis or the database with the operation result. Set TTL based on reasonable retry windows (24 hours for payments, 1 hour for most operations).

**Scope:** Idempotency keys must be scoped to a user or API key — global keys are a DoS vector. Return `409 Conflict` if the same key is used with different request parameters (key collision detection).

Design database operations to be naturally idempotent where possible: `INSERT ... ON CONFLICT DO NOTHING`, `UPSERT`, or check-then-insert in a transaction.
