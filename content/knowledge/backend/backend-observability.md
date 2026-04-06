---
name: backend-observability
description: Structured logging, distributed tracing, RED method metrics, SLO-based alerting, and operational dashboards
topics: [backend, observability, logging, tracing, metrics, alerting, opentelemetry, slo]
---

## Structured Logging

Log in JSON to make logs machine-parseable and searchable in aggregation systems (Datadog, Splunk, CloudWatch Logs Insights, Grafana Loki).

**Standard fields every log line should include:**
- `timestamp` — ISO 8601 with milliseconds
- `level` — `debug`, `info`, `warn`, `error`
- `message` — human-readable description
- `service` — service name and version
- `traceId` / `requestId` — correlation ID propagated from the incoming request

**Log levels:**
- `debug` — verbose development information; disabled in production by default
- `info` — normal operational events (request received, job completed, user logged in)
- `warn` — recoverable issues (retry attempted, fallback used, deprecated API called)
- `error` — failures requiring attention (unhandled exception, external service down, database error)

**Never log:** Passwords, tokens, API keys, credit card numbers, SSNs, or full request bodies of sensitive endpoints. Implement a logging middleware that redacts known-sensitive field names before any log line is written.

**Correlation IDs:** Generate a UUID per request at the entry point (API gateway or first middleware). Propagate it through all downstream service calls via the `X-Request-ID` or `traceparent` header. Include it in every log line. This makes it possible to trace a single user request across all services and log streams.

## Distributed Tracing

Use OpenTelemetry (OTel) — the vendor-neutral standard for distributed tracing, metrics, and logs. Instrument once, export to any backend (Jaeger, Zipkin, Datadog APM, Honeycomb, AWS X-Ray).

**Trace context propagation:** The OTel SDK automatically propagates `traceparent` and `tracestate` headers when you use instrumented HTTP clients. Always use the instrumented clients — never make raw HTTP calls that bypass propagation.

**Auto-instrumentation:** Use OTel auto-instrumentation packages for your framework (Express, FastAPI, Spring Boot) to capture traces for all incoming requests and outgoing calls without manual spans.

**Custom spans:** Add manual spans for business operations that span multiple functions: `processOrder`, `chargePayment`, `sendNotification`. Annotate spans with relevant attributes (user ID, order ID, amount). This provides visibility into where time is spent within a service.

**Sampling:** In high-throughput services, trace every request at 100% to observe development/staging. In production, use head-based sampling (5–10%) to control costs while preserving statistically representative data. Always sample 100% of errored traces regardless of the sampling rate.

## Metrics — RED Method

The RED method (Rate, Errors, Duration) provides a minimal but complete view of service health:

- **Rate:** Requests per second. Baseline normal traffic and alert on significant drops (traffic lost) or spikes (traffic surge, potential attack).
- **Errors:** Request error rate as a percentage. Alert when the error rate exceeds the SLO threshold. Track by error type (4xx client errors vs. 5xx server errors).
- **Duration:** Request latency. Track p50, p95, and p99. Alert on p99 exceeding the SLO latency threshold. Latency degradation often precedes error rate spikes.

Instrument these three metrics for every service endpoint. For background workers, instrument job throughput (rate), job failures (errors), and job duration.

## SLO-Based Alerting

Define SLOs (Service Level Objectives) before writing alert rules. An SLO is a measurable target: "99.9% of requests complete successfully" or "p99 latency < 500ms over a 28-day window."

**Error budget:** The tolerance implied by the SLO. A 99.9% availability SLO has a 0.1% error budget — about 44 minutes of downtime per month. Track error budget consumption and alert when it is burning faster than expected.

**Burn rate alerts:** Alert when the error budget is being consumed at a rate that would exhaust it before the window ends. A burn rate of 2x means the budget runs out in half the window. Use multi-window burn rate alerts (fast burn: 5-minute window at 14x burn rate; slow burn: 1-hour window at 2x burn rate) to catch both sudden incidents and gradual degradations.

Avoid threshold alerts on raw metrics — they generate too many false positives. SLO-based alerting reduces alert fatigue and ensures alerts correspond to actual user impact.

## Dashboards

Build dashboards around the RED metrics plus infrastructure health. Every service dashboard should show: request rate, error rate, p50/p95/p99 latency, error budget remaining, database query latency, and downstream service call rates.

Add runbook links to every alert. An alert without a runbook wastes incident response time.
