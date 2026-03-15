---
name: review-implementation-tasks
description: Failure modes and review passes specific to implementation tasks artifacts
topics: [review, tasks, planning, decomposition, agents]
---

# Review: Implementation Tasks

The implementation tasks document translates the architecture into discrete, actionable work items that AI agents can execute. Each task must be self-contained enough for a single agent session, correctly ordered by dependency, and clear enough to implement without asking questions. This review uses 7 passes targeting the specific ways implementation tasks fail.

Follows the review process defined in `review-methodology.md`.

---

## Pass 1: Architecture Coverage

### What to Check

Every architectural component, module, and integration point has corresponding implementation tasks. No part of the architecture is left without work items.

### Why This Matters

Uncovered components are discovered during implementation when an agent realizes a dependency has no task. This blocks the agent, creates unplanned work, and disrupts the critical path. Coverage gaps typically occur in cross-cutting concerns (logging, error handling, auth middleware) and infrastructure (CI/CD, deployment, database migrations).

### How to Check

1. List every component from the system architecture document
2. For each component, find implementation tasks that cover it
3. Flag components with no corresponding tasks
4. Check cross-cutting concerns: logging, error handling, authentication/authorization middleware, configuration management, health checks
5. Check infrastructure tasks: database migration scripts, CI/CD pipeline setup, deployment configuration, environment setup
6. Check integration tasks: component-to-component wiring, API client generation, event bus configuration
7. Verify that testing tasks exist alongside implementation tasks (not deferred to "later")

### What a Finding Looks Like

- P0: "Architecture describes an 'API Gateway' component with routing, rate limiting, and auth validation, but no implementation tasks exist for it. Five downstream tasks assume it exists."
- P1: "Database migration tasks cover schema creation but no task covers seed data or test fixtures. The testing strategy requires test data."
- P2: "Logging infrastructure is mentioned in architecture but has no dedicated task. Individual component tasks may handle it ad hoc, creating inconsistent logging."

---

## Pass 2: Missing Dependencies

### What to Check

Task dependencies are complete and correct. No task assumes a prerequisite that is not listed as a dependency. No circular dependencies exist.

### Why This Matters

Missing dependencies cause agents to start work that immediately blocks — the agent picks up a task, discovers it depends on something not yet built, and wastes a session. Circular dependencies make it impossible to determine a valid execution order. Both destroy parallelization efficiency.

### How to Check

1. For each task, read its description and acceptance criteria
2. Identify everything the task needs to exist before it can start (database tables, API endpoints, shared libraries, configuration)
3. Verify each prerequisite is listed as a dependency
4. Check for implicit dependencies: "implement user dashboard" implicitly depends on "implement user authentication" — is this explicit?
5. Build the full dependency graph and check for cycles
6. Verify that the dependency graph has at least one task with no dependencies (the starting point)
7. Check for over-specified dependencies: tasks blocked on things they do not actually need, creating artificial bottlenecks

### What a Finding Looks Like

- P0: "Task 'Implement order API endpoints' has no dependency on 'Create database schema.' The API task cannot start without tables to query."
- P1: "Tasks 'Implement user service' and 'Implement auth middleware' depend on each other. Circular dependency — determine which can be built first with a mock."
- P2: "Task 'Build product listing page' lists 'Deploy staging environment' as a dependency. This is over-specified — the page can be built and tested locally."

---

## Pass 3: Task Sizing

### What to Check

No task is too large for a single agent session (typically 30-60 minutes of focused work). No task is too small to be meaningful (trivial one-line changes should be grouped). Tasks have a clear scope boundary.

### Why This Matters

Too-large tasks exceed agent context windows and session limits. The agent runs out of context mid-task, produces incomplete work, and the next session must understand and continue partial progress — which is error-prone. Too-small tasks create overhead (setup, context loading, validation) that exceeds the actual work.

### How to Check

1. For each task, estimate the implementation scope: how many files touched, how many functions written, how much logic?
2. Flag tasks that involve more than one major component or module — these are likely too large
3. Flag tasks that involve more than 5-7 files — these may exceed agent context
4. Flag tasks that are trivial (rename a variable, update a config value) — these should be grouped into a larger task
5. Check that each task has a clear boundary: when does the agent stop? "Implement the order module" has no clear boundary; "Implement order creation endpoint with validation" does
6. Verify that tasks do not mix concerns: a single task should not be "implement auth AND set up database"

### What a Finding Looks Like

- P0: "Task 'Implement the entire backend' is a single task covering 15 architectural components, 40+ files, and hundreds of functions. This must be decomposed into component-level tasks."
- P1: "Task 'Set up user service with authentication, authorization, profile management, and email verification' covers four distinct features. Split into separate tasks."
- P2: "Task 'Update README with API documentation link' is a one-line change. Group with other documentation tasks."

---

## Pass 4: Acceptance Criteria

### What to Check

Every task has clear, testable acceptance criteria that define "done." Criteria are specific enough that an agent can verify its own work.

### Why This Matters

Without acceptance criteria, agents do not know when to stop. They either under-deliver (missing edge cases, skipping error handling) or over-deliver (adding features not asked for, over-engineering). Clear criteria also enable automated verification — if the criteria are testable, CI can validate them.

### How to Check

1. For each task, read the acceptance criteria
2. Check that criteria are testable assertions, not vague goals: "user can log in" is vague; "POST /auth/login returns 200 with JWT token when given valid credentials, 401 with error message when given invalid credentials" is testable
3. Verify criteria cover the happy path AND at least one error/edge case
4. Check that criteria reference specific inputs and expected outputs
5. Look for criteria that say "should work correctly" or "handle errors properly" — these are not actionable
6. Verify that criteria align with the API contract, database schema, and UX spec (no contradictions with upstream artifacts)

### What a Finding Looks Like

- P0: "Task 'Implement payment processing' has acceptance criteria: 'Payments should work.' This is untestable. Specify: which payment methods, what validation, what error responses, what idempotency behavior."
- P1: "Task 'Build user registration' criteria say 'user can register' but do not specify validation rules (password requirements, email format, duplicate handling)."
- P2: "Acceptance criteria reference 'standard error format' without specifying what that format is. Link to the error contract in the API spec."

---

## Pass 5: Critical Path Accuracy

### What to Check

The identified critical path is actually the longest dependency chain. Moving tasks on/off the critical path would not shorten total project duration.

### Why This Matters

An incorrect critical path means optimization effort is misdirected. If the team parallelizes work on the perceived critical path but the actual bottleneck is elsewhere, total project duration does not improve. The critical path determines the minimum project duration — optimizing anything else has zero impact on delivery date.

### How to Check

1. Trace the longest dependency chain from start to finish — this is the critical path
2. Compare with the documented critical path — do they match?
3. Check for hidden long chains: integration tasks, end-to-end testing, deployment setup — these are often on the actual critical path but not recognized
4. Verify that critical path tasks are not blocked by non-critical tasks (this would extend the critical path)
5. Check for near-critical paths: chains that are only 1-2 tasks shorter than the critical path. These become the critical path if any task slips.
6. Verify that critical path tasks have clear owners and no ambiguity — these are the tasks that cannot afford delays

### What a Finding Looks Like

- P0: "The documented critical path is: schema -> API -> frontend. But the actual longest chain is: schema -> API -> integration tests -> deployment pipeline -> end-to-end tests, which is 2 tasks longer."
- P1: "Critical path task 'Implement auth service' depends on non-critical task 'Design admin dashboard.' This dependency makes the admin dashboard silently critical."
- P2: "Two dependency chains are within one task of the critical path length. These near-critical paths should be identified to guide resource allocation."

---

## Pass 6: Parallelization Validity

### What to Check

Tasks marked as parallelizable are truly independent. They do not share state, modify the same files, or have undeclared dependencies on each other's output.

### Why This Matters

False parallelization causes merge conflicts, race conditions, and wasted work. If two agents build features that both modify the same shared module, their changes conflict at merge time. One agent's work may need to be redone. Worse, if both agents assume they own a shared resource, they may produce incompatible implementations.

### How to Check

1. For each set of tasks marked as parallel, check: do they modify the same files?
2. Check for shared state: do parallel tasks both write to the same database tables, configuration files, or shared modules?
3. Check for shared dependencies: if both tasks depend on a shared library, will one task's changes to that library affect the other?
4. Verify that parallel tasks produce independent outputs that can be merged without conflict
5. Check for ordering assumptions: does parallel task A assume parallel task B has or has not completed?
6. Look for shared infrastructure: if both tasks need to modify CI/CD configuration, they will conflict

### What a Finding Looks Like

- P0: "Tasks 'Implement user service' and 'Implement auth middleware' are marked as parallel, but both modify 'src/middleware/index.ts'. These will produce merge conflicts."
- P1: "Tasks 'Build order API' and 'Build inventory API' are parallel but both need to modify the shared database connection configuration. Sequence the config setup first."
- P2: "Parallel tasks 'Build feature A' and 'Build feature B' both add entries to the routing table. Minor merge conflict risk — document the resolution strategy."

---

## Pass 7: Agent Context

### What to Check

Each task specifies which documents and artifacts the implementing agent should read before starting. The context is sufficient for the agent to complete the task without hunting for information.

### Why This Matters

AI agents have limited context windows. If a task does not specify what to read, the agent either loads too much context (wasting tokens, risking truncation) or too little (missing crucial design decisions). Explicit context references are the difference between an agent that executes efficiently and one that spends half its session discovering what it needs to know.

### How to Check

1. For each task, verify a context section lists the specific documents/sections to read
2. Check that the listed context is sufficient: does it cover the relevant architecture section, API contract, database schema, and UX spec for this task?
3. Check that the listed context is minimal: does it include only what is needed for this specific task, not the entire project documentation?
4. Verify that context references are specific: "docs/system-architecture.md, Section 3.2: Order Service" not just "docs/system-architecture.md"
5. Check for missing context: does the task require knowledge that is not in any listed document? (This may indicate a documentation gap)
6. Verify that coding standards, testing strategy, and git workflow references are included where relevant

### What a Finding Looks Like

- P0: "Task 'Implement order creation endpoint' lists no context documents. The agent needs the API contract (endpoint spec), database schema (orders table), domain model (Order aggregate invariants), and architecture section (Order Service design)."
- P1: "Task 'Build user dashboard' references the architecture document but not the UX spec. The agent will build the component structure correctly but not the visual design."
- P2: "Task context references 'docs/system-architecture.md' without specifying which section. The agent will load the entire 2000-line document instead of the relevant 100-line section."
