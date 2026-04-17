---
name: cross-service-observability
description: Design distributed tracing, correlation IDs, and cross-service SLOs
summary: "Defines the observability strategy for multi-service systems: distributed tracing propagation, correlation ID standards, cross-service SLO definitions, and failure isolation alerting."
phase: "quality"
order: 941
dependencies: [review-operations, service-ownership-map]
outputs: [docs/cross-service-observability.md]
reads: [operations]
conditional: null
knowledge-base: [multi-service-observability]
---

## Purpose
Design the observability strategy specific to multi-service systems: how traces
propagate across service boundaries, how correlation IDs are generated and
forwarded, what cross-service SLOs are defined and measured, and how alerting
isolates failures to a specific service rather than surfacing them only at the
user-facing layer. Extends the single-service monitoring strategy in
docs/operations-runbook.md without redefining it — focusing on the interactions
and dependencies between services.

## Inputs
- docs/operations-runbook.md (required) — single-service monitoring baseline
  to extend
- docs/service-ownership-map.md (required) — which services exist and how they
  communicate
- docs/system-architecture.md (optional) — service topology and transport choices
- docs/inter-service-contracts.md (optional) — per-contract SLA targets to
  derive SLOs from

## Expected Outputs
- docs/cross-service-observability.md — distributed tracing setup, correlation
  ID standard, cross-service SLO definitions, failure isolation alerting strategy

## Quality Criteria
- (mvp) Distributed tracing standard chosen (OpenTelemetry, Jaeger, Zipkin, or
  vendor-specific) with propagation format specified (W3C TraceContext, B3)
- (mvp) Correlation ID standard defined: field name, generation point (entry
  service or API gateway), forwarding requirement (all outbound calls must
  propagate the ID)
- (mvp) Every service in the ownership map emits traces with at minimum: service
  name, operation name, trace ID, span ID, and error status
- (mvp) Cross-service SLOs defined for at least the critical user-facing request
  paths (availability and latency targets per path)
- (deep) Sampling strategy defined: head-based vs. tail-based, sampling rate,
  and rules for forcing full traces on errors or slow requests
- (deep) Each cross-service SLO includes: the measured boundary (caller or
  provider), the metric (p99 latency, error rate), the threshold, and the
  measurement window
- (deep) Error budget alerting: alert fires before 100% of monthly error budget
  is consumed (e.g., at 50% and 90%), not only on threshold breach
- (deep) Failure isolation alerting: alerts identify the originating service,
  not just the user-facing symptom (dependency latency vs. internal latency
  tracked separately)
- (deep) Span attributes standardized across services: required attribute set
  documented (HTTP method, status code, db system, messaging system, etc.)
- (deep) Log correlation: every log line emitted during a traced request includes
  the trace ID and span ID so logs and traces can be joined
- (deep) Observability data retention policy defined per signal type (traces,
  metrics, logs) with storage tier and cost rationale
- (deep) Cross-service dashboard spec: describes what panels are needed to
  diagnose a latency spike from entry point to the offending downstream service

## Methodology Scaling
- **deep**: Full distributed tracing setup with sampling strategy. Standardized
  span attributes. Log-trace correlation. Cross-service SLOs with error budgets
  and multi-threshold alerting. Failure isolation alerting. Dashboard spec.
  Retention policy.
- **mvp**: Tracing standard and propagation format. Correlation ID standard.
  Cross-service SLOs for critical paths. Basic failure isolation alerting.
- **custom:depth(1-5)**:
  - Depth 1: tracing standard choice and correlation ID standard only.
  - Depth 2: add per-service trace emission requirements and cross-service SLOs
    for critical paths.
  - Depth 3: add sampling strategy, span attribute standards, and log-trace
    correlation.
  - Depth 4: add error budget alerting, failure isolation alerting per service,
    and cross-service dashboard spec.
  - Depth 5: full observability strategy with retention policy, cost rationale,
    and multi-region or multi-tenant trace propagation considerations.

## Mode Detection
Check for docs/cross-service-observability.md. If it exists, operate in update
mode: read the existing observability strategy and diff against the current
service ownership map and operations runbook. Preserve confirmed SLOs, sampling
strategies, and correlation ID standards. Surface new services from the
ownership map that lack trace emission requirements. Flag SLOs whose source
contracts changed in the inter-service contracts document.

## Update Mode Specifics
- **Detect prior artifact**: docs/cross-service-observability.md exists
- **Preserve**: confirmed SLO definitions, error budget thresholds, sampling
  strategy, correlation ID standard, span attribute requirements, log-trace
  correlation rules, retention policy
- **Triggers for update**: ownership map added a new service or cross-service
  call, operations runbook changed the monitoring baseline, inter-service
  contracts updated SLA targets, architecture changed transport or observability
  infrastructure
- **Conflict resolution**: if a new service from the ownership map has
  conflicting SLO requirements (e.g., its provider SLA is tighter than the
  existing consumer SLO), surface both targets and request a resolution
  decision; never silently relax an existing SLO without documenting the
  rationale
