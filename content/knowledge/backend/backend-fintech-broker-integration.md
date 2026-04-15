---
name: backend-fintech-broker-integration
description: Multi-broker adapter pattern; credential rotation; error harmonization; rate-limit management; broker-side quirks.
topics: [backend, fintech, brokers, integration, adapter-pattern, rate-limits, credentials, retry]
---

A fintech backend that routes orders or reads positions across more than one broker inherits the union of every broker's quirks, outages, auth schemes, and undocumented behaviors. The broker-integration layer exists to hide that mess behind one normalized internal contract so the rest of the system — risk, order lifecycle, ledger, UI — can stay clean. This doc covers the adapter contract, credential handling, error harmonization, rate-limit strategy, and the specific pitfalls that recur regardless of which brokers you connect.

## Summary

Brokers do not share conventions. Alpaca exposes REST+WebSocket with OAuth or static keys; Interactive Brokers' Client Portal uses a local gateway with session tokens that time out; Tradier is REST-only with bearer tokens; TD/Schwab uses OAuth with mandatory refresh flows; institutional venues speak FIX 4.2/4.4 over persistent TCP; some prime brokers ship vendor-specific binary protocols. Auth differs. Order-state taxonomies differ (Alpaca's `new/partially_filled/filled/canceled/expired` does not map 1:1 to IBKR's `Submitted/PreSubmitted/Cancelled/Filled`). Error-code schemes differ. Rate-limit headers differ — when they exist at all. Building "just one more broker-specific branch" into the order service is how a codebase becomes unmaintainable in 18 months. The adapter layer is the discipline that prevents that.

The adapter contract is a narrow, normalized internal API: `placeOrder`, `cancelOrder`, `replaceOrder`, `fetchOrder`, `fetchFills`, `fetchPositions`, `fetchBalance`, `subscribeFills`, `subscribeQuotes`. Each broker-specific adapter implements that interface; everything above the interface — risk checks, order router, position service — speaks only the normalized types. Define the contract in an IDL (protobuf, OpenAPI, or just a well-typed TS/Go module) so schema drift is a compile error, not a runtime surprise. Normalized types include a canonical `OrderStatus` enum, a canonical `RejectReason` enum, and monetary fields in minor units (see `backend-fintech-ledger.md`).

Credentials never live in source, never in plain env vars in production, and never in the container image. Store them in a secrets manager with audit trails (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, 1Password Service Accounts). Fetch at process start, cache in memory with a TTL, refresh on expiry. Rotate on a schedule (30–90 days for static keys) and rotate immediately on any suspected compromise, employee offboarding, or vendor breach. Broker OAuth refresh tokens require a separate refresh worker — long-running processes with stale tokens are the single most common broker outage cause in practice.

Error harmonization converts broker-specific failures into a small internal taxonomy the rest of the system can reason about: `transient` (retry with exponential backoff + jitter), `rate_limited` (backoff + queue, honor any `Retry-After`), `invalid` (non-retriable; surface to user with a clean reason), `auth` (refresh credentials and retry once; alert on repeat), `outage` (circuit-break, disable new-order flow, alert on-call), `unknown` (state is indeterminate — do NOT blindly retry; queue for reconciliation — see `backend-fintech-order-lifecycle.md`). The mapping table is the most audited piece of the adapter; mis-classifying `unknown` as `transient` causes duplicate orders and customer-visible incidents.

Rate-limit management is client-side: a token-bucket per broker per credential (plus per-endpoint where brokers split limits), sized below the broker's published limit to leave headroom for retries. Back-pressure upstream — the order router should block on an awaitable token, not spin-retry — so quota exhaustion manifests as latency, not cascading rejections. On approaching the limit, prioritize cancellations over new orders (cancellations reduce risk; new orders increase it). See `backend-fintech-risk-management.md` for why that ordering matters during a volatility event.

## Deep Guidance

### Typical Broker APIs and Their Tradeoffs

Retail/prosumer brokers mostly ship **REST+WebSocket**: REST for order entry and account state, WebSocket for fills, quotes, and order updates. Alpaca, Tradier, Tastytrade, Robinhood (unofficial), and TD Ameritrade/Schwab follow this shape. Latency is 50–500ms per REST call, quotes arrive via WebSocket in tens of ms. Rate limits are HTTP-header-driven (`X-RateLimit-Remaining`, `Retry-After`) and typically 200–1000 requests/minute per key.

**Interactive Brokers** is its own category. The Client Portal Gateway runs locally (or in a sidecar container), maintains a session, and exposes REST on localhost. Sessions expire (roughly every 24h) and require re-auth. IBKR also offers TWS API (native C++/Java/Python bindings over a local socket) and FIX for institutional. The gateway model forces you to treat the broker connection as a stateful component with its own health check and restart policy.

**FIX protocol** (Financial Information eXchange, 4.2 or 4.4 most common) is the institutional standard: persistent TCP session with sequence numbers, heartbeats, and gap-fill recovery. Latency is sub-millisecond but the engineering burden is real: FIX engines (QuickFIX/n, QuickFIX/J, OnixS) require session-state management, store-and-forward semantics, and careful handling of re-sends after disconnect. Use a battle-tested FIX engine; do not roll your own.

**Vendor binary protocols** (some prime brokers, ATS venues) are a further step down the latency/engineering tradeoff — only worth the cost when microseconds matter. For most fintech backends, REST+WS is the right default; FIX is added when institutional routing or smart-order-routing vendors (Trading Technologies, ION, Fidessa) require it.

Reliability and cost also vary. Alpaca's free tier has generous throughput but less uptime history; IBKR has strong reliability but complex gateway management; TD/Schwab is reliable but OAuth is fiddly and the API has frequent deprecations. Track each broker's actual availability via your own monitors — do not trust the status page.

### Authentication Patterns

- **Static API keys (HMAC-signed).** Coinbase, Kraken, older Alpaca. Secret is used to sign a canonical request string (method + path + timestamp + body) with HMAC-SHA256; server verifies. Safer than bearer tokens because the secret never crosses the wire. Rotate quarterly via zero-downtime dual-key windows (new key active; old key accepts for 24h; cut over; revoke old).
- **Bearer tokens (static).** Tradier, older Alpaca. Simpler; leaked token is used verbatim. Rotate monthly; prefer HMAC when the broker supports both.
- **OAuth 2.0 with refresh.** TD/Schwab, Robinhood (unofficial), many brokerage aggregators (Plaid Investments, SnapTrade). Access token TTL 15–60 minutes; refresh token TTL days-to-months. Requires a dedicated refresh worker that renews tokens *before* expiry (30–60s buffer) and persists the new access/refresh pair atomically. Refresh-token rotation (where the server issues a new refresh token each time) is common and forces strict single-consumer semantics — only one process may refresh at a time; use a distributed lock (Redis, Postgres advisory lock).
- **Session-based.** IBKR Client Portal. Login once, keep-alive periodically, reauth on 401. The gateway is stateful; treat it as a singleton per account and health-check the session, not just the gateway process.
- **mTLS or client certificates.** Institutional FIX sessions and some bank APIs. Certificates rotate annually; automate issuance via your PKI (cert-manager + Vault PKI, AWS Private CA).

Never check secrets into Git. Never pass them on the CLI (they land in shell history and `ps`). Mount them as in-memory files or fetch from the secrets manager at process start. Scrub from logs by field name and by regex (common token shapes: `sk_live_*`, `AK*`, JWT `eyJ*`). Audit-log every credential read with actor id and reason — this is a SOC 2 CC6 control (see `backend-fintech-compliance.md`).

### Adapter Interface Design

Define the contract once, in one place. Below is the normalized TypeScript interface; the same shape translates to Go interfaces, Python Protocols, or protobuf services.

```typescript
// Normalized broker adapter contract. Every broker-specific class implements
// this interface; all callers depend on the interface, never on a concrete
// broker type.

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';
export type OrderStatus =
  | 'pending_new'      // submitted to us, not yet acked by broker
  | 'new'              // acked by broker, working
  | 'partially_filled'
  | 'filled'
  | 'canceled'
  | 'rejected'
  | 'expired'
  | 'unknown';         // reconciliation required

export interface PlaceOrderRequest {
  clientOrderId: string;      // UUID — idempotency key across retries
  accountId: string;
  symbol: string;             // normalized ticker (e.g. 'AAPL')
  side: OrderSide;
  type: OrderType;
  quantity: bigint;           // minor units or share count, per asset class
  limitPrice?: bigint;        // minor units
  stopPrice?: bigint;
  timeInForce: TimeInForce;
  submittedAt: Date;
}

export interface OrderAck {
  clientOrderId: string;
  brokerOrderId: string;
  status: OrderStatus;
  acceptedAt: Date;
}

export interface BrokerAdapter {
  placeOrder(req: PlaceOrderRequest): Promise<OrderAck>;
  cancelOrder(clientOrderId: string): Promise<void>;
  replaceOrder(clientOrderId: string, changes: Partial<PlaceOrderRequest>): Promise<OrderAck>;
  fetchOrder(clientOrderId: string): Promise<OrderState>;
  fetchFills(since: Date): Promise<Fill[]>;
  fetchPositions(accountId: string): Promise<Position[]>;
  fetchBalance(accountId: string): Promise<Balance>;
  subscribeFills(onFill: (f: Fill) => void): Promise<Subscription>;
  healthCheck(): Promise<HealthStatus>;
}
```

Keep the interface narrow. Broker-specific features (IBKR's advanced order types, Alpaca's fractional shares, crypto venues' margin calls) either fit into optional fields on the normalized types or require a capability flag (`adapter.supports('fractional_shares')`). Resist the temptation to leak broker-specific escape hatches; the moment one caller reaches past the interface, the abstraction stops paying rent.

Version the IDL. Brokers change payloads without notice; when they do, the adapter absorbs it and the interface stays stable — but when *your* normalized shape needs to change (new order type, new status), bump the interface version and support both for a deprecation window.

### Error Harmonization Taxonomy

Every adapter maps broker responses into the internal taxonomy. Get this mapping wrong and you either retry into duplicate orders (worst case) or alert on every transient blip (operational noise). Below is the canonical mapping pattern.

```typescript
type InternalErrorClass =
  | 'transient'       // network flake, 5xx; retry with backoff+jitter
  | 'rate_limited'    // 429; backoff + queue; honor Retry-After
  | 'invalid'         // 4xx; never retry; surface to user
  | 'auth'            // 401/403; refresh credential, retry once; alert on repeat
  | 'outage'          // broker-wide failure; circuit-break; alert on-call
  | 'unknown';        // indeterminate state; reconcile, do NOT retry

// Alpaca → internal (illustrative)
function classifyAlpacaError(resp: AlpacaErrorResponse): InternalErrorClass {
  if (resp.httpStatus >= 500) return 'transient';
  if (resp.httpStatus === 429) return 'rate_limited';
  if (resp.httpStatus === 401 || resp.httpStatus === 403) return 'auth';
  if (resp.httpStatus === 422 && resp.code === 40010001) return 'invalid'; // insufficient buying power
  if (resp.httpStatus === 422 && resp.code === 40310000) return 'invalid'; // market closed
  if (resp.httpStatus === 504 || resp.code === 'timeout') return 'unknown'; // order may or may not exist
  if (resp.httpStatus === 503 && /maintenance/i.test(resp.message)) return 'outage';
  return 'unknown';
}
```

The critical distinction is `transient` vs `unknown`. A 500 on a read (fetch positions) is `transient` — retry freely, the read is idempotent. A 500 or timeout on a `placeOrder` call is `unknown` — the order may or may not have reached the broker's matching engine. Retrying risks a duplicate fill; not reconciling risks a missed fill. The correct handling is to enqueue a reconciliation job that polls the broker by `clientOrderId` (which was sent with the request) until the order's fate is determined, then emit the appropriate state transition. This is why `clientOrderId` is mandatory on every place call, not optional. Cross-ref `backend-fintech-order-lifecycle.md` for the full reconciliation flow.

Maintain the error mapping per-broker in a table that product owners and on-call engineers can read without spelunking through code. When the broker ships new error codes (they will, without notice), the table is what gets updated.

### Idempotency With Brokers

Every broker worth integrating accepts a client-supplied order id (`client_order_id`, `clOrdID` in FIX, `externalOrderId`, naming varies). Always send one, always make it a UUID v4 you generate before the first attempt, always persist it before the network call. This gives you two properties: (a) retries dedupe at the broker — a second `placeOrder` with the same `clientOrderId` returns the existing order, not a new one; (b) reconciliation has a stable key to look up on `fetchOrder(clientOrderId)`.

A few brokers reject a second attempt with the same `clientOrderId` even when the first was rate-limited or dropped mid-flight. Your adapter must treat that rejection specifically — it is an *expected* outcome of the retry, not an error. Map it to "fetch the existing order and return the canonical `OrderAck`."

For brokers that do not support client-order-id (rare, mostly legacy or crypto venues), substitute a deduplication window at the adapter: persist `(account, symbol, side, quantity, limit_price, submitted_within_N_seconds)` and reject duplicates before hitting the network. This is weaker than a real idempotency key; flag the broker as a migration priority.

### Broker-Outage Handling

Brokers go down. The 2021 Robinhood and Schwab outages cost real customer money; IBKR's quarterly maintenance windows are announced but often overrun; exchanges halt for SSR or volatility circuit breakers. The adapter must detect and react.

**Circuit breaker per broker per endpoint** (libraries: `opossum` in Node, Resilience4j in Java, `gobreaker` in Go). Trip threshold: e.g. 50% failure rate over 20-call rolling window or 10 consecutive `outage`/`transient` errors. Open state rejects calls immediately with a cached "broker unavailable" response. Half-open probes one request every 30s; success closes the breaker.

Graceful degradation while open: disable new-order submission, continue to allow cancellations (cancellations reduce exposure — prioritize the path that shrinks risk). Continue to serve last-known positions/balances from cache with a clear staleness marker. Page on-call within minutes, not hours — for a brokerage, "we can't place orders" is a customer-impact P0.

User communication: the UI must distinguish "your order failed because of you" from "your order failed because of us." A generic "try again later" is worse than useless during an outage; it creates support load. Publish a status endpoint that the UI reads and surface a specific broker banner.

Record every circuit-breaker state change to the audit log (see `backend-fintech-compliance.md`) — regulators and customers will ask for a postmortem timeline.

### Rate-Limit Strategy: Token Bucket

```typescript
// Client-side token bucket. One per (broker, credential, endpoint-group).
// Size the rate below the broker's published limit — leave headroom for
// retries and for cross-shard contention if multiple workers share credentials.

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,       // burst size
    private readonly refillPerSecond: number // sustained rate
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  // Await a token. Resolves when one is available; rejects on timeout.
  async take(timeoutMs: number = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.min(
        (1 / this.refillPerSecond) * 1000,
        Math.max(0, deadline - Date.now())
      );
      if (waitMs <= 0) throw new Error('rate-limit wait timed out');
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSecond
    );
    this.lastRefill = now;
  }
}

// Usage: await bucket.take() before every broker call. Exhaustion manifests
// as latency, not errors — upstream request handlers block on the bucket.
```

For multi-process/multi-region deployments sharing the same credential, a distributed rate-limiter (Redis with Lua scripts, or a dedicated service) replaces the in-memory bucket. Honor the broker's `Retry-After` header as an override — if the broker says "wait 5s," pause the bucket for 5s regardless of its own refill state.

Prioritize traffic when approaching the limit: cancellations before new orders; reads before writes; interactive user requests before background reconciliation jobs. A priority queue in front of the bucket expresses this directly.

### Testing Strategy

- **Sandbox environments.** Alpaca, IBKR, Tradier, and most modern brokers provide paper/sandbox endpoints. Use them for integration tests in CI — not all brokers have them, and sandboxes diverge from production in subtle ways (sandbox may accept orders production would reject for PDT rules, fractional-share limits, etc.). Treat sandbox-green as necessary but not sufficient.
- **Record/replay for unit tests.** Capture real broker responses (with secrets scrubbed) into fixtures (`nock`, `vcrpy`, `go-vcr`). Unit tests run fully offline and deterministically. Refresh fixtures quarterly and after any broker API version bump.
- **Contract tests on schedule.** A cron job (hourly or daily) that exercises the full adapter contract against sandbox — place, cancel, fetch, subscribe — and alerts on any behavior drift. Brokers ship breaking changes without notice; contract tests catch them before customers do.
- **Chaos testing.** Inject rate-limit responses, 5xx, timeouts, and partial payloads into the adapter's HTTP layer and assert the error taxonomy classifies correctly. Tools: `toxiproxy`, `wiremock`, a local test double that replays broker responses.
- **Reconciliation backfill tests.** Simulate an "unknown" outcome and assert the reconciler converges to the correct terminal state by polling `fetchOrder`. This is where bugs hide — exercise it deliberately.

### Common Pitfalls

- **Retry storms amplifying rate limits.** A broker blip returns 500s; naive retry immediately doubles the traffic, tripping 429s, which retry further. Always use exponential backoff with full jitter (`delay = random(0, base * 2^attempt)`, capped) and a max-attempts limit. Cross-instance coordination via a shared token bucket prevents fleet-wide pile-ons.
- **Stale auth tokens on long-running processes.** Workers started at 9am with a 60-minute access token stop working at 10am. Refresh proactively with a 30–60s buffer before expiry; run the refresh on a dedicated timer per credential, not inline per request. Persist the refreshed token atomically — two workers refreshing concurrently with a rotating refresh-token scheme will invalidate each other.
- **Time-zone bugs around market hours.** US equities open 9:30am ET, not 9:30am local. Always store and compute in UTC with an explicit exchange-calendar library (`pandas_market_calendars`, `exchange_calendars`, `NYSE holidays`). Half-days (day after Thanksgiving, Christmas Eve) close at 1:00pm ET — miss these and orders reject late in the day.
- **Order-state drift when webhooks are missed.** WebSocket disconnects and misses fill events; the internal state lags the broker. Run a periodic `fetchOrder` + `fetchFills` reconciliation (every 30–60s for active orders) even when the WS is healthy. Belt and suspenders — do not trust a single channel.
- **Assuming broker order-id uniqueness across accounts.** Some brokers scope order ids per account, not globally. Always join on `(broker, account, brokerOrderId)` in your own storage. Your `clientOrderId` is globally unique; the broker's id may not be.
- **Blindly trusting broker timestamps.** Broker clocks drift. Persist both the broker's timestamp and your own received-at timestamp; reconcile against trading day boundaries using exchange calendars, not broker-reported times.
- **Silent symbol normalization drift.** `BRK.B` vs `BRK/B` vs `BRK-B` — brokers disagree on tickers with punctuation. Normalize on ingress and egress; keep a per-broker mapping table. Same for options (OCC symbology vs broker-specific shorthand).
- **Shared credentials across environments.** A staging deploy pointing at production credentials places real orders. Enforce via separate secrets per environment, network-level allowlists, and a pre-flight check that refuses to start if the environment tag does not match the credential's expected tag.
- **Not testing the sad path under load.** Everything works at 10 req/min in staging; at 500 req/min in production the bucket empties, retries pile up, and the circuit breaker oscillates. Load-test the adapter with realistic traffic shapes including error injection.

See also `backend-fintech-order-lifecycle.md` for the order state machine and reconciliation flows that depend on the adapter's `unknown` classification, `backend-fintech-risk-management.md` for how rate-limit prioritization interacts with kill-switch logic, `backend-fintech-observability.md` for the metrics and traces every adapter should emit, and `backend-fintech-compliance.md` for credential-audit and change-management expectations.
