---
name: api-contracts
description: Specify API contracts for all system interfaces
phase: "specification"
order: 830
dependencies: [review-architecture]
outputs: [docs/api-contracts.md]
conditional: "if-needed"
knowledge-base: [api-design]
---

## Purpose
Define API contracts for all system interfaces — REST endpoints, GraphQL schema,
WebSocket events, or inter-service communication. Each endpoint specifies request/
response shapes, error codes, authentication requirements, and rate limits.

## Inputs
- docs/system-architecture.md (required) — component interfaces to specify
- docs/domain-models/ (required) — domain operations to expose
- docs/adrs/ (required) — API style decisions (REST vs GraphQL, versioning)

## Expected Outputs
- docs/api-contracts.md — API specification with endpoints, request/response
  shapes, error contracts, auth requirements

## Quality Criteria
- (mvp) Every domain operation that crosses a component boundary has an API endpoint
- (mvp) Error contracts are explicit (not just "500 Internal Server Error")
- (mvp) Authentication and authorization requirements per endpoint
- (deep) Versioning strategy documented (if applicable)
- (deep) Pagination, filtering, and sorting for list endpoints
- (deep) Idempotency documented for mutating operations

## Methodology Scaling
- **deep**: OpenAPI-style specification. Full request/response schemas with
  examples. Error catalog. Auth flow diagrams. Rate limiting strategy.
  SDK generation considerations.
- **mvp**: Endpoint list with HTTP methods and brief descriptions. Key
  request/response shapes. Auth approach.
- **custom:depth(1-5)**: Depth 1-2: endpoint list. Depth 3: add schemas and
  error contracts. Depth 4-5: full OpenAPI-style spec.

## Mode Detection
Check for docs/api-contracts.md. If it exists, operate in update mode: read
existing endpoint definitions and diff against current system architecture and
domain models. Preserve existing endpoint paths, request/response schemas, and
error contracts. Add new endpoints for new features or domain operations.
Update error contracts if domain model changed validation rules. Never remove
or rename existing endpoints without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/api-contracts.md exists
- **Preserve**: existing endpoint paths, HTTP methods, request/response schemas,
  error codes, auth requirements, pagination patterns, versioning strategy
- **Triggers for update**: architecture changed component boundaries, domain
  models added new operations, ADRs changed API style or auth approach
- **Conflict resolution**: if architecture moved an operation to a different
  component, update the endpoint's component ownership but preserve its contract;
  flag breaking schema changes for user review
