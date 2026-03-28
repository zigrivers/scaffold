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
- Every domain operation that crosses a component boundary has an API endpoint
- Error contracts are explicit (not just "500 Internal Server Error")
- Authentication and authorization requirements per endpoint
- Versioning strategy documented (if applicable)
- Pagination, filtering, and sorting for list endpoints
- Idempotency documented for mutating operations

## Methodology Scaling
- **deep**: OpenAPI-style specification. Full request/response schemas with
  examples. Error catalog. Auth flow diagrams. Rate limiting strategy.
  SDK generation considerations.
- **mvp**: Endpoint list with HTTP methods and brief descriptions. Key
  request/response shapes. Auth approach.
- **custom:depth(1-5)**: Depth 1-2: endpoint list. Depth 3: add schemas and
  error contracts. Depth 4-5: full OpenAPI-style spec.

## Mode Detection
Update mode if contracts exist. Diff against architecture changes.
