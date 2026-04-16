---
name: multi-service-resilience
description: Circuit breakers, bulkheads, timeout budgets, and failure isolation strategies
topics: [circuit-breakers, bulkheads, timeout-budgets, failure-isolation, retry-storms]
---

## Summary

In a multi-service system, any individual service will fail. The question is whether that failure stays contained or cascades into a full system outage. Resilience patterns exist to answer that question: circuit breakers stop callers from hammering failing services; bulkheads prevent one misbehaving integration from consuming all threads and connections; timeout budgets enforce that calls fail fast rather than hang indefinitely; and graceful degradation strategies ensure users receive a degraded-but-working experience rather than an error page. This document provides concrete patterns, configuration guidance, and trade-off analysis for each technique.

## Circuit Breaker Pattern

A circuit breaker wraps outbound calls to a downstream service. It monitors failure rates and, when they exceed a threshold, stops forwarding calls — returning an immediate failure instead of waiting for timeouts to accumulate.

### States

A circuit breaker has three states:

**Closed (normal):** All calls pass through. Failures are counted. When the failure rate exceeds the threshold within the measurement window, the circuit opens.

**Open (tripped):** All calls fail immediately without attempting the downstream call. The caller receives a fast failure. After a configured timeout, the circuit transitions to half-open.

**Half-Open (probing):** A limited number of probe calls are allowed through to the downstream service. If they succeed, the circuit closes. If they fail, the circuit returns to open.

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  // How many failures in the window before opening
  failureThreshold: number;
  // Rolling window duration (ms) for counting failures
  windowMs: number;
  // Minimum number of calls in the window before the threshold applies
  // Prevents opening on 1 failure out of 1 call (100% failure rate)
  minimumCallCount: number;
  // How long to stay open before probing (ms)
  recoveryTimeoutMs: number;
  // How many probe calls in half-open state before deciding
  probeCount: number;
  // How many probes must succeed to close the circuit
  probeSuccessThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 0.5,      // 50% failure rate triggers open
  windowMs: 60_000,           // 1-minute rolling window
  minimumCallCount: 10,       // Need at least 10 calls before evaluating
  recoveryTimeoutMs: 30_000,  // Wait 30s before probing
  probeCount: 3,
  probeSuccessThreshold: 2,
};

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private callWindow: Array<{ timestamp: number; success: boolean }> = [];
  private probeAttempts = 0;
  private probeSuccesses = 0;
  private openedAt?: number;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.pruneWindow();

    if (this.state === 'open') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed < this.config.recoveryTimeoutMs) {
        throw new CircuitOpenError(`Circuit ${this.name} is open — downstream unavailable`);
      }
      this.transitionTo('half-open');
    }

    if (this.state === 'half-open') {
      if (this.probeAttempts >= this.config.probeCount) {
        throw new CircuitOpenError(`Circuit ${this.name} probe limit reached — still open`);
      }
      this.probeAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess() {
    this.callWindow.push({ timestamp: Date.now(), success: true });

    if (this.state === 'half-open') {
      this.probeSuccesses++;
      if (this.probeSuccesses >= this.config.probeSuccessThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  private recordFailure() {
    this.callWindow.push({ timestamp: Date.now(), success: false });

    if (this.state === 'half-open') {
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed' && this.shouldOpen()) {
      this.transitionTo('open');
    }
  }

  private shouldOpen(): boolean {
    if (this.callWindow.length < this.config.minimumCallCount) return false;
    const failures = this.callWindow.filter(c => !c.success).length;
    return failures / this.callWindow.length >= this.config.failureThreshold;
  }

  private transitionTo(next: CircuitState) {
    this.state = next;
    if (next === 'open') {
      this.openedAt = Date.now();
      this.probeAttempts = 0;
      this.probeSuccesses = 0;
    } else if (next === 'closed') {
      this.callWindow = [];
      this.probeAttempts = 0;
      this.probeSuccesses = 0;
    }
  }

  private pruneWindow() {
    const cutoff = Date.now() - this.config.windowMs;
    this.callWindow = this.callWindow.filter(c => c.timestamp > cutoff);
  }

  getState(): CircuitState { return this.state; }
}

class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
```

**Trade-offs:**
- (+) Prevents cascading failures: a slow downstream service cannot hold the upstream's threads indefinitely.
- (+) Fast failure in open state gives the upstream service time to shed load and the downstream service time to recover.
- (+) Half-open probing enables automatic recovery without manual intervention.
- (-) Circuit opens on transient spikes, not just real outages — requires tuning `minimumCallCount` and `windowMs` carefully for your traffic patterns.
- (-) State is per-instance by default. In a horizontally-scaled service, each replica has its own circuit state. Use Redis or a service mesh (Istio, Envoy) for cluster-wide state.
- (-) `CircuitOpenError` is a new error type callers must handle. Forgetting to catch it surfaces as an unhandled exception.

**Configuration guidelines:**
- `failureThreshold: 0.5` is a reasonable default for most services. Lower it (0.25) for critical payments or auth paths. Raise it (0.75) for non-critical enrichment services where partial data is acceptable.
- `recoveryTimeoutMs: 30_000` gives a recovering service 30s of breathing room. Increase for services that are known to take longer to restart.
- `minimumCallCount: 10` prevents false opens on low-traffic periods. Reduce in environments where services handle fewer requests (dev, staging).

## Bulkhead Isolation

Bulkheads partition resources so that failures in one integration cannot exhaust the resources needed by other integrations. The name comes from ship design: watertight compartments prevent a single hull breach from sinking the entire vessel.

### Thread Pool Bulkhead

Dedicate a separate thread pool (or async concurrency limit) to each downstream service. A slow downstream service fills its own pool, not the global pool.

```typescript
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(private maxConcurrency: number) {
    this.permits = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this.waitQueue.push(resolve));
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

class BulkheadExecutor {
  private semaphore: Semaphore;
  private activeCount = 0;
  private rejectedCount = 0;

  constructor(
    private readonly name: string,
    private readonly maxConcurrency: number,
    private readonly maxQueueSize: number,
  ) {
    this.semaphore = new Semaphore(maxConcurrency);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const queueDepth = this.semaphore['waitQueue'].length;
    if (queueDepth >= this.maxQueueSize) {
      this.rejectedCount++;
      throw new BulkheadFullError(
        `Bulkhead ${this.name} queue full (${this.maxConcurrency} concurrent + ${this.maxQueueSize} queued)`
      );
    }

    await this.semaphore.acquire();
    this.activeCount++;

    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.semaphore.release();
    }
  }

  getMetrics() {
    return {
      name: this.name,
      active: this.activeCount,
      maxConcurrency: this.maxConcurrency,
      rejected: this.rejectedCount,
    };
  }
}

class BulkheadFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadFullError';
  }
}

// Usage: each downstream gets its own bulkhead
const paymentsBulkhead = new BulkheadExecutor('payments-service', 10, 20);
const inventoryBulkhead = new BulkheadExecutor('inventory-service', 20, 40);
const notificationsBulkhead = new BulkheadExecutor('notifications-service', 5, 10);

async function chargeAndFulfill(orderId: string) {
  // Payments and inventory each have their own concurrency limit
  // A payments outage cannot consume inventory's capacity
  const [charge, reservation] = await Promise.all([
    paymentsBulkhead.execute(() => paymentsClient.charge(orderId)),
    inventoryBulkhead.execute(() => inventoryClient.reserve(orderId)),
  ]);
  return { charge, reservation };
}
```

### Queue-Based Bulkhead

For async workloads, use separate queues per integration. Each queue has its own concurrency and backpressure configuration.

```typescript
// BullMQ example: separate queues isolate failure domains
const paymentQueue = new Queue('payment-processing', {
  connection: redis,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
});

const notificationQueue = new Queue('notification-dispatch', {
  connection: redis,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 500 } },
});

// Payment worker: limited to 5 concurrent jobs
const paymentWorker = new Worker('payment-processing', processPayment, {
  connection: redis,
  concurrency: 5,       // Bulkhead: max 5 concurrent payment jobs
  limiter: { max: 100, duration: 60_000 },  // 100 jobs/minute rate limit
});

// Notification worker: separate concurrency, isolated from payment issues
const notificationWorker = new Worker('notification-dispatch', sendNotification, {
  connection: redis,
  concurrency: 20,      // Notifications can be higher concurrency
});
```

**Trade-offs (bulkheads):**
- (+) Failure in one integration cannot starve others of thread/connection resources.
- (+) Per-integration metrics (`activeCount`, `rejectedCount`) make capacity problems visible before they cascade.
- (+) `BulkheadFullError` sheds load with a controlled rejection rather than an unbounded queue that grows until OOM.
- (-) Tuning concurrency limits requires load testing. Too low and you throttle unnecessarily; too high and the bulkhead doesn't protect.
- (-) Adds a queuing layer. Calls that would have failed fast now wait up to `maxQueueSize` entries before being rejected — this can increase average latency even during partial failures.
- (-) Per-integration bulkheads multiply operational configuration. Document limits in service manifests.

## Timeout Budget Allocation

Timeouts must be set at every level of a call chain. A missing timeout is a resource leak waiting to become an outage.

### The Budget Model

Every user-facing request has a total time budget. Each hop in the call chain consumes part of that budget. The sum of all hops (including their own processing time) must fit within the total budget.

```
User SLA: 2,000ms (P99 target)

Entry path:
  API Gateway auth + routing:   50ms
  BFF / aggregator overhead:   100ms

Parallel downstream calls:
  Order Service:               500ms
    └─ Inventory sub-call:     200ms   (within Order's 500ms budget)
  User Profile Service:        300ms   (parallel with Order)
  Product Catalog Service:     250ms   (parallel with Order)

Serialization + network:       100ms
P99 buffer / headroom:         500ms
                               ────
Total:                       2,000ms
```

### Deadline Propagation

Pass the absolute deadline through the call chain so all services share one clock, not per-hop timeouts that can stack:

```typescript
const DEADLINE_HEADER = 'x-request-deadline';
const DEFAULT_TIMEOUT_MS = 5_000;

// Middleware: attach deadline to incoming requests that don't have one
function deadlineMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.headers[DEADLINE_HEADER]) {
    const deadline = new Date(Date.now() + DEFAULT_TIMEOUT_MS).toISOString();
    req.headers[DEADLINE_HEADER] = deadline;
  }
  next();
}

// Helper: compute remaining timeout when making downstream calls
function getRemainingMs(req: Request, overhead = 10): number {
  const deadline = req.headers[DEADLINE_HEADER] as string | undefined;
  if (!deadline) return DEFAULT_TIMEOUT_MS;

  const remaining = new Date(deadline).getTime() - Date.now() - overhead;
  if (remaining <= 0) throw new DeadlineExceededError('Request deadline already exceeded');
  return remaining;
}

// Usage: downstream call uses remaining budget, not a fixed timeout
async function callInventoryService(req: Request, orderId: string) {
  const timeout = getRemainingMs(req, 20); // subtract 20ms for network overhead

  return inventoryClient.getAvailability(orderId, {
    headers: { [DEADLINE_HEADER]: req.headers[DEADLINE_HEADER] },
    timeout,
  });
}

class DeadlineExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineExceededError';
  }
}
```

**Trade-offs (timeout budgets):**
- (+) Deadline propagation ensures the entire call chain fails fast rather than stacking per-hop timeouts.
- (+) Budget modeling makes timeout decisions explicit rather than scattered magic numbers across the codebase.
- (-) Requires all services to adopt the deadline header convention. Partial adoption produces incorrect behavior.
- (-) Clock skew across services introduces small errors in remaining-time calculations. Use monotonic clocks where available and add conservative overhead.
- (-) Budgets become stale as service performance changes. Revisit quarterly or after each major architectural change.

**Timeout anti-patterns:**
- **No timeout set**: Most HTTP clients default to no timeout. An unresponsive downstream holds a connection indefinitely, exhausting the upstream's connection pool.
- **Identical timeout at every level**: A chain of 5 services each with a 5,000ms timeout can take 25,000ms to fail end-to-end. Timeouts must decrease with depth.
- **Timeout without circuit breaker**: Repeated timeouts still attempt the downstream call on every retry. Pair every timeout with a circuit breaker so repeated failures open the circuit.

## Failure Isolation Strategies

### Error Classification

Not all errors are the same. Classify errors before deciding on the response:

```typescript
type ErrorClass =
  | 'transient'    // Temporary — retry is likely to succeed
  | 'permanent'    // Client or data error — retrying won't help
  | 'overload'     // Server is busy — retry with backoff + jitter
  | 'timeout'      // Deadline exceeded — check deadline before retrying
  | 'circuit-open' // Downstream unavailable — return fallback, don't retry
  | 'unknown';     // Unclassified — treat conservatively

function classifyError(error: unknown): ErrorClass {
  if (error instanceof CircuitOpenError) return 'circuit-open';
  if (error instanceof DeadlineExceededError) return 'timeout';

  const status = (error as any)?.response?.status as number | undefined;
  if (!status) return 'transient'; // Network error, no response

  if (status === 429) return 'overload';
  if ([500, 502, 503, 504].includes(status)) return 'transient';
  if ([400, 401, 403, 404, 422].includes(status)) return 'permanent';
  if (status === 408) return 'timeout';

  return 'unknown';
}
```

### Fallback Strategies by Error Class

```typescript
async function getProductWithFallback(productId: string, req: Request): Promise<Product> {
  try {
    return await catalogBulkhead.execute(() =>
      catalogCircuit.execute(() =>
        callCatalogService(req, productId)
      )
    );
  } catch (error) {
    const errorClass = classifyError(error);

    switch (errorClass) {
      case 'circuit-open':
      case 'transient':
        // Return cached version if available
        const cached = await cache.get<Product>(`product:${productId}`);
        if (cached) {
          logger.warn({ productId, errorClass }, 'Returning stale cached product');
          return { ...cached, _stale: true };
        }
        // Return a minimal placeholder — better than an error for browsing
        return { id: productId, name: 'Product temporarily unavailable', available: false };

      case 'permanent':
        // 404 or 422 — propagate, don't retry or cache
        throw error;

      case 'timeout':
        // Deadline already exceeded — fail fast, don't attempt fallback
        throw error;

      default:
        // Unknown — return placeholder and log for investigation
        logger.error({ productId, errorClass, error }, 'Unclassified product fetch error');
        return { id: productId, name: 'Product temporarily unavailable', available: false };
    }
  }
}
```

### Graceful Degradation Patterns

Design each feature for three modes: full, degraded, and unavailable.

```typescript
interface ProductPageData {
  product: Product;
  relatedProducts: Product[];   // Optional — degradable
  reviews: Review[];            // Optional — degradable
  inventory: InventoryStatus;   // Optional — degradable
}

async function getProductPageData(
  productId: string,
  req: Request
): Promise<ProductPageData> {
  // Core product data — non-degradable
  const product = await getProductWithFallback(productId, req);

  // Optional enrichments — fail independently, don't block the page
  const [relatedProducts, reviews, inventory] = await Promise.allSettled([
    getRelatedProducts(productId, req),
    getProductReviews(productId, req),
    getInventoryStatus(productId, req),
  ]);

  return {
    product,
    relatedProducts: relatedProducts.status === 'fulfilled' ? relatedProducts.value : [],
    reviews: reviews.status === 'fulfilled' ? reviews.value : [],
    inventory: inventory.status === 'fulfilled'
      ? inventory.value
      : { status: 'unknown', message: 'Inventory status temporarily unavailable' },
  };
}
```

**Trade-offs (graceful degradation):**
- (+) Users receive a working page rather than an error screen when a non-critical service is down.
- (+) `Promise.allSettled` is the correct primitive — unlike `Promise.all`, it does not short-circuit on failure.
- (-) Partial data requires careful UI handling. The frontend must know how to render each degraded state.
- (-) Stale cache fallbacks can show outdated prices or incorrect availability. Set explicit `_stale` flags so the UI can display a freshness warning.

## Retry Storm Prevention

Retry storms occur when many clients simultaneously retry after a shared failure, overwhelming a recovering service with a burst of traffic.

### Jitter and Backoff

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: 'full' | 'equal' | 'decorrelated';
}

const SERVICE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10_000,
  jitter: 'full',
};

function computeDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, config.maxDelayMs);

  switch (config.jitter) {
    case 'full':
      // Random value between 0 and capped — maximum spread
      return Math.random() * capped;

    case 'equal':
      // Half fixed, half random — more predictable average
      return capped / 2 + Math.random() * (capped / 2);

    case 'decorrelated':
      // Each delay is random within [baseDelay, prevDelay * 3]
      // Avoids correlated retry waves across clients
      return Math.random() * (capped * 3 - config.baseDelayMs) + config.baseDelayMs;
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = SERVICE_RETRY_CONFIG,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorClass = classifyError(error);

      // Only retry transient errors — never retry permanent or open-circuit
      if (errorClass === 'permanent' || errorClass === 'circuit-open') {
        throw error;
      }

      if (attempt === config.maxAttempts) break;

      // Respect server-provided Retry-After header (rate limit responses)
      const retryAfterHeader = (error as any)?.response?.headers?.['retry-after'];
      const delay = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : computeDelay(attempt, config);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### Coordinated Retry Budgets

In high-traffic systems, coordinate retry behavior at the request level using retry budgets — a limit on the ratio of retries to original requests:

```typescript
class RetryBudget {
  private tokens: number;
  private readonly maxTokens: number;
  private lastRefill: number;

  constructor(
    private readonly requestsPerSecond: number,
    // Allow at most 20% of traffic to be retries
    private readonly retryRatio: number = 0.2,
  ) {
    this.maxTokens = Math.ceil(requestsPerSecond * retryRatio);
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  canRetry(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillAmount = (elapsed / 1000) * this.requestsPerSecond * this.retryRatio;
    this.tokens = Math.min(this.maxTokens, this.tokens + refillAmount);
    this.lastRefill = now;
  }
}

const catalogRetryBudget = new RetryBudget(100); // 100 req/s, 20% retry budget = 20 retries/s

async function callCatalogWithBudget(productId: string): Promise<Product> {
  try {
    return await catalogClient.getProduct(productId);
  } catch (error) {
    if (classifyError(error) === 'transient' && catalogRetryBudget.canRetry()) {
      await new Promise(resolve => setTimeout(resolve, computeDelay(1, SERVICE_RETRY_CONFIG)));
      return catalogClient.getProduct(productId);
    }
    throw error;
  }
}
```

**Trade-offs (retry storm prevention):**
- (+) Full jitter is the most effective at preventing thundering herd — clients retry at random intervals rather than synchronized waves.
- (+) Retry budgets cap the amplification factor: 100 failures cannot produce 300+ retry calls when the budget is exhausted.
- (-) Full jitter means some retries happen very quickly (near zero delay), which may not be appropriate for services that need explicit recovery time. Use `equal` jitter for predictable minimum delays.
- (-) Retry budget state must be shared across instances in a horizontally-scaled service. Use Redis counters with TTL for cluster-wide budgets.

## Observability for Resilience

Every resilience mechanism must emit metrics and structured logs so you know when it activates:

```typescript
// Metrics to expose (Prometheus or equivalent):
// circuit_breaker_state{name, state}                — 0=closed, 1=half-open, 2=open
// circuit_breaker_calls_total{name, result}          — success, failure, short-circuited
// bulkhead_active_calls{name}                        — current concurrency
// bulkhead_rejected_calls_total{name}                — rejected due to full bulkhead
// retry_attempts_total{service, attempt_number}      — retry attempt distribution
// timeout_exceeded_total{service}                    — deadline exceeded events

function instrumentedCircuitCall<T>(
  circuit: CircuitBreaker,
  bulkhead: BulkheadExecutor,
  fn: () => Promise<T>,
  labels: { service: string },
): Promise<T> {
  const start = Date.now();

  return bulkhead.execute(() => circuit.execute(fn))
    .then(result => {
      metrics.increment('circuit_breaker_calls_total', { ...labels, result: 'success' });
      metrics.histogram('call_duration_ms', Date.now() - start, labels);
      return result;
    })
    .catch(error => {
      const result = error instanceof CircuitOpenError
        ? 'short-circuited'
        : error instanceof BulkheadFullError
          ? 'rejected'
          : 'failure';
      metrics.increment('circuit_breaker_calls_total', { ...labels, result });
      throw error;
    });
}
```

## Common Pitfalls

**Circuit breaker per-instance only.** In a 10-replica service, each replica has its own circuit state. One replica may have opened its circuit while the other nine keep sending traffic, defeating the protection. Fix: share circuit state via Redis or delegate circuit breaking to the service mesh (Envoy, Istio).

**Retrying without a circuit breaker.** Retry logic keeps hammering a failing service even after the failure is clearly systemic. Fix: wrap every retry block in a circuit breaker. When the circuit opens, retries stop.

**Missing `Promise.allSettled` in fan-outs.** Using `Promise.all` for parallel enrichment calls means a single enrichment failure cancels all others. Fix: use `Promise.allSettled` and handle each result independently.

**Timeout but no deadline.** Setting a timeout on each call without propagating a shared deadline means the full call chain timeout is the sum of individual timeouts. A chain of three services each with 5,000ms timeouts can take 15 seconds to fail. Fix: attach a deadline at the entry point and propagate it through all downstream calls.

**Bulkhead sized by gut feel.** Setting `maxConcurrency: 10` without measuring the service's actual throughput. Too low throttles legitimate traffic; too high doesn't protect. Fix: load test the downstream service to find its natural breaking point, then set the bulkhead just below it.

**Graceful degradation without cache warming.** Returning a cached fallback only works if the cache was populated. On a cold start or after a cache flush, there's nothing to fall back to. Fix: implement cache warming on startup and ensure TTLs are set conservatively so fallbacks are available during brief outages.

## See Also

- [multi-service-api-contracts](./multi-service-api-contracts.md) — Retry policies, idempotency keys, and timeout budget allocation
- [multi-service-observability](./multi-service-observability.md) — Metrics, tracing, and alerting for resilience signals
- [multi-service-architecture](./multi-service-architecture.md) — Circuit breaker context within service topology
- [multi-service-testing](./multi-service-testing.md) — Chaos testing and fault injection strategies
