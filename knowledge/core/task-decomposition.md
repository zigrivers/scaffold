---
name: task-decomposition
description: Breaking architecture into implementable tasks with dependency analysis and agent context
topics: [tasks, decomposition, dependencies, user-stories, parallelization, sizing, critical-path]
---

# Task Decomposition

Expert knowledge for breaking user stories into implementable tasks with dependency analysis, sizing, parallelization, and agent context requirements.

## Summary

### Story-to-Task Mapping

User stories bridge PRD features and implementation tasks. Each story decomposes into tasks following the technical layers needed. Every task must trace back to a user story, and every story to a PRD feature (PRD Feature → US-xxx → Task BD-xxx).

### Task Sizing

Each task should be completable in a single AI agent session (30-90 minutes of agent time). A well-sized task has a clear title (usable as commit message), touches 1-5 files, produces a testable result, and has no ambiguity about "done."

Split large tasks by layer (API, UI, DB, tests), by feature slice (happy path, validation, edge cases), or by entity. Combine tiny tasks that touch the same file and have no independent value.

### Dependency Types

- **Logical** — Task B requires Task A's output (endpoint needs DB schema)
- **File contention** — Two tasks modify the same file (merge conflict risk)
- **Infrastructure** — Task requires setup that must exist first (DB, auth, CI)
- **Knowledge** — Task benefits from understanding gained in another task

Only logical, file contention, and infrastructure dependencies should be formal constraints.

### Definition of Done

1. Acceptance criteria from the user story are met
2. Unit tests pass (for new logic)
3. Integration tests pass (for API endpoints or component interactions)
4. No linting or type errors
5. Code follows project coding standards
6. Changes committed with proper message format

## Deep Guidance

### From Stories to Tasks — Extended

> **Note:** User stories are created as an upstream artifact in the pre-pipeline phase and available at `docs/user-stories.md`. This section covers how to consume stories and derive implementation tasks from them.

User stories bridge the gap between what the business wants (PRD features) and what developers build (implementation tasks). Every PRD feature maps to one or more user stories (created in the pre-pipeline), and every user story should map to one or more implementation tasks.

**Feature -> Story mapping:**

A PRD feature like "User can manage their profile" becomes multiple stories:

```
US-001: As a user, I can view my profile information
US-002: As a user, I can edit my display name and bio
US-003: As a user, I can upload a profile picture
US-004: As a user, I can change my password
US-005: As a user, I can delete my account
```

Each story focuses on a single capability from the user's perspective. The INVEST criteria validate the decomposition:

- **Independent:** Each story can be implemented and delivered without requiring another story to be complete (ideally)
- **Negotiable:** The implementation approach is open to discussion; the story defines what, not how
- **Valuable:** Each story delivers something the user can see, do, or benefit from
- **Estimable:** The team can roughly estimate the effort
- **Small:** Completable in 1-3 focused implementation sessions
- **Testable:** Acceptance criteria define unambiguous pass/fail conditions

### Writing Acceptance Criteria

Acceptance criteria are the bridge between stories and tests. They must be specific enough that pass/fail is unambiguous:

**Good acceptance criteria (Given/When/Then format):**

```
Story: US-002 - Edit display name and bio

AC-1: Given I am on my profile page,
      When I click "Edit Profile",
      Then I see editable fields for display name and bio
      And the fields are pre-populated with my current values

AC-2: Given I have modified my display name,
      When I click "Save",
      Then my profile updates immediately
      And I see a success notification "Profile updated"
      And navigating away and returning shows the updated name

AC-3: Given I enter a display name longer than 50 characters,
      When I try to save,
      Then I see an error "Display name must be 50 characters or fewer"
      And the form is not submitted

AC-4: Given I click "Edit Profile" and then "Cancel",
      When I return to view mode,
      Then no changes are saved
      And my original values are displayed
```

**Bad acceptance criteria:**
- "Profile editing works correctly" — untestable
- "User can edit their profile" — restates the story title
- "Handle errors gracefully" — what errors? What does gracefully mean?

### Story to Task Mapping

Each user story decomposes into implementation tasks. The decomposition follows the technical layers needed:

```
US-002: Edit display name and bio

Tasks:
1. feat(api): implement PATCH /api/v1/users/:id endpoint with validation
   - Accepts: { displayName?, bio? }
   - Validates: displayName max 50 chars, bio max 500 chars
   - Returns: updated user object
   - Test: integration test for endpoint (valid update, validation error, auth)

2. feat(ui): add profile edit form component
   - Form with display name and bio fields
   - Pre-populated with current values
   - Client-side validation matching API rules
   - Submit calls PATCH endpoint
   - Test: component test (render, validation, submit)

3. feat(ui): add profile edit page with state management
   - Edit/view mode toggle
   - Success notification on save
   - Cancel reverts to original values
   - Loading state during save
   - Test: integration test (full edit flow with mocked API)
```

### Maintaining Traceability

Every task must trace back to a user story, and every user story must trace to a PRD feature:

```
PRD Feature: User Profile Management
  -> US-002: Edit display name and bio
    -> Task BD-42: implement PATCH /api/v1/users/:id
    -> Task BD-43: add profile edit form component
    -> Task BD-44: add profile edit page with state management
```

This traceability ensures:
- No PRD feature is missed (coverage check)
- No orphan tasks exist (every task serves a purpose)
- Impact analysis is possible (changing a PRD feature reveals which tasks are affected)

### Task Sizing — Extended

#### Right-Sizing for Agent Sessions

Each task should be completable in a single AI agent session (typically 30-90 minutes of agent time). Tasks that are too large overflow the context window; tasks that are too small create unnecessary coordination overhead.

**A well-sized task:**
- Has a clear, specific title that could be a commit message
- Touches 1-5 files (not counting test files)
- Produces a testable, verifiable result
- Has no ambiguity about what "done" means
- Can be code-reviewed independently

**Size calibration:**

| Too Small | Right Size | Too Large |
|-----------|------------|-----------|
| "Add email field to User model" | "Implement user registration API endpoint with validation and tests" | "Build the entire auth system" |
| "Create Button component" | "Build form components (Input, Select, Textarea) with validation states" | "Create the full design system" |
| "Add index to users table" | "Create database schema for user management with migration" | "Set up the entire database" |

#### Splitting Large Tasks

When a task is too large, split along these axes:

**By layer (horizontal split):**
- Backend API endpoint
- Frontend component
- Database migration
- Integration test

**By feature slice (vertical split):**
- Core happy-path flow
- Validation and error handling
- Edge cases and special states
- Performance optimization

**By entity/scope:**
- User CRUD operations
- Order CRUD operations
- Payment processing

**Splitting signals:**
- The task description has "and" connecting unrelated work
- The task requires reading more than 3 existing documents for context
- The task involves more than 2 architectural boundaries (e.g., database + API + frontend + auth)
- You can't describe what "done" looks like in 2-3 sentences

#### Combining Small Tasks

If multiple tiny tasks touch the same file and have no independent value, combine them:

- "Add field X to model" + "Add field Y to model" + "Add field Z to model" -> "Create user profile model with all fields"
- "Add route A" + "Add route B" (same controller) -> "Implement routes for user profile management"

The test: would the small task result in a useful commit on its own? If not, combine.

### Dependency Analysis — Extended

#### Types of Dependencies

**Logical dependencies:** Task B requires Task A's output. The API endpoint task depends on the database schema task because the endpoint queries tables that must exist first.

**File contention dependencies:** Two tasks modify the same file. Even if logically independent, they'll produce merge conflicts if run in parallel. Sequence them.

**Infrastructure dependencies:** A task requires infrastructure (database, auth system, CI pipeline) that must be set up first. These are implicit dependencies that are easy to miss.

**Knowledge dependencies:** A task requires understanding gained from completing another task. The developer who builds the auth system understands the auth patterns needed by other features.

#### Building Dependency Graphs (DAGs)

A dependency graph is a directed acyclic graph (DAG) where:
- Nodes are tasks
- Edges point from dependency to dependent (A -> B means "A must complete before B can start")
- No cycles exist (a cycle means neither task can start)

**Process:**

1. List all tasks
2. For each task, identify what it needs that doesn't exist yet
3. Find or create the task that produces what's needed
4. Draw an edge from producer to consumer
5. Check for cycles (if A depends on B and B depends on A, something is wrong — split or reorganize)

#### Detecting Cycles

Cycles indicate a modeling problem. Common causes and fixes:

- **Mutual data dependency:** Service A needs data from Service B, and Service B needs data from Service A. Fix: extract the shared data into a separate task that both depend on.
- **Feature interaction:** Feature X needs Feature Y's component, and Feature Y needs Feature X's component. Fix: extract the shared component into its own task.
- **Testing dependency:** "Can't test A without B, can't test B without A." Fix: use mocks/stubs to break the cycle during testing. The integration test that tests both together becomes a separate task.

#### Finding Critical Path

The critical path is the longest chain of dependent tasks from start to finish. It determines the minimum project duration.

**To find the critical path:**

1. Assign estimated effort to each task
2. Trace all paths from start (no dependencies) to end (no dependents)
3. Sum the effort along each path
4. The longest path is the critical path

**Why it matters:**
- Tasks on the critical path cannot be parallelized — they directly determine project duration
- Delays on the critical path delay the entire project
- To shorten the project, focus on splitting or accelerating critical-path tasks
- Non-critical-path tasks have "float" — they can be delayed without affecting the project end date

#### Dependency Documentation

For each dependency, document:

| Dependency | Type | Reason | Risk |
|------------|------|--------|------|
| BD-10 -> BD-15 | Logical | BD-15 queries the users table created by BD-10 | Low — schema is stable |
| BD-12 -> BD-13 | File contention | Both modify src/routes/index.ts | Medium — merge conflict risk |
| BD-01 -> BD-* | Infrastructure | BD-01 sets up the database; everything needs it | High — blocks all work |

### Parallelization and Wave Planning

#### Identifying Independent Tasks

Tasks are safe to run in parallel when:
- They have no shared dependencies (no common prerequisite still in progress)
- They don't modify the same files (no merge conflict risk)
- They don't affect the same database tables (no migration conflicts)
- Their test suites don't share state (no test interference)

**Parallel-safe patterns:**
- Two features in separate directories (auth and billing)
- Frontend and backend tasks for different features
- Documentation tasks alongside implementation tasks
- Test infrastructure tasks alongside feature tasks (if different directories)

**Not parallel-safe:**
- Two tasks that both add routes to the same router file
- Two database migration tasks (migration ordering conflicts)
- Tasks that modify the same shared utility file
- Tasks where one produces test fixtures the other consumes

#### Managing Shared-State Tasks

When tasks must share state (database, shared configuration, route registry):

**Sequencing:** Add explicit dependencies so tasks run one after another. This is the safest approach.

**Interface agreement:** Tasks agree on an interface (API contract, database schema) before implementation. Both can work in parallel as long as neither deviates from the agreed interface.

**Feature flags:** Both tasks can merge independently. A feature flag controls which one is active. Integrate them in a separate task after both complete.

#### Merge Strategies for Parallel Work

When parallel tasks produce branches that must be merged to main:

- **Rebase before merge:** Each task rebases onto the latest main before creating a PR. This catches conflicts before they reach main.
- **First-in wins:** The first task to merge gets a clean merge. Subsequent tasks must rebase and resolve conflicts.
- **Minimize shared files:** Design the task decomposition to minimize file overlap. Feature-based directory structure helps enormously.

#### Wave Planning

Organize tasks into waves based on the dependency graph:

```
Wave 1 (no dependencies): Infrastructure setup, database schema, design system tokens
Wave 2 (depends on Wave 1): API endpoints, base components, auth middleware
Wave 3 (depends on Wave 2): Feature pages, integration tests, documentation
Wave 4 (depends on Wave 3): End-to-end tests, performance optimization, polish
```

Each wave's tasks can run in parallel. Wave N+1 starts only when all its dependencies in Wave N are complete. The number of parallel agents should match the number of independent tasks in the current wave.

### Agent Context Requirements

#### What Context Each Task Needs

Every task description should specify what documents and code the implementing agent needs to read:

```
Task: Implement user registration endpoint

Read before starting:
- docs/system-architecture.md — understand the API layer structure
- docs/coding-standards.md — error handling patterns, naming conventions
- docs/tdd-standards.md — integration test pattern for API endpoints
- src/features/auth/ — existing auth code (if any)
- src/shared/middleware/auth.ts — auth middleware interface

Produces:
- src/features/auth/controllers/register.controller.ts
- src/features/auth/services/register.service.ts
- src/features/auth/validators/register.validator.ts
- tests/features/auth/register.integration.test.ts
```

#### Handoff Information

When a task produces output that another task consumes, specify the handoff:

```
This task produces: POST /api/v1/auth/register
Contract:
  Request: { email: string, password: string, displayName: string }
  Response 201: { user: { id, email, displayName }, token: string }
  Response 400: { error: { code: "VALIDATION_ERROR", details: [...] } }
  Response 409: { error: { code: "ALREADY_EXISTS", message: "..." } }

Consuming tasks:
  BD-25 (registration page) will call this endpoint
  BD-30 (onboarding flow) expects the response shape above
```

#### Assumed Prior Work

Explicitly state what the agent can assume exists:

```
Assumes:
- Database is set up with migration infrastructure (BD-01, completed)
- Auth middleware exists at src/shared/middleware/auth.ts (BD-05, completed)
- Design system tokens are configured (BD-08, completed)

Does NOT assume:
- Users table exists (this task creates it)
- Any auth endpoints exist (this is the first)
```

### Common Pitfalls

**Tasks too vague.** "Implement backend" or "Set up auth" with no acceptance criteria, no file paths, and no test requirements. An agent receiving this task will guess wrong about scope, structure, and conventions. Fix: every task must specify exact files to create/modify, acceptance criteria, and test requirements.

**Missing dependencies.** Two tasks that modify the same file run in parallel and produce merge conflicts. Or a task tries to query a table that hasn't been created yet. Fix: explicitly map file ownership and identify all data dependencies before finalizing the task graph.

**Unrealistic parallelization.** Planning for 10 parallel agents when the dependency graph only allows 3 tasks at a time. Fix: analyze the dependency graph. The number of useful parallel agents equals the width of the widest wave.

**Giant foundation tasks.** "Set up everything: database, auth, API framework, shared types, error handling, logging, configuration" as a single task. This single task blocks all other work and is too large for a single agent session. Fix: split foundation into the smallest useful pieces — each should produce something that unblocks at least one other task.

**Testing as a separate phase.** All implementation tasks first, then "write all tests" as a final task. This violates TDD and produces lower-quality code. Fix: every implementation task includes its tests. The task isn't done until tests pass.

**No traceability.** Tasks exist in a task tracker with no link to user stories or PRD features. When a PRD feature changes, nobody knows which tasks are affected. Fix: every task references its user story. Every user story references its PRD feature.

**Premature shared utilities.** Creating "shared utility library" tasks before any feature needs them. This produces speculative abstractions that don't fit actual use cases. Fix: shared code emerges from feature work. Only create shared utility tasks after two or more features demonstrate the need.

**Ignoring the critical path.** Assigning agents to low-priority tasks while critical-path tasks wait for resources. Fix: always prioritize critical-path tasks. Non-critical tasks are parallelized around the critical path, not instead of it.
