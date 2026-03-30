---
description: "Break deliverables into implementable tasks with dependencies, ordered by priority and dependencies"
long-description: "Breaks your user stories and architecture into concrete tasks — each scoped to ~150 lines of code and 3 files max, with clear acceptance criteria, no ambiguous decisions, and explicit dependencies."
---

## Purpose
Decompose user stories and system architecture into concrete, implementable
tasks suitable for AI agents. Each task should be independently executable,
have clear inputs/outputs, and be small enough for a single agent session.
The primary mapping is Story → Task(s), with PRD as the traceability root.

## Inputs
- docs/system-architecture.md (optional — not available in MVP) — components to implement
- docs/domain-models/ (optional — not available in MVP) — domain logic to implement
- docs/adrs/ (optional — not available in MVP) — technology constraints
- docs/plan.md (required) — features to trace tasks back to
- docs/user-stories.md (required) — stories to derive tasks from
- docs/tdd-standards.md (required) — testing requirements to incorporate into tasks
- docs/operations-runbook.md (optional) — ops requirements to incorporate into tasks
- docs/security-review.md (optional) — security requirements to incorporate into tasks
- docs/database-schema.md (optional) — data layer tasks
- docs/api-contracts.md (optional) — API implementation tasks
- docs/ux-spec.md (optional) — frontend tasks
- tests/acceptance/ (optional) — test skeletons to reference in task descriptions
- docs/story-tests-map.md (optional) — AC-to-test mapping for task coverage verification

## Expected Outputs
- docs/implementation-plan.md — task list with dependencies, sizing, and
  assignment recommendations

## Quality Criteria
- (deep) Every architecture component has implementation tasks
- (mvp) Every user story has implementation tasks
- (mvp) Task dependencies form a valid DAG (no cycles, verified by checking no task depends on a later-ordered task)
- (mvp) Each task produces 150 +/- 50 lines of net-new application code (excluding tests and generated files)
- (mvp) Tasks include acceptance criteria (how to know it's done)
- (mvp) Tasks incorporate testing requirements from the testing strategy
- (deep) Tasks reference corresponding test skeletons from tests/acceptance/ where applicable
- (deep) Tasks incorporate security controls from the security review where applicable
- (deep) Tasks incorporate operational requirements (monitoring, deployment) where applicable
- (deep) Parallelization opportunities are marked with wave plan
- (mvp) Every user story maps to >= 1 task
- (mvp) Every PRD feature maps to >= 1 user story, and every user story maps to >= 1 task (transitive traceability)
- (deep) High-risk tasks are flagged with risk type and mitigation
- (deep) Wave summary produced with agent allocation recommendation
- (mvp) No task modifies more than 3 application files (test files excluded; exceptions require justification)
- (mvp) No task contains unresolved design decisions (agents implement, they don't architect)
- (mvp) Every code-producing task includes co-located test requirements
- (deep) Critical path identified with estimated total duration

## Methodology Scaling
- **deep**: Detailed task breakdown with story-to-task tracing. Dependency graph.
  Sizing estimates. Parallelization plan. Agent context requirements per task.
  Phased delivery milestones.
- **mvp**: Ordered task list derived from PRD features and user stories only
  (architecture, domain models, and ADRs are not available at this depth).
  Each task has a brief description, rough size estimate, and key dependency.
  Enough to start working sequentially. Skip architecture decomposition —
  work directly from user story acceptance criteria.
- **custom:depth(1-5)**: Depth 1: ordered task list derived from PRD features only. Depth 2: ordered list with rough size estimates per task. Depth 3: add explicit dependencies and sizing (150-line budget, 3-file rule). Depth 4: full breakdown with dependency graph and parallelization plan. Depth 5: full breakdown with parallelization, wave assignments, agent allocation, and critical path analysis.

## MVP-Specific Guidance (No Architecture Available)

At MVP depth, the system architecture document does not exist. Task decomposition
must work directly from user stories without explicit component definitions.

**How to decompose stories into tasks without architecture:**

1. **Derive implicit layers from tech stack**: Read docs/tech-stack.md. For a web
   app: API layer (backend), UI layer (frontend), Data layer (database). Each
   story typically decomposes into one task per affected layer.

2. **Map each story to layers**: "User can register" → 3 tasks: API endpoint,
   UI form, database table. "User can view dashboard" → 2 tasks: API data
   endpoint, UI display component.

3. **Use acceptance criteria to define task boundaries**: Each AC (Given/When/Then)
   maps to test cases. Group test cases by layer. Each layer's test cases become
   one task.

   > **Note**: If user stories are one-liner bullets without Given/When/Then ACs (MVP depth 1–2), derive task boundaries directly from the story text instead: treat each story's success condition as defining one task scope. Infer implied acceptance criteria from the story description before decomposing into tasks.

4. **Order tasks by dependency**: Database migrations first, then API endpoints,
   then UI components (bottom-up).

5. **Split within layers when tasks exceed 150 lines**: Happy path in one task,
   validation/error handling in another, edge cases in a third.

## Mode Detection
Check for docs/implementation-plan.md. If it exists, operate in update mode:
read existing task list and diff against current architecture, user stories,
and specification documents. Preserve completed task statuses and existing
dependency relationships. Add new tasks for new stories or architecture
components. Re-derive wave plan if dependencies changed. Never remove tasks
that are in-progress or completed.

## Update Mode Specifics
- **Detect prior artifact**: docs/implementation-plan.md exists
- **Preserve**: completed and in-progress task statuses, existing task IDs,
  dependency relationships for stable tasks, wave assignments for tasks
  already started, agent allocation history, architecture decisions,
  component boundaries
- **Triggers for update**: architecture changed (new components need tasks),
  user stories added or changed, security review identified new requirements,
  operations runbook added deployment tasks, specification docs changed
- **Conflict resolution**: if architecture restructured a component that has
  in-progress tasks, flag for user review rather than silently reassigning;
  re-derive critical path only for unstarted tasks

## Task Size Constraints

Before finalizing the implementation plan, scan every task against the five agent
executability rules from the task-decomposition knowledge base:

1. **Three-File Rule** — Count application files each task modifies (exclude test files).
   Any task touching 4+ files must be split by layer or concern.
2. **150-Line Budget** — Estimate net-new application code lines per task. Any task
   likely to produce 200+ lines must be split by feature slice or entity.
3. **Single-Concern Rule** — Check each task description for "and" connecting unrelated
   work. Split if the task spans multiple architectural layers or feature domains.
4. **Decision-Free Execution** — Verify all design decisions are resolved in the task
   description. No "choose", "determine", "decide", or "evaluate options" language.
   Resolve decisions inline before presenting the plan.
5. **Test Co-location** — Confirm every code-producing task includes its test
   requirements. No "write tests later" aggregation tasks.

Tasks that fail any rule should be split inline. If a task genuinely can't be split
further, annotate with `<!-- agent-size-exception: reason -->`. The implementation
plan review will flag unjustified exceptions.

---

## Domain Knowledge

### task-decomposition

*Breaking architecture into implementable tasks with dependency analysis and agent context*

# Task Decomposition

Expert knowledge for breaking user stories into implementable tasks with dependency analysis, sizing, parallelization, and agent context requirements.

## Summary

### Story-to-Task Mapping

User stories bridge PRD features and implementation tasks. Each story decomposes into tasks following the technical layers needed. Every task must trace back to a user story, and every story to a PRD feature (PRD Feature → US-xxx → Task BD-xxx).

### Task Sizing

Each task should be completable in a single AI agent session (30-90 minutes of agent time). A well-sized task has a clear title (usable as commit message), touches 1-3 application files (hard limit; justify exceptions), produces ~150 lines of net-new application code (excluding tests and generated files), and has no ambiguity about "done."

Five rules govern agent-friendly task sizing:
1. **Three-File Rule** — Max 3 application files modified (test files excluded)
2. **150-Line Budget** — Max ~150 lines of net-new application code per task
3. **Single-Concern Rule** — One task does one thing (no "and" connecting unrelated work)
4. **Decision-Free Execution** — All design decisions resolved in the task description; agents implement, they don't architect
5. **Test Co-location** — Tests live in the same task as the code they test; no deferred testing

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
- Touches 1-3 application files (hard limit; test files excluded from count)
- Produces ~150 lines of net-new application code (excluding tests and generated files)
- Does exactly one thing (passes the single-concern test: describable without "and")
- Requires no design decisions from the agent (all choices resolved in the description)
- Includes co-located tests (the task isn't done until tests pass)
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

### Agent Executability Heuristics

Five formalized rules for ensuring tasks are the right size for AI agent execution. These are hard rules with an escape hatch — tasks exceeding limits must be split unless the author provides explicit justification via `<!-- agent-size-exception: reason -->`.

#### Rule 1: Three-File Rule

A task modifies at most 3 application files (test files don't count toward this limit). If it would touch more, split by layer or concern.

**Why 3:** Reading 3 files plus their context (imports, types, interfaces) consumes roughly 40-60% of a standard agent context window, leaving room for the task description, test code, and reasoning. At 5+ files, context pressure causes agents to lose track of cross-file consistency.

**Splitting when exceeded:**
- 4 files across 2 layers → split into one task per layer
- 5 files in the same layer → split by entity or concern within the layer
- Config files touched alongside application files → separate config task if non-trivial

#### Rule 2: 150-Line Budget

A task produces at most ~150 lines of net-new application code (excluding tests, generated files, and config). This keeps the entire change reviewable in one screen and within agent context budgets.

**Why 150:** Agent output quality degrades measurably after ~200 lines of new code in a single session. At 150 lines, the agent can hold the entire change in context while writing tests and verifying correctness.

**Estimating line count from task descriptions:**
- A CRUD endpoint with validation: ~80-120 lines
- A UI component with state management: ~100-150 lines
- A database migration with seed data: ~50-80 lines
- A full feature slice (API + UI + tests): ~300+ lines — MUST split

#### Rule 3: Single-Concern Rule

A task does exactly one thing. The test: can you describe what this task does in one sentence without "and"?

**Passes the test:**
- "Implement the user registration endpoint with input validation" (validation is part of the endpoint)
- "Create the order model with database migration" (migration is part of model creation)

**Fails the test:**
- "Add the API endpoint AND update the dashboard" — two tasks
- "Implement authentication AND set up the database" — two tasks
- "Build the payment form AND integrate with Stripe AND add webhook handling" — three tasks

**Splitting signals:**
- Task description contains "and" connecting unrelated work
- Task spans multiple architectural layers (API + frontend + database in one task)
- Task affects multiple bounded contexts or feature domains
- Task has acceptance criteria for two distinct user-facing behaviors

#### Rule 4: Decision-Free Execution

The task description must resolve all design decisions upfront. The agent implements, it doesn't architect. No task should require the agent to:

- Choose between patterns (repository vs active record, REST vs GraphQL)
- Select libraries or tools
- Decide module structure or file organization
- Determine API contract shapes (these come from upstream specs)

**Red flags in task descriptions:**
- "Choose the best approach for..."
- "Determine whether to use X or Y"
- "Decide how to structure..."
- "Evaluate options for..."
- "Select the most appropriate..."
- "Figure out the best way to..."

If a task contains any of these, the decision belongs in the task description — resolved by the plan author — not left to agent judgment. Local implementation choices (variable names, loop style, internal helper structure) are fine.

#### Rule 5: Test Co-location

Tests live in the same task as the code they test. The task follows TDD: write the failing test, then the implementation, then verify. The task isn't done until tests pass.

**Anti-pattern:** "Tasks 1-8: implement features. Task 9: write tests for everything." This produces untestable code, violates TDD, and creates a single massive testing task that exceeds all size limits.

**What co-location looks like:**
```
Task: Implement user registration endpoint
  1. Write failing integration test (POST /register with valid data → 201)
  2. Implement endpoint to make test pass
  3. Write failing validation test (invalid email → 400)
  4. Add validation to make test pass
  5. Commit
```

#### Escape Hatch

If a task genuinely can't be split further without creating tasks that have no independent value, add an explicit annotation in the task description: `<!-- agent-size-exception: [reason] -->`. The review pass flags unjustified exceptions but accepts reasoned ones.

**Valid exception reasons:**
- "Migration task touches 4 files but they're all trivial one-line renames"
- "Config file changes across 4 files are mechanical and identical in structure"
- "Test setup file is large but generated from a template"

**Invalid exception reasons:**
- "It's easier to do it all at once" (convenience is not a justification)
- "The files are related" (related files can still be separate tasks)
- "It would create too many tasks" (more small tasks > fewer large tasks)

#### Concrete "Too Big" Examples

| Task (Too Big) | Violations | Split Into |
|---------------|-----------|------------|
| "Implement user authentication" (8+ files, registration + login + reset + middleware) | Three-File, Single-Concern | 4 tasks: registration endpoint, login endpoint, password reset flow, auth middleware |
| "Build the settings page with all preferences" (6 files, multiple forms + APIs) | Three-File, 150-Line, Single-Concern | Per-group: profile settings, notification settings, security settings |
| "Set up database with all migrations and seed data" (10+ files, every entity) | Three-File, 150-Line | Per-entity: users table, orders table, products table, then seed data task |
| "Create API client with retry, caching, and auth" (4 concerns in one module) | Single-Concern, Decision-Free | 3 tasks: base client with auth, retry middleware, cache layer |
| "Implement the dashboard with charts, filters, and real-time updates" (5+ files, 300+ lines) | All five rules | 4 tasks: dashboard layout + routing, chart components, filter system, WebSocket integration |

### Common Pitfalls

**Tasks too vague.** "Implement backend" or "Set up auth" with no acceptance criteria, no file paths, and no test requirements. An agent receiving this task will guess wrong about scope, structure, and conventions. Fix: every task must specify exact files to create/modify, acceptance criteria, and test requirements.

**Missing dependencies.** Two tasks that modify the same file run in parallel and produce merge conflicts. Or a task tries to query a table that hasn't been created yet. Fix: explicitly map file ownership and identify all data dependencies before finalizing the task graph.

**Unrealistic parallelization.** Planning for 10 parallel agents when the dependency graph only allows 3 tasks at a time. Fix: analyze the dependency graph. The number of useful parallel agents equals the width of the widest wave.

**Giant foundation tasks.** "Set up everything: database, auth, API framework, shared types, error handling, logging, configuration" as a single task. This single task blocks all other work and is too large for a single agent session. Fix: split foundation into the smallest useful pieces — each should produce something that unblocks at least one other task.

**Testing as a separate phase.** All implementation tasks first, then "write all tests" as a final task. This violates TDD and produces lower-quality code. Fix: every implementation task includes its tests. The task isn't done until tests pass.

**No traceability.** Tasks exist in a task tracker with no link to user stories or PRD features. When a PRD feature changes, nobody knows which tasks are affected. Fix: every task references its user story. Every user story references its PRD feature.

**Premature shared utilities.** Creating "shared utility library" tasks before any feature needs them. This produces speculative abstractions that don't fit actual use cases. Fix: shared code emerges from feature work. Only create shared utility tasks after two or more features demonstrate the need.

**Ignoring the critical path.** Assigning agents to low-priority tasks while critical-path tasks wait for resources. Fix: always prioritize critical-path tasks. Non-critical tasks are parallelized around the critical path, not instead of it.

### Critical Path and Wave Planning

#### Identifying the Critical Path

The critical path is the longest chain of sequentially dependent tasks from project start to finish. To find it:

1. **Build the full DAG** — list every task and its dependencies (logical, file contention, infrastructure)
2. **Assign effort estimates** — use story points or hours per task
3. **Trace all paths** — walk from every root node (no dependencies) to every leaf node (no dependents)
4. **Sum each path** — the path with the highest total effort is the critical path
5. **Mark float** — non-critical tasks have float equal to (critical path length - their path length); they can slip by that amount without delaying the project

Critical path tasks get top priority for agent assignment. Delays on these tasks delay the entire project; delays on non-critical tasks do not (up to their float).

#### Wave Planning

Waves group independent tasks for parallel execution. Each wave starts only after its dependency wave completes.

```
Wave 0: Project infrastructure (DB setup, CI pipeline, auth scaffold)
Wave 1: Core data models, base API framework, design tokens
Wave 2: Feature endpoints, UI components, middleware (per-feature)
Wave 3: Integration flows, cross-feature wiring, E2E test scaffolds
Wave 4: Polish, performance, E2E tests, documentation finalization
```

**Rules for wave construction:**
- A task belongs to the earliest wave where all its dependencies are satisfied
- Tasks within a wave have zero dependencies on each other
- The number of useful parallel agents equals the task count of the widest wave
- If one wave has 8 tasks and the next has 2, consider whether splitting wave-2 tasks could improve parallelism

#### Agent Allocation by Wave

Assign agents based on task type to maximize context reuse within an agent session:

- **Backend agents** — API endpoints, database migrations, service logic. Context: architecture doc, API contracts, coding standards
- **Frontend agents** — UI components, pages, client-side state. Context: UX spec, design system, component patterns
- **Infrastructure agents** — CI/CD, deployment, config, monitoring. Context: dev setup, operations runbook
- **Cross-cutting agents** — Auth, error handling, shared utilities. Context: security review, coding standards

An agent working consecutive tasks of the same type retains relevant context and produces more consistent output.

#### Parallelization Signals

Tasks are safe to run in parallel when they share no file dependencies. Quick checklist:

- **Different feature directories** — `src/features/auth/` vs `src/features/billing/` can always parallelize
- **Different layers of different features** — backend auth + frontend billing have no file overlap
- **Same feature, different layers** — only if the interface contract is agreed upfront (API shape, component props)
- **Same file touched** — must be sequenced, no exceptions (merge conflicts are expensive)
- **Shared utility creation** — block until the utility task merges, then dependents can parallelize

---

### system-architecture

*Architecture patterns, component design, and project structure*

## Summary

## Architecture Patterns

### Layered Architecture

Organizes code into horizontal layers where each layer depends only on the layer directly below it. Common layers: presentation, application/business logic, domain, infrastructure/data access.

**When to use:** Simple CRUD applications, small teams, projects where the domain logic is straightforward. Good starting point when requirements are unclear.

**Trade-offs:**
- (+) Easy to understand and implement. Clear separation of concerns.
- (+) Well-represented in AI training data; AI generates correct layered code reliably.
- (-) Tends toward anemic domain models (logic drifts to service layers).
- (-) Changes to a feature often touch every layer (vertical changes cut across horizontal layers).
- (-) Can become a "big ball of mud" without discipline as layers accumulate cross-cutting dependencies.

### Hexagonal / Ports and Adapters

The domain logic sits at the center, surrounded by ports (interfaces defining how the domain interacts with the outside) and adapters (implementations of those interfaces). External concerns (databases, APIs, UIs) plug in via adapters.

**When to use:** Applications where the domain logic is the core value, where you want to test domain logic in isolation, or where you anticipate switching infrastructure components (database, message broker, external APIs).

**Trade-offs:**
- (+) Domain logic is testable without infrastructure. Swapping a database or API client requires only a new adapter.
- (+) Forces clean separation between domain and infrastructure.
- (-) More boilerplate: interfaces for every external dependency, adapter implementations, dependency injection wiring.
- (-) Over-engineering for simple CRUD. The ceremony doesn't pay off if the domain logic is trivial.
- (-) Less AI-familiar than layered architecture; AI may generate code that violates the port/adapter boundaries.

### Event-Driven Architecture

Components communicate by producing and consuming events rather than direct calls. An event represents something that happened. Producers don't know or care who consumes their events.

**When to use:** Systems with complex workflows, multiple consumers for the same business event, requirements for audit trails or event replay, systems that need to scale components independently.

**Trade-offs:**
- (+) Loose coupling between components. Adding a new consumer doesn't require changing the producer.
- (+) Natural fit for audit logs, analytics, and undo/redo.
- (-) Harder to reason about: the flow of control is distributed across event handlers.
- (-) Eventual consistency: events are processed asynchronously, so the system may be temporarily inconsistent.
- (-) Debugging is harder: you need to trace events across services to understand what happened.

### Microservices

Each bounded context or business capability is deployed as an independent service with its own data store, communicating via network calls (REST, gRPC, messaging).

**When to use:** Large teams that need independent deployment cycles, systems with dramatically different scaling requirements per component, organizations with multiple autonomous teams.

**Trade-offs:**
- (+) Independent deployment, scaling, and technology choices per service.
- (+) Failure isolation: one service going down doesn't take down the entire system.
- (-) Enormous operational complexity: service discovery, distributed tracing, network failure handling, data consistency across services, deployment coordination.
- (-) Over-engineering for most projects. If you can deploy a monolith, you should.
- (-) AI agents struggle with cross-service coordination, distributed debugging, and service mesh configuration.

### Modular Monolith

A single deployable unit internally organized into well-defined modules with explicit boundaries and interfaces. Modules communicate through defined interfaces, not arbitrary cross-module calls.

**When to use:** Most projects. Provides the organizational benefits of microservices (clean boundaries, independent development) without the operational complexity of distributed systems. Can be split into microservices later if genuinely needed.

**Trade-offs:**
- (+) Single deployment, single database, simple operations.
- (+) Clean module boundaries enable parallel development with low merge conflict risk.
- (+) Easy to refactor boundaries — moving code between modules is a code change, not a service migration.
- (-) Requires discipline to maintain module boundaries. Without enforcement, modules leak into each other.
- (-) Scaling is all-or-nothing (the whole monolith scales together).

### Choosing a Pattern

For most scaffold pipeline projects:

1. Start with **modular monolith** as the default. It gives you clean boundaries, testability, and low operational complexity.
2. Consider **hexagonal** if the domain logic is the primary value and you need infrastructure independence.
3. Consider **event-driven** if the domain naturally involves reactive workflows, audit requirements, or multiple consumers of business events.
4. Use **microservices** only if you have multiple teams that need independent deployment, or specific services with dramatically different scaling needs.
5. Avoid **layered** unless the application is genuinely simple (CRUD with minimal business logic).

## Deep Guidance

## Component Design

### Identifying Components from Domain Models

Each bounded context from the domain model typically maps to a top-level component or module. Within each bounded context:

- Aggregates map to services or sub-modules
- Domain events define the interfaces between components
- Repositories define the data access boundaries

**Mapping rules:**

| Domain Concept | Architecture Component |
|----------------|----------------------|
| Bounded Context | Top-level module/package |
| Aggregate | Service class or sub-module |
| Domain Event | Event interface / message type |
| Repository | Data access interface |
| Domain Service | Application service |
| Value Object | Shared type/library within the module |

### Defining Interfaces Between Components

Every component exposes a public interface (its API) and hides its internals. The interface is the contract that other components depend on.

**Interface design principles:**

- **Explicit over implicit.** Document what a component provides and what it requires. No hidden dependencies.
- **Narrow interfaces.** Expose the minimum necessary. More surface area means more coupling.
- **Stable interfaces.** Interfaces should change less frequently than implementations. Design for extension without interface changes.
- **Domain-language interfaces.** Use domain terminology, not infrastructure terminology. `orderService.place(order)` not `orderManager.insertAndNotify(orderDTO)`.

### Dependency Management

**Dependency inversion:** High-level modules should not depend on low-level modules. Both should depend on abstractions. The domain module defines an interface for data access; the infrastructure module implements it.

**Dependency direction rules:**

```
Presentation -> Application -> Domain <- Infrastructure
```

- Domain has zero external dependencies.
- Application orchestrates domain objects and depends on domain interfaces.
- Infrastructure implements domain interfaces and depends on external libraries.
- Presentation depends on application services.

**Preventing circular dependencies:**

- Dependencies must be acyclic. If module A depends on module B and module B depends on module A, extract the shared concept into a new module C.
- Use dependency analysis tools (e.g., madge for JavaScript, import-linter for Python) in CI to enforce dependency rules.
- When two modules need to communicate bidirectionally, use events or callbacks instead of direct references.

## Data Flow Design

### Request/Response Flows

Document the path of a user request through the system:

```
Client Request
  -> API Gateway / Router
    -> Controller (input validation, auth check)
      -> Application Service (orchestration, business rules)
        -> Domain Model (invariant enforcement, state changes)
          -> Repository (persistence)
        <- Domain Events (side effects)
      <- Response DTO (shape for client)
    <- HTTP Response
  <- Client Response
```

For each major user flow identified in the PRD, trace the request through every component it touches. This reveals:
- Missing components (the request needs something that doesn't exist)
- Unnecessary components (the request passes through components that add no value)
- Coupling points (where changes to the flow would ripple)

### Event Flows

For event-driven interactions, document:

```
Producer Aggregate
  -> Event (OrderPlaced)
    -> Event Bus / Queue
      -> Consumer 1 (InventoryService.reserveStock)
      -> Consumer 2 (NotificationService.sendConfirmation)
      -> Consumer 3 (AnalyticsService.recordPurchase)
```

Event flow documentation should include:
- The producing aggregate and triggering action
- The event name and payload schema
- All consumers and their resulting actions
- Error handling: what happens if a consumer fails?
- Ordering guarantees: must events be processed in order?

### Data Transformation Pipelines

When data moves between layers or components, it often changes shape:

```
HTTP Request Body (JSON)
  -> Validated Input DTO (type-safe, validated)
    -> Domain Command (domain language)
      -> Domain Entity mutations
        -> Domain Event (payload)
          -> Persistence Model (database row)
    -> Response DTO (client-facing shape)
```

Document each transformation point and what changes. This prevents the common mistake of passing database models directly to the client or accepting raw JSON deep in the domain layer.

## Module Organization

### Project Directory Structure

Directory structure is part of the architecture. A well-organized directory structure makes the architecture visible in the file system.

**Feature-based (vertical slices):**

```
src/
  features/
    auth/
      controllers/
      services/
      models/
      repositories/
      events/
      tests/
    orders/
      controllers/
      services/
      models/
      repositories/
      events/
      tests/
  shared/
    middleware/
    utils/
    types/
```

Best for: most projects, especially with parallel agents. Each feature is self-contained, reducing merge conflicts.

**Layer-based (horizontal slices):**

```
src/
  controllers/
  services/
  models/
  repositories/
  middleware/
  utils/
```

Best for: very small projects where the feature count is low and layered separation is the primary organizational concern.

**Hybrid (layers within features):**

```
src/
  features/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.model.ts
      auth.repository.ts
      auth.test.ts
    orders/
      ...
  shared/
    middleware/
    utils/
  infrastructure/
    database/
    messaging/
    external-apis/
```

Best for: projects that want feature isolation but also need clear infrastructure separation.

### File Naming Conventions

Consistency matters more than any specific convention. Pick one and enforce it:

- **kebab-case:** `user-profile.service.ts`, `order-item.model.ts` (most common in Node.js/TypeScript)
- **snake_case:** `user_profile_service.py`, `order_item_model.py` (standard in Python)
- **PascalCase:** `UserProfileService.java`, `OrderItemModel.java` (standard in Java/C#)

File names should include the component type as a suffix: `.controller`, `.service`, `.model`, `.repository`, `.test`, `.middleware`.

### Module Boundaries

Enforce that modules only interact through their public interfaces:

- Each module has an index/barrel file that exports only public API
- Internal files/classes are not exported
- Linter rules or import restrictions prevent reaching into another module's internals
- Module tests verify the public API; they don't test internals directly

### Import/Dependency Rules

Define a strict import ordering convention:

```
1. Standard library / Node.js built-ins
2. Third-party packages (npm/pip)
3. Internal shared modules (@shared/, @infrastructure/)
4. Feature-local modules (./relative paths)
```

Use path aliases to make imports readable: `@features/auth/service` instead of `../../../../features/auth/service`.

## State Management

### Where State Lives

State must have a clear, single owner. Distributed state with no clear owner leads to inconsistencies.

**Server-side state:**
- Database: persistent state (user data, orders, configuration)
- Cache (Redis, in-memory): derived or frequently-accessed state
- Session store: per-user session state
- Application memory: request-scoped transient state

**Client-side state (if applicable):**
- URL/query params: navigational state (current page, filters, sort order)
- Component state: UI-specific transient state (form inputs, open/closed toggles)
- Client-side store (Redux, Zustand, etc.): application state shared across components
- Local storage: persistent client state (preferences, draft saves)

### Consistency Strategies

- **Strong consistency** (single source of truth, synchronous reads): Use for data where correctness matters more than performance. Financial balances, inventory counts, access permissions.
- **Eventual consistency** (multiple sources, asynchronous sync): Acceptable for analytics, recommendations, activity feeds, notification counts.
- **Optimistic updates** (update UI immediately, reconcile with server): Good for user experience in low-conflict scenarios. Must handle conflicts gracefully.

### Caching

Add caching only when you have evidence of a performance problem, not speculatively.

When caching:
- Define the cache key scheme
- Define the invalidation strategy (TTL, event-based, write-through)
- Define what happens on cache miss (load from source, return stale data, error)
- Define maximum cache size and eviction policy (LRU, LFU, FIFO)

## Extension Points

Extension points allow the system to evolve without modifying core code. They must be designed, not just documented.

### Types of Extension Points

**Plugin systems:** Third-party or internal code hooks into defined interfaces. Example: a notification system with pluggable channels (email, SMS, push, Slack).

**Middleware/pipeline:** Processing steps that can be inserted, removed, or reordered. Example: request processing middleware (auth, logging, rate limiting, CORS).

**Configuration-driven behavior:** System behavior changes based on configuration without code changes. Example: feature flags, A/B tests, tenant-specific settings.

**Event hooks:** External code subscribes to events and reacts. Example: "after user creation, trigger welcome email" — the welcome email logic is decoupled from user creation.

### Design Rules

- Extension points must have a defined interface (not just "call any function")
- Document what extensions can and cannot do (security constraints, performance expectations)
- Provide default implementations for all extension points
- Test the extension mechanism itself, not just specific extensions
- Don't add extension points speculatively — add them when you have a concrete need for extensibility

## Cross-Cutting Concerns

### Logging

- **Structured logging** (JSON format) for machine parsability
- **Log levels:** DEBUG (verbose tracing), INFO (significant operations), WARN (recoverable issues), ERROR (failures requiring attention)
- **What to log:** Request/response metadata (not bodies), authentication events, business operations, errors with stack traces
- **What NEVER to log:** PII, passwords, tokens, credit card numbers, session cookies
- **Correlation IDs:** Every request gets a unique ID that propagates through all logs for that request, enabling end-to-end tracing

### Error Handling

- **Fail fast:** Detect errors as early as possible. Validate inputs at the boundary.
- **Error types:** Distinguish between client errors (bad input, 4xx), server errors (bugs, infrastructure failures, 5xx), and domain errors (business rule violations).
- **Error propagation:** Errors at lower layers should be translated to meaningful errors at higher layers. A "connection refused" database error becomes a "service unavailable" to the client.
- **Error recovery:** Define retry strategies for transient errors (with exponential backoff and jitter). Define circuit breakers for failing external services.

### Configuration Management

- **Environment-based:** Configuration varies by environment (dev, staging, production)
- **Hierarchical:** Default values < environment config < runtime overrides
- **Validated at startup:** All required configuration is checked at application start, not at first use
- **Typed:** Configuration values are parsed into proper types, not used as raw strings throughout the codebase
- **Secrets separated:** Sensitive values (API keys, database passwords) come from secure sources (environment variables, vault), never from config files committed to source control

### Feature Flags

- **Runtime toggles:** Enable/disable features without deployment
- **Scoped:** Feature flags apply globally, per-tenant, per-user, or per-percentage
- **Cleanup:** Feature flags are temporary. Set a removal date. Old feature flags become technical debt.
- **Testable:** Tests can exercise both flag-on and flag-off paths

## Common Pitfalls

**Over-architecting.** Microservices, event sourcing, CQRS, and distributed caching for a todo app with one user. Match architecture complexity to problem complexity. Start simple and add complexity only when the simpler approach demonstrably fails.

**Under-specifying interfaces.** "The auth module provides authentication" is not an interface specification. Specify the exact methods/endpoints, their parameters, their return types, and their error conditions. An AI agent implementing against a vague interface will guess wrong.

**Orphaned components.** A component that appears in the architecture diagram but in no data flow. If no request ever touches it, it either shouldn't exist or there's a missing data flow. Every component must appear in at least one data flow.

**Diagram/prose drift.** The architecture diagram shows three services but the prose describes four. Or the diagram shows a direct database connection but the prose describes a repository pattern. Keep diagrams and text synchronized. When one changes, update the other.

**Speculative generalization.** Adding layers of abstraction "in case we need it later" — an adapter for a database you'll never switch, a plugin system nobody will extend, a message queue for messages that could be function calls. Each abstraction has a maintenance cost. Add abstractions when you have a concrete need.

**Missing error paths in data flows.** Data flow diagrams that only show the happy path. What happens when the database is down? When the external API returns an error? When the message queue is full? Document error paths for every external dependency.

**Ignoring project structure.** Defining a beautiful hexagonal architecture but using a flat directory structure that doesn't reflect the architecture's boundaries. The file system should make the architecture visible. If modules can't be identified from the directory listing, the structure doesn't serve the architecture.

---

## After This Step

Continue with: `/scaffold:implementation-plan-review`
