---
name: multi-service-api-contracts
description: Internal API versioning, backward compatibility, retries, and idempotency patterns
topics: [internal-api-versioning, backward-compatibility, retries, idempotency, contract-evolution]
---

## Summary

Internal APIs between services have different constraints than public-facing APIs. They must evolve without coordinated deployments — service A cannot require service B to deploy simultaneously. This demands strict backward compatibility, well-defined deprecation timelines, retry policies that assume transient failures, and idempotency patterns that make retries safe. This document provides concrete guidance on versioning strategies, compatibility rules, retry configuration, idempotency key design, and timeout budgeting for multi-service systems.

## Internal API Versioning Strategies

### URL Path Versioning

The simplest and most discoverable approach: the version is part of the URL path.

```
GET /api/v1/orders/:id
GET /api/v2/orders/:id
```

Service B routes traffic by URL prefix. Both versions run simultaneously during migration. Service A upgrades to v2 at its own pace. Once all consumers are on v2, v1 is decommissioned.

**Trade-offs:**
- (+) Version is visible in logs, dashboards, and access logs — trivially easy to spot which version is being called.
- (+) Easy to test: curl a specific version without special headers.
- (+) Cacheable at every layer (CDN, reverse proxy, client cache).
- (-) URL proliferation — resource paths are repeated for each version.
- (-) Clients must update hard-coded URLs when migrating versions.
- (-) Encourages big-bang versioning rather than additive evolution.

**When to use:** Public-facing APIs, APIs consumed by many independent teams, or when clear migration paths are more important than URL aesthetics.

### Header-Based Versioning

The version is communicated through a request header, keeping URLs stable.

```http
GET /orders/abc123
Accept: application/vnd.myservice.v2+json
# or
GET /orders/abc123
X-API-Version: 2
```

The service inspects the header and dispatches to the appropriate handler version. The URL is the same across versions.

```typescript
// Express middleware for header-based versioning
function versionMiddleware(req: Request, res: Response, next: NextFunction) {
  const version = req.headers['x-api-version'] as string
    || req.headers['accept']?.match(/vnd\.myservice\.v(\d+)/)?.[1]
    || '1'; // default to v1 if omitted

  req.apiVersion = parseInt(version, 10);

  if (req.apiVersion > MAX_SUPPORTED_VERSION) {
    return res.status(400).json({
      error: { code: 'UNSUPPORTED_VERSION', message: `Maximum supported version is ${MAX_SUPPORTED_VERSION}` }
    });
  }

  next();
}
```

**Trade-offs:**
- (+) Clean, stable URLs. Bookmarks and links don't break when the version changes.
- (+) Multiple versions can be differentiated at the handler level without separate route registrations.
- (-) Not visible in browser URL bar. Harder to test without tooling.
- (-) Cannot be cached by standard reverse proxies without custom `Vary` headers.
- (-) Easy to forget the header, leading to silent version defaulting.

**When to use:** Internal service-to-service APIs where both sides are under your control and you can enforce consistent header setting in your service clients.

### Content Negotiation (Media Type Versioning)

A stricter form of header versioning using standard HTTP `Accept` and `Content-Type` headers with vendor-specific media types.

```http
GET /orders/abc123
Accept: application/vnd.acme.orders-v2+json

# Response
Content-Type: application/vnd.acme.orders-v2+json
```

**Trade-offs:**
- (+) Uses HTTP standards correctly. No custom header conventions to document.
- (+) Fine-grained: can version individual resource types independently.
- (-) Most unfamiliar to developers accustomed to URL versioning.
- (-) Verbose headers. More complex client setup.
- (-) Media type parsing is fragile if not done carefully.

**When to use:** APIs adhering strictly to REST constraints, or when you need to version individual resource representations independently of the endpoint.

### Choosing a Versioning Strategy

For internal multi-service APIs: **prefer URL path versioning for new services** and header versioning when URLs must remain stable (e.g., webhooks, callback URLs, shared bookmarked resources). Both work. Consistency within a system matters more than the strategy chosen.

## Backward Compatibility Rules

### Additive-Only Changes (Non-Breaking)

The following changes are backward compatible and do not require a new version:

```
✓ Adding a new field to a response body
✓ Adding a new optional query parameter
✓ Adding a new endpoint
✓ Adding a new enum value (consumers must handle unknown enum values gracefully)
✓ Adding a new HTTP header to responses
✓ Relaxing a validation constraint (accepting more values than before)
✓ Making a previously required field optional
✓ Adding a new error code to the set
```

Example of a backward-compatible response evolution:

```json
// v1 response
{
  "orderId": "ord_abc123",
  "status": "confirmed",
  "total": 9900
}

// v1.1 (still v1, additive change) — consumers that don't know about new fields ignore them
{
  "orderId": "ord_abc123",
  "status": "confirmed",
  "total": 9900,
  "currency": "USD",
  "estimatedDelivery": "2026-04-18"
}
```

### Breaking Changes (Version Bump Required)

The following changes are breaking and require a new version or a coordinated migration:

```
✗ Removing a field from a response body
✗ Renaming a field
✗ Changing a field's type (string → integer, object → array)
✗ Making an optional parameter required
✗ Changing the URL structure of an existing endpoint
✗ Changing the meaning of an existing status code
✗ Removing a valid enum value
✗ Changing error response structure
✗ Narrowing a validation constraint (accepting fewer values than before)
```

### Consumer Robustness Rules

Consumers (clients calling an API) must be written to tolerate additive changes without code modifications:

```typescript
// BAD: Destructuring that fails if a new field is present (strict TypeScript)
const { orderId, status, total } = response; // fails if response has extra fields

// GOOD: Pick only what you need — unknown fields are ignored
interface OrderResponse {
  orderId: string;
  status: OrderStatus;
  total: number;
  // deliberately does not enumerate all fields
}

// BAD: Switch on enum that throws on unknown values
switch (order.status) {
  case 'pending': handlePending(); break;
  case 'confirmed': handleConfirmed(); break;
  default: throw new Error(`Unknown status: ${order.status}`); // BREAKS on new enum values
}

// GOOD: Default case handles unknown enum values gracefully
switch (order.status) {
  case 'pending': handlePending(); break;
  case 'confirmed': handleConfirmed(); break;
  default:
    logger.warn({ status: order.status }, 'Received unknown order status — treating as pending');
    handlePending();
}
```

### Deprecation Timelines

When a field, endpoint, or behavior is deprecated:

1. **Announce deprecation** — add `Deprecation` and `Sunset` HTTP headers to responses.
2. **Log usage** — log every request using the deprecated feature so consumers can be identified.
3. **Notify consumers** — use logs and headers to identify and reach affected teams.
4. **Honor the sunset date** — remove the deprecated feature no earlier than the sunset date.

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
Link: <https://docs.internal/api/v2/migration>; rel="successor-version"
```

**Minimum deprecation windows:**
- Internal services (same organization): 90 days
- Partner APIs: 180 days
- Public APIs: 365 days

## Retry Policies with Exponential Backoff and Jitter

### When to Retry

Retry only on transient errors. Distinguish transient from permanent failures:

| HTTP Status | Retry? | Rationale |
|-------------|--------|-----------|
| 408 Request Timeout | Yes | Server-side timeout — transient |
| 429 Too Many Requests | Yes, with backoff | Rate limit — respect `Retry-After` |
| 500 Internal Server Error | Conditionally | Transient server error — retry if idempotent |
| 502 Bad Gateway | Yes | Upstream unavailable — transient |
| 503 Service Unavailable | Yes | Server overload — transient |
| 504 Gateway Timeout | Yes | Upstream timeout — transient |
| 400 Bad Request | No | Client error — retrying won't help |
| 401 Unauthorized | No | Auth failure — re-authenticate, don't retry |
| 403 Forbidden | No | Permission denied — permanent |
| 404 Not Found | No | Resource absent — permanent |
| 409 Conflict | No | State conflict — permanent (usually) |
| 422 Unprocessable Entity | No | Validation failure — permanent |

**Critical rule:** Only retry idempotent operations, or operations that use idempotency keys. Retrying a non-idempotent POST without an idempotency key risks duplicate side effects (double charges, duplicate orders).

### Exponential Backoff with Jitter

```typescript
interface RetryConfig {
  maxAttempts: number;       // Total attempts (including first)
  baseDelayMs: number;       // Initial delay
  maxDelayMs: number;        // Cap on delay growth
  jitterFactor: number;      // 0.0 to 1.0 — adds randomness to prevent thundering herd
  retryableStatusCodes: Set<number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 30_000,
  jitterFactor: 0.5,
  retryableStatusCodes: new Set([408, 429, 500, 502, 503, 504]),
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential: 100ms, 200ms, 400ms, 800ms...
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Full jitter: random value between 0 and cappedDelay * jitterFactor
  const jitter = Math.random() * cappedDelay * config.jitterFactor;

  return cappedDelay - jitter; // Decorrelated jitter reduces thundering herd
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Extract HTTP status if available
      const status = (error as any)?.response?.status;

      // Don't retry non-transient errors
      if (status && !config.retryableStatusCodes.has(status)) {
        throw error;
      }

      // Don't sleep after the last attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      // Respect server-provided Retry-After header
      const retryAfter = (error as any)?.response?.headers?.['retry-after'];
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : calculateDelay(attempt, config);

      logger.warn({ attempt, delay, status }, 'Retrying after transient failure');
      await sleep(delay);
    }
  }

  throw lastError;
}
```

### Circuit Breaker Pattern

Retries alone are insufficient. Without a circuit breaker, retries against a failing downstream service amplify load during an outage, making recovery harder.

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening
  successThreshold: number;    // Successes in half-open before closing
  timeoutMs: number;           // Time open before trying half-open
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - (this.lastFailureTime ?? 0);
      if (elapsed > this.config.timeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit open — downstream service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

**Trade-offs (retry + circuit breaker):**
- (+) Transient failures are transparent to callers — retries recover without caller awareness.
- (+) Circuit breaker prevents cascading failures and gives failing services time to recover.
- (-) Retries increase tail latency — a 3-retry call can take 3x the timeout budget.
- (-) Jitter adds complexity. Without jitter, retries from many clients synchronize and create thundering herd.

## Idempotency Key Design Patterns

### Why Idempotency Keys Are Required

In distributed systems, at-most-once delivery is not achievable without distributed consensus (expensive). At-least-once delivery is the practical default. This means:

- Network requests may be retried
- Message queue consumers may receive duplicates
- Webhooks may be delivered multiple times

Every mutation operation must be idempotent to handle these cases safely.

### Idempotency Key Protocol

```http
POST /payments
Idempotency-Key: idk_7f3e2a1c-9d4b-4e6f-a8c2-1234567890ab
Content-Type: application/json

{
  "amount": 9900,
  "currency": "USD",
  "customerId": "cust_abc123"
}
```

Server-side implementation:

```typescript
interface IdempotencyRecord {
  key: string;
  requestHash: string;       // Hash of request body to detect mismatched replays
  status: 'processing' | 'complete' | 'error';
  response: unknown;
  statusCode: number;
  expiresAt: Date;
}

async function handleWithIdempotency(
  req: Request,
  res: Response,
  handler: () => Promise<{ statusCode: number; body: unknown }>,
) {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!idempotencyKey) {
    // Idempotency key is optional but recommended — proceed without deduplication
    const { statusCode, body } = await handler();
    return res.status(statusCode).json(body);
  }

  // Validate key format
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: { code: 'INVALID_IDEMPOTENCY_KEY' } });
  }

  // Compute hash of request body to detect mismatched replays
  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body))
    .digest('hex');

  // Atomic check-and-set to handle concurrent requests with the same key
  const existing = await idempotencyStore.getOrCreate(idempotencyKey, {
    requestHash,
    status: 'processing',
  });

  if (existing) {
    // Replay detected
    if (existing.requestHash !== requestHash) {
      return res.status(422).json({
        error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Key used with different request body' }
      });
    }

    if (existing.status === 'processing') {
      return res.status(409).json({
        error: { code: 'CONCURRENT_REQUEST', message: 'A request with this key is in progress' }
      });
    }

    // Return stored response
    return res.status(existing.statusCode).json(existing.response);
  }

  // First request — process and store result
  try {
    const { statusCode, body } = await handler();
    await idempotencyStore.complete(idempotencyKey, { statusCode, response: body });
    return res.status(statusCode).json(body);
  } catch (error) {
    await idempotencyStore.error(idempotencyKey, { statusCode: 500, response: { error: 'Internal error' } });
    throw error;
  }
}
```

### Key Generation Guidelines

- Clients generate idempotency keys, not servers. This ensures keys survive network failures.
- Use UUIDs (v4) or crypto-random strings of at least 128 bits of entropy.
- Scope keys to the operation: `pay_<uuid>` for payments, `ord_<uuid>` for orders. Avoids cross-operation key collisions.
- Keys expire after 24–72 hours. Document the expiry window clearly.
- Store keys in a fast, durable store (Redis with persistence, or a database table with an index on the key).

**Trade-offs (idempotency keys):**
- (+) Retries are safe — the consumer doesn't need to worry about duplicate side effects.
- (+) Keys serve as a natural audit trail for retry behavior.
- (-) Requires durable storage and an atomic check-and-set operation.
- (-) Concurrent requests with the same key require careful locking (use database-level uniqueness constraints or Redis SET NX).
- (-) Keys must expire to avoid unbounded storage growth.

## Contract Evolution and Deprecation Strategies

### Evolutionary API Design

Design APIs to evolve without version bumps by applying these principles from the start:

**Use open content models:** Response objects should accept and ignore unknown fields. Never validate that a response contains only known fields.

**Use extension points:** Include a `metadata` or `extensions` field for future optional data:

```json
{
  "orderId": "ord_abc123",
  "status": "confirmed",
  "metadata": {}
}
```

**Use stable identifiers:** Resource IDs must never change format. If you start with integer IDs, you cannot switch to UUIDs without a breaking change. Prefer opaque string identifiers from day one.

**Explicit nullability:** Distinguish "field is absent" from "field is explicitly null." A field that is absent means the server doesn't know about it; a field that is null means the server knows it has no value.

### Deprecation Workflow

1. **Mark deprecated in the schema:** Add `deprecated: true` in OpenAPI, or a `@deprecated` directive in GraphQL.
2. **Return deprecation headers:** Include `Deprecation` and `Sunset` headers.
3. **Emit metrics:** Record usage of deprecated endpoints/fields by consumer identity.
4. **Notify consumers:** Use the metrics to identify and notify affected service teams.
5. **Sunset:** On the sunset date, remove the deprecated feature. Return `410 Gone` for deprecated endpoints.

```yaml
# OpenAPI deprecation marking
paths:
  /api/v1/orders:
    get:
      deprecated: true
      description: "Deprecated. Use /api/v2/orders. Sunset: 2026-12-31."
      x-sunset: "2026-12-31"
      x-migration-guide: "https://docs.internal/api/v2/migration"
```

### Parallel Running Strategy

Run old and new versions simultaneously during migration:

```
Phase 1: Deploy v2 endpoint. Keep v1 live. No consumer changes.
Phase 2: Notify consumers. Give them 90 days to migrate.
Phase 3: Consumers migrate to v2 at their own pace.
Phase 4: Monitor v1 usage until it drops to zero.
Phase 5: Sunset v1. Return 410 for 30 days, then remove completely.
```

**Trade-offs:**
- (+) Zero forced lockstep deployments. Each team migrates independently.
- (+) Rollback is straightforward: revert client to v1 calls.
- (-) Running two versions doubles the code to maintain during the transition window.
- (-) Bugs must be fixed in both versions during the parallel period.

## Timeout Budget Allocation

### Timeout Budgets in Synchronous Call Chains

Every synchronous call chain has a total time budget (typically driven by the user-facing SLA). Allocate that budget across service hops:

```
User SLA: 2000ms total

API Gateway:          50ms   (routing, auth)
BFF / Aggregator:    100ms   (orchestration overhead)
  → Order Service:   500ms   (own processing)
      → Inventory:   200ms   (sub-call from Order)
  → User Service:    300ms   (parallel with Order)
  → Catalog Service: 300ms   (parallel with Order)
Buffer / P99 margin: 550ms

Total:              2000ms
```

**Rules:**
- Each service subtracts its own processing time from the budget and passes the remainder to downstream calls.
- Use deadline propagation: pass the absolute deadline as a header so all services in the chain share a single clock.

```typescript
// Propagate deadline through service calls
function propagateDeadline(req: Request, outgoingHeaders: Record<string, string>) {
  const incomingDeadline = req.headers['x-request-deadline'] as string | undefined;
  if (incomingDeadline) {
    const remainingMs = new Date(incomingDeadline).getTime() - Date.now();
    if (remainingMs <= 0) {
      throw new Error('Deadline exceeded before downstream call');
    }
    outgoingHeaders['x-request-deadline'] = incomingDeadline;
    outgoingHeaders['x-request-timeout'] = String(Math.min(remainingMs - 10, DEFAULT_TIMEOUT));
  } else {
    const deadline = new Date(Date.now() + DEFAULT_TIMEOUT).toISOString();
    outgoingHeaders['x-request-deadline'] = deadline;
    outgoingHeaders['x-request-timeout'] = String(DEFAULT_TIMEOUT);
  }
}
```

**Trade-offs:**
- (+) Budget allocation prevents a slow upstream from consuming 100% of the budget, starving downstream calls.
- (+) Deadline propagation ensures the full chain fails fast when the overall budget is exhausted.
- (-) Requires consistent adoption across all services in the chain.
- (-) Hard-coded timeout budgets become stale as service performance changes — revisit budgets quarterly.

### Timeout Anti-Patterns

**No timeout set:** The default for most HTTP clients is no timeout. An unresponsive downstream service holds a connection open indefinitely, exhausting the upstream's connection pool.

**Identical timeout across all tiers:** Setting 5s everywhere means a chain of 5 services each with 5s timeouts can take 25s to fail. Use smaller timeouts deeper in the call graph.

**Timeout without circuit breaker:** After the timeout threshold, retries still hit the failing service. Add a circuit breaker so repeated timeouts open the circuit and stop sending requests.

## Common Pitfalls

**Version drift without sunset enforcement.** Running v1, v2, and v3 simultaneously with no committed sunset dates. Consumers never migrate because the old version keeps working. Fix: enforce sunset dates in CI (fail the build if a past-sunset version is still active).

**Retrying non-idempotent POSTs.** Automatic retry on a payment POST without an idempotency key causes duplicate charges. Fix: require idempotency keys on all mutation endpoints; only retry when the key is present.

**Jitter-free exponential backoff.** All clients retry at exactly 100ms, 200ms, 400ms — synchronized thundering herd that overwhelms the recovering service. Fix: add full jitter.

**Missing consumer contract tests.** A provider changes a response field name. No tests catch it. Consumer breaks in production. Fix: implement consumer-driven contract tests (Pact) that run in the provider's CI pipeline.

**Timeout too high on outer layer, too low on inner layer.** Inner services time out before the outer caller does. Callers retry, inner service is already overloaded. Fix: use deadline propagation so all layers share one absolute deadline.

## See Also

- [multi-service-architecture](./multi-service-architecture.md) — Service boundary design and communication patterns
- [multi-service-auth](./multi-service-auth.md) — mTLS, service tokens, and zero-trust for inter-service calls
- [api-design](./api-design.md) — REST and GraphQL design principles
- [testing-strategy](./testing-strategy.md) — Contract testing with Pact
