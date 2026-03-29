---
name: tdd
description: Define testing conventions and TDD standards for the tech stack
phase: "foundation"
order: 240
dependencies: [coding-standards]
outputs: [docs/tdd-standards.md]
reads: [create-prd, system-architecture]
conditional: null
knowledge-base: [testing-strategy]
---

## Purpose
Define the project's testing conventions, TDD workflow, test pyramid, coverage
goals, quality gates, and testing patterns. This tells agents how to test the
code they write and establishes testing standards before implementation begins.
Includes concrete reference examples for each test category using the project's
actual test framework and assertion library.

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
- (mvp) Test pyramid defined with coverage targets per layer
- (mvp) Testing patterns specified for each layer (unit, integration, e2e)
- (mvp) Quality gates defined (what must pass before merge)
- Edge cases from domain invariants are test scenarios
- (deep) Performance testing approach for critical paths
- (deep) Contract testing strategy documented for service boundaries

## Methodology Scaling
- **deep**: Comprehensive strategy. Test matrix by layer and component. Specific
  test patterns per architecture pattern. Performance benchmarks. CI integration.
  Test data strategy. Mutation testing approach.
- **mvp**: Test pyramid overview. Key testing patterns. What must pass before deploy.
- **custom:depth(1-5)**: Depth 1-2: test pyramid overview with key patterns and example test for each layer. Depth 3: add per-layer test patterns, coverage targets, CI integration, and test data strategy. Depth 4: add performance benchmarks, mutation testing approach, and cross-module integration patterns. Depth 5: full suite with contract testing, visual regression strategy, and automated quality gate calibration.

## Mode Detection
Check for docs/tdd-standards.md. If it exists, operate in update mode: read
existing strategy and diff against current tech stack, coding standards, and
PRD. Preserve testing patterns, layer definitions, custom assertions, and test
data strategy. Update coverage goals if PRD scope or tech stack changed.
Re-generate only sections affected by upstream changes — do not rewrite
stable layer definitions or custom assertion patterns.

## Update Mode Specifics
- **Detect prior artifact**: docs/tdd-standards.md exists
- **Preserve**: test pyramid layer definitions, custom assertion helpers, test
  data strategy, quality gate thresholds, framework-specific patterns
- **Triggers for update**: tech-stack.md changed (new test runner or framework),
  coding-standards.md changed (naming conventions), PRD scope expanded (new
  features needing test scenarios)
- **Conflict resolution**: if tech stack changed test runner, migrate pattern
  examples to new runner syntax; preserve coverage targets unless user requests
  adjustment
