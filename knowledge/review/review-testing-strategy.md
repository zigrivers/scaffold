---
name: review-testing-strategy
description: Failure modes and review passes specific to testing and quality strategy artifacts
topics: [review, testing, quality, coverage, test-pyramid]
---

# Review: Testing Strategy

The testing strategy defines how the system will be verified at every layer. It must cover unit tests through end-to-end tests, address domain-specific invariants, align with the architecture's component boundaries, and define quality gates for CI/CD. This review uses 6 passes targeting the specific ways testing strategies fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Coverage Gaps by Layer**: Each architectural layer has test coverage defined; test pyramid is balanced (not top-heavy or bottom-heavy).
- **Pass 2 — Domain Invariant Test Cases**: Every domain invariant has at least one corresponding test scenario covering positive and negative cases.
- **Pass 3 — Test Environment Assumptions**: Test environment matches production constraints; database engines, service configurations, and test data are realistic.
- **Pass 4 — Performance Test Coverage**: Performance-critical paths have benchmarks with specific thresholds; load and stress testing scenarios defined.
- **Pass 5 — Integration Boundary Coverage**: All component integration points have integration tests using real (not mocked) dependencies.
- **Pass 6 — Quality Gate Completeness**: CI pipeline gates cover linting, type checking, tests, and security scanning; gates block deployment on failure.

## Deep Guidance

---

## Pass 1: Coverage Gaps by Layer

### What to Check

Each architectural layer (domain logic, application services, API, database, frontend, integration points) has test coverage defined. The test pyramid is balanced — not top-heavy (too many E2E tests) or bottom-heavy (unit tests only, no integration).

### Why This Matters

Missing test coverage at any layer creates a blind spot where bugs hide. Too many E2E tests create slow, flaky test suites that developers disable. Too few integration tests mean components work in isolation but fail when connected. The testing strategy must specify what gets tested at which level with clear rationale.

### How to Check

1. List every architectural layer from the system architecture
2. For each layer, verify the testing strategy specifies: what types of tests, what the tests verify, approximate coverage expectations
3. Check the test pyramid balance: unit tests should be most numerous, integration tests fewer, E2E tests fewest
4. Verify that each layer's test scope matches its architectural responsibility
5. Check for layers with no test coverage defined — these are the blind spots
6. Verify that the testing strategy addresses external dependencies: how are third-party APIs, databases, and services handled in tests? (Mocks, test doubles, contract tests, testcontainers)

### What a Finding Looks Like

- P0: "The database layer has no test coverage defined. No mention of schema validation tests, migration tests, or query correctness tests."
- P1: "Testing strategy defines unit tests and E2E tests but no integration tests. Components are tested in isolation and in full-system context, but never at the boundary — this misses component integration bugs."
- P1: "External API dependencies (payment gateway, email service) have no test approach defined. Are they mocked? Stubbed? Is there a contract test?"
- P2: "Test pyramid is inverted: 50 E2E tests, 20 integration tests, 15 unit tests. This will produce a slow, flaky test suite."

---

## Pass 2: Domain Invariant Test Cases

### What to Check

Every domain invariant from the domain models has at least one corresponding test scenario defined. Invariants are the highest-value test targets because they define business correctness.

### Why This Matters

Domain invariants are the rules the business cannot tolerate being violated. If the invariant "order total must equal sum of line items minus discounts" is not tested, a calculation bug could ship to production. Invariant violations are often the most expensive production bugs — they corrupt data, break financial calculations, or violate regulatory requirements.

### How to Check

1. List every domain invariant from the domain models
2. For each invariant, find at least one test scenario in the testing strategy
3. Check that test scenarios cover both the positive case (invariant holds) and negative case (invariant is violated — system rejects the operation)
4. Verify that edge cases are considered: boundary values, null/empty inputs, concurrent modifications
5. Check for invariants that span multiple aggregates — these need integration-level tests, not just unit tests
6. Verify that invariant tests are classified at the correct pyramid level: aggregate-internal invariants at unit level, cross-aggregate invariants at integration level

### What a Finding Looks Like

- P0: "Domain invariant 'account balance cannot be negative' has no corresponding test scenario. This is a financial correctness requirement that must be tested."
- P1: "Invariant 'email must be unique per tenant' has a unit test scenario but no integration test. The unit test mocks the uniqueness check — only an integration test against the real database can verify the constraint."
- P2: "Invariant 'order must have at least one line item' has a positive test but no negative test (what happens when creating an order with zero items)."

---

## Pass 3: Test Environment Assumptions

### What to Check

The test environment described in the strategy matches production constraints. Database versions, service configurations, and external dependency behavior in tests reflect what will exist in production.

### Why This Matters

Tests that pass against SQLite but fail against PostgreSQL. Tests that mock a payment gateway's happy path but never test the timeout behavior that will happen in production. Test environment mismatches are the primary reason "tests pass, production breaks." The testing strategy must be explicit about how the test environment relates to production.

### How to Check

1. Compare the test database to the production database: same engine? Same version? Same configuration?
2. Check external service test doubles: do they replicate the real service's behavior, including errors, latency, and edge cases?
3. Verify that test data represents realistic production conditions: data volumes, data shapes, edge case values
4. Check for environment-specific behavior: timezone handling, locale, file system paths, network configuration
5. Verify that CI/CD test environment is specified and matches local test environment
6. Check for assumptions about test ordering or test isolation — are tests truly independent?

### What a Finding Looks Like

- P0: "Tests run against SQLite but production uses PostgreSQL. SQLite and PostgreSQL have different type systems, different locking behavior, and different SQL dialect support. Tests will pass locally and fail in production."
- P1: "Payment gateway is mocked to always return success. No test scenario covers timeout, network error, or declined payment — all common production scenarios."
- P2: "Test data uses 5 records per table but production will have millions. Performance-sensitive queries are not tested at scale."

---

## Pass 4: Performance Test Coverage

### What to Check

Performance-critical paths identified in the PRD or architecture have benchmarks defined. Load testing, stress testing, and latency requirements have corresponding test scenarios.

### Why This Matters

Performance requirements stated in the PRD ("sub-200ms API response," "handle 1000 concurrent users") are meaningless without tests that verify them. Performance regressions are invisible to functional tests — the system still returns correct results, just slowly. By the time performance issues are discovered in production, the fix often requires architectural changes.

### How to Check

1. List performance requirements from the PRD and architecture (response time, throughput, concurrent users, data volume)
2. For each requirement, find a corresponding performance test scenario
3. Verify that benchmarks have specific thresholds (not "should be fast" but "95th percentile response time < 200ms")
4. Check for load testing: is the expected concurrent user load tested?
5. Check for stress testing: what happens beyond expected load? (Graceful degradation vs. crash)
6. Verify that performance tests run in an environment representative of production (not a developer laptop)
7. Check for performance regression detection: are benchmarks tracked over time?

### What a Finding Looks Like

- P0: "PRD requires 'sub-200ms response time for search queries' but no performance test scenario exists. There is no way to verify this requirement is met."
- P1: "Load testing scenario exists for 100 concurrent users, but the PRD targets 10,000. The test does not verify the actual requirement."
- P2: "Performance tests exist but have no regression tracking. A performance degradation from a code change will not be detected until it reaches production."

---

## Pass 5: Integration Boundary Coverage

### What to Check

All component integration points have integration tests defined. Every API call between services, every database query pattern, every message queue interaction has a test at the integration level.

### Why This Matters

Integration boundaries are where bugs hide. Each component may work perfectly in isolation (unit tests pass) but fail when connected to another component due to serialization mismatches, protocol errors, authentication failures, or contract violations. Integration tests catch these by testing real component interactions.

### How to Check

1. List every integration point from the architecture: service-to-service calls, database queries, message queue producers/consumers, external API integrations
2. For each integration point, verify a test scenario exists at the integration level
3. Check that integration tests use real (or realistic) dependencies, not mocks (that is what unit tests are for)
4. Verify that contract tests exist for external APIs: when the external API changes, do tests catch the break?
5. Check for async integration points (message queues, webhooks): are these tested with real async behavior, including ordering, retry, and failure scenarios?
6. Verify that database integration tests cover actual query execution (not mocked repositories)

### What a Finding Looks Like

- P0: "OrderService calls InventoryService to reserve stock, but no integration test verifies this interaction. If the request format changes, the break is undetected."
- P1: "Database repository tests mock the database connection. There are no tests that execute actual SQL against a real database — schema errors, query syntax errors, and constraint violations are invisible."
- P2: "Event consumer integration tests verify message processing but not message ordering or duplicate handling."

---

## Pass 6: Quality Gate Completeness

### What to Check

The CI pipeline quality gates catch all intended issues before code reaches production. Gates cover linting, type checking, unit tests, integration tests, security scanning, and any project-specific checks.

### Why This Matters

A quality gate that exists in documentation but not in CI is not a gate. If the testing strategy says "all code must pass linting" but the CI pipeline does not run a linter, the gate is aspirational. Quality gates must be concrete: what tool, what configuration, what threshold, what happens on failure.

### How to Check

1. List every quality requirement from the testing strategy (code coverage thresholds, linting rules, type checking, security scanning)
2. For each requirement, verify it maps to a specific CI pipeline step
3. Check that gate failure blocks deployment (not just warns)
4. Verify code coverage thresholds are specified and enforced: what percentage? Per file or overall? Is it a gate or a report?
5. Check for security scanning: dependency vulnerability scanning, static analysis, secrets detection
6. Verify that the gate order is correct: fast checks first (lint, type check), slow checks later (integration tests, E2E tests)
7. Check for missing gates: database migration validation, API contract validation (schema against implementation), documentation generation

### What a Finding Looks Like

- P0: "Testing strategy requires 80% code coverage but the CI pipeline has no coverage reporting or enforcement. The requirement is unverifiable."
- P1: "Security scanning is listed as a quality requirement but no specific tool or CI pipeline step implements it."
- P2: "Quality gates run linting, unit tests, and integration tests, but do not validate database migrations. A broken migration would pass all gates and fail in production."

---

## Common Review Anti-Patterns

### 1. Copy-Pasted Generic Strategy

The testing strategy is a boilerplate document that says "we will have unit tests, integration tests, and E2E tests" without connecting to the actual architecture. No mention of specific components, no mapping of test types to architectural layers, no project-specific invariants.

**How to spot it:** The strategy could be copy-pasted into any other project and still read correctly. No component names, no domain terms, no architecture-specific decisions.

### 2. Testing Strategy Disconnected from Architecture

The strategy defines test types and coverage goals but does not reference the system architecture. Tests are organized by test framework (Jest unit tests, Playwright E2E tests) rather than by architectural component. This makes it impossible to verify coverage — you cannot tell which components are tested and which are not.

**How to spot it:** Search for component names from the architecture document. If none appear in the testing strategy, the two documents are disconnected.

### 3. Mock-Everything Mentality

Every external dependency is mocked, including the database. Unit test coverage is high, but no test ever executes a real query, a real HTTP call, or a real message queue interaction. The test suite provides confidence that the mocking layer works, not that the system works.

**Example finding:**

```markdown
## Finding: TSR-009

**Priority:** P1
**Pass:** Integration Boundary Coverage (Pass 5)
**Document:** docs/testing-strategy.md, Section 4.2

**Issue:** All database tests use an in-memory mock repository. The repository interface
is tested, but no test ever executes SQL against a real PostgreSQL instance. The following
risks are untested: query syntax errors, constraint violations, transaction isolation
behavior, migration correctness.

**Recommendation:** Add integration tests using testcontainers or a CI-managed PostgreSQL
instance for at least the OrderRepository and UserRepository (the two repositories with
complex queries).
```

### 4. No Negative Test Scenarios

The strategy defines tests for the happy path but never specifies what happens when things fail. No test scenarios for invalid input, network timeouts, concurrent modification, or resource exhaustion. The system is verified to work when everything goes right — the most uninteresting case.

**How to spot it:** Scan test scenario descriptions for words like "invalid," "timeout," "failure," "error," "reject," "concurrent," "duplicate." If these are absent, negative scenarios are missing.

### 5. Coverage Percentage as the Only Quality Metric

The strategy defines 80% code coverage as the quality gate but specifies no other quality criteria. High coverage with no assertion quality means tests that execute code paths without verifying behavior — "tests" that call functions and ignore the return value. Coverage measures how much code was run, not whether it was tested correctly.

**How to spot it:** The quality gates section mentions only code coverage. No mention of mutation testing, assertion density, test execution time budgets, or flakiness tracking.
