---
name: backend-testing
description: API integration tests, contract testing, database testing patterns, mocking external services, and load testing
topics: [backend, testing, integration-tests, contract-testing, database-testing, mocking, load-testing]
---

Backend testing strategy determines how much confidence you have before every deploy — a well-layered test suite catches regressions at the fastest possible feedback loop while still exercising the real data layer and honoring API contracts with consumers.

## Summary

### API Integration Tests

Integration tests verify the full request-response cycle through the application stack, including middleware, routing, validation, business logic, and the database. Unlike unit tests, they catch wiring problems that unit tests miss.

**With supertest (Node.js):** Mount the Express/Fastify app without starting a server. Supertest handles the HTTP layer in-process — fast, no port conflicts.

```typescript
const app = createApp(); // factory, no app.listen()
it('POST /orders returns 201 with created order', async () => {
  const res = await request(app)
    .post('/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: 'prod_1', quantity: 2 });
  expect(res.status).toBe(201);
  expect(res.body.data.id).toBeDefined();
});
```

Run integration tests against a real database (see Database Testing below), not mocks. The value of integration tests comes from exercising the real data layer.

### Contract Testing

Contract tests verify that a service honors the API contract its consumers depend on, without requiring consumers and providers to be deployed together.

**Consumer-driven contracts (Pact):** Consumers define their expectations (request shape + response shape) as a contract file. The provider verifies the contract runs against their implementation. Breaks are caught in CI before deployment, not in staging.

**Schema validation:** For APIs consumed by external parties, use JSON Schema or OpenAPI schema validation in tests. Assert that every response matches the documented schema. This catches unintentional breaking changes (removed fields, type changes) before they reach consumers.

**Use contract testing when:** You own both sides of an API boundary, or you maintain a public API with known consumers. Skip it for internal services where integration tests cover the boundary adequately.

### Database Testing

**Use transactions for isolation:** Wrap each test in a database transaction and roll it back after the test. No cleanup code needed; each test starts from a known state.

```typescript
beforeEach(async () => { await db.transaction.begin(); });
afterEach(async () => { await db.transaction.rollback(); });
```

**Test fixtures:** Use factory functions (not fixture files) to create test data. Factories are composable, easier to maintain, and produce minimal records with explicit variation. Libraries: `fishery`, `@anatine/zod-mock`, or plain functions.

**Test database:** Use a separate database for tests (configured via `DATABASE_URL` environment variable in CI). Run migrations before the test suite. Never run tests against the production database.

**Seed data:** Limit seed data to what is required by the test. Broad seed data creates invisible dependencies between tests — a test that only creates one record but relies on seeded data is fragile and hard to understand.

## Deep Guidance

### Mocking External Services

**MSW (Mock Service Worker):** Intercepts HTTP requests at the network layer using a service worker (browser) or Node.js interceptor. Unlike mocking `fetch` or axios, MSW mocks at the protocol level — the same mock works for any HTTP client. Define handlers that return realistic responses; test error cases by returning 5xx responses or network errors.

**nock (Node.js):** Intercepts Node.js `http`/`https` modules. Appropriate for testing code that uses native HTTP or libraries that don't support service workers. Supports response delays, request matching by headers and body, and assertion that expected requests were made.

**Principles:**
- Mock only external boundaries — services you don't own (Stripe, Twilio, third-party APIs).
- Don't mock your own database or internal services; use real instances in integration tests.
- Keep mock responses realistic — use actual API response shapes, not minimal stubs.
- Test the unhappy path: timeout, 429, 500, malformed response.

### Load Testing

**k6:** JavaScript-based load testing tool with a clean API. Define scenarios with virtual users and ramp profiles. Check assertions (thresholds) on p95 latency and error rate inline with the test script. Outputs structured results; integrates with Grafana for visualization.

**Artillery:** YAML/JSON configuration-driven load testing with a plugin ecosystem. Better for teams that prefer declarative configuration over scripting. Supports WebSocket and gRPC in addition to HTTP.

**When to run:** Load test before launching any endpoint that will receive significant concurrent traffic, before scaling down infrastructure, and after performance-sensitive refactors. Run load tests in a staging environment with production-representative data volume. Define pass/fail thresholds (p99 < 500ms, error rate < 0.1%) and fail CI when thresholds are breached.
