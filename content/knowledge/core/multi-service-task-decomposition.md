---
name: multi-service-task-decomposition
description: Breaking multi-service work into per-service implementation waves
topics: [per-service-waves, dependency-ordering, parallel-implementation, shared-infrastructure-first]
---

## Summary

Multi-service implementation fails predictably when teams try to build everything in parallel without a dependency plan, or when they serialize everything and lose the parallelism that multi-service architecture is supposed to enable. The solution is structured wave planning.

**Wave 0 — Shared infrastructure first (sequential, all teams):** Service scaffold template, shared TypeScript types, auth middleware, observability setup, database migration runner, CI pipeline. No service work begins until Wave 0 completes. Keep this wave minimal — if it takes more than two weeks, it is over-scoped.

**Contract-first development:** For each inter-service integration, produce a machine-readable contract (OpenAPI spec or event schema) before writing any implementation code. Both teams review and ratify the contract. Then implement in parallel — provider builds the real endpoint; consumer implements against a generated stub or mock.

**Per-service internal waves (A–D):**
- Wave A: Database schema, domain models, repositories (no external dependencies)
- Wave B: Core business logic, event publishing, unit tests
- Wave C: HTTP controllers, auth integration, endpoint integration tests
- Wave D: Downstream service clients, inbound event consumers, contract tests

**Cross-service integration milestones** are explicit synchronization gates:
- Milestone 1 (after Wave C): All services pass contract tests against stubs and expose `/health`.
- Milestone 2 (after shared test environment deploy): End-to-end happy path works with real services.
- Milestone 3 (before production): Load tested, circuit breakers validated, runbooks written.

**Release ordering:** Leaf services (no upstream dependencies) release first. Services with dependencies release after their dependencies are live. Use expand-contract for breaking changes and feature flags to decouple deployment from release.

## Deep Guidance

## Shared Infrastructure First

Before any service-specific work begins, the infrastructure that all services share must exist. Building shared infrastructure after services start causes rework — services make assumptions about auth, observability, and database patterns that must be retrofitted when the shared layer is added.

### What Belongs in the Shared Infrastructure Wave

The shared infrastructure wave covers anything that two or more services will import, depend on, or integrate with:

- **Service scaffold**: The project template that each service starts from — runtime, framework, logging configuration, health check endpoint, graceful shutdown handler.
- **Auth middleware**: JWT validation, service token extraction, role/permission checking. Every service needs this from day one.
- **Shared type contracts**: TypeScript types (or protobuf definitions) for events, error shapes, and API response envelopes that cross service boundaries.
- **Observability instrumentation**: Structured logging setup, distributed trace context propagation (`x-trace-id`, `x-request-id`), metrics client initialization.
- **Database migration infrastructure**: The migration runner and migration table — not the schema itself, but the mechanism.
- **Test infrastructure**: Integration test helpers, database test fixtures, service client mocks.
- **CI pipeline**: Build, lint, test stages that run on every push to every service repository.

```
Wave 0: Shared Infrastructure (sequential — each item may unblock others)
  0-A: Service scaffold template (unblocks: all per-service waves)
  0-B: Shared TypeScript types package (unblocks: API contract work)
  0-C: Auth middleware + JWT validation (unblocks: any auth-protected endpoint)
  0-D: Observability setup (logging + trace propagation) (unblocks: debuggable work)
  0-E: Database migration runner (unblocks: all schema work)
  0-F: CI pipeline configuration (unblocks: parallel development with confidence)

Wave 1+: Per-service implementation (parallel across services)
```

**Trade-offs:**
- (+) Services start from a consistent, tested base. No service implements its own JWT parser or log formatter.
- (+) Cross-cutting bugs (a wrong trace header format, a broken auth check) are fixed once in the shared layer, not six times across six services.
- (-) The shared wave is a bottleneck — no service work can start until it completes. Keep the wave minimal. If "shared infrastructure" takes four weeks, the plan is over-scoped.
- (-) Shared code creates coupling. When the shared types package changes, all consumers must update. Use semantic versioning and publish as a versioned package.

## Contract-First Development Workflow

Contracts are the interface definitions between services: HTTP API schemas, event schemas, and gRPC proto files. Writing contracts before implementations enables parallel development — two teams can build against the same contract simultaneously.

### Step 1: Define the Contract

For each inter-service integration, produce a machine-readable contract before writing any implementation code:

```yaml
# order-service/contracts/inventory-availability.yaml
# OpenAPI fragment describing what order-service needs from inventory-service

openapi: "3.0.3"
info:
  title: Inventory Availability — used by Order Service
  version: "1.0.0"
paths:
  /inventory/check:
    post:
      operationId: checkAvailability
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [items]
              properties:
                items:
                  type: array
                  items:
                    type: object
                    required: [productId, quantity]
                    properties:
                      productId:
                        type: string
                        format: uuid
                      quantity:
                        type: integer
                        minimum: 1
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                required: [available, items]
                properties:
                  available:
                    type: boolean
                  items:
                    type: array
                    items:
                      type: object
                      required: [productId, available, quantityOnHand]
                      properties:
                        productId:
                          type: string
                        available:
                          type: boolean
                        quantityOnHand:
                          type: integer
```

For async event contracts, define the event schema in the shared types package:

```typescript
// packages/shared-types/src/events/order.ts

export interface OrderPlacedEvent {
  eventType: 'order.placed';
  eventId: string;          // UUID — for deduplication
  occurredAt: string;       // ISO 8601
  version: number;          // Schema version — increment on breaking change
  payload: {
    orderId: string;
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPriceCents: number;
    }>;
    totalCents: number;
    currency: string;
  };
}

export interface OrderCancelledEvent {
  eventType: 'order.cancelled';
  eventId: string;
  occurredAt: string;
  version: number;
  payload: {
    orderId: string;
    customerId: string;
    reason: 'customer_request' | 'payment_failure' | 'inventory_unavailable';
    cancelledAt: string;
  };
}
```

### Step 2: Review and Ratify the Contract

The teams on both sides of the contract must agree before implementation begins. Common review points:

- Is the request payload minimal? Avoid sending data the consumer won't use.
- Are response fields nullable or optional fields documented as such?
- Does the error shape match the standard envelope used across all services?
- Are event schema fields sufficient for all known consumers?

Ratification can be async (a PR comment approval), but it must be explicit. Contract changes after ratification require a new version.

### Step 3: Implement in Parallel

Once contracts are ratified, both the provider and consumer can implement simultaneously:

- The **provider** implements the real endpoint or event publisher, verified by its own unit and integration tests.
- The **consumer** implements against a generated stub or mock, verified by consumer-side contract tests.

Integration is deferred to the integration milestone, not day-to-day development.

**Trade-offs:**
- (+) Parallel development becomes possible without any real service running.
- (+) Contract reviews surface design problems early — a missing required field is caught in review, not at integration.
- (-) Contracts require discipline. If teams skip the ratification step and start implementing simultaneously against unreviewed contracts, they diverge and must reconcile later.
- (-) Contract changes trigger consumer notifications. Maintaining a contract registry (e.g., Pact Broker, OpenAPI registry) is overhead that pays off at 5+ services.

## Stub and Mock-Driven Parallel Implementation

A stub is a lightweight implementation of a service's API that returns realistic test data. It enables consumers to develop and test against the contract without waiting for the real service.

### Generating Stubs from Contracts

For REST services, generate a stub server from the OpenAPI spec:

```typescript
// scripts/generate-stubs.ts
// Reads OpenAPI specs from contracts/ and generates a stub server per service

import { createServer } from 'prism';
import path from 'path';

const stubs = [
  { name: 'inventory-service', spec: 'contracts/inventory-availability.yaml', port: 4001 },
  { name: 'user-service', spec: 'contracts/user-profile.yaml', port: 4002 },
  { name: 'notification-service', spec: 'contracts/notification-dispatch.yaml', port: 4003 },
];

async function startStubs() {
  for (const stub of stubs) {
    const server = await createServer(path.resolve(stub.spec), {
      mock: { dynamic: true },  // Generates realistic mock data from schema
      port: stub.port,
    });
    console.log(`Stub ${stub.name} running on :${stub.port}`);
  }
}

startStubs();
```

In the consumer service's integration test configuration, point at the stub server instead of the real service:

```typescript
// order-service/tests/helpers/test-env.ts

export const TEST_SERVICE_URLS = {
  inventoryService: process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:4001',
  userService: process.env.USER_SERVICE_URL ?? 'http://localhost:4002',
  notificationService: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4003',
};

// In CI: stubs run as Docker containers, URLs set via env vars
// In local dev: run `npm run stubs` to start stub servers
// In integration tests (post-stub): URLs point at real services in a test environment
```

### Consumer-Driven Contract Tests

Consumer-driven contract tests encode what the consumer expects from the provider. These tests run in the provider's CI and fail if the provider breaks a consumer's expectations:

```typescript
// order-service/tests/contracts/inventory.contract.test.ts
// This file lives in the consumer (order-service) but runs in the provider's (inventory-service) CI

import { Pact } from '@pact-foundation/pact';

describe('Order Service → Inventory Service contract', () => {
  const provider = new Pact({
    consumer: 'order-service',
    provider: 'inventory-service',
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());
  afterEach(() => provider.verify());

  it('returns availability for all requested items', async () => {
    await provider.addInteraction({
      state: 'product prod_abc123 has 5 units available',
      uponReceiving: 'a check-availability request for 2 units',
      withRequest: {
        method: 'POST',
        path: '/inventory/check',
        body: { items: [{ productId: 'prod_abc123', quantity: 2 }] },
      },
      willRespondWith: {
        status: 200,
        body: {
          available: true,
          items: [{ productId: 'prod_abc123', available: true, quantityOnHand: 5 }],
        },
      },
    });

    const result = await inventoryClient.checkAvailability([
      { productId: 'prod_abc123', quantity: 2 },
    ]);

    expect(result.available).toBe(true);
    expect(result.items[0].quantityOnHand).toBe(5);
  });
});
```

**Trade-offs (stub-driven development):**
- (+) Each service team moves at full speed without blocking on another team's implementation schedule.
- (+) Contract tests in provider CI catch breaking changes before they reach a shared environment.
- (-) Stubs return static or schema-generated data. Complex business logic (e.g., "available quantity decreases as orders are placed") cannot be modeled in stubs. Real integration testing is still required.
- (-) Stubs can drift from the real implementation if the provider team doesn't keep the OpenAPI spec current. Enforce spec-first: the spec is the source of truth, implementation follows.

## Per-Service Implementation Waves

Once shared infrastructure exists and contracts are ratified, each service is implemented in internal waves.

### Service-Level Wave Structure

Each service follows the same internal wave structure regardless of domain:

```
Service-Internal Wave A: Foundation (no external dependencies)
  A-1: Database schema + migrations
  A-2: Domain models + validation
  A-3: Repository / data access layer
  A-4: Unit tests for models and validation

Service-Internal Wave B: Core operations (depends on Wave A)
  B-1: Core business logic (services / use cases)
  B-2: Internal event publishing (domain events → message bus)
  B-3: Unit tests for business logic

Service-Internal Wave C: API surface (depends on Wave B)
  C-1: HTTP controllers + request validation
  C-2: Auth middleware integration
  C-3: Error handling + response serialization
  C-4: Integration tests for all endpoints

Service-Internal Wave D: External integrations (depends on Wave B contracts)
  D-1: Downstream service clients (using stubs in tests)
  D-2: Inbound event consumers (from other services' events)
  D-3: Consumer contract tests
```

### Cross-Service Wave Ordering

When multiple services are built in parallel, their internal waves must align at integration milestones:

```
Month 1 — Shared Infrastructure (Wave 0, all teams)
  All: scaffold, auth middleware, shared types, CI

Month 2 — Per-service Foundation Waves (A + B, teams parallel)
  Order Service:       DB schema, domain models, core business logic
  Inventory Service:   DB schema, domain models, stock management logic
  User Service:        DB schema, domain models, profile management
  Notification Service: DB schema, domain models, dispatch logic

Month 3 — Per-service API + Stub-based Integration (Wave C + D, teams parallel)
  All services: HTTP controllers, auth, integration tests against stubs
  → Integration Milestone 1: All services pass contract tests against stubs

Month 4 — Real Integration (Wave E, shared test environment)
  All: deploy to shared test environment
  All: run integration tests against real services (not stubs)
  → Integration Milestone 2: End-to-end happy path works in test environment

Month 5 — Hardening + Release Prep
  All: load testing, circuit breaker tuning, graceful degradation
  → Integration Milestone 3: Production-ready — passes all gates
```

**Practical tracking format for cross-service waves:**

```markdown
## Wave B Status (Core Operations) — Target: End of Month 2

| Service             | B-1 Business Logic | B-2 Event Publishing | B-3 Unit Tests | Wave B Complete |
|---------------------|:------------------:|:--------------------:|:--------------:|:---------------:|
| order-service       | ✅ Done            | ✅ Done              | ✅ Done        | ✅              |
| inventory-service   | ✅ Done            | 🔄 In Progress       | 🔄 In Progress | ⏳              |
| user-service        | ✅ Done            | ✅ Done              | ✅ Done        | ✅              |
| notification-service| 🔄 In Progress     | ⬜ Not started       | ⬜ Not started | ⏳              |

Blockers:
- inventory-service B-2: waiting on shared event bus topic naming convention (Wave 0-B, shared types)
- notification-service: team bandwidth — estimated completion 3 days late
```

## Integration Milestones

Integration milestones are explicit synchronization points where all services must pass a shared set of tests before work continues. They prevent a common failure mode: services that pass their individual tests but fail when integrated because contracts drifted or assumptions don't hold.

### Milestone 1: Contract Compliance

**When:** After each service completes Wave C (API surface with integration tests).

**Gate criteria:**
- All services pass their own integration tests (against stubs).
- Consumer contract tests pass for every provider-consumer pair.
- Every service returns the standard error envelope shape.
- Every service exposes `/health` and returns 200 with a structured health payload.

```bash
# Milestone 1 validation script
#!/usr/bin/env bash
set -euo pipefail

SERVICES=(order-service inventory-service user-service notification-service)
FAILED=()

for service in "${SERVICES[@]}"; do
  echo "=== Checking $service ==="

  # Run integration tests
  if ! cd "services/$service" && npm test -- --testPathPattern=integration; then
    FAILED+=("$service: integration tests failed")
  fi

  # Validate health endpoint exists and returns 200
  if ! curl -sf "http://localhost:$(get_port "$service")/health" > /dev/null; then
    FAILED+=("$service: health endpoint unavailable")
  fi

  # Run consumer contract tests for this provider
  if ! npm run test:contracts -- --provider="$service"; then
    FAILED+=("$service: consumer contract tests failed")
  fi
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Milestone 1 FAILED:"
  printf "  - %s\n" "${FAILED[@]}"
  exit 1
fi

echo "Milestone 1 PASSED — all services contract-compliant"
```

### Milestone 2: Real Integration

**When:** After all services are deployed to a shared test environment.

**Gate criteria:**
- All end-to-end happy-path flows complete successfully.
- Event-driven flows (e.g., order placed → inventory reserved → notification sent) complete within their SLAs.
- No unhandled errors in structured logs across any service.
- Distributed traces show correct parent-child span relationships.

### Milestone 3: Production Readiness

**When:** Before any service goes to production.

**Gate criteria:**
- Load test: each service handles 2× expected peak traffic without errors.
- Circuit breakers open under artificial load, close on recovery.
- Graceful degradation works: stopping one service does not bring down dependent services.
- Runbooks exist for every on-call scenario identified in the architecture review.
- Secrets are managed via the approved secret store (not `.env` files).

**Trade-offs (integration milestones):**
- (+) Milestones create shared accountability. A team cannot declare itself "done" while its contracts fail the provider's tests.
- (+) Problems are found while teams still remember what they built. Integration failures discovered a month after implementation are expensive to debug.
- (-) Milestone gates slow down the fast-moving teams that are ahead of schedule. Mitigate by allowing ahead-of-schedule teams to begin hardening (load testing, observability tuning) while waiting for others.

## Dependency Ordering for Parallel Development

When services depend on each other's data or events, the dependency ordering determines which can start before others.

### Mapping Service Dependencies

Before planning waves, build a dependency map:

```
Dependency analysis:

order-service READS FROM:
  → user-service (customer profile, shipping address)   [sync REST call]
  → inventory-service (product availability)            [sync REST call]
  → catalog-service (product details, pricing)          [sync REST call]

order-service PUBLISHES:
  → order.placed event (consumed by: inventory-service, notification-service)
  → order.cancelled event (consumed by: inventory-service, notification-service)

inventory-service READS FROM:
  → catalog-service (product definitions)               [sync REST call]

inventory-service PUBLISHES:
  → inventory.reserved event (consumed by: order-service)
  → inventory.released event (consumed by: order-service)

notification-service READS FROM:
  → user-service (notification preferences, contact info) [sync REST call]

notification-service CONSUMES:
  → order.placed, order.cancelled (from order-service)
  → inventory.reserved, inventory.released (from inventory-service)

catalog-service: no upstream service dependencies (leaf service)
user-service: no upstream service dependencies (leaf service)
```

### Parallelism from the Dependency Map

Services with no upstream dependencies are leaf services and can start immediately. Services with dependencies can start development (using stubs) but cannot complete real integration until their dependencies are live:

```
Can start immediately (no real upstream dependencies):
  ✅ catalog-service   — no dependencies
  ✅ user-service      — no dependencies

Can develop with stubs, integrate after catalog + user are live:
  ⏳ inventory-service — depends on catalog-service (real integration)
  ⏳ notification-service — depends on user-service (real integration)

Can develop with stubs, integrates last:
  ⏳ order-service — depends on user, inventory, catalog

Optimal parallel development order:
  Week 1-6:  catalog-service + user-service (parallel, no dependencies)
  Week 3-8:  inventory-service + notification-service (parallel, stubs for catalog/user)
  Week 5-10: order-service (stubs for inventory/catalog/user)
  Week 9-12: Integration Milestones 1 + 2 + 3 (sequential gates)
```

Note the overlap: inventory-service starts in week 3 (using stubs), not after catalog-service completes (week 6). This is the key efficiency gain from contract-first + stub-driven development.

## Release Coordination Strategies

Releasing multiple services to production without a coordination strategy causes integration failures in production that were not present in test.

### Release Ordering Rules

Release services in reverse dependency order — leaf services first, dependent services last:

```
Release order (example):
  Release 1: catalog-service + user-service (no dependencies — safe to release any time)
  Release 2: inventory-service (depends on catalog; released after catalog is live)
             notification-service (depends on user; released after user is live)
  Release 3: order-service (depends on all above; released last)
```

### Consumer-Before-Provider Releases (Expand-Contract)

When a contract change is required, use the expand-contract pattern to deploy without downtime:

```
Phase 1 — Expand (consumer adds support for new field, provider adds new field):
  1a. Provider adds new field to response (backward-compatible addition)
  1b. Consumer adds code to handle the new field when present
  1c. Deploy provider first, then consumer — no coordination required

Phase 2 — Contract (remove old field once consumers are updated):
  2a. Monitor: verify consumer no longer reads old field
  2b. Provider removes old field (breaking change — now safe because no consumer uses it)
  2c. Deploy provider — consumers already prepared for absence of old field
```

```typescript
// Phase 1b: consumer handles both old and new field shapes
function parseInventoryResponse(response: InventoryResponse): AvailabilityResult {
  return {
    available: response.available,
    quantityOnHand: response.quantityOnHand,  // new field — may be present or absent
    // Legacy fallback: some providers may still return the old shape during rollout
    quantity: response.quantityOnHand ?? response.quantity ?? 0,
  };
}
```

### Feature Flags for Cross-Service Features

When a feature requires coordinated changes across multiple services, use feature flags to decouple deployment from release:

```typescript
// Feature flag: 'real-time-inventory-check' enables new inventory flow
// Services can deploy their part independently; flag enables the feature system-wide

async function placeOrder(order: OrderRequest): Promise<Order> {
  const useRealTimeInventory = await featureFlags.isEnabled('real-time-inventory-check');

  if (useRealTimeInventory) {
    // New flow: synchronous inventory check before order confirmation
    const availability = await inventoryClient.checkAvailability(order.items);
    if (!availability.available) {
      throw new InsufficientInventoryError(availability.items);
    }
  }
  // Old flow: inventory check happens asynchronously after order creation

  return orderRepository.create(order);
}
```

**Deployment sequence with feature flag:**
1. Deploy order-service with new code + feature flag check (flag off by default).
2. Deploy inventory-service with new availability endpoint.
3. Test integration end-to-end with flag enabled in staging.
4. Enable flag in production during a low-traffic window.
5. Monitor for errors. If issues arise, disable the flag — no deployment required.
6. After confidence period, remove the flag and the old code path.

**Trade-offs (release coordination):**
- (+) Reverse dependency release ordering prevents consumers from calling providers that don't exist yet.
- (+) Expand-contract pattern removes the need for coordinated simultaneous deployments of breaking changes.
- (+) Feature flags decouple deployment from release, reducing the blast radius of new cross-service features.
- (-) Feature flags accumulate. Stale flags add complexity without value. Assign an expiry date to every flag at creation time and schedule cleanup.
- (-) Expand-contract requires two deployment cycles per breaking change. This is a feature, not a bug — it means breaking changes can be done without coordination windows.

## Common Pitfalls

**Skipping shared infrastructure to move faster.** Teams start building services before shared auth middleware, logging, or migration infrastructure exists. Each service implements its own version. Later, a security bug in auth must be patched in six places, not one. Fix: treat Wave 0 as non-negotiable. Two weeks of shared infrastructure saves months of divergence cleanup.

**Contracts as informal agreements.** Two teams agree verbally on an API shape, start implementing, and meet at integration time to discover they made different assumptions about nullable fields, error shapes, and pagination. Fix: contracts must be written down and reviewed before implementation starts. A YAML file, even an imperfect one, is worth more than a verbal agreement.

**Stubs that don't reflect the real service.** The stub server returns data that the real service never actually returns (e.g., stub returns a `price` field that the real endpoint omits). Consumer tests pass against the stub but fail against the real service. Fix: generate stubs from the same OpenAPI spec that the real service is validated against. If the spec is wrong, fix the spec, then fix both.

**Integration milestones treated as optional.** Teams skip Milestone 1 because "contracts look good" and go straight to Milestone 2. Contract drift discovered late is expensive. Fix: milestones are gates, not suggestions. Automate them in CI so they cannot be bypassed.

**Releasing services in the wrong order.** Order service is released before inventory service. Order service makes calls to an endpoint that doesn't exist yet, producing 500 errors. Fix: draw the dependency map before planning releases. Leaf services always go first.

**Feature flags with no expiry.** A flag enabled "temporarily" for a cross-service feature rollout is still in the codebase two years later, with the old code path dead but never removed. Developers are afraid to delete the flag because they don't know if anything depends on it. Fix: every feature flag has a ticket to remove it, created at the same time as the flag.

**Wave planning that ignores the critical path.** Assigning agents to build notification-service (low dependency count, not on critical path) while order-service (critical path, highest dependency count) waits for resources. Fix: identify the critical path before assigning agents. Non-critical services are parallelized around the critical path, not instead of it.

## See Also

- [task-decomposition](./task-decomposition.md) — Single-service task sizing, dependency graphs, and wave planning
- [multi-service-api-contracts](./multi-service-api-contracts.md) — Contract evolution, versioning, and deprecation
- [multi-service-architecture](./multi-service-architecture.md) — Service boundary design and communication patterns
- [multi-service-testing](./multi-service-testing.md) — Consumer-driven contract tests (Pact), integration test strategies
