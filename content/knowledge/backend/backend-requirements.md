---
name: backend-requirements
description: API-first design principles, SLA requirements (latency p99, uptime, throughput), scalability targets, backwards compatibility commitments, and API versioning strategy
topics: [backend, requirements, sla, api, versioning, scalability, performance]
---

Backend requirements are the contract the service makes with its consumers — other teams, external developers, and end users. Setting explicit SLAs, versioning policies, and scalability targets before any code is written eliminates the most expensive class of late-breaking architectural changes. A backend that surprises its callers with latency spikes or breaking changes destroys trust and creates cascading toil.

## Summary

### API-First Design

Write the API contract — OpenAPI spec, GraphQL schema, or protobuf definition — before writing implementation code. This forces explicit thinking about the consumer's perspective and produces a concrete artifact reviewable by all stakeholders before a single endpoint exists.

- **Design the interface, not the implementation**: Endpoints should model domain operations, not database rows. Prefer `POST /orders/{id}/cancel` over `PATCH /orders/{id}` with a `status: "cancelled"` payload.
- **Publish specs early**: Generate mock servers from OpenAPI specs so frontend teams can integrate immediately. Tools: Prism, Mockoon, Stoplight.
- **Review the contract**: Treat spec changes like code changes — pull requests, approval gates, and a changelog for breaking vs non-breaking modifications.

### SLA Requirements

Establish these as project requirements before sprint one:

- **Latency p99**: Typical web API targets: p99 < 500 ms for user-facing reads; p99 < 1 s for writes. Internal service calls: p99 < 100 ms. Set per-endpoint budgets for expensive operations (search, report generation).
- **Availability / uptime**: 99.9% (three nines) = 8.7 hours downtime/year. 99.95% = 4.4 hours. Each extra nine requires substantially more operational investment. Match the target to business impact.
- **Throughput**: Define peak requests per second at both steady state and spike conditions. A service handling 100 req/s steady must survive a 5× traffic spike during a product launch.
- **Error budget**: Define what percentage of requests may fail without triggering an incident. A 0.1% error rate budget at 10,000 req/s = 10 errors/s. Track this in the SLA dashboard.

### Scalability Targets

State growth expectations explicitly:

- **User growth**: Design for 10× current volume with known architectural changes. Design for 100× only if the business case is concrete — over-engineering for hypothetical scale is expensive.
- **Data volume**: Specify retention policy and expected row counts at 1 year and 3 years. A billion-row table needs a different indexing strategy than a million-row table.
- **Horizontal scaling**: Stateless service design is a requirement if horizontal scaling is expected. Document any stateful dependencies (sessions, local caches) that prevent it.

### Backwards Compatibility Commitments

Define the breaking-change policy upfront:

- **Non-breaking changes** (can ship anytime): Adding optional fields to responses, adding optional request parameters, adding new endpoints, expanding enum values in non-exhaustive enums.
- **Breaking changes** (require versioning or migration period): Removing or renaming fields, changing field types, requiring previously optional fields, changing error response shape.
- **Deprecation window**: Commit to how long deprecated endpoints remain available — typically 6–12 months for external APIs, 4–8 weeks for internal services.

### API Versioning Strategy

Choose one strategy per API surface and document it:

- **URL path versioning** (`/v1/`, `/v2/`): Most visible, easy to route and document. Preferred for public REST APIs.
- **Accept/Content-Type header**: `Accept: application/vnd.api.v2+json`. Cleaner URLs, harder to test manually.
- **Query parameter**: `?version=2`. Easiest to add but pollutes every request.
- **No versioning (schema evolution)**: Only viable with strict non-breaking-change discipline and GraphQL or Protobuf with field deprecation support.

## Deep Guidance

### Encoding SLAs as Tests

SLA commitments only have teeth if they are automatically verified:

- Add p99 latency assertions to load tests using k6, Gatling, or Locust. Fail the pipeline if p99 exceeds the budget under synthetic load.
- Instrument production with percentile metrics (not just averages) via Prometheus or Datadog. Average latency hides tail-latency problems that affect the top 1% of users — which at scale is thousands of people.
- Implement synthetic monitoring: fire real API calls from external locations every 60 seconds and alert on latency or error rate breaches.
