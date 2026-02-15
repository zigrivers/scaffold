---
description: "Create TDD standards for the tech stack"
---

Deeply research test-driven development (TDD) best practices for our tech stack — review docs/tech-stack.md and docs/coding-standards.md — then create docs/tdd-standards.md as the definitive testing reference for this project.

This document will be referenced by AI agents during every implementation task. It needs to be prescriptive and concrete, not theoretical.

## What the Document Must Cover

### 1. TDD Workflow (the non-negotiable process)
- Define the exact Red → Green → Refactor cycle as it applies to our stack
- When to write unit tests vs integration tests vs e2e tests for a given change
- The rule: no implementation code exists without a failing test written first
- How to handle TDD when working with external APIs, databases, or third-party services

### 2. Test Architecture
- Directory structure and file naming conventions (mirror source structure? co-locate? — decide based on our stack's conventions)
- Test categorization: unit / integration / e2e — define the boundary for each
- What belongs in each category for our specific stack (e.g., "API route handlers get integration tests, utility functions get unit tests, critical user flows get e2e tests")
- Shared test utilities, factories, fixtures, and helpers — where they live and how to use them

### 3. Concrete Patterns for Our Stack
- Mocking strategy: what to mock, what NOT to mock, preferred mocking libraries
- Database testing: test database setup/teardown, seeding, transaction rollback patterns
- API testing: request/response testing patterns, authentication in tests
- Frontend testing (if applicable): component testing, user interaction simulation
- Async testing patterns specific to our stack
- Provide a **reference test example** for each test category showing the exact pattern to follow

### 4. AI-Specific Testing Rules
These are critical because AI agents make predictable testing mistakes:
- Never write tests that test the framework or library itself — only test OUR logic
- Never write trivial tests (e.g., testing that a constant equals itself)
- Tests must assert behavior, not implementation details — don't test that a specific internal method was called, test that the outcome is correct
- Every test must be able to fail meaningfully — if you can't describe a scenario where the test catches a real bug, delete it
- Test names must describe the behavior being tested: `should return 404 when session does not exist` not `test error case`
- No test should depend on another test's state or execution order
- When fixing a bug: write the failing test FIRST that reproduces the bug, then fix it

### 5. Coverage & Quality Standards
- Minimum coverage thresholds (suggest appropriate levels for our stack — 100% is usually wrong)
- What to measure: line coverage is table stakes, branch coverage matters more
- Areas that MUST have 100% branch coverage (e.g., authentication, payment, data validation)
- Areas where lower coverage is acceptable (e.g., configuration, generated code)
- How to run coverage reports with our stack's tooling

### 6. CI/Test Execution
- How tests should run (parallel? sequential? by category?)
- Expected test run time targets (fast feedback loop matters)
- What blocks a commit vs. what runs in CI only
- Flaky test policy: if a test fails intermittently, it's a bug — fix or delete it

### 7. E2E / Visual Testing

If this project uses browser testing (Playwright) or mobile testing (Maestro), those will be configured by separate setup prompts that will add E2E-specific sections to this document.

Placeholder — to be completed by:
- **Playwright Integration prompt** — for web apps (browser automation, visual verification)
- **Maestro Setup prompt** — for Expo/mobile apps (flow testing, screenshot verification)

Until those prompts run, E2E testing patterns are not yet defined. Focus TDD efforts on unit and integration tests.

## What This Document Should NOT Be
- A TDD textbook or history lesson — assume the reader knows what TDD is
- Generic advice that applies to any stack — everything should reference OUR specific tools and libraries
- Aspirational — only include standards we intend to enforce from day one

## Process
- Use subagents to research TDD best practices for our specific stack in parallel
- Review docs/user-stories.md to understand the types of features being built — this informs which testing patterns will be most relevant
- Use AskUserQuestionTool for decisions like coverage thresholds, test runner preferences, or e2e scope
- Include runnable example commands for running tests, checking coverage, and running specific test categories
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/tdd-standards.md` created.

**Next:** Run `/scaffold:project-structure` — Define and scaffold project directory structure.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
