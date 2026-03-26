---
description: "Verify task dependency graph is acyclic with valid ordering and parallelization"
long-description: "Extracts all task dependency relationships, builds the directed graph, checks for cycles, validates ordering against architectural layer constraints, analyzes file contention between parallel tasks, and identifies the critical path. Produces a complete dependency health report."
---

Extract every dependency relationship between implementation tasks, build the directed graph, and validate it. A valid dependency graph ensures that tasks can be executed in an order that never requires unbuilt dependencies. An invalid graph — cycles, missing dependencies, file contention — will cause agent deadlocks and merge conflicts during implementation.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown with dependencies (primary input)
- `docs/system-architecture.md` — Layer structure and data flows
- `docs/database-schema.md` or `docs/schema/` — Table relationships (imply dependency ordering)
- `docs/api-contracts.md` or `docs/api/` — Endpoint dependencies
- `docs/project-structure.md` — File layout (for contention analysis)

## What to Check

### 1. Cycle Detection

A cycle means task A depends on B, B depends on C, and C depends on A — no task can start. Use topological sort (Kahn's algorithm) to detect cycles. For each cycle found, identify the minimal loop, determine the weakest dependency, and recommend a fix (commonly: split a task into "define interface" and "implement interface").

### 2. Completeness Check

Every task referenced as a dependency must exist in the task list. Flag orphaned references (renamed/removed tasks, typos) and disconnected tasks (no dependencies and no dependents that are not roots or leaves).

### 3. Architectural Layer Ordering

Verify dependency ordering matches the architecture's layered structure:

1. Infrastructure setup (database, message queue, cache config)
2. Schema creation (tables, indexes, constraints, migrations)
3. Core domain logic (entities, business rules, domain services)
4. Repository / data access layer
5. Service layer (application services, orchestration)
6. API layer (endpoints, middleware, serialization)
7. Frontend components (if applicable)
8. Integration and E2E tests

Flag any task in a lower layer depending on a task in a higher layer (e.g., schema creation depending on an API endpoint).

**Exception**: Cross-cutting concerns (auth, logging, error handling) may be set up early and used by all layers.

### 4. File Contention Analysis

Identify all parallelizable task pairs (no dependency path between them). For each pair, check if they modify the same source files, database tables, API endpoints, or configuration. File contention causes merge conflicts. Fix by adding a dependency, splitting the shared resource, or sequencing within the same wave.

### 5. Critical Path Analysis

Find the longest chain of sequential dependencies (determines minimum project duration). Report the critical path length, the tasks on it, and whether any can be split to shorten it.

### 6. Fan-In / Fan-Out Analysis

Flag tasks with 5+ dependents (high fan-in blockers) and tasks with 5+ prerequisites (high fan-out late starters). Evaluate whether fan-in tasks can be split and whether fan-out dependencies are all truly necessary.

### 7. Wave Planning Feasibility

If the plan uses waves: verify wave-internal independence (no intra-wave dependencies), prior-wave satisfaction (all deps met by earlier waves), no intra-wave file contention, and reasonable wave sizes for available agents.

## Findings Format

For each issue found:
- **ID**: DGV-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which tasks and relationships
- **Fix**: Specific remediation

### Severity guidelines:
- **P0**: Cycle in the dependency graph. Missing dependency that would cause implementation failure.
- **P1**: File contention between parallel tasks. Orphaned dependency reference. Layer ordering violation.
- **P2**: Suboptimal parallelization. Fan-in bottleneck that could be split.
- **P3**: Wave planning could be improved. Minor reordering opportunity.

### Summary block:

```
Total tasks: NN | Dependencies: NN | Acyclic: Yes/No
Critical path: N tasks | Max parallelism: N tasks
High fan-in: [list] | Parallel conflicts: N found
```

## Process

1. Read all input artifacts listed above
2. Extract every task and its declared dependencies
3. Build the directed graph
4. Run cycle detection
5. Run completeness check (orphaned references)
6. Verify architectural layer ordering
7. Analyze file contention between parallel tasks
8. Compute critical path
9. Analyze fan-in/fan-out
10. Validate wave planning (if applicable)
11. Compile findings report sorted by severity
12. Present to user for review
13. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Dependency Graph complete** — Task DAG verified, contention analyzed, critical path identified.

**Next:** Run `/scaffold:scope-creep-check` — Verify all specs stay within PRD boundaries.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
