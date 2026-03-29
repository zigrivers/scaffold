---
description: "Configure end-to-end testing (Playwright for web, Maestro for mobile) based on detected project platform"
long-description: "Detects whether your project is web or mobile, then configures Playwright (web) or Maestro (mobile) with a working smoke test, baseline screenshots, and guidance on when to use E2E vs. unit tests."
---

## Purpose
Automatically detects project platform type from tech-stack.md and package.json
to determine which E2E framework(s) to configure. Configures Playwright for web
frontends, Maestro for mobile/Expo apps, or both for multi-platform projects.
Self-skips for backend-only or library projects with no UI.

## Inputs
- docs/tech-stack.md (required) — frontend framework and rendering approach
- docs/tdd-standards.md (required) — E2E placeholder section to fill
- docs/coding-standards.md (required for mobile) — testID conventions to add
- CLAUDE.md (required) — browser/mobile testing section to add
- package.json (read-only) — dependency detection for platform and brownfield signals
- docs/user-stories.md (optional) — key user flows for visual verification

## Expected Outputs
Outputs vary by detected platform:
- (web) Playwright config file, tests/screenshots/ directories, CLAUDE.md and
  tdd-standards.md browser testing sections
- (mobile) maestro/ directory with config, flows, shared sub-flows, screenshots,
  package.json test scripts, coding-standards.md testID conventions, CLAUDE.md
  and tdd-standards.md mobile testing sections
- (both) All of the above

## Quality Criteria
- (mvp) Platform detection is explicit and logged (web, mobile, both, or skip)
- (mvp) (web) Playwright config uses framework-specific dev server command and port
- (mvp) (web) Smoke test passes (navigate, screenshot, close)
- (mvp) (mobile) Maestro CLI installed, sample flow executes, screenshot captured
- (mobile) testID naming convention defined and documented
- (mvp) E2E section in tdd-standards.md distinguishes when to use E2E vs unit tests
- (mvp) Baseline screenshots committed, current screenshots gitignored
- (mvp) CLAUDE.md contains browser/mobile testing section
- (mvp) tdd-standards.md E2E section updated with when-to-use guidance
- (deep) CI integration configured for E2E test execution
- (deep) Sub-flows defined for common user journeys
- (deep) Smoke test names and intent are consistent between Playwright and Maestro

## Methodology Scaling
- **deep**: Full setup for all detected platforms. All visual testing patterns,
  baseline management, responsive verification, CI integration, sub-flows for
  common journeys, and comprehensive documentation updates.
- **mvp**: Basic config and smoke test for detected platform. Minimal docs
  updates. Two viewports for web, single platform for mobile.
- **custom:depth(1-5)**:
  - Depth 1: Config + smoke test for primary platform only
  - Depth 2: Config + smoke test with basic viewport/device coverage
  - Depth 3: Add patterns, naming conventions, and testID rules
  - Depth 4: Add CI integration and both mobile platforms
  - Depth 5: Full suite with baseline management, sub-flows, and cross-platform consistency

## Conditional Evaluation
Enable when: tech-stack.md indicates a web frontend (Playwright) or mobile app
(Maestro). Detection signals: React/Vue/Angular/Svelte in tech-stack (web),
Expo/React Native (mobile), or explicit UI layer in architecture. Self-skips for
backend-only or library projects with no UI.

## Mode Detection
Check for existing E2E config: Playwright config file (playwright.config.ts or
.js) and/or maestro/ directory. If either exists, run in update mode for that
platform. Preserve baseline screenshots, custom viewports, existing flows,
and environment variables.

## Update Mode Specifics
- **Detect prior artifact**: playwright.config.ts/.js exists and/or maestro/
  directory exists with flow files
- **Preserve**: baseline screenshots, custom viewports, existing test flows,
  environment variables, testID naming conventions
- **Triggers for update**: new user stories with UI interactions added,
  platform targets changed in tech-stack.md, tdd-standards.md E2E section updated
- **Conflict resolution**: preserve existing baselines, add new flows alongside
  existing ones rather than replacing

---

## Domain Knowledge

### testing-strategy

*Test pyramid, testing patterns, coverage strategy, and quality gates*

# Testing Strategy

Expert knowledge for test pyramid design, testing patterns, coverage strategy, and quality gates across all test levels.

## Summary

### Test Pyramid

```
        /  E2E Tests  \         Few, slow, high confidence
       / Integration    \       Moderate, medium speed
      /   Unit Tests      \     Many, fast, focused
     ________________________
```

### Test Level Definitions

- **Unit Tests** — Single function/method/class in isolation. No I/O, deterministic, millisecond execution. Test pure business logic, state machines, edge cases, error handling.
- **Integration Tests** — Interaction between 2+ components with real infrastructure. Seconds to execute. Test API handlers, DB queries, auth middleware, external service integrations.
- **E2E Tests** — Complete user flows with real browser/device. Seconds to minutes. Test critical user journeys only (5-15 tests for most apps).

### Basic Patterns

- **Arrange/Act/Assert (AAA)** — Set up conditions, perform action, verify result.
- **Given/When/Then (BDD)** — Behavior-oriented variant for integration and E2E tests.
- **Test Doubles** — Stubs (return predetermined data), Mocks (verify interactions), Spies (wrap real implementations), Fakes (simplified working implementations).

### What NOT to Mock

- The thing you're testing
- Value objects and simple data transformations
- The database in integration tests
- Too many things (if 10 mocks needed, refactor the code)

## Deep Guidance

### Unit Tests — Extended

**What they test:** A single function, method, or class in isolation from all external dependencies (database, network, file system, other modules).

**Characteristics:**
- Execute in milliseconds
- No I/O (no database, no network, no file system)
- Deterministic (same input always produces same output)
- Can run in any order and in parallel
- External dependencies are replaced with test doubles

**What to unit test:**
- Pure business logic (calculations, transformations, validations)
- State machines and state transitions
- Edge cases and boundary conditions
- Error handling logic
- Data formatting and parsing

**What NOT to unit test:**
- Framework behavior (don't test that Express routes requests correctly)
- Configuration (don't test that environment variables are read)
- Trivial getters/setters with no logic
- Third-party library functions

**Example structure:**

```typescript
describe('calculateOrderTotal', () => {
  it('sums line item prices', () => {
    const lines = [
      { quantity: 2, unitPrice: 1000 },  // $10.00 each
      { quantity: 1, unitPrice: 2500 },  // $25.00
    ];
    expect(calculateOrderTotal(lines)).toBe(4500); // $45.00
  });

  it('returns zero for empty order', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });

  it('rejects negative quantities', () => {
    const lines = [{ quantity: -1, unitPrice: 1000 }];
    expect(() => calculateOrderTotal(lines)).toThrow('Quantity must be positive');
  });
});
```

### Integration Tests — Extended

**What they test:** The interaction between two or more components, including real infrastructure (database, API calls between layers, message queues).

**Characteristics:**
- Execute in seconds
- Use real infrastructure (test database, local services)
- May require setup and teardown (database seeding, service startup)
- Test that components integrate correctly, not that each component works in isolation

**What to integration test:**
- API endpoint handlers (request -> business logic -> database -> response)
- Database query builders and repositories (do queries return correct data?)
- Authentication/authorization middleware (does the auth chain work end-to-end?)
- External service integrations (with a test/sandbox instance or contract tests)

**API endpoint integration test example:**

```typescript
describe('POST /api/v1/users', () => {
  beforeEach(async () => {
    await db.users.deleteAll();  // Clean slate
  });

  it('creates a user and returns 201', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(201);

    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user).not.toHaveProperty('password');  // Never return password

    // Verify the user actually exists in the database
    const dbUser = await db.users.findByEmail('test@example.com');
    expect(dbUser).not.toBeNull();
  });

  it('returns 409 when email already exists', async () => {
    await db.users.create({ email: 'taken@example.com', password: 'hash' });

    const response = await request(app)
      .post('/api/v1/users')
      .send({ email: 'taken@example.com', password: 'SecurePass123!' })
      .expect(409);

    expect(response.body.error.code).toBe('ALREADY_EXISTS');
  });
});
```

### End-to-End (E2E) Tests — Extended

**What they test:** Complete user flows from the user's perspective, using a real browser (for web apps) or real device/emulator (for mobile apps).

**Characteristics:**
- Execute in seconds to minutes
- Use a full running application stack
- Simulate real user behavior (clicks, typing, navigation)
- Most expensive to maintain and slowest to run
- Highest confidence that the system works as users expect

**What to E2E test:**
- Critical user journeys (registration, login, core business flow, payment)
- Flows that integrate multiple features (add to cart -> checkout -> payment -> confirmation)
- Accessibility checks on key pages

**What NOT to E2E test:**
- Every possible validation error (covered by unit/integration tests)
- Internal API behavior (covered by integration tests)
- Visual pixel-perfection (use visual regression testing tools separately)

**Keep E2E tests focused:**
- 5-15 E2E tests for most applications
- Each tests a complete user journey, not a single interaction
- If an E2E test breaks, it reveals a real user-facing problem

### Test Doubles — Detailed Patterns

#### Stubs

Return predetermined responses. Use when you need to control what a dependency returns.

```typescript
const userRepo = { findById: jest.fn().mockResolvedValue({ id: '1', name: 'Alice' }) };
```

#### Mocks

Record calls and verify interactions. Use when you need to verify that a dependency was called correctly.

```typescript
const emailService = { send: jest.fn() };
// ... execute code ...
expect(emailService.send).toHaveBeenCalledWith({
  to: 'alice@example.com',
  subject: 'Welcome!'
});
```

#### Spies

Wrap real implementations and record calls. Use when you want real behavior but also want to verify calls.

#### Fakes

Working implementations with simplified behavior. Use for expensive dependencies in tests (in-memory database instead of real database).

#### When to Use Which

- Stub external services (HTTP APIs, email, payment)
- Mock side-effect-producing dependencies (to verify they're called)
- Spy on internal functions (to verify call patterns without changing behavior)
- Fake databases in unit tests (in-memory implementations of repository interfaces)

### What NOT to Mock — Extended

- **The thing you're testing.** If you mock the function under test, you're testing the mock, not the code.
- **Value objects and simple data transformations.** Use real instances; they're fast and deterministic.
- **The database in integration tests.** The point of integration tests is to test real database interactions.
- **Too many things.** If a test requires 10 mocks, the code under test has too many dependencies. Refactor the code, not the test.

### Snapshot Testing

Captures the output of a component or function and compares it to a stored reference:

**When to use:** Catching unintended changes to serializable output (React component trees, API response shapes, configuration objects).

**When NOT to use:** For testing correctness (snapshots don't assert meaning, only shape). Don't use as a substitute for specific assertions.

**Rules:**
- Review snapshot changes carefully — don't just update blindly
- Keep snapshots small (snapshot a component, not an entire page)
- Use inline snapshots for small outputs

### Contract Testing

Verify that a service provider and its consumers agree on the API contract:

- The consumer defines a contract (expected request/response pairs)
- The provider runs the consumer's contracts as tests
- If the provider changes break a consumer contract, tests fail before deployment

Best for: microservices, separate frontend/backend teams, or any system where the API producer and consumer are developed independently.

### Coverage Strategy — In Depth

#### Coverage Targets by Layer

Coverage targets should vary by the criticality and testability of each layer:

| Layer | Coverage Target | Rationale |
|-------|----------------|-----------|
| Domain logic (pure business rules) | 90-100% branch | Business rules are the core value; they must be correct |
| API endpoints | 80-90% branch | Integration tests cover happy path and major error paths |
| UI components | 70-80% branch | Component tests cover rendering and interaction |
| Infrastructure (adapters, config) | 50-70% line | Low logic density; over-testing adds maintenance burden |
| Generated code | 0% | Don't test generated code; test the generator |

#### Meaningful vs. Vanity Coverage

**Meaningful coverage** tests behavior that could break:
- Branch coverage (both sides of every `if` statement)
- Boundary value testing (0, 1, N, max, max+1)
- Error path coverage (every `catch` block has a test that triggers it)

**Vanity coverage** inflates the number without adding value:
- Testing that a constructor sets properties (tests language features, not logic)
- Testing obvious delegation (service calls repository, returns result)
- Achieving 100% line coverage by testing every getter/setter

### Mutation Testing

Mutation testing introduces small changes (mutations) to production code and checks whether tests detect them. If a mutation survives (tests still pass), the tests are weak.

Common mutations:
- Flipping `>` to `>=`
- Changing `&&` to `||`
- Replacing a return value with `null`
- Removing a function call

Tools: Stryker (JavaScript/TypeScript), mutmut (Python), PITest (Java).

Use mutation testing periodically (not on every CI run — it's slow) to assess test suite quality.

### Quality Gates — Detailed

#### Pre-Commit Checks

Run on every commit (should complete in <10 seconds):

- **Linting:** Code style violations (ESLint, Ruff, ShellCheck)
- **Type checking:** Static type errors (TypeScript compiler, mypy)
- **Formatting:** Code formatting (Prettier, Black, gofmt)

These are fast, catch obvious mistakes, and prevent noisy diffs in PRs.

#### CI Pipeline Checks

Run on every push and PR (should complete in <5 minutes):

- **All pre-commit checks** (redundant but catches bypassed hooks)
- **Unit tests** with coverage report
- **Integration tests** with test database
- **Build verification** (the application compiles and builds successfully)
- **Security audit** (dependency vulnerability scan)

#### Pre-Merge Requirements

Before a PR can be merged:

- All CI checks pass
- Code review approved (by human or AI reviewer)
- No merge conflicts
- Branch is up-to-date with main (or rebased)

#### Performance Benchmarks (Optional)

For performance-critical applications:

- Benchmark tests run in CI
- Results compared against baseline
- Significant regressions (>10% degradation) block merge
- Baselines updated when intentional changes affect performance

### Test Data Management

#### Fixtures

Static test data stored in files or constants. Best for:
- Reference data (country lists, category hierarchies, status enums)
- Large datasets for performance tests
- Complex object graphs that are tedious to construct in code

```typescript
// fixtures/users.ts
export const validUser = {
  email: 'test@example.com',
  displayName: 'Test User',
  password: 'SecurePassword123!',
};

export const adminUser = {
  ...validUser,
  email: 'admin@example.com',
  role: 'admin',
};
```

#### Factories

Functions that generate test data with sensible defaults and selective overrides. Best for:
- Creating many variations of the same entity
- Ensuring test data is always valid
- Keeping tests focused on what varies (not boilerplate setup)

```typescript
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    email: `user-${randomId()}@example.com`,
    displayName: 'Test User',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage: only specify what matters for this test
const suspendedUser = createUser({ status: 'suspended' });
```

#### Seeds

Initial data loaded into the test database for integration tests. Rules:
- Seed data represents realistic scenarios (not just one record per table)
- Seed data is idempotent (safe to run twice)
- Seed data is minimal (only what tests need; don't replicate production)
- Seed data includes edge cases (user with no orders, order with many items)

#### Test Database Management

**Transaction rollback pattern:** Each test runs inside a database transaction that is rolled back after the test. Fast, clean, but doesn't test commit behavior.

**Truncate-and-seed pattern:** Before each test (or test suite), truncate all tables and re-seed. Slower but tests real commit behavior.

**Dedicated test database:** Each test run creates a fresh database. Slowest but most isolated.

**Recommendation:** Use transaction rollback for unit-level database tests. Use truncate-and-seed for integration test suites. Use dedicated databases for CI.

### Common Pitfalls

**Testing implementation details.** "Verify that `_processPayment` was called with exactly these parameters." This test breaks whenever the internal implementation changes, even if the observable behavior is unchanged. Fix: test the observable outcome, not the internal mechanism.

**Flaky tests.** Tests that pass sometimes and fail other times. Common causes: time-dependent logic, race conditions, shared mutable state, network dependencies, random ordering. Fix: each flaky test is a bug. Fix the root cause (mock time, eliminate shared state, isolate network calls) or delete the test. Never ignore flaky tests.

**Slow test suites.** A test suite that takes 20 minutes to run discourages running tests frequently. Common causes: E2E tests doing unit-level work, no test parallelization, unnecessary database setup per test, sleeping in tests. Fix: move fine-grained logic tests to unit level. Parallelize test execution. Use transaction rollback instead of database recreation.

**Testing through the UI for logic tests.** An E2E test that clicks through a form to verify that email validation works. This is a unit test masquerading as an E2E test — it's 100x slower and 10x more fragile. Fix: test validation logic with a unit test. Use E2E only for verifying the full user flow.

**No test data strategy.** Tests that create data inline with inconsistent formats, duplicate setup logic, and fragile assumptions. Fix: use factories for all test data. Define fixtures for static reference data. Establish seed data for integration tests.

**100% coverage as a goal.** Pursuing 100% line coverage leads to tests that test trivial code, tests that are coupled to implementation, and team resistance to writing more tests. Fix: set meaningful coverage targets per layer. Focus on branch coverage over line coverage. Use mutation testing to assess quality.

**Testing the framework.** "Test that the Express router returns 404 for an undefined route." This tests Express, not your code. Fix: test your handlers, your middleware, your business logic. Assume the framework works correctly.

**Skipped tests accumulate.** Tests marked as `skip` or `xit` that are never re-enabled. They represent either dead code or known bugs that nobody addresses. Fix: skipped tests are technical debt. Set a policy: fix or delete within one sprint.

**No test naming convention.** Test descriptions like "test 1," "works correctly," or "handles the thing." Uninformative when tests fail. Fix: test names should describe the scenario and expected outcome: "returns 404 when user does not exist," "applies 10% discount for premium members."

### From Acceptance Criteria to Test Cases

Acceptance criteria are the bridge between user stories and automated tests. Every AC should produce one or more test cases with clear traceability.

#### Given/When/Then to Arrange/Act/Assert

The mapping is direct:

- **Given** (precondition) becomes **Arrange** — set up test data, mock dependencies, configure state
- **When** (action) becomes **Act** — call the function, hit the endpoint, trigger the event
- **Then** (expected outcome) becomes **Assert** — verify return value, check database state, assert response body

```typescript
// AC: Given a user with 5 failed login attempts,
//     When they attempt a 6th login,
//     Then the account is locked and they see "Account locked"
it('locks account after 5 failed attempts', async () => {
  // Arrange: create user with 5 failed attempts
  const user = await createUser({ failedAttempts: 5 });
  // Act: attempt login
  const res = await request(app).post('/login').send({ email: user.email, password: 'wrong' });
  // Assert: locked
  expect(res.status).toBe(423);
  expect(res.body.error.message).toContain('Account locked');
});
```

#### One AC, Multiple Test Cases

Each AC produces at minimum one happy-path test. Then derive edge cases:

- **Boundary values**: If the AC says "max 50 characters," test 49, 50, and 51
- **Empty/null inputs**: If the AC assumes input exists, test what happens when it does not
- **Concurrency**: If the AC describes a state change, test what happens with simultaneous requests

#### Negative Case Derivation

For every "Given X" in an AC, systematically test "Given NOT X":

- AC says "Given user is authenticated" — test unauthenticated access (expect 401)
- AC says "Given the order exists" — test with nonexistent order ID (expect 404)
- AC says "Given valid payment details" — test with expired card, insufficient funds, invalid CVV

#### Parameterized Tests for Similar ACs

When multiple ACs follow the same pattern with different inputs, use data-driven tests:

```typescript
it.each([
  ['empty email', { email: '', password: 'valid' }, 'Email is required'],
  ['invalid email', { email: 'notanemail', password: 'valid' }, 'Invalid email format'],
  ['short password', { email: 'a@b.com', password: '123' }, 'Password too short'],
])('rejects registration with %s', async (_, input, expectedError) => {
  const res = await request(app).post('/register').send(input);
  expect(res.status).toBe(400);
  expect(res.body.error.message).toContain(expectedError);
});
```

#### Test Naming for Traceability

Test names should mirror the AC wording so that when a test fails, the team can trace it back to the requirement without reading the test body:

- AC: "User sees error when email is already taken" — Test: `'returns 409 when email is already taken'`
- AC: "Profile updates immediately after save" — Test: `'updates profile and reflects changes on next fetch'`
- Include the story or AC ID in the describe block when practical: `describe('US-002: Edit profile', () => { ... })`

## See Also

- [api-design](../core/api-design.md) — Contract testing patterns
