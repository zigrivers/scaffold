---
name: tdd-execution-loop
description: Red-green-refactor execution cycle for AI agents
topics: [tdd, execution, testing, workflow]
---

# TDD Execution Loop

Expert knowledge for the core TDD execution loop that AI agents follow during implementation. This defines the disciplined red-green-refactor cycle, commit timing, and test-first practices that ensure every change is verified before it ships.

## Summary

### Red-Green-Refactor Cycle

```
  RED         GREEN        REFACTOR
  Write a  →  Write the  →  Clean up
  failing     minimal       without
  test        code to       changing
              pass it       behavior
```

Each cycle produces one small, verified increment of functionality.

### Commit Timing

- **Commit after green** — every passing test is a safe checkpoint
- **Commit after refactor** — clean code locked in before the next feature
- **Never commit red** — a failing test in history breaks bisect and reverts

### Test-First Discipline

- Always write the test before the implementation
- Verify the test actually fails (red) before writing production code
- A test that never failed might not be testing anything meaningful

## Deep Guidance

### Red-Green-Refactor Cycle — Extended

#### Red Phase: Write a Failing Test

Write a test that describes the next small piece of behavior you want to add. Run it and confirm it fails. The failure message should clearly indicate what is missing.

**Key rules:**
- The test must fail for the right reason (missing function, wrong return value — not a syntax error or import failure)
- Write only one test at a time — don't batch multiple behaviors into a single red phase
- The test name should describe the expected behavior: `returns 404 when user not found`, not `test user endpoint`

#### Green Phase: Minimal Implementation

Write the smallest amount of production code that makes the failing test pass. Do not add logic for future tests, handle edge cases you haven't tested yet, or optimize.

**Key rules:**
- If you can make the test pass by returning a hard-coded value, that's valid — the next test will force generalization
- Don't refactor during the green phase — just make it pass
- Run the full relevant test suite (not just the new test) to confirm you haven't broken anything

#### Refactor Phase: Clean Up

With all tests green, improve the code's structure, readability, and design without changing its behavior. The tests are your safety net.

**Common refactors:**
- Extract duplicate code into helper functions
- Rename variables and functions for clarity
- Simplify conditionals
- Move code to better locations (closer to where it's used)

**Key rules:**
- All tests must remain green throughout refactoring
- If a refactor breaks a test, undo and take a smaller step
- Commit after a successful refactor before starting the next red phase

### When to Commit

| Event | Commit? | Why |
|-------|---------|-----|
| Test goes green | Yes | Safe checkpoint with verified behavior |
| Refactor complete, tests still green | Yes | Lock in clean code |
| Test is red (failing) | No | Broken state in history breaks bisect |
| Mid-implementation, nothing passes yet | No | Partial work has no verified value |
| Multiple tests green at once | Yes | But prefer smaller commits |

Ideal commit cadence: every 5-15 minutes during active TDD. If you haven't committed in 30 minutes, you're taking too large a step.

### PR Creation Patterns

- **One PR per task** — a PR should map to a single task, story, or unit of work
- **Descriptive titles** — `feat(auth): add password reset flow` not `auth changes`
- **Test evidence in description** — include which tests were added, what they cover, and that they pass
- **Link to task ID** — reference the task, story, or issue that motivated the work
- **Small PRs** — prefer 50-200 lines changed; split larger work into sequential PRs

### Test-First Discipline — Extended

**Why test-first matters:**
- Forces you to think about the interface before the implementation
- Prevents writing untestable code (if you can't test it first, the design needs work)
- Creates a failing test that proves your test actually exercises the code path
- Produces a test suite where every test has been observed to fail — higher confidence

**Common violations to avoid:**
- Writing implementation first, then adding tests after (tests may not cover the actual behavior)
- Writing a test that passes immediately (it might be testing the wrong thing)
- Skipping the red step "because you know the implementation is correct" (hubris)

### Handling Flaky Tests

Flaky tests — tests that pass sometimes and fail other times — are bugs. Treat them with urgency.

**Investigation steps:**
1. Run the test in isolation 10 times to confirm flakiness
2. Check for common causes: time-dependent logic, race conditions, shared mutable state, network calls, random data
3. Fix the root cause, don't add retries

**Never:**
- Add `retry(3)` to make a flaky test pass — this hides the bug
- Mark as `skip` without filing a tracking issue
- Ignore flaky tests in CI — they erode trust in the entire suite

### Slow Test Suites

When the full test suite takes too long for rapid TDD:

**During development:**
- Run only the focused subset (tests for the module you're changing)
- Use test runner watch mode to re-run on file change
- Tag tests by level (unit, integration, e2e) and run only unit during red-green-refactor

**Before PR creation:**
- Run the full test suite locally
- Confirm CI will run the complete suite
- Don't submit a PR if you haven't verified the full suite passes

**Reducing suite time:**
- Move logic tests from integration/e2e to unit level
- Parallelize test execution
- Use transaction rollback instead of database recreation
- Profile the slowest tests and optimize or split them

### Test Isolation

Each test must be independent — it should pass or fail regardless of what other tests run before it, after it, or alongside it.

**Rules:**
- No shared mutable state between tests (global variables, class-level state, database rows from a previous test)
- Each test sets up its own preconditions and cleans up after itself
- Tests should pass when run individually, in any order, or in parallel
- Use `beforeEach`/`setUp` for common setup, not test-to-test data flow
- Avoid `beforeAll`/`setUpClass` unless the shared resource is truly read-only

**Detecting isolation violations:**
- Run tests in random order — if they fail, they have hidden dependencies
- Run a single test in isolation — if it fails only when run alone, it depends on setup from another test

### When to Stop and Ask

TDD assumes clear requirements. When requirements are unclear, continuing to write tests is wasteful. Stop and ask when:

- **Unclear requirements** — the acceptance criteria are ambiguous or contradictory
- **Architectural ambiguity** — you're unsure which module should own the behavior
- **Conflicting documentation** — the PRD says one thing, the user stories say another
- **Scope creep** — the task is growing beyond what was originally planned
- **Blocked by another task** — you need output from a task that hasn't been completed yet
- **Unfamiliar domain** — you don't understand the business rules well enough to write a meaningful test

Document what you know, what you don't, and what decision you need — then ask.

## See Also

- [testing-strategy](../core/testing-strategy.md) — Test pyramid, coverage strategy, quality gates
- [task-claiming-strategy](./task-claiming-strategy.md) — Task selection and dependency awareness
