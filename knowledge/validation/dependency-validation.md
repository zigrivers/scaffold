---
name: dependency-validation
description: Verifying dependency graphs are acyclic, complete, and correctly ordered
topics: [validation, dependencies, graphs, cycles, ordering, parallelization]
---

# Dependency Validation

Dependency validation extracts all dependency relationships between implementation tasks, builds a graph, checks for correctness, and verifies that the ordering matches architectural constraints. A valid dependency graph ensures that tasks can be executed in an order that never requires unbuilt dependencies.

## What a Dependency Graph Represents

Each node in the graph is an implementation task. Each directed edge represents a "must complete before" relationship: if task A depends on task B, then B must be completed before A can start.

The graph encodes:
- **Sequencing constraints** — What must happen before what.
- **Parallelization opportunities** — Tasks with no dependency relationship can run simultaneously.
- **Critical path** — The longest chain of sequential dependencies, which determines minimum project duration.
- **Blocking risk** — Tasks that many other tasks depend on, whose delay blocks the most work.

## How to Extract Dependencies

### From the Task Breakdown

Implementation tasks should have explicit dependency declarations. Extract these directly:

```
Task T-012: Set up database schema
  Depends on: T-010 (database connection config)

Task T-015: Implement user registration endpoint
  Depends on: T-012 (user table must exist), T-011 (auth middleware)

Task T-020: Build sign-up form
  Depends on: T-015 (registration endpoint must exist)
```

### From Architecture Data Flows

Data flow diagrams imply dependencies. If Component A sends data to Component B, then Component B's implementation depends on Component A's interface being defined (though not necessarily fully implemented — interface-first development can decouple this).

### From Schema Dependencies

Database schema has inherent ordering:
- Tables with foreign keys depend on the referenced tables.
- Migration scripts must run in order.
- Seed data depends on table creation.

### From API Contract Dependencies

API implementation depends on:
- Schema (data layer must exist for the API to read/write)
- Auth middleware (if endpoints are protected)
- External service clients (if the endpoint calls external services)

### Implicit Dependencies to Look For

Some dependencies are not stated but are real:

1. **Shared configuration** — Multiple tasks may depend on environment setup, config files, or shared constants that no task explicitly produces.
2. **Shared libraries** — Multiple tasks may depend on utility functions, custom error classes, or helper modules.
3. **Framework scaffolding** — All tasks may depend on the initial project setup (package.json, tsconfig, linting config) which may or may not be its own task.
4. **Test infrastructure** — Tests depend on test utilities, fixtures, and configuration that must be set up first.

## Graph Validation Checks

### 1. Cycle Detection

A cycle means task A depends on B, B depends on C, and C depends on A. No task in the cycle can ever start because each is waiting for another.

**Detection algorithm (Kahn's algorithm):**
1. Compute the in-degree (number of incoming edges) for each node.
2. Add all nodes with in-degree 0 to a queue.
3. While the queue is not empty:
   a. Remove a node from the queue.
   b. For each outgoing edge from that node, decrement the in-degree of the target.
   c. If the target's in-degree reaches 0, add it to the queue.
4. If all nodes have been processed, the graph is acyclic.
5. If nodes remain unprocessed, they are part of cycles.

**What to do when cycles are found:**
- Identify the minimal cycle (the smallest set of tasks that form a loop).
- Determine which dependency is weakest — can it be broken by splitting a task or defining an interface?
- Common resolution: split a task into "define interface" and "implement interface" — other tasks can depend on the interface definition without waiting for the full implementation.

### 2. Completeness Check

Every task referenced as a dependency must exist in the task list.

**Process:**
1. Collect all task IDs from the implementation tasks.
2. Collect all task IDs referenced in dependency declarations.
3. Any referenced ID not in the task list is an orphaned dependency.

**Common causes:**
- Task was removed or renamed but its dependents were not updated.
- Dependency references a task from a different phase or project.
- Typo in the task ID.

### 3. Ordering vs. Architectural Constraints

The dependency ordering should match the architecture's layered structure:

**Layer ordering (typical):**
1. Infrastructure setup (database, message queue, cache)
2. Schema creation (tables, indexes, constraints)
3. Core domain logic (entities, business rules, domain services)
4. Repository/data access layer
5. Service layer (application services, orchestration)
6. API layer (endpoints, middleware, serialization)
7. Frontend components (if applicable)
8. Integration and E2E tests

Verify that no task in a lower layer depends on a task in a higher layer (e.g., schema creation should not depend on an API endpoint).

**Exceptions:** Some cross-cutting concerns (logging, auth, error handling) may be set up early and used by all layers. This is acceptable as long as the dependency is on the shared infrastructure, not on a specific feature in a higher layer.

### 4. Parallel Task Independence

Tasks that can run in parallel (no dependency relationship between them) should not share mutable state.

**Process:**
1. Identify all task pairs that have no dependency path between them (neither A→B nor B→A exists).
2. For each parallel pair, verify:
   - They do not modify the same files.
   - They do not modify the same database tables in conflicting ways.
   - They do not depend on the same external service configuration.
   - They do not modify the same API endpoints.

**What findings look like:**
- "Tasks T-015 and T-018 can run in parallel but both modify `src/middleware/auth.ts`. If both agents work simultaneously, they will produce merge conflicts."
- "Tasks T-020 and T-022 both add columns to the `users` table. Parallel execution will cause migration conflicts."

**Resolution options:**
- Add a dependency between the conflicting tasks (breaking the parallelism).
- Split the shared resource into separate modules that can be independently modified.
- Sequence the conflicting tasks and note that parallelism is not available.

### 5. Critical Path Analysis

The critical path is the longest chain of sequential dependencies. It determines the minimum time to complete all tasks, even with unlimited parallelism.

**How to find it:**
1. Perform a topological sort of the graph.
2. For each node, compute the longest path from any root (node with no dependencies) to that node.
3. The node with the longest path is the end of the critical path.
4. Trace backward from that node along the longest incoming path to find the full critical path.

**Why it matters:**
- Tasks on the critical path cannot be parallelized — any delay directly extends the project.
- Tasks NOT on the critical path have slack — they can be delayed without extending the project.
- Optimization efforts should focus on the critical path: Can any critical-path task be split? Can any dependency be relaxed?

### 6. Fan-in and Fan-out Analysis

**High fan-in tasks** (many tasks depend on them):
- These are blockers. If they are delayed, many downstream tasks are blocked.
- They should be prioritized and possibly split into smaller deliverables.
- Example: "Set up authentication middleware" — 15 API tasks depend on it.

**High fan-out tasks** (depend on many other tasks):
- These can only start late in the project.
- They should be reviewed for whether all dependencies are truly necessary.
- Example: "E2E test suite" depends on all API and frontend tasks.

## Graph Visualization

For communication, represent the dependency graph visually:

```
T-001 (Project setup)
  ├─> T-010 (DB config)
  │     └─> T-012 (Schema creation)
  │           ├─> T-015 (User registration endpoint)
  │           │     └─> T-020 (Sign-up form)
  │           └─> T-016 (Product CRUD endpoints)
  │                 └─> T-021 (Product listing page)
  └─> T-011 (Auth middleware)
        ├─> T-015 (User registration endpoint)
        └─> T-016 (Product CRUD endpoints)
```

Or as a dependency table:

```markdown
| Task | Depends On | Depended On By | Parallelizable With |
|------|-----------|----------------|---------------------|
| T-001 | — | T-010, T-011 | — |
| T-010 | T-001 | T-012 | T-011 |
| T-011 | T-001 | T-015, T-016 | T-010, T-012 |
| T-012 | T-010 | T-015, T-016 | T-011 |
| T-015 | T-012, T-011 | T-020 | T-016 |
| T-016 | T-012, T-011 | T-021 | T-015 |
| T-020 | T-015 | — | T-016, T-021 |
| T-021 | T-016 | — | T-015, T-020 |
```

## Output Format

### Validation Summary

```markdown
## Dependency Graph Validation Results

**Total tasks:** 45
**Total dependencies:** 72
**Graph is acyclic:** Yes / No
**Cycles found:** [list if any]
**Orphaned dependencies:** [list if any]
**Critical path length:** 12 tasks
**Critical path:** T-001 → T-010 → T-012 → T-015 → T-025 → ... → T-045
**Maximum parallelism:** 6 tasks simultaneously (at step 4 of topological sort)
**High fan-in tasks (>5 dependents):** T-001, T-011, T-012
**Parallel conflicts found:** 3 (listed below)
```

### Finding Report

```markdown
## Finding: Parallel Conflict Between T-020 and T-022

**Type:** Parallel task conflict
**Severity:** Major
**Description:** Both tasks modify `src/models/User.ts` — T-020 adds email verification fields, T-022 adds profile fields. Parallel execution will cause merge conflicts.
**Recommendation:** Add dependency T-020 → T-022 (or vice versa) to serialize these tasks.
```

## When to Run Dependency Validation

- After the implementation tasks are complete.
- After any task is added, removed, or modified.
- Before starting implementation — the dependency graph is the work scheduler.
- When agents report being blocked — verify the blockage is real and not a missing dependency resolution.
