---
name: backend-async-patterns
description: Message queue patterns, event-driven architecture, saga patterns, retry strategies, and idempotency keys
topics: [backend, async, message-queues, event-driven, saga, retry, idempotency, cqrs]
---

Asynchronous patterns decouple services in time and space, enabling systems to absorb load spikes, survive partial failures, and scale independently — but they introduce delivery guarantees and consistency tradeoffs that must be designed for explicitly from the start.

## Summary

Asynchronous patterns come in two primary shapes: pub/sub for fan-out scenarios and work queues for competing consumers. Dead letter queues capture messages that exhaust retry attempts. Always configure a DLQ — without one, unprocessable messages either loop forever or are silently lost.

For distributed transactions, the saga pattern coordinates multi-step operations across services using either choreography (event-driven) or orchestration (central coordinator). All retry strategies should use exponential backoff with jitter to prevent retry storms, and circuit breakers prevent cascading failures when downstream services are degraded.

## Deep Guidance

### Message Queue Patterns

**Pub/sub (publish-subscribe):** Publishers emit events to a topic without knowing who consumes them. Multiple subscribers independently receive each message. Use for fan-out scenarios — an order placed event triggers inventory update, email notification, and analytics simultaneously.

**Work queues (competing consumers):** Messages are distributed across multiple workers; each message is processed by exactly one worker. Use for task distribution — image processing, email sending, PDF generation. Enables horizontal scaling: add workers to increase throughput.

**Dead letter queues (DLQ):** Messages that fail after the maximum retry attempts are moved to a DLQ instead of being dropped. Monitor DLQ depth as a health signal. Inspect failed messages, fix the root cause, then replay from the DLQ. Always configure a DLQ — without one, unprocessable messages either loop forever or are silently lost.

### Event-Driven Architecture

**Event sourcing:** Store the sequence of state-changing events as the system of record, not the current state. The current state is a projection derived by replaying events. Benefits: complete audit history, ability to reconstruct past state, event replay for debugging. Cost: more complex reads (projections), eventual consistency, snapshot management for performance.

**CQRS (Command Query Responsibility Segregation):** Separate the write model (commands that change state) from the read model (queries optimized for display). Commands go through validation and business logic; read models are denormalized for query performance. Event sourcing and CQRS are often paired but are independent patterns — CQRS is valuable without event sourcing when read and write workloads have very different shapes.

**Event schema evolution:** Version event schemas from the start. Consumers must handle older event versions gracefully. Use a schema registry (Confluent Schema Registry, AWS Glue Schema Registry) to enforce compatibility. Prefer additive changes (new optional fields) over breaking changes.

### Saga Pattern for Distributed Transactions

Sagas coordinate multi-step transactions across services without two-phase commit. Each step has a compensating transaction that undoes its effect.

**Choreography:** Each service emits events and other services react. No central coordinator. Simpler but harder to trace and reason about for long workflows.

**Orchestration:** A saga orchestrator service drives the workflow, calling each participant and issuing compensating calls on failure. Easier to trace and monitor; the orchestrator is a single point of failure.

Use sagas when: a business operation spans multiple services or databases, and full ACID transactions are not available. Always design compensating transactions before implementing the forward path.

### Retry Strategies

**Exponential backoff:** After a failure, wait before retrying. Double the wait on each subsequent attempt: 1s, 2s, 4s, 8s, 16s. Add jitter (randomness of ±25%) to prevent retry storms — without jitter, all callers retry simultaneously and overwhelm the recovering service.

**Maximum attempts:** Cap total retries (typically 3–5). After the maximum, either raise the error to the caller, move the message to a DLQ, or trigger an alert.

**Circuit breaker:** Track the failure rate of calls to a dependency. When failures exceed a threshold (e.g., 50% of calls in the last 10 seconds), open the circuit and immediately return an error without attempting the call. After a cooldown period, allow a single probe request — if it succeeds, close the circuit; if it fails, stay open. Circuit breakers prevent cascading failures when a downstream service is slow or down.

### Idempotency Keys

Make all mutating operations idempotent so they can be safely retried. The client generates a unique idempotency key (UUID) and sends it with the request. The server records the key and the response. On a duplicate request with the same key, return the stored response without re-executing the operation.

**Storage:** Store idempotency keys in Redis or the database with the operation result. Set TTL based on reasonable retry windows (24 hours for payments, 1 hour for most operations).

**Scope:** Idempotency keys must be scoped to a user or API key — global keys are a DoS vector. Return `409 Conflict` if the same key is used with different request parameters (key collision detection).

Design database operations to be naturally idempotent where possible: `INSERT ... ON CONFLICT DO NOTHING`, `UPSERT`, or check-then-insert in a transaction.

### Message Ordering Guarantees

Different messaging systems provide different ordering guarantees:

- **FIFO (First In, First Out)**: SQS FIFO queues, Kafka partitions. Messages are delivered in the order they were sent. Useful for operations where order matters (sequential state transitions, financial transactions).
- **Best-effort ordering**: Standard SQS, most pub/sub systems. Messages may arrive out of order. Design consumers to handle reordering — use sequence numbers or timestamps to detect and resolve ordering conflicts.
- **Partition-level ordering**: Kafka guarantees order within a partition. Use a partition key (user ID, order ID) to ensure all related messages go to the same partition and are processed in order.

When order matters, choose a system that guarantees it at the partition level rather than trying to enforce ordering at the application level. Application-level ordering (hold messages in a buffer, sort, then process) is fragile and adds latency.

### Backpressure Strategies

When a producer emits messages faster than consumers can process them, the system needs a backpressure strategy:

- **Queue depth limits**: Set a maximum queue depth. When the queue is full, the producer receives an error and must retry or drop the message. This prevents unbounded memory growth.
- **Rate limiting at the producer**: Throttle the producer based on consumer throughput. The producer monitors queue depth and reduces its emit rate when the queue approaches capacity.
- **Consumer scaling**: Automatically scale consumer instances based on queue depth. When depth exceeds a threshold, add workers. When it drops, scale down. Cloud-native options: AWS Lambda with SQS triggers (auto-scales), Kubernetes KEDA (queue-based autoscaler).
- **Shedding**: When overwhelmed, intentionally drop low-priority messages rather than processing everything slowly. Useful for telemetry or analytics events where some data loss is acceptable.

Monitor queue depth and consumer lag as primary health indicators. A growing queue depth means consumers are falling behind — this is a capacity planning signal, not a bug to ignore.

### Transactional Outbox Pattern

The transactional outbox pattern ensures that database writes and message publishing are atomic — either both happen or neither does:

1. Write the business data and the outbox event to the database in the same transaction
2. A separate process (poller or CDC) reads the outbox table and publishes events to the message queue
3. Mark outbox entries as published after successful delivery

This eliminates the dual-write problem where the database commit succeeds but the message publish fails (or vice versa). Use database CDC (Change Data Capture) with Debezium for production-grade implementations.

### Choosing a Message Broker

Select the broker based on throughput, ordering, and operational requirements:

- **Redis (via BullMQ, Redis Streams)**: Good for moderate throughput, simple to operate, already present in most stacks. Limited durability if Redis is not configured with AOF persistence. Best for job queues and task distribution.
- **RabbitMQ**: Full-featured broker with routing, exchanges, and consumer acknowledgment. Excellent for complex routing topologies. More operational overhead than Redis.
- **Kafka**: Designed for high-throughput event streaming with durable, ordered, replayable logs. Best for event-driven architectures where consumers need to replay history. Highest operational overhead.
- **SQS / Cloud Pub/Sub**: Managed services with zero operational overhead. Limited features compared to self-hosted brokers but eliminate infrastructure management entirely. Default choice for cloud-native services unless a specific feature gap forces self-hosting.

Start with the simplest broker that meets the requirements. Migrating from Redis to Kafka later is straightforward if the consumer interface is abstracted behind a repository pattern.
