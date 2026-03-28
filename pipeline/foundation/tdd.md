---
name: tdd
description: Define testing conventions and TDD standards for the tech stack
phase: "foundation"
order: 240
dependencies: [coding-standards]
outputs: [docs/tdd-standards.md]
conditional: null
knowledge-base: [testing-strategy]
---

## Purpose
Define the project's testing conventions, TDD workflow, test pyramid, coverage
goals, quality gates, and testing patterns. This tells agents how to test the
code they write and establishes testing standards before implementation begins.

## Inputs
- docs/tech-stack.md (required) — determines test runner, assertion library, and framework-specific testing patterns
- docs/coding-standards.md (required) — naming conventions and code patterns that apply to test files
- docs/plan.md (required) — features inform which testing scenarios matter most
- docs/system-architecture.md (optional) — if available, layers to test
- docs/domain-models/ (optional) — if available, business rules to verify
- docs/adrs/ (optional) — if available, testing technology choices

## Expected Outputs
- docs/tdd-standards.md — testing approach with coverage goals and patterns

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
