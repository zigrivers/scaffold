---
description: "Generate test skeletons from user story acceptance criteria"
long-description: "Generates a test skeleton file for each user story — one pending test case per acceptance criterion, tagged with story and criterion IDs — giving agents a TDD starting point for every feature."
---

## Purpose
Generate test skeleton files from user story acceptance criteria, creating a
direct, traceable link from every AC to a tagged test case. Each story produces
a test file with one test case per acceptance criterion, tagged with story and
AC IDs for downstream coverage verification. Test cases are created as
pending/skipped — developers implement them during TDD execution.

## Inputs
- docs/user-stories.md (required) — stories with acceptance criteria in GWT format
- docs/tdd-standards.md (required) — test framework, patterns, layer conventions
- docs/tech-stack.md (required) — language, test runner, assertion library
- docs/coding-standards.md (required) — test naming conventions
- docs/system-architecture.md (required) — component structure for layer assignment
- docs/project-structure.md (required) — test file location conventions
- docs/api-contracts.md (optional) — endpoint details for API test skeletons
- docs/database-schema.md (optional) — data layer context for integration tests
- docs/ux-spec.md (optional) — UI component context for component tests

## Expected Outputs
- tests/acceptance/{story-id}-{slug}.test.* — one test file per story with
  tagged pending test cases per AC
- docs/story-tests-map.md — traceability matrix mapping stories → test files,
  ACs → test cases, and layer assignments (unit/integration/e2e)

## Quality Criteria
- (mvp) Every Must-have user story has a corresponding test file
- (mvp) Every acceptance criterion has at least one tagged test case
- (mvp) Test cases are tagged with story ID and AC ID for traceability
- (deep) Test layer assignment: single-function ACs → unit; cross-component ACs → integration; full user journey ACs → e2e
- (mvp) Test files use the project's test framework from docs/tech-stack.md
- (mvp) All test cases are created as pending/skipped (or equivalent framework pause/skip mechanism) (not implemented)
- (mvp) docs/story-tests-map.md shows 100% AC-to-test-case coverage
- (mvp) Test file location follows conventions from docs/project-structure.md
- (deep) Test data fixtures and dependencies documented for each test file
- (deep) Each pending test case includes story ID and AC ID tags, GWT structure, and at least one assertion hint
- (mvp) If api-contracts.md does not exist, API test skeletons derived from user story acceptance criteria instead

## Methodology Scaling
- **deep**: All stories get test files. Negative test cases for every happy path
  AC. Boundary condition tests. Layer-specific skeletons (unit + integration +
  e2e where applicable). Traceability matrix with confidence analysis.
- **mvp**: Test files for Must-have stories only. One test case per AC. No
  layer splitting — all tests in acceptance/ directory.
- **custom:depth(1-5)**:
  - Depth 1: Must-have stories only, one test case per AC
  - Depth 2: Add Should-have stories
  - Depth 3: Add negative test cases for every happy-path AC
  - Depth 4: Add boundary condition tests and layer splitting (unit/integration/e2e)
  - Depth 5: Full suite — all stories including Could-have, edge cases, and confidence analysis in traceability matrix

## Mode Detection
Update mode if tests/acceptance/ directory exists. In update mode: add test
files for new stories, add test cases for new ACs in existing stories, never
delete user-implemented test logic (only add new pending cases). Update
docs/story-tests-map.md with new mappings.

## Update Mode Specifics
- **Detect prior artifact**: tests/acceptance/ directory exists with test files
- **Preserve**: all user-implemented test logic, existing test file names and
  structure, story ID and AC ID tags, traceability mappings in
  docs/story-tests-map.md
- **Triggers for update**: user stories added or changed acceptance criteria,
  architecture changed component structure (layer assignments may shift),
  tdd-standards.md changed test patterns or framework
- **Conflict resolution**: if a story's AC was reworded, update the test case
  description but preserve any implemented test body; if layer assignment
  changed, move the test case to the correct layer file

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

---

### user-stories

*Expert knowledge for translating product requirements into well-formed user stories*

# User Stories

Expert knowledge for translating product requirements into well-formed user stories with acceptance criteria, epic structure, and traceability.

## Summary

### Story Anatomy

**"As a [persona], I want [action], so that [outcome]."**

- **Persona** — the specific user role from the PRD, not "a user"
- **Action** — what the user wants to do, in their language
- **Outcome** — the value they get (the most important part)

Deviations: **System stories** for background processes ("When a payment fails, the system retries twice...") and **Constraint stories** for NFRs ("All API responses within 500ms at p95").

### INVEST Criteria

- **Independent** — can be developed without requiring another story first
- **Negotiable** — describes what/why, not how
- **Valuable** — delivers value to a user or stakeholder
- **Estimable** — specific enough to estimate effort
- **Small** — implementable in 1-3 focused agent sessions
- **Testable** — acceptance criteria have clear pass/fail outcomes

### Acceptance Criteria Format

Use Given/When/Then for scenarios:
```
Given [precondition/context]
When [action/trigger]
Then [expected outcome]
```

Include parameterized scenarios for role variations, negative scenarios for every happy path, and boundary conditions at edges.

**AC vs. Test Cases**: ACs define WHAT should happen (business-level). Test cases define HOW to verify (technical-level, derived during implementation).

## Deep Guidance

### Story Anatomy — Extended

**Good stories:**
- "As a teacher, I want to assign homework to a class, so that students have practice material outside of class."
- "As a new user, I want to see a guided tour on first login, so that I understand the core features without reading documentation."

**Bad stories:**
- "As a user, I want the system to work." — No specific persona, no specific action, no testable outcome.
- "As a developer, I want a REST endpoint for user creation." — Implementation story. The developer is not the user. Rewrite as: "As a new visitor, I want to create an account, so that I can save my preferences."
- "As a user, I want good performance." — Not actionable. Rewrite with specifics: "As a returning user, I want the dashboard to load within 2 seconds, so that I can start my daily workflow immediately."

**When to deviate from the template:**
- **System stories** describe behavior with no direct user action: "When a payment fails, the system retries twice with exponential backoff and notifies the user after final failure." These are acceptable for background processes, scheduled jobs, and automated workflows.
- **Constraint stories** capture non-functional requirements: "All API responses must complete within 500ms at p95 under normal load." These complement functional stories rather than replacing them.

### INVEST Criteria — Deep Dive

#### Independent

The story can be developed and delivered without requiring another story to be done first. Stories with hard dependencies should be split or reordered.

- **Pass:** "As a user, I want to search products by name" — works regardless of whether filtering or sorting stories are done.
- **Fail:** "As a user, I want to edit my profile photo" that silently depends on "As a user, I want to upload files" — if upload isn't done, this story is blocked.
- **Fix:** Make the dependency explicit and consider whether the stories should be combined or the shared functionality extracted.

#### Negotiable

The story describes what and why, not how. Implementation details are negotiated during development, not locked in the story.

- **Pass:** "As a user, I want to receive notifications about order status changes."
- **Fail:** "As a user, I want to receive WebSocket push notifications rendered as toast components in the bottom-right corner using the Sonner library."
- **Fix:** Move implementation details to technical notes. The story stays focused on user value.

#### Valuable

The story delivers value to a user or stakeholder. Every story should have a clear beneficiary.

- **Pass:** "As a shopper, I want to save items for later, so that I can return and purchase them without searching again."
- **Fail:** "As a developer, I want to refactor the authentication module." — No user value. This is a technical task, not a story.
- **Fix:** Frame technical work in terms of user value, or track it as a task rather than a story.

#### Estimable

The team (or agent) can estimate the effort. If a story is too vague to estimate, it needs more conversation or splitting.

- **Pass:** "As a user, I want to reset my password via email" — well-understood pattern, estimable.
- **Fail:** "As a user, I want AI-powered recommendations" — too vague. What data? What algorithm? What UI?
- **Fix:** Split into smaller, more specific stories until each is estimable.

#### Small

A story should be implementable in 1-3 focused agent sessions. Larger stories need splitting.

- **Pass:** "As a user, I want to update my display name."
- **Fail:** "As a user, I want a complete e-commerce checkout flow with cart, address, payment, confirmation, and order tracking."
- **Fix:** Split by workflow step: cart management, address entry, payment processing, order confirmation, order tracking.

#### Testable

Acceptance criteria have clear pass/fail outcomes. If you can't write a test for it, the story isn't ready.

- **Pass:** "Given a user with items in cart, when they click checkout, then they see the address form with their saved addresses pre-populated."
- **Fail:** "The checkout should be intuitive." — Not testable.
- **Fix:** Replace subjective language with observable behavior.

### Persona Definition

Personas are extracted from the PRD's user/stakeholder descriptions. Each persona is a specific user type with distinct goals, not a generic role label.

**Goal-driven personas vs. role labels:**
- Role label: "Admin" — too generic. What does the admin want?
- Goal-driven: "School Administrator (Ms. Chen) — manages teacher accounts, reviews class assignments, generates progress reports for the district. Goals: minimize time on administrative tasks, ensure compliance with district reporting requirements."

**When personas collapse:**
- If two personas have identical goals and workflows, they're the same persona. An "Admin" who is also a regular "User" is two personas only if their goals differ when wearing each hat.
- Don't create personas for system actors (database, scheduler, API consumer) — these are system stories, not persona stories.

**Persona template:**
- **Name** — a human name for memorability (e.g., "Alex the Admin")
- **Role** — their relationship to the product
- **Goals** — what they're trying to accomplish (2-3 primary goals)
- **Pain points** — what frustrates them today (informs acceptance criteria)
- **Context** — when, where, how they use the product (informs UX decisions)

### Epic Structure

Epics group related stories by user journey, not by system component.

**Group by journey, not by layer:**
- **Good:** "Account Setup" epic (registration, email verification, profile creation, preferences) — follows the user's path.
- **Bad:** "API Endpoints" epic (user CRUD, product CRUD, order CRUD) — groups by technical layer, not user value.

**Epic sizing:**
- A typical epic contains 3-8 stories. Fewer than 3 suggests the epic is too narrow — consider merging with a related epic. More than 8 suggests the epic covers too much — look for natural split points.

**When to split epics:**
- Different personas drive different parts of the epic
- The epic spans distinct phases of the user journey (onboarding vs. daily use vs. administration)
- Half the stories have no dependencies on the other half

**Epic naming:**
- Use verb phrases that describe the user goal: "Managing Team Members," "Processing Payments," "Onboarding New Users."
- Avoid technical names: "REST API," "Database Layer," "Auth Module."

### Acceptance Criteria Patterns — Extended

#### Given/When/Then Format

The standard format for acceptance criteria scenarios:

```
Given [precondition/context]
When [action/trigger]
Then [expected outcome]
```

**Example:**
```
Given a registered user on the login page
When they enter valid credentials and click "Sign In"
Then they are redirected to the dashboard and see a welcome message with their name
```

#### Parameterized Scenarios

When the same behavior applies to multiple variations, use parameterized scenarios:

```
Given a user with role [admin | member | viewer]
When they access the settings page
Then they see [all settings | team settings only | read-only view]
```

#### Negative Scenarios

Every happy path should have corresponding error scenarios:

```
Given a registered user on the login page
When they enter an incorrect password
Then they see "Invalid credentials" and the password field is cleared
And after 5 failed attempts, the account is locked for 15 minutes
```

#### Boundary Conditions

Test edges, not just middles:

```
Given a user creating a project name
When they enter exactly 100 characters (the maximum)
Then the name is accepted
When they enter 101 characters
Then they see "Name must be 100 characters or fewer" and the extra character is rejected
```

#### Acceptance Criteria vs. Test Cases

- **Acceptance criteria** define WHAT should happen (business-level behavior)
- **Test cases** define HOW to verify it (technical-level steps)
- Stories contain acceptance criteria. Test cases are derived later during implementation.

### Story Splitting Heuristics

When a story is too large, use these patterns to split it into smaller, independently valuable stories.

#### By Workflow Step

Before: "As a user, I want to complete the checkout process."
After:
- "As a shopper, I want to review my cart before checkout."
- "As a shopper, I want to enter my shipping address."
- "As a shopper, I want to select a payment method and pay."
- "As a shopper, I want to see an order confirmation."

#### By Data Variation

Before: "As a user, I want to create posts."
After:
- "As a user, I want to create text posts."
- "As a user, I want to create posts with images."
- "As a user, I want to create posts with embedded videos."

#### By Operation (CRUD)

Before: "As an admin, I want to manage users."
After:
- "As an admin, I want to invite new users."
- "As an admin, I want to view the user list with search and filters."
- "As an admin, I want to edit user roles."
- "As an admin, I want to deactivate user accounts."

#### By User Role

Before: "As a user, I want to access the dashboard."
After:
- "As a team member, I want to see my assigned tasks on the dashboard."
- "As a team lead, I want to see team progress metrics on the dashboard."
- "As an admin, I want to see system health and usage stats on the dashboard."

#### By Happy/Sad Path

Before: "As a user, I want to upload a document."
After:
- "As a user, I want to upload a PDF or Word document."
- "As a user, I want to see clear error messages when upload fails (wrong format, too large, network error)."

### Scope Boundaries

Every story should explicitly state what it does NOT include to prevent scope creep.

**Format:**
```
**Scope Boundary:** This story does NOT include:
- Bulk assignment (covered by US-045)
- Email notifications for assignments (covered by US-023)
- Grading submitted assignments (separate epic)
```

**Why scope boundaries matter:**
- During implementation, agents can confidently stop when they hit a boundary
- Stories that overlap are discovered early (and consolidated or clarified)
- Scope boundaries flow downstream into task boundaries

**Relationship to MoSCoW:**
- "Won't" items in MoSCoW are scope boundaries at the PRD level
- Story-level scope boundaries are more granular — they clarify what THIS story excludes even if another story covers it

### PRD-to-Story Traceability

Every PRD feature must map to at least one user story. This is a non-negotiable coverage requirement.

**How to ensure coverage:**
1. Extract every distinct feature and requirement from the PRD
2. For each, identify the corresponding user story or stories
3. Flag any PRD feature with no story — these are coverage gaps
4. Flag any story that doesn't trace back to a PRD feature — these may be scope creep

**Handling compound requirements:**
- PRD: "Users can create, edit, and delete projects." → Split into 3 stories (one per operation).
- PRD: "The system supports SSO and email/password authentication." → Two stories (one per auth method).

**Surfacing implicit requirements:**
- Every user action that can fail needs an error handling story or acceptance criteria
- Every data entry point needs validation acceptance criteria
- Accessibility requirements (keyboard navigation, screen readers) apply to all UI stories
- Loading states, empty states, and offline behavior are often implied but not stated

**Traceability notation:**
- Use IDs to create a traceable chain: PRD-REQ-001 → US-001 → (downstream: Task BD-42)
- Story IDs (US-001, US-002, ...) are stable — they persist through updates and are referenced by downstream phases

### Story Dependencies

Some stories must be implemented before others. Document these explicitly.

**Blocked-by vs. informed-by:**
- **Blocked-by:** Story B cannot start until Story A is complete. A produces something B requires (a database table, an API endpoint, a shared component).
- **Informed-by:** Story B benefits from knowing how Story A was implemented, but can proceed independently with reasonable assumptions.

Only blocked-by dependencies should be formal constraints. Informed-by relationships are noted but don't block.

**How dependencies feed into task decomposition:**
- Story dependencies become task dependencies in the implementation tasks step
- Chains of 3+ dependent stories should be reviewed — long chains limit parallelization
- If many stories depend on the same story, that story is on the critical path and should be prioritized

**Keeping dependency chains short:**
- If Story C depends on B which depends on A, ask: can C depend directly on A instead? Can C's dependency be satisfied with a mock or interface?
- Extract shared infrastructure into its own story at the front of the chain rather than letting it hide inside a feature story

### Common Pitfalls

#### Implementation Stories
- **Problem:** "As a developer, I want a REST endpoint for user CRUD."
- **Fix:** Rewrite from the user's perspective: "As a new visitor, I want to create an account with my email." The REST endpoint is an implementation detail, not a user story.

#### Stories Too Large
- **Problem:** A story with 10+ acceptance criteria spanning multiple workflows.
- **Fix:** Split using the heuristics above. Each resulting story should have 3-5 acceptance criteria.

#### Vague Acceptance Criteria
- **Problem:** "The feature works correctly and is user-friendly."
- **Fix:** Replace with Given/When/Then scenarios. Define "correctly" and "user-friendly" in observable terms.

#### Missing Personas
- **Problem:** Stories reference undefined personas ("a power user," "the operator").
- **Fix:** Map back to PRD personas. If the PRD doesn't define this persona, either add it to the PRD or use an existing persona.

#### Stories Without Value Statements
- **Problem:** "As a user, I want to click the submit button."
- **Fix:** Add the "so that" clause: "As a user, I want to submit my feedback form, so that the support team can address my issue."

#### Duplicate Stories Across Epics
- **Problem:** "Upload profile photo" appears in both "Account Setup" and "Profile Management" epics.
- **Fix:** Choose one epic. Add a scope boundary in the other epic referencing the canonical story.

#### Confusing Acceptance Criteria with Implementation Steps
- **Problem:** "1. Create a POST /api/users endpoint. 2. Validate email format with regex. 3. Hash password with bcrypt."
- **Fix:** These are implementation steps, not acceptance criteria. Rewrite as: "Given a valid email and password, when the user submits registration, then their account is created and they receive a confirmation email."

---

## After This Step

Continue with: `/scaffold:create-evals`
