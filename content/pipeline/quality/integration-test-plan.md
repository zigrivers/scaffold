---
name: integration-test-plan
description: Design contract tests, cross-service E2E flows, and service mocking strategy
summary: "Plans the cross-service testing strategy: consumer-driven contract tests, integration test flows covering critical multi-service journeys, and service dependency mocking approaches for isolated testing."
phase: "quality"
order: 942
dependencies: [review-testing, inter-service-contracts]
outputs: [docs/integration-test-plan.md]
reads: [service-ownership-map, cross-service-auth]
conditional: null
knowledge-base: [multi-service-testing]
---

## Purpose
Design and document the cross-service testing strategy: consumer-driven contract
tests that verify inter-service API compatibility without full-stack deployment,
integration test flows covering critical multi-service user journeys, and
service dependency mocking approaches that allow individual services to be
tested in isolation. Extends the single-service TDD standards in
docs/tdd-standards.md — focusing on the boundaries and interactions between
services rather than unit or component tests within a single service.

## Inputs
- docs/tdd-standards.md (required) — single-service test standards to extend
- docs/inter-service-contracts.md (required) — contracts to derive consumer-
  driven tests from
- docs/service-ownership-map.md (required) — which services communicate and
  own which data concepts
- docs/cross-service-auth.md (optional) — auth mechanism to include in
  integration test flows

## Expected Outputs
- docs/integration-test-plan.md — contract testing approach, integration test
  flow inventory, and service mocking strategy

## Quality Criteria
- (mvp) Contract testing tool chosen (Pact, Spring Cloud Contract, or equivalent)
  with rationale
- (mvp) Every cross-service call from the ownership map has a corresponding
  consumer-driven contract test
- (mvp) Consumer-driven contract tests run in CI on both consumer and provider
  pipelines; provider cannot merge a breaking change without a failing test
- (mvp) Integration test flows defined for at least the critical user-facing
  multi-service journeys (happy path per journey)
- (mvp) Each integration test flow identifies: the services involved, the entry
  point, the data dependencies, and the expected end state
- (deep) Contract tests cover: success responses, error responses, and schema
  evolution cases (optional field added, field deprecated)
- (deep) Provider state setup documented for each contract test: how to
  bootstrap the provider into the correct state before verification
- (deep) Service mocking strategy defined per dependency type: in-process stub,
  WireMock/API mock server, or contract-verified test double
- (deep) Mocking boundary policy stated: mocks are only used at service
  boundaries (never mock internal collaborators in integration tests)
- (deep) Integration test environment strategy: dedicated environment, ephemeral
  per-PR environment, or service virtualization — with trade-offs documented
- (deep) Cross-service auth included in integration test flows: service tokens
  or mTLS certificates provisioned in the test environment
- (deep) Flaky test mitigation strategy: retry policy for integration tests,
  isolation rules (no shared state between tests), and quarantine process for
  known-flaky tests
- (deep) Data seeding and teardown approach: how test data is created and
  cleaned up across services without leaking state between test runs

## Methodology Scaling
- **deep**: Full contract test suite per service pair with provider state setup.
  Integration test flow inventory covering all critical journeys (happy and
  error paths). Service mocking strategy with boundary policy. Flaky test
  mitigation. Data seeding and teardown. Cross-service auth in test flows.
  Integration environment strategy with trade-offs.
- **mvp**: Contract testing tool choice. Consumer-driven tests per cross-service
  call. Integration test flows for critical journeys (happy path). Basic
  mocking strategy.
- **custom:depth(1-5)**:
  - Depth 1: contract testing tool choice and consumer-driven test list only.
  - Depth 2: add integration test flows for critical journeys and basic mocking
    strategy.
  - Depth 3: add provider state setup, schema evolution test cases, and mocking
    boundary policy.
  - Depth 4: add integration environment strategy, cross-service auth in test
    flows, and data seeding/teardown approach.
  - Depth 5: full plan with flaky test mitigation, quarantine process, and
    multi-environment or multi-tenant testing considerations.

## Mode Detection
Check for docs/integration-test-plan.md. If it exists, operate in update mode:
read the existing plan and diff against the current inter-service contracts and
service ownership map. Preserve confirmed contract test tool choice, mocking
strategy, and integration test flows. Surface new cross-service calls from the
ownership map that lack contract tests. Flag flows whose participating services
changed in the architecture.

## Update Mode Specifics
- **Detect prior artifact**: docs/integration-test-plan.md exists
- **Preserve**: confirmed contract testing tool, consumer-driven test inventory,
  provider state setup, mocking strategy, integration environment choice,
  flaky test mitigation rules, data seeding approach
- **Triggers for update**: ownership map added a new cross-service call,
  inter-service contracts changed a schema or auth mechanism, architecture
  added or removed a service, security review identified new auth requirements
  that affect test flows
- **Conflict resolution**: if a new cross-service call from the ownership map
  has no clear owner for writing the consumer-driven contract test, surface the
  ambiguity and request an ownership assignment before adding the test entry;
  never add a contract test without a designated consumer team responsible for
  maintaining it
