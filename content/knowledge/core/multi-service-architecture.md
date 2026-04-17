---
name: multi-service-architecture
description: Service boundary design, communication patterns, service discovery, and networking topology
topics: [service-boundaries, communication-patterns, service-discovery, networking-topology, data-ownership, sync-vs-async]
---

## Summary

Multi-service architectures distribute system functionality across independently deployable units. The core trade-off is independent deployment and scaling versus operational complexity, distributed failure modes, and data consistency challenges.

**Decomposition strategies:**
- **Domain-driven:** Each bounded context becomes a candidate service — the most defensible approach.
- **Team-aligned:** Organize services along team boundaries for clear ownership.
- **Strangler Fig:** Incrementally extract from an existing monolith.

**Communication patterns:**
- **REST:** Default for synchronous request-response; universal support, easy to debug.
- **gRPC:** High-throughput internal service calls; strongly typed, binary serialization.
- **Message queues:** Async, single consumer; natural rate limiting, retry via dead-letter queues.
- **Event streaming (Kafka):** Async, multiple independent consumers; durable, replayable log.

**Service discovery:** DNS-based (Kubernetes default), client-side registry (Consul), or service mesh (Istio/Linkerd).

**Networking:** API gateway for external traffic; BFF pattern per client type; direct service-to-service for internal calls.

**Data ownership:** Each service owns its data exclusively — no cross-service direct database access. Data crosses boundaries via API calls, event subscriptions, or API composition.

## Deep Guidance

## Service Decomposition Strategies

### Domain-Driven Decomposition

The most defensible decomposition strategy: each bounded context from your domain model becomes a candidate service. A bounded context is a coherent, self-contained part of the domain with its own ubiquitous language and data model.

**Steps to decompose:**

1. Identify bounded contexts by finding the seams where domain language changes. When the word "account" means different things in billing versus support, those are different bounded contexts.
2. Map aggregate roots within each context. Each aggregate root (the entity that enforces invariants across a cluster of objects) is a unit of consistency.
3. Find domain events crossing context boundaries. These are the integration points — where one service must react to changes in another.
4. Apply the "can this context be developed, deployed, and scaled independently?" test to each candidate.

**Common bounded context candidates:**

- Identity/Authentication (users, credentials, sessions)
- Billing/Payments (subscriptions, invoices, payment methods)
- Catalog (products, pricing, availability)
- Orders (placement, fulfillment, cancellation)
- Notifications (email, push, SMS delivery)
- Analytics/Reporting (read-heavy, can lag behind)

**Trade-offs:**
- (+) Natural seams reduce cross-service coupling. Context boundaries map to team boundaries (Conway's Law).
- (+) Each service has a coherent ubiquitous language — cleaner code, clearer tests.
- (-) Requires significant upfront domain modeling investment. Wrong context boundaries are expensive to fix.
- (-) Domain events crossing boundaries require durable messaging infrastructure.

### Team-Aligned Decomposition

Organize services along team boundaries rather than domain boundaries. Each team owns one or more services they can deploy independently.

**When to prefer team-aligned over domain-driven:**

- Domain boundaries are unclear or disputed
- Organizational structure is stable and well-defined
- Need to achieve deployment independence quickly

**Trade-offs:**
- (+) Clear ownership. No ambiguity about which team is responsible for a service.
- (+) Enables parallel development without coordination overhead.
- (-) Services may not align with domain boundaries, creating awkward integration points.
- (-) Team reorganization forces service reorganization.

### Strangler Fig Pattern

For decomposing an existing monolith: incrementally extract functionality into new services while the monolith continues running. The monolith is the "strangler" being replaced over time.

**Steps:**
1. Identify a bounded context that is self-contained and has clear external interfaces.
2. Build the new service alongside the monolith, not replacing it yet.
3. Route traffic to the new service via an API gateway or proxy.
4. Migrate data to the new service's database.
5. Remove the corresponding code from the monolith.

**Trade-offs:**
- (+) No big-bang rewrite. Incremental risk.
- (+) The new service can be validated in production before the monolith code is removed.
- (-) Running both systems simultaneously doubles operational surface during transition.
- (-) Data migration is the hard part — requires careful cutover strategy.

### Service Granularity Guidelines

Services can be too coarse (essentially a distributed monolith) or too fine (nanoservices with network overhead for every operation).

**Signs a service is too coarse:**
- Multiple teams need to change the service for independent features
- Deployments require coordinating across multiple domain concepts
- The service has more than ~10 aggregates or ~5 bounded sub-contexts

**Signs a service is too fine:**
- Most operations require calls to 3+ other services to complete
- The service cannot perform meaningful work independently
- Deployment of this service almost always pairs with deployment of another service
- The service has fewer than 3-5 meaningful operations

**Rule of thumb:** A service should be independently deployable AND independently meaningful. If you always deploy services A and B together, they should probably be one service.

## Sync vs Async Communication Patterns

### Synchronous: REST

REST over HTTP is the default choice for synchronous request-response communication. Use it when the caller needs an immediate response to proceed.

```yaml
# OpenAPI 3.0 service contract example
openapi: "3.0.3"
info:
  title: Order Service API
  version: "1.0.0"
paths:
  /orders:
    post:
      summary: Place a new order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [customerId, items]
              properties:
                customerId:
                  type: string
                  format: uuid
                items:
                  type: array
                  items:
                    type: object
                    required: [productId, quantity]
                    properties:
                      productId:
                        type: string
                      quantity:
                        type: integer
                        minimum: 1
      responses:
        "201":
          description: Order placed
          content:
            application/json:
              schema:
                type: object
                properties:
                  orderId:
                    type: string
                    format: uuid
                  status:
                    type: string
                    enum: [pending, confirmed, failed]
        "422":
          description: Validation error or business rule violation
        "503":
          description: Downstream service unavailable
```

**Use REST when:**
- The caller needs the result immediately to continue (user-facing request, transactional operation)
- Simple CRUD operations
- External clients (mobile apps, browsers, third-party integrations)

**Trade-offs:**
- (+) Universal support. Easy to debug with standard tools (curl, browser dev tools).
- (+) Stateless — any instance can handle any request.
- (-) Temporal coupling: caller blocks until the callee responds.
- (-) Cascade failures: if the downstream service is slow, the upstream service's threads/connections pile up.
- (-) Chatty interfaces under load: many small requests are expensive.

### Synchronous: gRPC

Protocol Buffers over HTTP/2. Strongly typed, efficient binary serialization, bidirectional streaming support.

**Use gRPC when:**
- Internal service-to-service communication where you control both sides
- High-throughput, low-latency requirements (gRPC is ~5-10x faster than REST for equivalent payloads)
- Strongly typed contracts are more important than universal client support
- Streaming (server-sent events, client streaming, bidirectional)

**Trade-offs:**
- (+) Strongly typed contracts enforced at compile time. Breaking changes are caught early.
- (+) Binary serialization is compact and fast. Streaming support is native.
- (-) Not browser-native. Requires grpc-web proxy for browser clients.
- (-) Harder to debug (binary format). Need tooling like grpcurl or grpc-ui.
- (-) .proto files add a build step. Requires code generation for every language.

### Asynchronous: Message Queues

Producer sends a message to a queue; consumer processes it independently. The producer does not wait for the consumer to finish.

**Use message queues when:**
- The work can be done asynchronously (sending emails, processing uploads, generating reports)
- Rate limiting: smooth bursts of work across time
- Retry logic: failed messages stay in the queue and can be reprocessed
- Competing consumers: multiple workers process from the same queue

**Queue implementation options:**
- **Redis Streams / BullMQ** (Node.js): Simple, low operational overhead. Good for single-datacenter deployments.
- **RabbitMQ**: Traditional message broker. Good routing, dead-letter exchanges, per-message TTL.
- **Amazon SQS**: Fully managed. Good for AWS-centric architectures.

**Trade-offs:**
- (+) Temporal decoupling: producer and consumer don't need to be running simultaneously.
- (+) Natural rate limiting and backpressure.
- (+) Dead-letter queues catch failures for inspection and retry.
- (-) Eventual processing: you can't return the result to the original caller.
- (-) Ordering: standard queues don't guarantee FIFO. If order matters, use FIFO queues (SQS FIFO, Kafka partitions).
- (-) Duplicate delivery: at-least-once delivery means consumers must be idempotent.

### Asynchronous: Event Streaming (Kafka)

A durable, ordered, partitioned log of events. Unlike queues (messages are deleted after consumption), events in a stream are retained and multiple consumers can read the same events independently.

**Use event streaming when:**
- Multiple services need to react to the same business event
- Events need to be replayed (reprocessing, new consumers bootstrapping, audit)
- Event ordering within a partition matters
- High throughput (Kafka handles millions of events/second)

**Trade-offs:**
- (+) Multiple independent consumer groups — adding a new consumer doesn't affect existing ones.
- (+) Event replay enables new consumers to catch up on historical data.
- (+) High throughput and durability.
- (-) Operational complexity: Kafka clusters, topic partitioning, consumer group management.
- (-) Not suitable for low-latency RPC (Kafka adds latency compared to REST/gRPC).
- (-) Schema evolution requires care — Avro with Schema Registry or protobuf for schema enforcement.

### Choosing a Communication Pattern

```
Decision matrix:
  Caller needs result immediately AND operation is fast?      → REST or gRPC
  Caller needs result immediately AND it's internal service?  → gRPC (performance)
  Result not needed immediately AND single consumer?          → Message queue
  Result not needed immediately AND multiple consumers?       → Event streaming
  External clients (browser/mobile)?                          → REST only
  Streaming data (real-time, large payloads)?                 → gRPC streaming or WebSockets
```

## Service Discovery Patterns

### DNS-Based Discovery

The simplest approach: services register DNS names, and clients resolve the address via DNS lookup. In Kubernetes, every Service gets a DNS name automatically.

```yaml
# Kubernetes Service — automatic DNS: order-service.production.svc.cluster.local
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service
  ports:
    - name: http
      port: 80
      targetPort: 8080
    - name: grpc
      port: 9090
      targetPort: 9090
  type: ClusterIP
```

**Use DNS-based discovery when:**
- Running on Kubernetes (it's free, already works)
- Simple client-server topology without complex routing rules
- No need for advanced traffic management (weighted routing, circuit breaking)

**Trade-offs:**
- (+) Zero infrastructure overhead on Kubernetes. DNS is already there.
- (+) Familiar — developers understand DNS.
- (-) DNS TTL caching means changes propagate slowly. A crashed pod's IP may still resolve for 30s.
- (-) No built-in circuit breaking, retries, or load balancing beyond round-robin.
- (-) Service mesh features (mTLS, observability) require additional tooling.

### Client-Side Service Registry (Consul)

Services register themselves with a central registry (Consul). Clients query the registry to discover available instances and perform client-side load balancing.

```hcl
# Consul service registration
service {
  name = "order-service"
  id   = "order-service-1"
  port = 8080
  tags = ["v2", "production"]

  check {
    http     = "http://localhost:8080/health"
    interval = "10s"
    timeout  = "2s"
  }

  meta {
    version = "2.1.4"
    region  = "us-east-1"
  }
}
```

**Trade-offs:**
- (+) Rich health checking — services are removed from the registry when health checks fail.
- (+) Service metadata (version, region) enables advanced routing.
- (+) Works outside Kubernetes (VMs, bare metal, multi-cloud).
- (-) Every client needs a Consul client library.
- (-) Consul is a distributed system with its own operational complexity.

### Service Mesh (Istio / Linkerd)

A sidecar proxy (Envoy) is injected alongside each service container. All traffic flows through the proxy, which handles service discovery, load balancing, circuit breaking, mTLS, and observability — without changing application code.

```yaml
# Istio VirtualService — traffic routing rules
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts:
    - order-service
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: order-service
            subset: v2
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 90
        - destination:
            host: order-service
            subset: v2
          weight: 10
---
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: order-service
spec:
  host: order-service
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
    outlierDetection:
      consecutiveErrors: 5
      interval: 30s
      baseEjectionTime: 30s
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

**Trade-offs:**
- (+) Circuit breaking, retries, and mTLS with no code changes.
- (+) Automatic distributed tracing and metrics for all service-to-service traffic.
- (+) Fine-grained traffic control (canary, A/B testing, fault injection).
- (-) Significant operational complexity. Istio has a steep learning curve.
- (-) Sidecar proxy adds latency (~1ms per hop) and memory overhead (~50MB per pod).
- (-) Debugging mesh configuration issues requires mesh expertise.

**Choose service mesh when:** You have 10+ services, a dedicated platform team, and need mTLS, fine-grained traffic control, or comprehensive observability. For most projects with <10 services, DNS-based discovery plus well-designed retry logic in the application is sufficient.

## Networking Topology

### API Gateway Pattern

A single entry point for all external traffic. The gateway handles routing, authentication, rate limiting, and protocol translation.

```
External Client
     ↓
  API Gateway  ←── Auth middleware (JWT validation, API keys)
  /api/v1/*    ←── Rate limiting (per-client quotas)
  /api/v2/*    ←── TLS termination
     ↓
  Route table:
    /api/v1/orders/*    → order-service:8080
    /api/v1/users/*     → user-service:8080
    /api/v1/products/*  → catalog-service:8080
    /api/v2/orders/*    → order-service-v2:8080
```

**Trade-offs:**
- (+) Centralized cross-cutting concerns (auth, rate limiting, logging) applied consistently.
- (+) API versioning without changing internal service URLs.
- (+) External clients have a stable, versioned API surface while internal services evolve freely.
- (-) Gateway is a single point of failure — must be highly available.
- (-) All external traffic flows through one chokepoint — performance and scaling of the gateway matters.
- (-) Risk of the "fat gateway" anti-pattern: business logic creeping into the gateway.

**Gateway options:** Kong, AWS API Gateway, nginx, Traefik, Envoy.

### Direct Service-to-Service (Internal Mesh)

Services call each other directly using DNS or service discovery, without routing through a central gateway for internal traffic.

**Use for:** Internal service-to-service calls (not externally-facing traffic). The API gateway handles external-to-internal; internal calls use direct addressing.

**Trade-offs:**
- (+) Lower latency (no additional network hop).
- (+) Simpler topology to reason about for individual service interactions.
- (-) No centralized enforcement of mTLS or auth between internal services without a service mesh.
- (-) Service A must know the address of service B — tighter coupling.

### Backend for Frontend (BFF)

A dedicated API gateway per client type (mobile, web, partner API). Each BFF aggregates and transforms data from multiple internal services for its specific client.

```
Mobile App  →  Mobile BFF  ──┬──→ order-service
Web App     →  Web BFF    ──┤──→ user-service
Partner     →  Partner API──┘──→ catalog-service
```

**Use BFF when:**
- Mobile and web clients need different data shapes (mobile needs less data, fewer fields)
- Clients have significantly different performance requirements
- Different security/auth requirements per client type

**Trade-offs:**
- (+) Each BFF is optimized for its client's needs.
- (+) Changes to the mobile app don't require changing the web API and vice versa.
- (-) More services to maintain. Each BFF adds operational overhead.
- (-) Shared logic between BFFs needs to live somewhere (shared library or common downstream service).

## Data Ownership at the Architecture Level

### The Core Rule: Services Own Their Data

Each service owns its data store exclusively. No other service queries that database directly. Data is accessed only through the service's API.

**Enforcement:**
- Each service runs its own database instance (separate RDS instance, separate schema, or separate database within a shared cluster — in order of isolation strength).
- Database credentials are only distributed to the owning service.
- CI/CD validates no cross-service imports of database models or query builders.

**Why this matters:**
- Schema changes in one service cannot break another service's direct queries.
- Each service can choose its storage technology independently (PostgreSQL, MongoDB, Redis, S3).
- Database scaling decisions are local to the service.

### Data at the Boundary

When service A needs data owned by service B:

1. **API call (synchronous):** A calls B's API. Simple but adds latency and creates temporal coupling.
2. **Event subscription (asynchronous):** B publishes events when its data changes; A subscribes and maintains a local read-optimized projection of the data it needs.
3. **API composition at read time:** A gateway or BFF calls multiple services and assembles the response. Useful for read-heavy pages that aggregate from many services.

### Identifying Data Ownership in Design

For each table or collection in your system, answer:
- Which service is the authority for this data?
- Which service creates, updates, and deletes records in this store?
- Which other services need to read this data, and how?

If multiple services are updating the same data, that is a design problem. Either the boundary is drawn wrong (the two services should be one service), or there is a missing coordination mechanism (saga, distributed transaction).

## Common Pitfalls

**Distributed monolith.** Services that must be deployed together, call each other synchronously for every operation, or share a database. The operational complexity of microservices without the benefits. Root cause: service boundaries drawn along technical layers instead of domain boundaries.

**Chatty service interfaces.** Service A makes 10 REST calls to service B to assemble a single response. Each call adds latency and failure surface. Fix: design coarser-grained API operations that return everything the caller needs in one request, or use event-driven replication so A has a local copy of B's data.

**Synchronous chains.** Request enters service A, which synchronously calls B, which synchronously calls C. If C is slow, the entire chain backs up. Depth-3+ synchronous chains are a reliability hazard. Fix: async messaging for non-critical paths; circuit breakers and timeouts on all synchronous calls.

**Missing idempotency.** Retry logic (required for reliability) causes duplicate processing when the callee doesn't implement idempotent operations. Fix: every mutation operation must accept an idempotency key and deduplicate retried requests.

**Service discovery via environment variables.** Hard-coding `SERVICE_B_URL=http://b-service:8080` in environment variables is better than nothing, but fragile — it doesn't handle multiple instances, health checking, or failover. Use DNS-based discovery (Kubernetes Services) or a service registry instead.

**No circuit breakers.** Calling a downstream service without a circuit breaker means a slow downstream service will cascade failures upstream as threads/connections pile up. Every synchronous cross-service call must have a timeout and circuit breaker.
