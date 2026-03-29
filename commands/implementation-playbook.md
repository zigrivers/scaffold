---
description: "Create the playbook that AI agents follow during implementation"
long-description: "Writes the playbook agents reference during every coding session — task execution order, which docs to read before each task, the TDD loop to follow, quality gates to pass, and the handoff format between agents."
---

## Purpose
Create the implementation playbook — the operational document that AI agents
reference during implementation. Defines task ordering, context requirements
per task, coding standards, git workflow (branching/PR strategy), handoff
format between agents, and success criteria.

## Inputs
- docs/implementation-plan.md (required) — tasks to sequence
- docs/system-architecture.md (required) — architecture context
- docs/tdd-standards.md (required) — testing requirements
- tests/acceptance/ (required if exists) — test skeletons agents implement during TDD
- docs/story-tests-map.md (required if exists) — story-to-test mapping for progress tracking
- tests/evals/ (required if exists) — project eval checks to run as quality gates
- docs/eval-standards.md (required if exists) — what evals check and what they don't
- docs/plan.md (optional) — PRD for requirement traceability
- docs/user-stories.md (optional) — acceptance criteria source
- docs/database-schema.md (optional) — for data-layer task context
- docs/api-contracts.md (optional) — for API endpoint task context
- docs/ux-spec.md (optional) — for UI task context
- docs/design-system.md (optional) — for styling task context
- docs/security-review.md (optional) — for security control task context
- docs/operations-runbook.md (optional) — for deployment task context
- docs/onboarding-guide.md (optional — not available in MVP) — agents should read for project context before playbook
- All other frozen artifacts

## Expected Outputs
- docs/implementation-playbook.md — agent implementation playbook

## Quality Criteria
- (mvp) Task execution order is clear and respects dependencies
- (deep) Each task has context requirements (which docs to read before starting)
- (mvp) Coding standards are defined (naming, patterns, error handling)
- (mvp) Git workflow is defined (branching strategy, commit format, PR process)
- (mvp) Success criteria per task (how to know it's done)
- (deep) Handoff format between agents (what to communicate when passing work)
- (mvp) Quality gates are defined (what must pass before a task is complete)
- (mvp) Test skeleton discovery: playbook instructs agents to check docs/story-tests-map.md before writing new tests
- (mvp) Dependency-failure recovery: playbook documents what to do when a task's upstream dependency is blocked
- (deep) Quality gates include `make eval` (or equivalent) as a required check when eval tests exist
- (deep) Agent workflow references test skeleton implementation from tests/acceptance/
- (deep) Handoff format includes at minimum: implementation summary, assumptions made, known limitations, gotchas, and files modified

## Methodology Scaling
- **deep**: Full playbook. Detailed coding standards, git workflow with
  examples, per-task context briefs, inter-agent communication protocol,
  rollback procedures for failed tasks.
- **mvp**: Minimal playbook with task execution order, basic coding conventions
  reference, commit format, and quality gate commands from CLAUDE.md. Skip
  per-task context blocks, wave assignments, and inter-agent handoff format.
  Reference docs/coding-standards.md and docs/tdd-standards.md directly.
- **custom:depth(1-5)**: Depth 1: task execution order and commit format only. Depth 2: add basic coding conventions reference and quality gate commands. Depth 3: add per-task context requirements, wave assignments, and quality gates per wave. Depth 4: add inter-agent communication protocol, handoff format, and error recovery procedures. Depth 5: full playbook with rollback procedures, eval integration, and per-task minimum context blocks.

## Mode Detection
Check if `docs/implementation-playbook.md` already exists.
- If exists: UPDATE MODE — read current playbook, identify changes in implementation plan or upstream docs, update per-task context blocks and wave assignments while preserving completed task status and agent allocation history.
- If not: FRESH MODE — generate from scratch using implementation plan and all supporting docs.

## Update Mode Specifics

- **Detect**: `docs/implementation-playbook.md` exists with tracking comment
- **Preserve**: Completed task statuses, agent handoff notes, established patterns, quality gate results
- **Triggers**: New tasks added, wave assignments changed, quality gate definitions updated
- **Conflict resolution**: New tasks append to existing waves; never remove completed task records

---

## Domain Knowledge

### implementation-playbook

*Structuring work for AI agents — task execution, coding standards, git workflow, quality gates*

# Implementation Playbook

The implementation playbook is the definitive reference for AI agents executing implementation tasks. It covers how agents pick and execute work, what coding standards they must follow, how they use git, how they hand off work, and what quality gates must pass before a task is considered complete.

This is the most critical finalization document. If the onboarding guide tells agents "what this project is," the playbook tells them "how to do the work."

## Summary

## Task Execution Protocol

### How Agents Pick Work

1. **Check for available tasks.** Query the task management system for unblocked, unclaimed tasks.
2. **Claim the task.** Mark the task as claimed with the agent's identity. This prevents two agents from working on the same task.
3. **Read the task brief.** Each task should have a context brief listing what to read, what patterns to follow, and what the expected output is.
4. **Verify dependencies are complete.** Before starting, confirm that all tasks this one depends on are actually done — code is merged, migrations are applied, APIs are available.
5. **Start implementation.** Follow the coding standards, patterns, and conventions documented below.
6. **Run quality gates.** Before marking complete, run all quality checks.
7. **Submit for review.** Create a pull request following the git workflow.
8. **Hand off.** After merge, update the task status and record any notes for downstream tasks.

### Task Size Guidelines

A well-sized task is:
- **Completable in a single session** — If a task takes more than one work session, it is too large.
- **Independently verifiable** — You can run tests and confirm the task works without completing other tasks.
- **Reviewable in one sitting** — A PR should be reviewable in under 30 minutes.

**If a task is too large,** split it before starting. Common splits:
- Backend + frontend → separate tasks
- Data model + API + UI → separate tasks per layer
- Multiple endpoints → one task per endpoint (or per resource if closely related)
- Feature + tests → do NOT split these. Every task includes its own tests.

### Context Requirements

Each task should specify its context brief — the minimum set of documents an agent needs to read before implementing:

```markdown
## Task T-015: Implement User Registration Endpoint

### Context Brief
Read before starting:
- docs/api-contracts.md §2.1 (registration endpoint spec)
- docs/system-architecture.md §4.2 (auth service design)
- docs/database-schema.md §3.1 (users table)
- src/middleware/auth.ts (auth middleware pattern)
- src/handlers/health.handler.ts (handler pattern example)

### Acceptance Criteria
- POST /auth/register accepts {email, password}
- Returns 201 with {user, token} on success
- Returns 409 if email already exists
- Returns 422 for invalid input with field-level errors
- Password is hashed with bcrypt (cost factor 12)
- Registration event is logged
- Tests cover all response codes
```

If a task does not have a context brief, the agent should create one from the specification artifacts before starting.

### Minimum Context by Task Type

When a per-task context block is incomplete, agents should consult this taxonomy to ensure they have sufficient context:

**Before starting any task**, check `docs/story-tests-map.md` to find test skeletons for your task's user stories. If test skeletons exist, begin TDD with those pending tests rather than writing new ones.

| Task Type | Required Docs | Additional Context |
|-----------|--------------|-------------------|
| Backend API | `docs/api-contracts.md`, `docs/database-schema.md`, `docs/domain-models/`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/story-tests-map.md` | Relevant ADR for API style choices, `tests/acceptance/` skeletons |
| Frontend UI | `docs/ux-spec.md`, `docs/design-system.md`, `docs/api-contracts.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/story-tests-map.md` | Component patterns from design system, `tests/acceptance/` skeletons |
| Database migration | `docs/database-schema.md`, `docs/domain-models/`, `docs/operations-runbook.md`, `docs/story-tests-map.md` | Rollback strategy from ops runbook, `tests/acceptance/` skeletons |
| Infrastructure/CI | `docs/dev-setup.md`, `docs/git-workflow.md`, `docs/operations-runbook.md`, `docs/story-tests-map.md` | Deployment pipeline stages |
| Bug fix | Relevant source code, `docs/tdd-standards.md`, `docs/coding-standards.md`, `docs/story-tests-map.md` | Related test files, reproduction steps, `tests/acceptance/` skeletons |
| Security hardening | `docs/security-review.md`, `docs/api-contracts.md`, `docs/coding-standards.md`, `docs/story-tests-map.md` | OWASP checklist items from security review, `tests/acceptance/` skeletons |

## Deep Guidance

## Coding Standards

Coding standards ensure consistency across agents. Every agent must follow these conventions without exception. Inconsistency between agents produces a codebase that feels like it was written by different teams — because it was.

### Naming Conventions

**Files:**
- Use kebab-case for file names: `user-registration.handler.ts`, `order.service.ts`
- Test files mirror source files: `user-registration.handler.test.ts`
- One primary export per file. The file name should match the export name.
- Group by feature/domain, not by type (put `user.handler.ts`, `user.service.ts`, `user.repository.ts` together, not all handlers in one directory).

**Variables and functions:**
- Use camelCase for variables and functions: `getUserById`, `isAuthenticated`
- Use PascalCase for classes and types: `UserService`, `OrderStatus`
- Use UPPER_SNAKE_CASE for constants: `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`
- Boolean variables start with `is`, `has`, `can`, `should`: `isActive`, `hasPermission`
- Functions that return booleans match the same convention: `isValid()`, `canAccess()`
- Event handler functions start with `on` or `handle`: `onOrderCreated`, `handlePaymentFailed`

**Database:**
- Use snake_case for table and column names: `users`, `created_at`, `order_items`
- Table names are plural: `users`, `orders`, `products`
- Foreign key columns end with `_id`: `user_id`, `order_id`
- Boolean columns start with `is_` or `has_`: `is_active`, `has_verified_email`
- Timestamp columns end with `_at`: `created_at`, `updated_at`, `deleted_at`
- Index names follow the pattern: `idx_{table}_{columns}`: `idx_users_email`

**API:**
- Use kebab-case for URL paths: `/api/user-profiles`, `/api/order-items`
- Use camelCase for JSON field names: `{ "firstName": "...", "createdAt": "..." }`
- Resource names are plural: `/api/users`, `/api/orders`

These are defaults. The project's ADRs or specific style guide may override any of these. Always check the project-specific decisions first.

### Error Handling

**Principles:**
1. **Fail fast.** Validate inputs at the boundary (API handler). Do not pass invalid data through multiple layers before failing.
2. **Use typed errors.** Define custom error classes with error codes. Do not throw generic Error objects.
3. **Errors are data, not strings.** An error response has a code (machine-readable), a message (human-readable), and optionally field-level details.
4. **Handle errors at the right layer.** Domain logic throws domain errors. The handler catches and translates to HTTP responses. Do not mix HTTP concerns in domain logic.
5. **Never swallow errors.** Catch-and-ignore is a bug. If you catch an error, either handle it (retry, fallback, transform) or re-throw it.

**Error response format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Email is required" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  }
}
```

**HTTP status code mapping:**
| Error Type | HTTP Status | When |
|-----------|-------------|------|
| ValidationError | 422 | Input fails validation |
| NotFoundError | 404 | Requested entity does not exist |
| ConflictError | 409 | Duplicate or state conflict |
| AuthenticationError | 401 | Missing or invalid credentials |
| AuthorizationError | 403 | Valid credentials, insufficient permissions |
| RateLimitError | 429 | Too many requests |
| InternalError | 500 | Unexpected errors (log the full error, return generic message) |

### Logging

**What to log:**
- Every incoming request (method, path, status, duration)
- Every outgoing request to external services (target, duration, status)
- Every error (with stack trace for unexpected errors)
- Every significant business event (user registered, order placed, payment processed)
- Every state transition (order status change, account activation)

**What NOT to log:**
- Passwords, tokens, API keys, or any secrets
- Full request/response bodies for endpoints that handle PII
- Health check requests (too noisy)

**Log format:**
Use structured logging (JSON). Each log entry should include:
- `timestamp` — ISO 8601
- `level` — error, warn, info, debug
- `message` — Human-readable description
- `requestId` — Correlation ID from the request (for tracing)
- Context fields appropriate to the event

**Log levels:**
- `error` — Something is broken and needs attention. Trigger an alert.
- `warn` — Something unexpected happened but the system recovered. Review periodically.
- `info` — Normal operational events. Business events, request completion.
- `debug` — Detailed diagnostic information. Disabled in production.

### Import Ordering

Follow a consistent import order:
1. Standard library / runtime modules
2. Third-party packages (npm modules)
3. Internal modules (project code) — absolute paths
4. Relative imports (same module)

Separate each group with a blank line.

### File Structure

Each source file follows a consistent structure:
1. Imports
2. Type definitions (interfaces, types, enums)
3. Constants
4. Main export (class, function, or component)
5. Helper functions (private to this module)

## Git Workflow

### Branching Strategy

**Trunk-based development** is the default unless the project's ADRs specify otherwise.

- `main` is always deployable
- Feature branches are short-lived (merged within 1-2 days)
- Branch naming: `{type}/{task-id}-{brief-description}`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
  - Examples: `feat/T-015-user-registration`, `fix/T-042-cart-total-rounding`

### Commit Message Format

Follow the Conventional Commits specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`

**Scope:** The module or component affected. Use the short name: `auth`, `orders`, `cart`, `db`.

**Description:** Imperative mood, lowercase, no period. Describe WHAT changed, not HOW.

**Examples:**
```
feat(auth): add user registration endpoint

Implements POST /auth/register with email/password validation,
bcrypt password hashing, and JWT token generation.

Closes T-015
```

```
fix(cart): correct total calculation for discounted items

The discount was being applied to the original price instead of
the line item subtotal, causing overcharges on multi-quantity
discounted items.

Closes T-042
```

**Bad commit messages:**
- "fix stuff" (what stuff?)
- "WIP" (should not be merged)
- "updates" (meaningless)
- "Fixed the bug in the thing" (what bug? what thing?)

### Task ID in Commits

Every commit must reference a task ID. This maintains traceability from code back to requirements.

Format: Include `Closes T-XXX` or `[T-XXX]` in the commit message footer or body.

### PR Process

1. **Create the branch** from latest `main`.
2. **Implement the task.** Make focused commits — each commit should be atomic and meaningful.
3. **Run all quality gates** locally before pushing.
4. **Push the branch** and create a pull request.
5. **PR title** follows commit message format: `type(scope): description [T-XXX]`
6. **PR body** includes:
   - What changed and why
   - How to test it
   - Any follow-up work needed
   - Screenshots if UI changes (or description of visual changes)
7. **Wait for CI** to pass.
8. **Review and address feedback** — make new commits, do not force-push during review.
9. **Merge** using squash merge (single commit on main with clean history).
10. **Delete the branch** after merge.

### Merge Strategy

**Squash and merge** is the default. This produces a clean main branch history where each commit represents one completed task.

Exceptions:
- If a task has multiple meaningful commits that should be preserved, use rebase and merge.
- Never use merge commits (no `--no-ff`). They clutter the history.

### Rebasing

Before creating a PR, rebase on latest main:
```bash
git fetch origin
git rebase origin/main
```

If conflicts arise:
1. Resolve each conflict carefully.
2. Verify tests still pass after resolution.
3. Continue the rebase.

Do not blindly accept "theirs" or "ours" — each conflict needs thoughtful resolution.

## Quality Gates

Before a task is considered complete, all quality gates must pass.

### Gate 1: Tests Pass

```bash
make test                    # All tests pass
make test-coverage           # Coverage meets threshold
```

Every task must include tests for the code it adds or modifies:
- **Unit tests** for business logic (services, utilities)
- **Integration tests** for data access (repositories, database operations)
- **Handler tests** for API endpoints (request → response)
- **Component tests** for UI components (render + interaction)

### Gate 2: Lint and Type Check

```bash
make lint                    # No lint errors (warnings are allowed but discouraged)
make typecheck               # No type errors
```

Do not disable lint rules with `eslint-disable` unless the rule is genuinely wrong for that specific case, and add a comment explaining why.

### Gate 3: Build Succeeds

```bash
make build                   # Production build succeeds
```

> Commands shown here are examples. Use the actual commands from your project's CLAUDE.md Key Commands table.

If the build fails with warnings, investigate. Warnings often become errors in stricter environments.

### Gate 4: Manual Verification

For UI changes: visually verify the change works as specified. For API changes: test with curl or a REST client. For background jobs: trigger the job and verify the result.

Automated tests are necessary but not sufficient. Always verify the feature works end-to-end.

### Gate 5: No Regressions

Run the full test suite, not just the tests for the changed code. New code can break existing features through unexpected interactions.

### Gate 6: Evals

**Gate: Evals** — Run `make eval` (or project-equivalent from CLAUDE.md Key Commands). All eval checks must pass. If a specific eval fails, consult `docs/eval-standards.md` for category descriptions and resolution guidance.

Evals run collectively via `make eval`. If a specific eval category fails, consult `docs/eval-standards.md` for the category description and resolution approach.

## Inter-Agent Handoff

When one agent completes a task and another agent will build on it, the completing agent must communicate:

### What to Record in the Task Completion

1. **What was done** — Brief summary of the implementation approach. Not a code walkthrough, but enough for the next agent to understand the shape of the solution.
2. **What assumptions were made** — Any decision not explicitly in the specifications. "The spec said 'validate input' but did not specify max length. I used 255 characters for string fields."
3. **What is left** — Any known limitations, TODOs, or follow-up items. "Rate limiting is not implemented — depends on T-050."
4. **What to watch out for** — Any gotchas the next agent should know. "The User model has a `toJSON` method that strips sensitive fields — do not bypass it when returning user data."
5. **What files were modified** — List of files touched, so the next agent knows what to review.

### Handoff Format

```markdown
## Task T-015 Completion: User Registration Endpoint

### Summary
Implemented POST /auth/register. User creation, bcrypt hashing,
JWT generation, email uniqueness check. Handler, service, repository
layers with tests.

### Assumptions Made
- Max email length: 255 chars (not specified, matches RFC 5321)
- Password max length: 128 chars (bcrypt input limit)
- JWT expiry: 24 hours (not specified, used common default)

### Not Included
- Email verification flow (separate task T-016)
- Rate limiting on registration (depends on T-050)

### Watch Out
- UserRepository.create() throws ConflictError on duplicate email —
  the handler maps this to 409. Do not add a pre-check query;
  rely on the database unique constraint.

### Files Modified
- src/handlers/auth.handler.ts (new)
- src/services/auth.service.ts (new)
- src/repositories/user.repository.ts (new)
- src/routes/auth.routes.ts (new)
- src/errors/conflict.error.ts (new)
- prisma/migrations/001_create_users/ (new)
- tests/handlers/auth.handler.test.ts (new)
- tests/services/auth.service.test.ts (new)
```

## Working with Multiple Agents

When multiple agents work in parallel:

### Rules for Parallel Work

1. **Never work on the same file simultaneously.** If two tasks touch the same file, they must be sequenced, not parallelized.
2. **Rebase frequently.** Other agents are merging to main. Rebase before pushing to avoid conflicts.
3. **Claim tasks atomically.** Check-then-claim is a race condition. Use atomic claim operations.
4. **Communicate through the task system.** Do not assume another agent knows what you are doing. Update task status and completion notes.

### Conflict Resolution

When merge conflicts occur:
1. Read both sides of the conflict carefully.
2. Understand what the other agent changed and why.
3. Merge both changes (do not discard either side unless one is clearly wrong).
4. Run all tests after resolution.
5. If the conflict is complex (both sides restructured the same function), coordinate through the task system.

## Playbook Maintenance

The playbook is a living document. Update it when:
- A new pattern is established (add to coding standards)
- A common mistake is discovered (add to conventions or gotchas)
- The git workflow changes (branching strategy, merge approach)
- Quality gate thresholds change (coverage targets, lint rules)
- Agent coordination issues arise (add to parallel work rules)

The playbook should be the first document agents read before their first task, and the document they reference throughout implementation. If an agent asks a question that the playbook should answer, the answer goes in the playbook.

### Error Recovery

> The depth and specificity of error recovery guidance in CLAUDE.md depends on the `workflow-audit` step's methodology depth. At MVP depth, error recovery may be minimal.

When quality gates fail during implementation:

**Test failures:**
1. Read the failing test to understand the expected behavior
2. Check if the test is testing your change or pre-existing functionality
3. If your change broke the test: fix the implementation, not the test
4. If the test is wrong: document why and update the test with the fix
5. Re-run the full test suite, not just the failing test

**CI failures:**
1. Pull latest main and rebase your branch
2. Run `make check` locally to reproduce the failure
3. If the failure is environment-specific: check dev-setup.md for requirements
4. If the failure is a flaky test: document the flakiness and retry once

### Eval Failure Recovery

When `make eval` fails during implementation:

1. **Read the failing test name** — eval category names indicate what's wrong (e.g., `adherence` = coding standard violation, `consistency` = cross-document mismatch)
2. **Check `docs/eval-standards.md`** (if it exists) for category-specific guidance
3. **Common eval failures**:
   - **Adherence evals**: Code doesn't match coding-standards.md patterns. Fix: read the specific standard and adjust code.
   - **Consistency evals**: Document references are stale or contradictory. Fix: update the reference to match current state.
   - **Structure evals**: File/directory doesn't match project-structure.md. Fix: move files to correct location.
   - **Security evals**: Missing input validation or auth check. Fix: add the missing security control per security-review.md.
4. **If eval seems wrong**: Check if the eval itself is outdated. Flag for upstream review rather than working around it.

**Eval Failure → Root Cause Reference**:

| Eval Category | Root Cause Doc | What to Check |
|---------------|---------------|---------------|
| Adherence | `docs/coding-standards.md` | The specific pattern or convention that was violated |
| Consistency | Cross-doc references | Naming, paths, and commands match across all documents |
| Structure | `docs/project-structure.md` | File placement rules, directory conventions |
| Coverage | `docs/story-tests-map.md` | Missing acceptance-criteria-to-test mapping |
| Security | `docs/security-review.md` | The specific security control that was violated |

**Spec gap discovered during implementation:**
1. Document the gap with specific details (what's missing, what's needed)
2. Check if an ADR or architecture decision covers the case
3. If the gap is small: make a judgment call, document it in the commit message
4. If the gap is significant: pause the task and flag it for upstream resolution

**Agent produces incorrect output:**
1. Review the task description and acceptance criteria
2. Diff the output against the expected behavior
3. If the task description was ambiguous: improve it for future agents
4. Roll back the incorrect changes and retry with clearer context

### Dependency Failure

When a task's upstream dependency hasn't merged or has failed:

1. **Check the dependency task status** — Look at git branch status (`git log --oneline origin/main..origin/<branch>`), PR state (`gh pr view <branch>`), or the task tracking system (Beads `bd show <task-id>` / `docs/implementation-plan.md` status column) to determine whether the dependency is in-progress, merged, failed, or blocked.
2. **If in-progress**: Wait for it to merge. Do not start work that depends on uncommitted changes.
3. **If failed/blocked**: Flag for human review. The task may need to be reworked, reordered, or its dependency removed.
4. **If the dependency is in a different agent's worktree**: Coordinate via AGENTS.md or the task tracking system. Never duplicate work.
5. **Max wait**: If blocked for more than 30 minutes, find an unblocked task from the implementation plan and work on that instead. Do not idle.
6. **Escalation**: If no unblocked tasks remain, document the blocker in a PR comment (or Beads note) and notify via AGENTS.md or the project's communication channel so the blocker is visible to all agents and the project owner.

---

## After This Step

Continue with: `/scaffold:multi-agent-resume`, `/scaffold:multi-agent-start`, `/scaffold:new-enhancement`, `/scaffold:quick-task`, `/scaffold:single-agent-resume`, `/scaffold:single-agent-start`
