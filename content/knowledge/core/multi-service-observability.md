---
name: multi-service-observability
description: Distributed tracing, correlation IDs, cross-service SLOs, and failure attribution
topics: [distributed-tracing, correlation-ids, cross-service-slos, failure-attribution]
---

## Summary

Observability in a multi-service system is a prerequisite for correct operation, not an optional enhancement. When a request crosses four service boundaries before returning an error, you cannot debug it without distributed tracing and correlation IDs.

**Three pillars for multi-service systems:**
- **Distributed tracing (W3C Trace Context):** Every request gets a `traceparent` header with a trace ID and span ID. Each service records spans. All spans for a single request share a trace ID, creating a complete picture of the request's journey. Use OpenTelemetry (vendor-neutral) and export to any backend (Jaeger, Tempo, Datadog).
- **Correlation IDs (`X-Correlation-ID`):** Business-level identifier for a workflow, persisted in the application database. Survives async boundaries that distributed traces don't bridge (jobs, scheduled tasks, multi-request workflows). Include in every log entry and outgoing message.
- **Structured logs (JSON):** Every log entry must include `correlationId`, `traceId`, `service`, `version`, and `level`. Ship to a central aggregation system (ELK, Loki, CloudWatch).

**SLO strategy:** Define SLOs per service and per user-facing journey. Composite availability = product of all participating services' availabilities — a 5-service chain each at 99.9% yields ~99.5% composite. Alert on error budget burn rate (e.g., 14x sustainable rate in 1 hour), not hard thresholds.

**Failure attribution:** Walk the span tree inward from the user-facing error to find the first span that recorded an error. Classify as infrastructure, dependency, or application failure.

**OpenTelemetry Collector:** Route telemetry through a Collector (not directly from services to the backend) for backend-agnostic export, sampling, and buffering.

## Deep Guidance

## Distributed Tracing with W3C Trace Context

### The Problem Distributed Tracing Solves

A single user-facing request in a multi-service system might be handled by an API gateway, an auth service, an order service, an inventory service, and a payment service. Each service logs independently. Without distributed tracing, a single failed request leaves log entries scattered across five services with no way to correlate them. Debugging requires manual log archaeology across systems with imprecise time correlation.

Distributed tracing solves this by propagating a trace context through every service boundary. Each service records spans — units of work with start time, duration, tags, and relationships. All spans for a single request share a trace ID, creating a complete picture of the request's journey.

### W3C Trace Context Standard

The W3C Trace Context specification (https://www.w3.org/TR/trace-context/) defines two HTTP headers for propagating trace context:

**`traceparent`** — carries the trace ID, span ID, and sampling flags:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              ^^ version
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ trace-id (16 bytes, hex)
                                                  ^^^^^^^^^^^^^^^^ parent-span-id (8 bytes, hex)
                                                                   ^^ flags (01 = sampled)
```

**`tracestate`** — carries vendor-specific key-value pairs alongside the standard header:

```
tracestate: rojo=00f067aa0ba902b7,congo=t61rcWkgMzE
```

**Why use W3C Trace Context instead of vendor-specific headers:**
- (+) Interoperable: every OpenTelemetry SDK, AWS X-Ray, Google Cloud Trace, and Datadog agent understands it.
- (+) Future-proof: the standard is stable and broadly adopted.
- (-) Requires all services to propagate the headers correctly. A service that drops the headers breaks the trace chain.

### OpenTelemetry Integration

OpenTelemetry (OTel) is the CNCF-standard SDK for distributed tracing, metrics, and logs. It is the recommended approach — instrument once, export to any backend.

**Node.js setup:**

```typescript
// src/tracing.ts — initialize before requiring any other modules
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME ?? 'unknown-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
})

sdk.start()

// Graceful shutdown
process.on('SIGTERM', () => sdk.shutdown())
```

**Creating custom spans for business operations:**

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('order-service', '1.0.0')

async function processOrder(orderId: string, items: OrderItem[]): Promise<Order> {
  return tracer.startActiveSpan('processOrder', async (span) => {
    span.setAttributes({
      'order.id': orderId,
      'order.item_count': items.length,
    })

    try {
      const result = await doProcessOrder(orderId, items)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      throw err
    } finally {
      span.end()
    }
  })
}
```

**Trade-offs (OpenTelemetry auto-instrumentation):**
- (+) Automatic instrumentation for HTTP, gRPC, database drivers — no manual span creation needed for most cases.
- (+) Vendor-neutral: switch from Jaeger to Tempo to Datadog by changing the exporter config.
- (-) Auto-instrumentation adds startup latency (~200ms) — acceptable for long-running services, problematic for AWS Lambda cold starts.
- (-) High-cardinality span attributes (user IDs, order IDs) can explode storage costs. Set attribute cardinality limits.

## Correlation ID Propagation

### Correlation IDs vs. Trace IDs

Correlation IDs and trace IDs serve different purposes:

- **Trace ID** (from W3C traceparent): used by distributed tracing systems to correlate spans. Auto-generated by the tracing SDK. Used by engineers debugging specific requests.
- **Correlation ID**: a business-level identifier tied to a user request session or workflow, persisted in the application database for long-term audit and support. May span multiple traces if a workflow spans multiple requests or async operations.

Use both. The trace ID handles in-flight debugging; the correlation ID handles after-the-fact auditing and cross-referencing support tickets with log entries.

### Propagation Standards

**Incoming requests:** Extract the correlation ID from the `X-Correlation-ID` header. If absent, generate a new UUID. Always return it in the response.

**Outgoing requests:** Attach the correlation ID to every outgoing HTTP call, Kafka message, and async job.

**Logs:** Include the correlation ID in every log entry during request processing.

```typescript
// src/middleware/correlation.ts
import { randomUUID } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { AsyncLocalStorage } from 'async_hooks'

const correlationStore = new AsyncLocalStorage<{ correlationId: string; traceId?: string }>()

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? randomUUID()
  const traceId = req.headers['traceparent'] as string | undefined

  res.setHeader('X-Correlation-ID', correlationId)

  correlationStore.run({ correlationId, traceId }, () => {
    next()
  })
}

export function getCorrelationId(): string | undefined {
  return correlationStore.getStore()?.correlationId
}

// Attach to outgoing HTTP calls
export function outboundHeaders(): Record<string, string> {
  const store = correlationStore.getStore()
  if (!store) return {}
  return {
    'X-Correlation-ID': store.correlationId,
  }
}
```

**In structured logs (pino example):**

```typescript
import pino from 'pino'
import { getCorrelationId } from './middleware/correlation.js'

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    log(object) {
      return {
        ...object,
        correlationId: getCorrelationId(),
        service: process.env.SERVICE_NAME,
        version: process.env.SERVICE_VERSION,
      }
    },
  },
})

export const logger = baseLogger
```

**In Kafka messages:**

```typescript
// Attach correlation context to message headers
await producer.send({
  topic: 'order.placed',
  messages: [{
    key: orderId,
    value: JSON.stringify(payload),
    headers: {
      'x-correlation-id': getCorrelationId() ?? '',
      'x-source-service': process.env.SERVICE_NAME ?? '',
    },
  }],
})
```

**Consumer side — extract and propagate:**

```typescript
consumer.run({
  eachMessage: async ({ message }) => {
    const correlationId =
      message.headers?.['x-correlation-id']?.toString() ?? randomUUID()

    correlationStore.run({ correlationId }, async () => {
      await processMessage(message)
    })
  },
})
```

**Trade-offs (correlation ID propagation):**
- (+) End-to-end request tracing across async boundaries that distributed tracing alone cannot bridge (async jobs, scheduled tasks, event chains spanning minutes or hours).
- (+) Customer support can reference a correlation ID in a ticket and engineers can filter all logs for that single workflow.
- (-) Every service must be updated to propagate the header. A service that drops it breaks the chain.
- (-) Adds cardinality to logs — increases log storage unless correlation IDs are indexed and older logs are pruned.

## Cross-Service SLO Definition and Error Budget Management

### Defining SLOs Across Services

A Service Level Objective (SLO) is a target for service reliability expressed as a percentage of requests that succeed within a defined latency. In a multi-service system, each service has its own SLOs, and user-facing operations have composite SLOs that depend on the SLOs of all participating services.

**Single-service SLO example:**

```yaml
# docs/slos/order-service.yml
service: order-service
slos:
  - name: order_placement_availability
    description: POST /orders returns 2xx or 422 (valid response, not an infra error)
    target: 99.9%          # 43.8 minutes downtime per month
    window: 30d
    indicator:
      type: availability
      good_events: http_requests_total{service="order-service", path="/orders", method="POST", status=~"2xx|422"}
      total_events: http_requests_total{service="order-service", path="/orders", method="POST"}

  - name: order_placement_latency
    description: POST /orders responds within 500ms at p99
    target: 99%
    window: 30d
    indicator:
      type: latency
      threshold_ms: 500
      percentile: 99
      metric: http_request_duration_ms{service="order-service", path="/orders"}
```

**Composite SLO for a user-facing flow:** When a user places an order, the request touches the API gateway, auth service, order service, inventory service, and payment service. The composite availability is the product of each service's availability:

```
P(order_success) = P(gateway) × P(auth) × P(order) × P(inventory) × P(payment)
                 = 0.9999 × 0.9999 × 0.9990 × 0.9995 × 0.9990
                 = 0.9973  (99.73% availability, ~2 hours downtime/month)
```

This means if you target 99.9% for the composite user experience, each participating service must significantly exceed that — a single 99.9% service makes the composite worse.

**Practical SLO guidelines:**
- Define SLOs per service and per user-facing journey. Both are needed.
- Use 30-day rolling windows for error budgets — avoids quarterly spikes.
- Alert on error budget burn rate (e.g., if you burn 5% of the monthly error budget in an hour, page on-call) rather than hard availability thresholds.
- SLOs should be stored in version control alongside the service code.

### Error Budget Management

An error budget is the allowed failure capacity derived from the SLO target: if the SLO is 99.9%, the error budget is 0.1% (43.8 minutes of downtime per month).

**Error budget policy decisions:**

| Error Budget Remaining | Allowed Action |
|------------------------|----------------|
| > 50% | Normal development velocity, feature work, experiments |
| 25–50% | Caution. Prefer reliability improvements over new features |
| 10–25% | Freeze risky deploys. Focus on reliability work |
| < 10% | Stop all non-critical deploys. Incident review required |

**Prometheus alert rule for error budget burn rate:**

```yaml
# alerts/slo-burn-rate.yml
groups:
  - name: slo_burn_rate
    rules:
      - alert: HighErrorBudgetBurnRate
        expr: |
          (
            rate(http_requests_total{status=~"5.."}[1h]) /
            rate(http_requests_total[1h])
          ) > (14.4 * (1 - 0.999))
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.service }} burning error budget at 14x rate"
          description: |
            Service {{ $labels.service }} is burning its monthly error budget
            at 14x the sustainable rate. At this rate, the full monthly budget
            will be consumed in ~2 hours.
```

**Trade-offs (SLO-based alerting):**
- (+) Error budget burn rate alerts fire early (before the budget is exhausted) and reduce alert fatigue compared to hard threshold alerts.
- (+) Aligns engineering and product decisions: spending error budget on risky experiments is an explicit product trade-off.
- (-) Requires setting meaningful SLO targets — too lenient wastes budget, too strict makes every incident a budget crisis.
- (-) Composite SLOs across services require all participating services to instrument and report correctly.

## Failure Attribution and Root Cause Analysis

### Attributing Failures in Distributed Traces

When a distributed request fails, the trace shows which span failed and why. The root cause is typically the deepest span with an error status — but not always. Use a structured analysis approach.

**Steps for trace-based failure attribution:**

1. Identify the user-facing error (the outermost span with an error status).
2. Walk the span tree inward until you find the first span that recorded an error. This is the origin of the error.
3. Check if the origin span is a timeout, a 5xx from a downstream service, or an exception in application code.
4. Classify the failure: infrastructure (network, hardware), dependency (external API, database), or application (bug, unhandled edge case).

**Span attributes to include for attribution:**

```typescript
// Good span attributes for failure attribution
span.setAttributes({
  'http.method': 'POST',
  'http.url': 'https://payment-service/charge',
  'http.status_code': 503,
  'error.type': 'ServiceUnavailable',
  'error.message': 'payment-service: connection timeout after 2000ms',
  'downstream.service': 'payment-service',
  'retry.attempt': 2,
  'retry.max': 3,
})
```

### Distributed Logging Aggregation

All services must ship logs to a central log aggregation system (ELK stack, Loki, CloudWatch Logs). Structured JSON logs with consistent fields are essential.

**Mandatory log fields (every log entry from every service):**

```typescript
interface LogEntry {
  timestamp: string        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  service: string          // service name from SERVICE_NAME env var
  version: string          // service version
  correlationId?: string   // propagated X-Correlation-ID
  traceId?: string         // from W3C traceparent
  spanId?: string          // current span ID
  message: string
  // Additional context fields as needed
  [key: string]: unknown
}
```

**Log query patterns for failure attribution:**

```
# Find all log entries for a specific correlation ID across all services
correlationId = "550e8400-e29b-41d4-a716-446655440000"

# Find all errors in the order-placement flow in the last hour
level = "error" AND correlationId = "..." AND timestamp > now() - 1h

# Find timeout patterns across the payment-service
service = "payment-service" AND message:timeout AND level = "error"
  | stats count by bin(1m)
```

### Cross-Service Dashboards

A cross-service dashboard gives the on-call engineer a single view of system health:

**Essential panels for a cross-service operations dashboard:**

```yaml
# Grafana dashboard structure (conceptual)
dashboard:
  title: "Multi-Service Operations"
  rows:
    - title: "User-Facing Health"
      panels:
        - name: "Composite Availability (30m window)"
          type: stat
          query: |
            avg(rate(http_requests_success[30m]) / rate(http_requests_total[30m]))
        - name: "p99 Latency by Service"
          type: timeseries
          query: |
            histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))

    - title: "Error Budget"
      panels:
        - name: "Error Budget Remaining (30d)"
          type: gauge
          thresholds: [10, 25, 50]
          query: |
            1 - (sum(rate(http_requests_total{status=~"5.."}[30d])) /
                 sum(rate(http_requests_total[30d])))

    - title: "Service Dependencies"
      panels:
        - name: "Cross-Service Call Success Rate"
          type: heatmap
          description: "Source service (rows) calling destination service (columns)"
```

**Trade-offs (centralized dashboards):**
- (+) Single pane of glass during incidents — on-call does not need to check each service individually.
- (+) Error budget panels enforce SLO accountability.
- (-) Dashboard maintenance burden. When services are added or renamed, dashboards go stale.
- (-) A single cross-service dashboard can obscure service-specific details. Link to per-service dashboards from the cross-service dashboard rather than collapsing everything into one view.

## OpenTelemetry Collector Deployment

For production deployments, route telemetry through an OpenTelemetry Collector rather than exporting directly from services to the backend. The Collector acts as a buffer, processor, and router.

```yaml
# otel-collector-config.yml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 100
  resource:
    attributes:
      - action: insert
        key: deployment.environment
        value: "${DEPLOYMENT_ENVIRONMENT}"

exporters:
  jaeger:
    endpoint: jaeger-collector:14250
    tls:
      insecure: false
      cert_file: /certs/collector.crt
      key_file: /certs/collector.key
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: otel
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [loki]
```

**Trade-offs (OTel Collector):**
- (+) Backend-agnostic. Switch from Jaeger to Tempo by changing the exporter — no service code changes.
- (+) The Collector can sample, filter, and enrich telemetry before export. Reduces storage costs.
- (+) The Collector buffers telemetry during backend outages — no data loss if Jaeger has a hiccup.
- (-) Adds one more component to operate. The Collector must be highly available or services lose telemetry.
- (-) Misconfigured sampling in the Collector can silently drop critical traces. Monitor Collector drop rate.

## Sampling Strategy

High-traffic services can generate millions of spans per minute. Sampling reduces storage costs at the expense of completeness.

**Head-based sampling:** The tracing SDK decides at the start of a trace whether to record it (based on a percentage, e.g., 1%). Simple but can drop error traces.

**Tail-based sampling (recommended for production):** The Collector holds spans in memory until the trace is complete, then decides whether to keep it based on trace-level criteria (e.g., keep all error traces, keep 1% of success traces).

```yaml
# Tail-based sampling in OTel Collector
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    expected_new_traces_per_sec: 1000
    policies:
      - name: errors-policy
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow-traces-policy
        type: latency
        latency: {threshold_ms: 2000}
      - name: probabilistic-policy
        type: probabilistic
        probabilistic: {sampling_percentage: 1}
```

## Common Pitfalls

**Missing header propagation.** A service receives a `traceparent` header but does not forward it in outgoing calls. The trace is broken at that service — the downstream spans appear as independent traces with no parent. Fix: instrument all HTTP clients, message producers, and async job dispatchers to propagate trace context.

**Log correlation without structured logs.** If services log plain text without the correlation ID field, log queries cannot aggregate across services. Fix: require structured JSON logs with `correlationId` and `traceId` as top-level fields in all services.

**SLOs without alerting.** Defining SLOs in YAML that nobody reads provides no operational benefit. Fix: SLO definitions must be backed by alerting rules that fire before the budget is exhausted. Treat unenforced SLOs as unfinished work.

**Dashboard sprawl.** Each service creates its own dashboard with different conventions, different time windows, and different color schemes. Nobody uses them during incidents because they cannot find the right one. Fix: establish a single cross-service dashboard as the on-call starting point with links to per-service detail dashboards.

**High-cardinality span attributes.** Adding user IDs or request payloads as span attributes creates millions of unique label combinations that explode trace storage costs. Fix: restrict span attributes to known-cardinality fields (service names, status codes, HTTP methods, boolean flags). Put user IDs in log fields, not span attributes.

**Tracing gaps in async flows.** A trace starts when an HTTP request arrives and ends when the response is sent. If that request enqueues a job that processes 30 minutes later, the trace does not capture the job processing. Fix: propagate the trace context in job metadata and create a new linked span in the worker, linking it to the original trace via `FOLLOWS_FROM` span link.
