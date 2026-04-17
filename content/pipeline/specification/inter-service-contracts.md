---
name: inter-service-contracts
description: Design API contracts between services with versioning, retries, and failure isolation
summary: "Specifies internal service-to-service API contracts including versioning strategy, backward compatibility rules, retry policies, timeout budgets, idempotency requirements, and failure isolation patterns."
phase: "specification"
order: 841
dependencies: [service-ownership-map, review-api]
outputs: [docs/inter-service-contracts.md]
reads: [api-contracts]
conditional: null
knowledge-base: [multi-service-api-contracts, multi-service-resilience]
---

## Purpose
Design and document the internal API contracts between services: endpoint
signatures, versioning strategy, backward compatibility rules, retry policies,
timeout budgets, idempotency requirements, and failure isolation patterns.
Produces a contract document that governs how services call one another and
what guarantees callers can rely on, distinct from the public-facing API
contracts in docs/api-contracts.md.

## Inputs
- docs/service-ownership-map.md (required) — which services communicate and
  who owns which data concepts
- docs/api-contracts.md (required) — public API patterns to align with
- docs/system-architecture.md (optional) — service topology and transport choices
- docs/adrs/ (optional) — decisions affecting inter-service transport or
  resilience strategy

## Expected Outputs
- docs/inter-service-contracts.md — per-contract specifications covering
  endpoint or event schema, versioning, retry policy, timeout budget,
  idempotency, and failure isolation

## Quality Criteria
- (mvp) Every cross-service call from the ownership map has a corresponding
  contract entry
- (mvp) Each contract specifies the caller, the provider, the operation name,
  and the transport (HTTP, gRPC, message queue, etc.)
- (mvp) Versioning strategy defined (URI prefix, header, schema version field)
  and applied consistently across all contracts
- (mvp) Backward compatibility rules stated (additive-only, deprecation window,
  breaking-change process)
- (deep) Each contract has an explicit timeout budget with rationale tied to
  the caller's own SLA
- (deep) Retry policy specified per contract: max attempts, backoff strategy
  (exponential + jitter), retryable vs. non-retryable error codes
- (deep) Idempotency requirements stated per operation (idempotency key, safe
  to retry, at-most-once)
- (deep) Failure isolation pattern assigned per contract (circuit breaker,
  bulkhead, fallback response, graceful degradation)
- (deep) Each contract documents its SLA: expected p99 latency and error
  budget
- (deep) Schema evolution rules documented (required vs. optional fields,
  unknown field handling, enum extension policy)
- (deep) Authentication and authorization mechanism specified for each
  contract (service-to-service token, mTLS, API key scope)

## Methodology Scaling
- **deep**: Full contract specification per service pair. Timeout budgets with
  SLA rationale. Retry and backoff policies. Idempotency guarantees. Failure
  isolation patterns (circuit breaker, bulkhead). Schema evolution rules.
  Auth mechanism per contract.
- **mvp**: Contract list with caller, provider, operation, and transport.
  Versioning strategy. Backward compatibility rules.
- **custom:depth(1-5)**:
  - Depth 1: contract list with caller, provider, operation, and transport only.
  - Depth 2: add versioning strategy and backward compatibility rules.
  - Depth 3: add timeout budgets, retry policies, and idempotency requirements.
  - Depth 4: add failure isolation patterns, SLA documentation, and schema
    evolution rules.
  - Depth 5: full specification with auth mechanism per contract, consumer-driven
    contract testing strategy, and multi-version coexistence plan.

## Mode Detection
Check for docs/inter-service-contracts.md. If it exists, operate in update
mode: read the existing contracts and diff against the current service
ownership map and API review findings. Preserve all confirmed contracts.
Surface new cross-service calls from the ownership map that lack contract
entries. Flag contracts whose provider or transport changed in the architecture
and require review. Never silently change a retry policy or timeout budget
without documenting the reason.

## Update Mode Specifics
- **Detect prior artifact**: docs/inter-service-contracts.md exists
- **Preserve**: confirmed retry policies, timeout budgets, idempotency
  guarantees, failure isolation patterns, versioning strategy, auth mechanisms
- **Triggers for update**: ownership map added a new cross-service call,
  API review identified a missing contract, architecture changed transport for
  a service pair, ADR updated resilience strategy
- **Conflict resolution**: if a new cross-service call from the ownership map
  conflicts with an existing contract boundary (e.g., caller now bypasses the
  designated provider), surface the conflict and request resolution before
  adding the new contract entry; do not silently add a contract that undermines
  an existing ownership assignment
