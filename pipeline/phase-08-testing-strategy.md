---
name: phase-08-testing-strategy
description: Define testing and quality strategy across all layers
phase: "8"
dependencies: [phase-03-system-architecture]
outputs: [docs/testing-strategy.md]
conditional: null
knowledge-base: [testing-strategy]
---

## Purpose
Define the testing strategy: test pyramid, coverage goals per layer, testing
patterns, quality gates, and performance testing approach. This tells agents
how to test the code they write.

## Inputs
- docs/system-architecture.md (required) — layers to test
- docs/domain-models/ (required) — business rules to verify
- docs/adrs/ (required) — testing technology choices
- docs/api-contracts.md (optional) — API test scenarios
- docs/database-schema.md (optional) — data layer test scenarios

## Expected Outputs
- docs/testing-strategy.md — testing approach with coverage goals and patterns

## Quality Criteria
- Test pyramid defined with coverage targets per layer
- Testing patterns specified for each layer (unit, integration, e2e)
- Quality gates defined (what must pass before merge)
- Edge cases from domain invariants are test scenarios
- Performance testing approach for critical paths

## Methodology Scaling
- **deep**: Comprehensive strategy. Test matrix by layer and component. Specific
  test patterns per architecture pattern. Performance benchmarks. CI integration.
  Test data strategy. Mutation testing approach.
- **mvp**: Test pyramid overview. Key testing patterns. What must pass before deploy.
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if strategy exists.
