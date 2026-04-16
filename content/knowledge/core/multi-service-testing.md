---
name: multi-service-testing
description: Consumer-driven contract testing, cross-service E2E strategies, and service test doubles
topics: [contract-tests, pact, schema-registry, cross-service-e2e, test-doubles]
---

## Summary

Testing a multi-service system requires a different strategy than testing a monolith. The test pyramid still applies, but each layer has multi-service-specific concerns: contract tests verify inter-service API agreements, cross-service E2E tests validate complete user journeys across service boundaries, and service test doubles replace real downstream services in isolated testing. This document covers consumer-driven contract testing with Pact and schema registry approaches, cross-service E2E test design and environment management, service test double strategies, CI integration for contract tests, and the complete test pyramid for multi-service systems.

## The Multi-Service Test Pyramid

The standard test pyramid (unit, integration, E2E) extends naturally to multi-service systems with contract tests inserted between integration and E2E:

```
         /  Cross-Service E2E  \     Few (5-15), slow, validates real user journeys
        /   Contract Tests      \    Moderate, fast, validates service API agreements
       /  Integration Tests      \   Per-service, medium speed, validates service internals
      /    Unit Tests              \  Many, fast, tests pure business logic in isolation
     ________________________________
```

**Layer responsibilities:**
- **Unit tests:** Business logic within a single service. No I/O, no other services, milliseconds.
- **Integration tests:** A service interacting with its own database, cache, and internal message queue. Real infrastructure, no other services.
- **Contract tests:** Verify that a service's API matches what its consumers expect, and that consumers correctly call the provider's API. Run per-service, not as a full-system test.
- **Cross-service E2E:** Full user journeys against a real or realistic multi-service environment. Highest confidence, highest maintenance cost.

## Consumer-Driven Contract Testing with Pact

### What Contract Testing Solves

Without contract tests, breaking changes in a provider's API are discovered when consumers deploy — in staging or, worse, production. Contract tests move that discovery to CI, in the provider's build, before the breaking change is merged.

Consumer-driven contract testing inverts the usual testing relationship: consumers define their expectations of the provider; the provider verifies it satisfies all consumer contracts. This means:

- Consumers own the contract specification.
- Providers run consumer contracts as part of their CI pipeline.
- A breaking change in the provider fails the provider's CI before deployment.

### Pact: Consumer Side

The consumer writes a Pact test that defines the expected interaction with the provider. Pact records the interaction and generates a `.json` pact file.

```typescript
// tests/contracts/order-service.pact.test.ts (consumer: api-gateway)
import { PactV3, MatchersV3 } from '@pact-foundation/pact'
import path from 'path'
import { OrderServiceClient } from '../../src/clients/order-service.js'

const { like, string, integer, eachLike } = MatchersV3

const provider = new PactV3({
  consumer: 'api-gateway',
  provider: 'order-service',
  dir: path.join(__dirname, '../../pacts'),
  logLevel: 'warn',
})

describe('api-gateway → order-service contract', () => {
  describe('GET /orders/:id', () => {
    it('returns order details for a valid order ID', async () => {
      await provider
        .given('order 550e8400 exists and is confirmed')
        .uponReceiving('a request for order 550e8400')
        .withRequest({
          method: 'GET',
          path: '/orders/550e8400-e29b-41d4-a716-446655440000',
          headers: { Authorization: like('Bearer token') },
        })
        .willRespondWith({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            orderId: string('550e8400-e29b-41d4-a716-446655440000'),
            status: string('confirmed'),
            items: eachLike({
              productId: string('prod-123'),
              quantity: integer(2),
              unitPriceCents: integer(1999),
            }),
            totalCents: integer(3998),
          },
        })
        .executeTest(async (mockServer) => {
          const client = new OrderServiceClient({ baseUrl: mockServer.url })
          const order = await client.getOrder('550e8400-e29b-41d4-a716-446655440000')
          expect(order.status).toBe('confirmed')
          expect(order.items).toHaveLength(1)
        })
    })
  })

  describe('POST /orders', () => {
    it('places a new order and returns order ID', async () => {
      await provider
        .given('user cust-001 exists and inventory is available')
        .uponReceiving('a request to place an order')
        .withRequest({
          method: 'POST',
          path: '/orders',
          headers: {
            'Content-Type': 'application/json',
            Authorization: like('Bearer token'),
          },
          body: {
            customerId: string('cust-001'),
            items: eachLike({ productId: string('prod-123'), quantity: integer(1) }),
          },
        })
        .willRespondWith({
          status: 201,
          body: {
            orderId: string('new-order-uuid'),
            status: string('pending'),
          },
        })
        .executeTest(async (mockServer) => {
          const client = new OrderServiceClient({ baseUrl: mockServer.url })
          const result = await client.placeOrder({
            customerId: 'cust-001',
            items: [{ productId: 'prod-123', quantity: 1 }],
          })
          expect(result.status).toBe('pending')
          expect(result.orderId).toBeTruthy()
        })
    })
  })
})
```

**Running the consumer test generates `pacts/api-gateway-order-service.json`** — this file is published to the Pact Broker for the provider to verify.

### Pact: Provider Side

The provider loads consumer pacts from the Pact Broker and verifies them against the running service. Provider states map to database setup functions.

```typescript
// tests/contracts/verify-pacts.test.ts (provider: order-service)
import { Verifier } from '@pact-foundation/pact'
import { app } from '../../src/app.js'
import { db } from '../../src/db/index.js'
import type { Server } from 'http'

let server: Server

beforeAll(async () => {
  await db.migrate.latest()
  server = app.listen(0) // random port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await db.destroy()
})

describe('Pact provider verification: order-service', () => {
  it('satisfies all consumer contracts', async () => {
    const opts = {
      provider: 'order-service',
      providerBaseUrl: `http://localhost:${(server.address() as { port: number }).port}`,

      // Fetch pacts from broker
      pactBrokerUrl: process.env.PACT_BROKER_URL ?? 'http://pact-broker:9292',
      pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      publishVerificationResult: process.env.CI === 'true',
      providerVersion: process.env.GIT_SHA ?? 'local',

      // Provider state handlers — set up database state for each interaction
      stateHandlers: {
        'order 550e8400 exists and is confirmed': async () => {
          await db('orders').insert({
            id: '550e8400-e29b-41d4-a716-446655440000',
            customer_id: 'cust-001',
            status: 'confirmed',
          })
          await db('order_items').insert({
            order_id: '550e8400-e29b-41d4-a716-446655440000',
            product_id: 'prod-123',
            quantity: 2,
            unit_price_cents: 1999,
          })
        },
        'user cust-001 exists and inventory is available': async () => {
          await db('customers').insert({ id: 'cust-001', email: 'test@example.com' })
          await db('inventory').insert({ product_id: 'prod-123', available_units: 100 })
        },
      },

      // Teardown between states
      beforeEach: async () => {
        await db.raw('TRUNCATE orders, order_items, customers, inventory RESTART IDENTITY CASCADE')
      },

      logLevel: 'warn',
    }

    await new Verifier(opts).verifyProvider()
  })
})
```

**Trade-offs (Pact):**
- (+) Breaking changes in the provider are detected in the provider's CI before the change is deployed.
- (+) Consumers define exactly what they use — providers can safely change anything not referenced in contracts.
- (+) The Pact Broker provides a dependency graph: which consumers use which provider endpoints.
- (-) Pact tests require maintaining provider state handlers — a setup burden that grows with the number of interactions.
- (-) Pact tests are not a substitute for integration tests. They verify the contract format, not business logic.
- (-) Requires a Pact Broker for CI integration. Self-hosting adds operational overhead (PactFlow offers hosted option).

### Pact Broker Integration in CI

```yaml
# .github/workflows/consumer-contract-test.yml
name: Consumer Contract Tests
on: [push, pull_request]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run consumer contract tests
        run: npm run test:contract:consumer
        env:
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}

      - name: Publish pacts to broker
        run: |
          npx pact-broker publish \
            --pact-files-or-dirs pacts/ \
            --consumer-app-version ${{ github.sha }} \
            --branch ${{ github.ref_name }} \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

---
# .github/workflows/provider-contract-test.yml
name: Provider Contract Verification
on: [push, pull_request]

jobs:
  verify-contracts:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: order_service_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4

      - name: Verify consumer contracts
        run: npm run test:contract:provider
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/order_service_test
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
          GIT_SHA: ${{ github.sha }}
          CI: true

      - name: Can-I-Deploy check
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant order-service \
            --version ${{ github.sha }} \
            --to-environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}
```

## Schema Registry Approach

For event-driven systems using Kafka, Avro schemas registered in a schema registry replace Pact for async contract testing.

**Schema registration (producer/provider side):**

```typescript
// src/events/order-placed.schema.ts
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry'

const registry = new SchemaRegistry({
  host: process.env.SCHEMA_REGISTRY_URL ?? 'http://schema-registry:8081',
})

export const ORDER_PLACED_SUBJECT = 'order.placed-value'

export const orderPlacedSchema = {
  type: 'record' as const,
  name: 'OrderPlaced',
  namespace: 'com.example.orders',
  fields: [
    { name: 'orderId', type: 'string' },
    { name: 'customerId', type: 'string' },
    { name: 'totalCents', type: 'int' },
    { name: 'placedAt', type: 'string' }, // ISO 8601
    {
      name: 'items',
      type: {
        type: 'array',
        items: {
          type: 'record',
          name: 'OrderItem',
          fields: [
            { name: 'productId', type: 'string' },
            { name: 'quantity', type: 'int' },
            { name: 'unitPriceCents', type: 'int' },
          ],
        },
      },
    },
  ],
}

export async function registerOrderPlacedSchema(): Promise<number> {
  const { id } = await registry.register(
    { type: 'AVRO', schema: JSON.stringify(orderPlacedSchema) },
    { subject: ORDER_PLACED_SUBJECT }
  )
  return id
}
```

**Schema compatibility modes:**
- `BACKWARD`: new schema can read data written with the old schema. Add fields with defaults, remove optional fields. Safe for consumers to upgrade first.
- `FORWARD`: old schema can read data written with the new schema. Safe for producers to upgrade first.
- `FULL`: both backward and forward compatible. Strictest, safest for large consumer bases.

**Trade-offs (schema registry vs. Pact for async):**
- (+) Schema compatibility checks run at schema registration time — breaking changes are rejected before any message is produced.
- (+) Every consumer automatically validates incoming messages against the registered schema. No additional test setup.
- (-) Schema registry only validates structure, not behavior. Business logic changes (field semantics, value ranges) are not caught.
- (-) Schema registry is a shared dependency. If it is unavailable, schema validation fails. Cache schemas locally for resilience.

## Service Test Doubles

### Test Double Taxonomy for Multi-Service Systems

In a multi-service system, test doubles replace entire downstream services, not just individual functions. The appropriate double depends on the test level.

| Double Type | Used At | Behavior | State |
|-------------|---------|----------|-------|
| Mock server (WireMock, msw) | Integration tests | Configurable stubbed HTTP responses | Stateless |
| In-memory fake service | Integration tests | Simplified but functionally correct | Stateful |
| Contract mock (Pact mock server) | Contract tests | Records interactions for contract files | Stateless |
| Full service in Docker | E2E / acceptance tests | Real service, isolated test database | Stateful |

### WireMock for HTTP Service Doubles

```typescript
// tests/integration/order-service.test.ts
// The order service calls the inventory service and payment service.
// In integration tests, replace both with WireMock servers.
import { WireMock } from 'wiremock-captain'

describe('OrderService integration', () => {
  let inventoryMock: WireMock
  let paymentMock: WireMock

  beforeAll(async () => {
    inventoryMock = new WireMock('http://inventory-mock:8080')
    paymentMock = new WireMock('http://payment-mock:8080')
  })

  afterEach(async () => {
    await inventoryMock.clearAll()
    await paymentMock.clearAll()
  })

  it('creates an order when inventory is available and payment succeeds', async () => {
    // Stub inventory service
    await inventoryMock.register(
      { method: 'POST', endpoint: '/reserve' },
      {
        status: 200,
        body: { reservationId: 'res-001', reserved: true },
      }
    )

    // Stub payment service
    await paymentMock.register(
      { method: 'POST', endpoint: '/charge' },
      {
        status: 200,
        body: { chargeId: 'chg-001', status: 'succeeded' },
      }
    )

    const result = await orderService.placeOrder({
      customerId: 'cust-001',
      items: [{ productId: 'prod-123', quantity: 1 }],
      paymentMethodId: 'pm-visa',
    })

    expect(result.status).toBe('confirmed')

    // Verify inventory was reserved exactly once
    const inventoryRequests = await inventoryMock.getRequestsForAPI(
      { method: 'POST', endpoint: '/reserve' }
    )
    expect(inventoryRequests).toHaveLength(1)
  })

  it('rolls back inventory reservation when payment fails', async () => {
    await inventoryMock.register(
      { method: 'POST', endpoint: '/reserve' },
      { status: 200, body: { reservationId: 'res-002', reserved: true } }
    )

    await inventoryMock.register(
      { method: 'DELETE', endpoint: '/reserve/res-002' },
      { status: 204 }
    )

    await paymentMock.register(
      { method: 'POST', endpoint: '/charge' },
      { status: 402, body: { error: 'INSUFFICIENT_FUNDS' } }
    )

    await expect(
      orderService.placeOrder({
        customerId: 'cust-001',
        items: [{ productId: 'prod-123', quantity: 1 }],
        paymentMethodId: 'pm-declined',
      })
    ).rejects.toThrow('Payment failed: INSUFFICIENT_FUNDS')

    // Verify the reservation was cancelled (rollback executed)
    const cancelRequests = await inventoryMock.getRequestsForAPI(
      { method: 'DELETE', endpoint: '/reserve/res-002' }
    )
    expect(cancelRequests).toHaveLength(1)
  })
})
```

### In-Memory Fake Services

For services where you need stateful behavior in tests (e.g., a notification service that should accumulate sent notifications for later assertion), an in-memory fake is more ergonomic than WireMock.

```typescript
// tests/fakes/fake-notification-service.ts
import express from 'express'
import type { Application } from 'express'

interface SentNotification {
  to: string
  template: string
  data: Record<string, unknown>
  sentAt: Date
}

export class FakeNotificationService {
  private readonly app: Application
  private readonly notifications: SentNotification[] = []
  private server?: ReturnType<Application['listen']>

  constructor() {
    this.app = express()
    this.app.use(express.json())

    this.app.post('/notifications', (req, res) => {
      this.notifications.push({
        ...req.body,
        sentAt: new Date(),
      })
      res.json({ notificationId: `notif-${Date.now()}`, status: 'queued' })
    })
  }

  async start(port = 0): Promise<number> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        resolve((this.server!.address() as { port: number }).port)
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => this.server?.close(() => resolve()))
  }

  reset(): void {
    this.notifications.length = 0
  }

  getSentNotifications(): SentNotification[] {
    return [...this.notifications]
  }

  getNotificationsTo(email: string): SentNotification[] {
    return this.notifications.filter((n) => n.to === email)
  }
}
```

**Trade-offs (in-memory fakes vs. mock servers):**
- (+) Fakes can maintain state across multiple requests — essential for testing workflows.
- (+) Assertion API is richer (`.getSentNotifications()`) than polling a mock server's request log.
- (-) Fakes require maintenance — when the real service's API changes, the fake must be updated.
- (-) Fakes can diverge from the real service behavior, making integration tests misleading. Mitigate by running contract tests against fakes as well as real services.

## Cross-Service E2E Test Design

### When to Use Cross-Service E2E Tests

Cross-service E2E tests are expensive: they require a running multi-service environment, real or realistic databases, and produce flaky failures unrelated to the code under test (network timeouts, service startup order, database state). Use them sparingly for the scenarios that nothing else can validate.

**Use cross-service E2E for:**
- Critical user journeys that exercise the full service graph (place order, payment, fulfillment, notification)
- Smoke tests after deployment to verify the environment is healthy
- Integration scenarios that contract tests cannot cover (e.g., business logic that depends on real data state across services)

**Do NOT use cross-service E2E for:**
- Validation error paths (unit tests)
- Per-service business logic (integration tests)
- API contract format verification (contract tests)

### E2E Test Environment Strategies

| Strategy | Setup Cost | Isolation | CI Suitability |
|----------|------------|-----------|----------------|
| Shared staging environment | Low | None | Poor — state bleeds between runs |
| Per-PR ephemeral environment | High | Full | Good — but slow to provision |
| Docker Compose local multi-service | Medium | Full | Good — fast for local dev |
| Kubernetes namespace per-branch | High | Full | Good — realistic but expensive |

**Docker Compose for cross-service E2E (recommended for most teams):**

```yaml
# docker-compose.e2e.yml
version: '3.9'

services:
  api-gateway:
    build:
      context: ../../api-gateway
      dockerfile: Dockerfile
    ports: ['3000:3000']
    environment:
      ORDER_SERVICE_URL: http://order-service:8080
      AUTH_SERVICE_URL: http://auth-service:8080
    depends_on:
      order-service:
        condition: service_healthy
      auth-service:
        condition: service_healthy

  order-service:
    build:
      context: ../../order-service
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgres://test:test@order-db:5432/order_test
      INVENTORY_SERVICE_URL: http://inventory-service:8080
      PAYMENT_SERVICE_URL: http://payment-service:8080
    depends_on:
      order-db:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

  order-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: order_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test -d order_test']
      interval: 2s
      timeout: 2s
      retries: 10

  auth-service:
    build:
      context: ../../auth-service
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgres://test:test@auth-db:5432/auth_test
      JWT_SECRET: test-secret-not-for-production
    depends_on:
      auth-db:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 5s
      retries: 10

  auth-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: auth_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test -d auth_test']
      interval: 2s
      retries: 10
```

**Cross-service E2E test (using the Docker Compose stack):**

```typescript
// tests/e2e/order-placement.e2e.test.ts
import axios from 'axios'

const GATEWAY = 'http://localhost:3000'

describe('Order placement journey', () => {
  let authToken: string
  let userId: string

  beforeAll(async () => {
    // Register and authenticate a test user
    const reg = await axios.post(`${GATEWAY}/api/v1/auth/register`, {
      email: `e2e-${Date.now()}@example.com`,
      password: 'TestPassword123!',
    })
    userId = reg.data.userId

    const login = await axios.post(`${GATEWAY}/api/v1/auth/login`, {
      email: reg.data.email,
      password: 'TestPassword123!',
    })
    authToken = login.data.token
  })

  it('completes the full order placement flow', async () => {
    // Place an order
    const orderRes = await axios.post(
      `${GATEWAY}/api/v1/orders`,
      {
        items: [{ productId: 'test-product-001', quantity: 2 }],
        paymentMethodId: 'test-card-visa',
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    )

    expect(orderRes.status).toBe(201)
    const { orderId } = orderRes.data
    expect(orderId).toBeTruthy()

    // Poll for order confirmation (async processing)
    let order: { status: string } | null = null
    for (let i = 0; i < 10; i++) {
      const statusRes = await axios.get(`${GATEWAY}/api/v1/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      order = statusRes.data
      if (order?.status === 'confirmed') break
      await new Promise((r) => setTimeout(r, 500))
    }

    expect(order?.status).toBe('confirmed')
  }, 30_000)
})
```

**Trade-offs (Docker Compose E2E):**
- (+) Full service isolation — no shared state with other test runs.
- (+) Reproducible locally — developers can run the same E2E suite on their machines.
- (-) Startup time. A 5-service Docker Compose stack with healthchecks takes 30-60 seconds to become ready.
- (-) Service build dependencies — CI must build all service images or pull from a registry.
- (-) Test data management is harder in a multi-service setup. Clearing state requires hitting each service's internal API or truncating databases directly.

## CI Integration Checklist for Contract Tests

A complete CI pipeline for a multi-service system runs contract tests in the correct order:

```
Consumer builds:
  1. Run unit + integration tests
  2. Run consumer contract tests → publish pact files to Pact Broker

Provider builds:
  1. Run unit + integration tests
  2. Fetch consumer pacts from Pact Broker
  3. Run provider verification → publish results to Pact Broker
  4. Run can-i-deploy check before deployment

Deployment gate:
  5. can-i-deploy must pass for all consumers before provider deploys
  6. can-i-deploy must pass for all providers before consumer deploys
```

**Key principle:** Never deploy a service that fails `can-i-deploy`. The Pact Broker tracks which versions of provider and consumer are compatible and will fail the check if the deployment would break a consumer.

## Common Pitfalls

**Testing the wrong level.** A team writes cross-service E2E tests for every business rule because "it's more realistic." These tests are 100x slower, flaky, and provide no more confidence than per-service integration tests for logic that lives entirely within one service. Fix: follow the test pyramid. Only cross-service E2E tests need multiple running services.

**Stale pacts.** Consumer contract files are committed to version control and drift out of sync with the actual service code. Fix: generate pacts from code, not handwritten YAML. Publish pacts to the Pact Broker on every consumer CI run. The Broker is the source of truth.

**Provider state drift.** Provider state handlers in Pact verification set up database rows that diverge from production schemas over time. Fix: use the same migration system and seed factories for provider state setup as for other integration tests. Run provider verification against a recently migrated test database.

**Fake services that lie.** An in-memory fake returns hardcoded 200s for all requests, masking integration bugs. Fix: fakes must fail on unexpected inputs (unregistered routes return 404 or 400), not silently succeed. Validate fake inputs against the same schema as the real service.

**E2E test pollution.** Tests create data but do not clean up, causing later tests to see unexpected state. Fix: each E2E test must own its test data. Use unique identifiers (timestamps, UUIDs) per test run. Provide a teardown or seed reset mechanism between test scenarios.

**Missing contract tests for async events.** Teams use Pact for HTTP APIs but leave Kafka events untested. A producer changes an event schema without updating consumers. Fix: use schema registry with compatibility enforcement for all Kafka events. Treat schema compatibility checks as contract tests for async events.

**Can-i-deploy bypassed.** A developer bypasses the can-i-deploy gate because it is slow or flapping. Fix: can-i-deploy is a hard gate. If it is slow, optimize the Pact Broker setup. If it is failing, investigate the failing contract — do not bypass.
