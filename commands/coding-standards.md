---
description: "Create coding standards for the tech stack"
---

Deeply research best practices for coding standards for our tech stack — review docs/tech-stack.md — then create docs/coding-standards.md as the definitive code quality reference for this project.

This document will be referenced by AI agents during every implementation task. It needs to be prescriptive with concrete examples, not abstract principles.

## What the Document Must Cover

### 1. Project Structure & Organization
- Directory structure conventions — where each type of file lives
- Module/component organization pattern (feature-based? layer-based? — decide based on our stack's best practices)
- File naming conventions with explicit examples
- Import ordering rules
- Index/barrel file policy (use them or don't — be explicit)

### 2. Code Patterns & Conventions
- Naming conventions for variables, functions, classes, types, constants, database fields — with examples of good and bad for each
- Function/method guidelines: max length, single responsibility, parameter limits
- Error handling strategy: how to throw, catch, propagate, and log errors consistently across the codebase. Include the specific error patterns for our stack.
- Async patterns: preferred approach for our stack (async/await, promises, callbacks — pick one and ban the rest)
- State management patterns (if applicable)
- API response format: standardized success/error response shapes
- Environment variable and configuration management

### 3. Type Safety & Data Validation
- Type strictness level (e.g., TypeScript strict mode, Python type hints)
- Input validation strategy: where validation happens (API boundary? service layer? both?) and what library to use
- Null/undefined handling policy
- Type definition conventions: where types live, how they're shared between layers

### 4. Security Standards
- Input sanitization requirements
- Authentication/authorization patterns for our stack
- Secrets management: how to handle API keys, credentials, connection strings
- Common vulnerabilities to prevent for our stack (SQL injection, XSS, CSRF, etc.) with the specific defensive pattern to use for each
- Dependency security: policy on adding new packages, audit requirements

### 5. Database & Data Access
- ORM/query patterns: preferred approach for our stack
- Migration conventions: naming, structure, reversibility
- Query performance guidelines: N+1 prevention, indexing expectations
- Transaction handling patterns
- Seed data conventions

### 6. API Design (if applicable)
- RESTful conventions or GraphQL patterns for our stack
- Endpoint naming and versioning
- Request/response validation and serialization
- Pagination, filtering, sorting standards
- Rate limiting and error code conventions

### 7. Logging & Observability
- What to log: requests, errors, key business events
- What NEVER to log: PII, secrets, tokens, passwords
- Log levels and when to use each (debug, info, warn, error)
- Structured logging format for our stack

### 8. AI-Specific Coding Rules
These prevent the most common AI coding mistakes:
- No dead code, no commented-out code, no TODO comments without a Beads task ID
- No copy-paste duplication — extract shared logic immediately
- No magic numbers or strings — use named constants
- No overly clever code — optimize for readability over cleverness
- Don't import entire libraries when you need one function
- Don't create abstractions until you have 2+ concrete uses (no premature abstraction)
- Don't add features, utilities, or helpers that aren't required by the current task
- Every function must have a clear, single reason to exist — if you can't name it well, the abstraction is wrong
- Prefer explicit over implicit — no hidden side effects, no surprising default behavior

### 9. Commit Messages

Define the project's commit message format:

Format: `[BD-<id>] type(scope): description`

Examples:
- `[BD-42] feat(auth): add login endpoint`
- `[BD-42] fix(auth): handle expired tokens`
- `[BD-42] test(auth): add login validation tests`
- `[BD-42] refactor(auth): extract token validation`
- `[BD-42] docs(api): add endpoint documentation`
- `[BD-42] chore(deps): update dependencies`

Rules:
- Types: feat, fix, test, refactor, docs, chore
- The `[BD-<id>]` prefix is required — every commit must trace to a Beads task
- Special case: `[BD-0]` is used for project setup commits before real tasks exist (bootstrapping)
- Scope should be the feature or module being changed
- Description should be imperative ("add", "fix", "update" — not "added", "fixed", "updated")

This format is referenced by the git workflow, CLAUDE.md, and CI pipeline. It must be consistent everywhere.

### 10. Code Review Checklist

A quick-reference checklist AI agents should self-apply before marking a task complete:
- [ ] No linting or type errors
- [ ] All tests pass
- [ ] No hardcoded values that should be configuration
- [ ] Error cases handled, not just happy path
- [ ] No sensitive data exposed in logs or responses
- [ ] Function and variable names are descriptive and consistent
- [ ] No unnecessary dependencies added
- [ ] Changes are minimal — only what the task requires

## What This Document Should NOT Be
- A style guide for tabs vs. spaces — use a formatter/linter config file for that and reference it
- Generic advice — every standard should reference our specific stack, libraries, and tools
- Aspirational — only include standards we enforce from day one. If it's a nice-to-have, leave it out.

## Process
- Use subagents to research coding standards for each part of our stack in parallel
- If our stack includes a linter or formatter, create the config file(s) alongside the standards doc and reference them
- Review docs/plan.md to understand the application domain — this informs which patterns matter most (e.g., a real-time app needs different standards than a CRUD app)
- Use AskUserQuestionTool for architectural decisions like error handling strategy, validation approach, and strictness levels
- Include runnable example snippets showing the RIGHT way to do things in our stack — AI follows patterns better than prose
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/coding-standards.md` created with linter/formatter configs.

**Next:** Run `/scaffold:tdd` — Create TDD standards for the tech stack.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
