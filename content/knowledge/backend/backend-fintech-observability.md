---
name: backend-fintech-observability
description: Trade event correlation; market-hours aware scheduling; SLOs for fintech systems; compliance logging; alerting strategy.
topics: [backend, fintech, observability, tracing, slos, alerting, correlation-id, market-hours]
---

Observability for a trading system is not generic APM with a finance skin — it is the ability to reconstruct any single order, end to end, across six or more services, on demand, years later, with timezone-correct timestamps and a stable correlation identifier. It is also the early-warning system that catches a sudden drop in fill rate at 09:31 ET before the desk calls. Done well it overlaps with — but does not replace — the immutable audit trail (`backend-fintech-compliance.md`).

## Summary

Every trade flow is distributed. A single order crosses the wizard (UI), order-management service, risk-check service, broker adapter, fill-processing worker, ledger, and balance projection — typically six to ten hops across HTTP and message queues. A correlation ID must be minted at the edge, propagated across every hop (HTTP header, MQ header, database row, log line, span attribute), and indexed in both logs and tracing. Without this, a "my order is stuck" ticket becomes an archaeology project.

SLOs for fintech are tighter than typical SaaS and are defined per flow, not per service. Order-submission (client click → broker ack) runs in the low hundreds of milliseconds at p99. Fill-processing (broker fill event → ledger write) targets single-digit seconds. Ledger-to-balance propagation (fill persisted → UI-visible balance update) targets under a minute — users refresh aggressively after a trade. Error budgets are monthly, tracked per flow, and breached budgets freeze risky deploys.

Market-hours-aware alerting is non-negotiable. A stale-price alert at 03:00 ET on a US equity feed is noise; at 09:35 ET it is a P1. A prolonged broker outage at any hour is a P1 — after-hours orders still queue, and overnight index futures trade nearly 24 hours. The alerting layer must consult a trading-calendar service (per venue, per asset class, with half-days and holidays) and route accordingly. Maintenance windows are encoded as first-class suppression rules, not tribal knowledge.

Regulatory logging is additive to operational observability. The audit trail (WORM storage, 7-year retention for most US regimes) is written in parallel with — never replaced by — ops logs. Ops logs rotate at 30–90 days. Conflating the two produces either cripplingly expensive storage or a compliance breach; keep the pipelines separate with different retention classes.

Alert on anomalies, not just errors. A zero-error service that suddenly stops filling orders is worse than one throwing 500s. Track fill-rate baselines (by symbol, venue, time-of-day bucket), risk-check reject rates, P&L velocity, and queue depths; alert on deviation from baseline, not just on thresholds. Cross-ref: `backend-fintech-order-lifecycle.md` for the flow being instrumented, `backend-fintech-risk-management.md` for risk-specific signals, `backend-fintech-broker-integration.md` for per-broker health, `backend-fintech-compliance.md` for the audit-log boundary.

## Deep Guidance

### Correlation IDs Across Every Hop

Use a two-tier identifier scheme. The outer tier is the `client_order_id` — minted in the UI (or API client), echoed on every user-facing artifact (order ticket, confirmation email, support ticket), and stable for the lifetime of the order. The inner tier is a W3C Trace Context `trace-id` per service interaction, standard across OpenTelemetry instrumentations. The `client_order_id` is the noun a human searches for ("why is order ABC-123 stuck?"); the `trace-id` is the edge-traversal graph a tool renders.

Propagation rules are absolute. HTTP boundaries carry `traceparent` and `tracestate` per W3C; add an `X-Client-Order-Id` header for the outer ID. Message queues (SQS, Kafka, RabbitMQ) put both in message attributes/headers — never only in the payload, because DLQ tools and retry wrappers often strip payload context. Database rows for orders, fills, and ledger entries store the `client_order_id` column indexed. Every structured log line and every span carries both. If a queue hop drops the correlation ID, that is a P2 bug to be fixed, not tolerated.

### Structured Logging Schema

Logs are JSON, single-line, with a fixed minimum set of fields plus event-type-specific extensions. Emit through a shared library so the schema is enforced, not hoped for.

```json
{
  "timestamp": "2026-04-15T13:31:04.128Z",
  "timestamp_local": "2026-04-15T09:31:04.128-04:00",
  "level": "info",
  "service": "order-management",
  "event_type": "order.submitted",
  "client_order_id": "ABC-123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "account_id": "acct_9f3c",
  "symbol": "AAPL",
  "side": "buy",
  "quantity": 100,
  "limit_price": { "amount": "182.50", "currency": "USD" },
  "broker_id": "alpaca",
  "venue": "NASDAQ",
  "latency_ms": 42
}
```

Monetary amounts are objects with `amount` (string decimal, never float) and `currency`. Timestamps are ISO-8601 with explicit UTC *and* the exchange-local time for operator sanity — "09:31 ET" is how a trader thinks, "13:31 UTC" is how storage indexes. `event_type` uses dotted nouns (`order.submitted`, `fill.received`, `risk.blocked`, `ledger.posted`) so alerting and dashboards can route on prefix.

### SLOs Per Flow

Define SLOs on user-visible flows, not on internal microservice latency. Typical targets:

| Flow | Metric | Target | Window |
|------|--------|--------|--------|
| Order submission (click → broker ack) | p99 latency | 400 ms | 30 days |
| Fill processing (broker fill → ledger) | p99 latency | 5 s | 30 days |
| Ledger-to-balance propagation | p95 lag | 45 s | 30 days |
| Balance query (API read) | p99 latency | 200 ms | 30 days |
| Order-submission availability | success rate | 99.9% | 30 days during market hours |

Error budgets are consumed only against market-hours traffic; off-hours degradation is tracked separately. When a budget is below 25% remaining, ship freeze applies to risk-touching services until the window resets or a postmortem authorizes deploy.

```yaml
# slo/order-submission.yaml
slo:
  name: order-submission-latency
  service: order-management
  flow: order.submitted -> order.broker_ack
  objective: 99.0
  indicator:
    type: latency
    percentile: 99
    threshold_ms: 400
  window:
    duration: 30d
    market_hours_only: true
    calendar: us-equities
  alerting:
    burn_rate:
      - window: 1h
        factor: 14.4   # fast burn
        severity: page
      - window: 6h
        factor: 6
        severity: ticket
```

### Market-Hours-Aware Alerting

A trading-calendar service (backed by `pandas-market-calendars`, `iex-cloud`, or Polygon reference data) exposes `is_market_open(venue, timestamp)` and `next_open/close(venue)`. Alert routing rules consult it. Stale-price alerts are suppressed outside regular session; broker-outage alerts escalate regardless; ledger-lag alerts during after-hours page only if open positions exist. Encode the routing in the alert platform (PagerDuty event rules, Grafana OnCall) rather than in per-alert bespoke logic, so maintenance is tractable.

Half-days (1 pm ET close around Thanksgiving and July 3rd) and early-close holidays are where this fails in practice — test the calendar service against a full year of real sessions, not a regex on weekdays.

### Trade Anomaly Detection

Error rates alone miss the most dangerous incidents. Track baselines and deviation. Fill rate per minute per symbol, compared against a trailing 20-session median for the same minute-bucket, alerting on >3σ deviation. Risk-check reject rate per account, alerting on sudden jumps (often a config deploy gone wrong). P&L velocity (dollars-per-minute realized loss) with tiered alerts — warn, page, and auto-trigger the kill switch at escalating thresholds. Queue depth on the fill-processing worker, alerting when backlog grows faster than drain rate.

Honeycomb BubbleUp or Datadog Watchdog handle the baseline math adequately for most teams; rolling homegrown detectors is rarely worth it until scale forces it.

### Multi-Broker Observability

Every broker integration (`backend-fintech-broker-integration.md`) exports the same metric taxonomy — `broker.submit.latency`, `broker.submit.errors`, `broker.fill.lag`, `broker.reconnect.count` — tagged with `broker_id`. Dashboards show aggregate health on top (all brokers combined) with per-broker drill-downs below. When one broker degrades, failover logic (if implemented) must emit its own events (`broker.failover.triggered`) with both old and new broker IDs and the failover reason.

### Distributed Tracing with OpenTelemetry

OpenTelemetry SDKs in every service, exporter to a backend (Honeycomb, Datadog APM, Grafana Tempo, or a Grafana LGTM stack). Span attributes carry financial context — `trading.symbol`, `trading.side`, `trading.quantity`, `trading.account_id`, `trading.broker_id`, `trading.client_order_id`. Sample tail-based: keep 100% of traces that contain an error or a latency outlier, throttle successes to 5–10%. Head-based sampling (decide at root) loses the ability to keep all errors and is the wrong default for fintech.

```typescript
// correlation-middleware.ts  (Express + OpenTelemetry)
import { trace, context } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientOrderId = req.header('x-client-order-id') ?? `srv-${randomUUID()}`;
  const span = trace.getActiveSpan();
  span?.setAttribute('trading.client_order_id', clientOrderId);

  res.setHeader('x-client-order-id', clientOrderId);
  (req as any).clientOrderId = clientOrderId;

  // Attach to async context so downstream logger picks it up.
  const ctx = context.active().setValue(Symbol.for('client_order_id'), clientOrderId);
  context.with(ctx, () => next());
}
```

### Log Retention vs Audit Retention

Two pipelines, two retention classes. Ops logs ship to Loki or a hot Elasticsearch tier with 30–90 day retention, indexed for high-cardinality ad-hoc querying. Audit events ship to append-only WORM storage (S3 Object Lock, Glacier with compliance-mode retention, or a dedicated vendor like DataBP) for the regulatory retention period — typically 7 years for SEC 17a-4 style records, sometimes longer. The two pipelines share schema where possible but diverge in transport, storage, and access controls. Never satisfy audit requirements by pointing at your Datadog log archive — it is not WORM unless explicitly configured, and even then access controls are wrong.

### Common Pitfalls

Correlation IDs dropped at queue hops because a retry wrapper reconstructed the message from payload only. Fix: make propagation a library concern, test explicitly.

Timezones not logged. A 14:30 timestamp is ambiguous; a 14:30Z plus 09:30-05:00 is not. Log both.

Alerts firing during scheduled broker maintenance windows because the suppression was a shared Google Doc. Fix: encode maintenance in the alerting platform with a defined owner and a review cadence.

No dashboard for the first-minute-of-open latency spike. The open is where queues are fullest, baselines are least representative, and incidents cluster. A dedicated "09:30–09:35 ET" dashboard saves incidents.

Tracing without financial attributes. Spans that show HTTP method and path but not symbol, side, or account are useless at 2 am. Every span on a trade path must carry the trading tuple.

Sampling that throws away errors. Head-based 1% sampling loses 99% of failure traces. Use tail-based sampling or keep 100% of errors regardless of sample rate.
