---
description: "Generate test skeletons from user story acceptance criteria"
long-description: "Parses user stories and creates tagged, pending test cases for every acceptance criterion — one test file per story, one test case per AC — in the project's own test framework. Produces a traceability matrix mapping stories to test files."
---

Parse `docs/user-stories.md` and generate test skeleton files with tagged, pending test cases for every acceptance criterion. Each story gets its own test file. Each AC becomes a test case tagged with story and AC IDs. All tests are created as pending/skipped — developers implement them during TDD execution.

## Mode Detection

Before starting, check if `tests/acceptance/` directory already exists:

**If the directory does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the directory exists → UPDATE MODE**:
1. **Read & analyze**: Read existing test files and `docs/story-tests-map.md`. Check for tracking comment: `<!-- scaffold:story-tests v<ver> <date> -->`.
2. **Diff against current stories**: Compare existing test files against current `docs/user-stories.md`. Categorize:
   - **ADD** — New stories or new ACs not yet in test files
   - **PRESERVE** — Test cases with implementation (no longer `.skip()`)
   - **ORPHAN** — Test files for stories that no longer exist (flag, don't delete)
3. **Preview changes**: Present summary table. Wait for approval.
4. **Execute update**: Add new test files/cases. Never delete or overwrite implemented test logic. Never remove a user's test implementation to replace with `.skip()`.
5. **Update tracking**: `<!-- scaffold:story-tests v<ver> <date> -->` on line 1 of `docs/story-tests-map.md`

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `tests/acceptance/` directory
- **Secondary output**: `docs/story-tests-map.md`
- **Preserve**: All implemented test logic (anything not `.skip()`), user-added test files, custom assertions
- **Related docs**: `docs/user-stories.md`, `docs/tdd-standards.md`, `docs/tech-stack.md`
- **Special rules**: Never overwrite implemented test cases. Only add new pending cases for new ACs. If a story was removed from user-stories.md, flag its test file as orphaned but don't delete.

---

## Required Reading

Read ALL of these before generating test skeletons:

| Document | What to Extract |
|----------|----------------|
| `docs/user-stories.md` | Every story and its acceptance criteria (Given/When/Then) |
| `docs/tdd-standards.md` | Test framework, naming conventions, file structure, mocking strategy |
| `docs/tech-stack.md` | Language, test runner, assertion library |
| `docs/coding-standards.md` | Naming conventions for test files and test cases |
| `docs/project-structure.md` | Where test files live, co-location vs. mirror directory |
| `docs/system-architecture.md` | Component/layer structure for test layer assignment |
| `docs/api-contracts.md` *(if exists)* | Endpoint details for API-focused ACs |
| `docs/database-schema.md` *(if exists)* | Data model context for data-focused ACs |
| `docs/ux-spec.md` *(if exists)* | Component hierarchy for UI-focused ACs |

---

## What to Generate

### 1. Test Skeleton Files

Create one test file per user story in `tests/acceptance/`:

**File naming**: `{story-id}-{slug}.test.{ext}`
- Example: `us-001-user-login.test.ts`, `us-012-order-checkout.test.ts`
- Extension matches project's test framework from `docs/tech-stack.md`

**Structure** (TypeScript/vitest example):

```typescript
// tests/acceptance/us-001-user-login.test.ts
// @story US-001
// @feature User Authentication

describe('US-001: As a user, I can log in with email and password', () => {

  describe('AC-1: Valid credentials', () => {
    it.skip('[US-001:AC-1] should authenticate user with valid email and password', () => {
      // Given a registered user with email "user@example.com" and password "Secure123!"
      // When they submit the login form with valid credentials
      // Then they receive a session token
      // And they are redirected to the dashboard
    });
  });

  describe('AC-2: Invalid credentials', () => {
    it.skip('[US-001:AC-2] should show error for invalid credentials', () => {
      // Given a visitor with incorrect password
      // When they submit the login form
      // Then they see "Invalid email or password" error
      // And no session is created
    });
  });

  describe('AC-3: Account lockout', () => {
    it.skip('[US-001:AC-3] should lock account after 5 failed attempts', () => {
      // Given a user who has entered wrong password 4 times
      // When they fail a 5th time
      // Then the account is locked for 15 minutes
      // And they see "Account locked" message
    });
  });

});
```

**Structure** (Python/pytest example):

```python
# tests/acceptance/test_us_001_user_login.py
# @story US-001
# @feature User Authentication

import pytest

class TestUS001UserLogin:
    """US-001: As a user, I can log in with email and password"""

    class TestAC1ValidCredentials:
        """AC-1: Valid credentials"""

        @pytest.mark.skip(reason="pending implementation")
        def test_us_001_ac_1_authenticates_with_valid_credentials(self):
            """[US-001:AC-1] should authenticate user with valid email and password
            Given a registered user with email and password
            When they submit the login form with valid credentials
            Then they receive a session token
            And they are redirected to the dashboard
            """
            pass

    class TestAC2InvalidCredentials:
        """AC-2: Invalid credentials"""

        @pytest.mark.skip(reason="pending implementation")
        def test_us_001_ac_2_shows_error_for_invalid_credentials(self):
            """[US-001:AC-2] should show error for invalid credentials"""
            pass
```

### 2. Test Layer Assignment

For each AC, determine the appropriate test layer based on what the AC tests:

| AC Type | Test Layer | Signal |
|---------|-----------|--------|
| API endpoint behavior | Integration test | AC mentions HTTP methods, status codes, endpoints |
| UI interaction | Component/E2E test | AC mentions clicking, seeing, navigating, forms |
| Business rule/calculation | Unit test | AC mentions validation, calculation, transformation |
| Data persistence | Integration test | AC mentions saving, retrieving, database operations |
| Cross-system flow | E2E test | AC spans multiple components or services |
| Error/edge case | Same layer as happy path | AC is a negative case for an existing flow |

When an AC clearly belongs in a layer other than acceptance, create the skeleton in the appropriate test directory (e.g., `tests/integration/`, `tests/unit/`, `tests/e2e/`) following the project's conventions from `docs/tdd-standards.md`. Always keep the story-level acceptance test skeleton in `tests/acceptance/` as the canonical mapping.

### 3. Traceability Matrix

Create `docs/story-tests-map.md`:

```markdown
<!-- scaffold:story-tests v1 YYYY-MM-DD -->
# Story-to-Test Traceability Matrix

## Coverage Summary
- Total stories: N
- Total acceptance criteria: N
- Test files generated: N
- Test cases generated: N (N pending, N implemented)

## Story → Test File Mapping

| Story ID | Story Title | Test File | ACs | Layer |
|----------|-------------|-----------|-----|-------|
| US-001 | User can log in | us-001-user-login.test.ts | 3 | integration |
| US-002 | User can register | us-002-user-register.test.ts | 5 | integration |
| US-003 | View dashboard | us-003-view-dashboard.test.ts | 4 | e2e |

## AC → Test Case Mapping

| Story | AC | Test Case | Status | Layer |
|-------|----|-----------|--------|-------|
| US-001 | AC-1 | [US-001:AC-1] authenticate with valid credentials | pending | integration |
| US-001 | AC-2 | [US-001:AC-2] show error for invalid credentials | pending | integration |
| US-001 | AC-3 | [US-001:AC-3] lock account after 5 failed attempts | pending | integration |

## Uncovered (if any)
List any ACs that couldn't be mapped to a test case, with rationale.
```

---

## Tag Format

Every generated test case MUST include a tag for downstream traceability:

- **Test case tag**: `[US-xxx:AC-y]` in the test description/name
- **Story tag**: `@story US-xxx` as a comment at the top of the test file
- **Feature tag**: `@feature Feature Name` as a comment (from PRD feature mapping)

These tags are consumed by:
- `create-evals` coverage checks — verifies every AC has a tagged test
- `implementation-plan` task decomposition — references test files per task
- `implementation-plan-review` — verifies test coverage is complete

---

## What This Step Does NOT Do

- **Does NOT implement test logic** — all test cases are `skip()`/`pending`. Developers fill them in during TDD execution.
- **Does NOT replace TDD** — this step creates the structure; TDD creates the implementation.
- **Does NOT validate tests pass** — pending tests can't pass. They're a roadmap.
- **Does NOT limit creativity** — developers can add tests beyond ACs; these are the minimum.
- **Does NOT create functional tests** — unit/integration/e2e test implementation belongs in the implementation phase, not here.

---

## Process

1. **Read `docs/user-stories.md`** — Extract every story with its acceptance criteria
2. **Read `docs/tdd-standards.md` and `docs/tech-stack.md`** — Determine test framework, naming conventions, file locations
3. **Read `docs/system-architecture.md`** — Understand layers for test assignment
4. **Use AskUserQuestionTool** for:
   - **Which stories to include?** All stories, or Must-have only (MVP)?
   - **Include negative test cases?** Generate negative/boundary test skeletons for every happy path AC?
   - **Layer splitting?** Create separate unit/integration/e2e files in addition to acceptance skeletons?
5. **Generate test skeleton files** — One per story, tagged test cases per AC
6. **Assign test layers** — Based on AC type and architecture
7. **Create `docs/story-tests-map.md`** — Full traceability matrix
8. **Verify no duplicate story files** — If a story already has a test file (update mode), add new ACs only
9. If using Beads: create and close a task for this work

---

## After This Step

When this step is complete, tell the user:

---
**Story test skeletons created** — `tests/acceptance/` contains tagged, pending test cases for every acceptance criterion. `docs/story-tests-map.md` documents the full traceability matrix.

**Next:**
- Run `/scaffold:review-testing` — Review test strategy including the generated skeletons.
- Or continue to `/scaffold:create-evals` — The coverage eval will now use story test tags for precise AC-to-test verification.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
