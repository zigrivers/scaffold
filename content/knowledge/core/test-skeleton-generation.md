---
name: test-skeleton-generation
description: Patterns for translating acceptance criteria into framework-specific test skeleton files
topics: [testing, test-generation, acceptance-criteria, tdd, test-skeletons]
---

# Test Skeleton Generation

This knowledge covers the translation of user story acceptance criteria (Given/When/Then format) into framework-specific test skeleton files. Skeletons are pending/skipped test stubs — they document expected behavior and provide a TDD starting point, but contain no implementation logic.

This is distinct from testing strategy (`testing-strategy`), which covers overall test architecture, and user stories (`user-stories`), which covers story authoring. This knowledge bridges the two: given well-written ACs and a chosen test framework, produce a complete set of traceable test skeletons.

## Summary

- **Purpose**: Translate user story acceptance criteria (Given/When/Then) into pending test cases in the project's test framework, one test per AC.
- **Output format**: One test file per story (or per epic), with each AC as a pending/skipped test case that documents the expected behavior without implementing it.
- **Framework mapping**: `describe` = story, `it`/`test` = AC criterion. For frameworks without pending support, use `it.skip` or `@pytest.mark.skip` with the AC text as the test name.
- **Layer assignment**: Each test skeleton is tagged with its execution layer (unit, integration, e2e) based on what the AC tests — data validation = unit, API flow = integration, user workflow = e2e.
- **ID tracing**: Every test name includes the story ID and criterion ID (e.g., `US-3.2: Given a logged-in user...`) so implementation agents can trace tests back to requirements.
- **Story-tests-map**: A traceability matrix (`docs/story-tests-map.md`) maps every story to its test files, every AC to its test case, and assigns execution layers.

## Deep Guidance

### Scope Boundary

**In scope:**
- Translating GWT acceptance criteria into pending test stubs
- Assigning test execution layers (unit, integration, e2e)
- Creating the story-tests-map traceability matrix
- Framework-specific skeleton patterns (vitest, pytest, bats, Go, etc.)
- Test file naming and directory conventions

**Out of scope:**
- Implementing test logic (skeletons are stubs only)
- Choosing the test framework (read `docs/tech-stack.md`)
- Writing acceptance criteria (that's the user stories step)
- Test infrastructure setup (that's the TDD standards step)

---

### Translation Rules

**Given/When/Then to Test Structure:**

The GWT format maps directly to the Arrange/Act/Assert pattern used in every test framework:

```
Given [precondition]     ->  test setup / arrange
When [action]            ->  act / trigger
Then [expected outcome]  ->  assert / verify
And [additional outcome] ->  additional assertion
```

Multiple `Given` clauses become multiple setup steps. Multiple `Then` clauses become multiple assertions in the same test. `And` following a `Given` is another precondition; `And` following a `Then` is another assertion.

**Compound ACs:**

When an AC has multiple `When` clauses, each `When` is a separate test case. The common `Given` preconditions are shared setup (a `beforeEach` or fixture), and each `When/Then` pair becomes its own test.

---

### Framework-Specific Patterns

#### vitest / jest (TypeScript/JavaScript)

```typescript
import { describe, it } from 'vitest';

describe('US-3: User can reset their password', () => {
  it.skip('AC-3.1: Given a registered user, when they request a password reset, then a reset email is sent', () => {
    // Arrange: registered user exists
    // Act: request password reset
    // Assert: reset email sent
  });

  it.skip('AC-3.2: Given a valid reset token, when the user submits a new password, then the password is updated', () => {
    // Arrange: valid reset token exists
    // Act: submit new password
    // Assert: password updated in database
  });

  it.skip('AC-3.3: Given an expired reset token, when the user submits a new password, then an error is shown', () => {
    // Arrange: expired reset token
    // Act: submit new password
    // Assert: error message displayed, password unchanged
  });
});
```

#### pytest (Python)

```python
import pytest

class TestUS3UserCanResetPassword:
    """US-3: User can reset their password"""

    @pytest.mark.skip(reason="skeleton")
    def test_ac_3_1_given_registered_user_when_request_reset_then_email_sent(self):
        """AC-3.1: Given a registered user, when they request a password reset, then a reset email is sent"""
        # Arrange: registered user exists
        # Act: request password reset
        # Assert: reset email sent
        pass

    @pytest.mark.skip(reason="skeleton")
    def test_ac_3_2_given_valid_token_when_submit_password_then_updated(self):
        """AC-3.2: Given a valid reset token, when the user submits a new password, then the password is updated"""
        # Arrange: valid reset token exists
        # Act: submit new password
        # Assert: password updated in database
        pass
```

#### bats (Bash)

```bash
# US-3: User can reset their password

@test "AC-3.1: Given a registered user, when they request a password reset, then a reset email is sent" {
  skip "skeleton"
  # Arrange: registered user exists
  # Act: request password reset
  # Assert: reset email sent
}

@test "AC-3.2: Given a valid reset token, when the user submits a new password, then the password is updated" {
  skip "skeleton"
  # Arrange: valid reset token exists
  # Act: submit new password
  # Assert: password updated in database
}
```

#### Go testing

```go
func TestUS3_UserCanResetPassword(t *testing.T) {
    t.Run("AC-3.1: Given a registered user, when they request a password reset, then a reset email is sent", func(t *testing.T) {
        t.Skip("skeleton")
        // Arrange: registered user exists
        // Act: request password reset
        // Assert: reset email sent
    })

    t.Run("AC-3.2: Given a valid reset token, when the user submits a new password, then the password is updated", func(t *testing.T) {
        t.Skip("skeleton")
        // Arrange: valid reset token exists
        // Act: submit new password
        // Assert: password updated in database
    })
}
```

### Framework-Specific Summary Table

| Framework | Story Group | Test Case | Pending Marker |
|-----------|------------|-----------|----------------|
| vitest/jest | `describe('US-3: Story title')` | `it('AC-3.1: Given X when Y then Z')` | `it.skip(...)` or `it.todo(...)` |
| pytest | `class TestUS3StoryTitle:` | `def test_ac_3_1_given_x_when_y_then_z(self):` | `@pytest.mark.skip(reason='skeleton')` |
| bats | comment block with story ID | `@test "AC-3.1: Given X when Y then Z"` | `skip "skeleton"` |
| Go testing | `func TestUS3_StoryTitle(t *testing.T)` | `t.Run("AC-3.1: Given X when Y then Z", ...)` | `t.Skip("skeleton")` |
| RSpec | `describe 'US-3: Story title'` | `it 'AC-3.1: ...'` | `xit 'AC-3.1: ...'` or `pending` |
| JUnit 5 | `@Nested class US3_StoryTitle` | `@Test @Disabled("skeleton")` | `@Disabled("skeleton")` |

---

### Layer Assignment Heuristic

Each test skeleton is tagged with its execution layer. This determines where the test runs in CI and what infrastructure it requires.

| AC Pattern | Layer | Example |
|------------|-------|---------|
| Validates input/output of a single function | Unit | "Then the email format is validated" |
| Tests interaction between components | Integration | "Then the order is saved to the database" |
| Tests a user-visible workflow end-to-end | E2E | "Then the user sees a confirmation page" |
| Tests error handling at a boundary | Integration | "Then a 400 error is returned with details" |
| Tests a non-functional requirement | Varies | Perf = benchmark, security = integration |

#### Layer Decision Rules

When the layer is ambiguous, apply these rules in order:

1. **Does the AC mention a UI element or user-visible state?** → E2E
2. **Does the AC cross a service or component boundary?** → Integration
3. **Does the AC test a single function's behavior with known inputs/outputs?** → Unit
4. **Does the AC test data persistence or retrieval?** → Integration
5. **Does the AC test an external service interaction?** → Integration (with mocks)

#### Layer Tags in Test Files

Add layer tags as comments or test metadata so CI can filter by layer:

```typescript
// @layer: integration
describe('US-3: User can reset their password', () => { ... });
```

```python
@pytest.mark.integration
class TestUS3UserCanResetPassword:
    ...
```

---

### Test File Naming and Organization

#### File Naming Convention

Test files follow the pattern: `{story-id}-{slug}.test.{ext}`

Examples:
- `us-1-user-registration.test.ts`
- `us-2-password-reset.test.ts`
- `us-3-profile-management.test.ts`

The story ID prefix ensures files sort in story order. The slug provides human-readable context.

#### Directory Structure

Test skeletons go in the acceptance test directory defined in `docs/project-structure.md`. If no convention exists, default to:

```
tests/
  acceptance/
    us-1-user-registration.test.ts
    us-2-password-reset.test.ts
    us-3-profile-management.test.ts
```

For projects that split tests by layer:

```
tests/
  unit/
    us-1-user-registration.unit.test.ts
  integration/
    us-1-user-registration.integration.test.ts
  e2e/
    us-1-user-registration.e2e.test.ts
```

---

### Story-Tests-Map Format

The `docs/story-tests-map.md` output maps every story to its test files. This is the primary traceability artifact.

```markdown
# Story-Tests Map

## Coverage Summary

| Metric | Value |
|--------|-------|
| Total stories | 12 |
| Stories with tests | 12 |
| Total ACs | 47 |
| ACs with test cases | 47 |
| Coverage | 100% |

## Traceability Matrix

| Story ID | Story Title | Test File | Layer | AC Count |
|----------|------------|-----------|-------|----------|
| US-1 | User registration | tests/acceptance/us-1-registration.test.ts | integration | 4 |
| US-2 | Password reset | tests/acceptance/us-2-password-reset.test.ts | e2e | 3 |
| US-3 | Profile management | tests/acceptance/us-3-profile.test.ts | unit | 5 |
```

The map must be updated whenever stories are added, removed, or have ACs changed. In update mode, new rows are appended and the coverage summary is recalculated.

---

### Handling Edge Cases

#### Stories Without GWT Format

If acceptance criteria are not in Given/When/Then format, convert them:
- "Users can search by keyword" → "Given a user on the search page, when they enter a keyword and submit, then matching results are displayed"
- Preserve the original AC text as a comment in the test case

#### Stories With Many ACs

Stories with more than 10 ACs may indicate the story is too large. Flag this in the story-tests-map but generate all skeletons regardless — the story decomposition is a separate concern.

#### Shared Preconditions

When multiple ACs share the same `Given` precondition, use the framework's shared setup:
- vitest/jest: `beforeEach` or `beforeAll`
- pytest: `@pytest.fixture`
- bats: `setup()`
- Go: helper function called at the start of each subtest

#### Negative Test Cases

For deep methodology, generate negative test cases for each happy-path AC:
- "Given X, when Y, then Z" → also generate "Given NOT X, when Y, then error"
- Negative cases get their own AC IDs: `AC-3.1-NEG`

---

### Anti-Patterns

- Don't implement test logic — skeletons are pending/skipped stubs only
- Don't combine multiple ACs into one test — one AC = one test case
- Don't omit the story/criterion ID from test names — traceability is the point
- Don't guess the test framework — read `docs/tech-stack.md` and `docs/tdd-standards.md`
- Don't create test files outside the project's test directory convention
- Don't add assertion logic to skeletons — that's the implementation agent's job
- Don't generate skeletons for non-functional requirements unless they have explicit ACs
- Don't skip the story-tests-map — it's the verification artifact that proves coverage
