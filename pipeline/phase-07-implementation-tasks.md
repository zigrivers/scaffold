---
name: phase-07-implementation-tasks
description: Break architecture into implementable tasks with dependencies
phase: "7"
dependencies: [phase-03-system-architecture]
outputs: [docs/implementation-tasks.md]
conditional: null
knowledge-base: [task-decomposition]
---

## Purpose
Decompose the system architecture into concrete, implementable tasks suitable
for AI agents. Each task should be independently executable, have clear inputs/
outputs, and be small enough for a single agent session. User stories inform
task creation — features map to stories map to tasks.

## Inputs
- docs/system-architecture.md (required) — components to implement
- docs/domain-models/ (required) — domain logic to implement
- docs/adrs/ (required) — technology constraints
- docs/prd.md (required) — features to trace tasks back to
- docs/database-schema.md (optional) — data layer tasks
- docs/api-contracts.md (optional) — API implementation tasks
- docs/ux-spec.md (optional) — frontend tasks

## Expected Outputs
- docs/implementation-tasks.md — task list with dependencies, sizing, and
  assignment recommendations

## Quality Criteria
- Every architecture component has implementation tasks
- Task dependencies form a valid DAG (no cycles)
- Each task is scoped for a single agent session (not too large, not too small)
- Tasks include acceptance criteria (how to know it's done)
- Critical path is identified
- Parallelization opportunities are marked

## Methodology Scaling
- **deep**: Detailed task breakdown with story-to-task tracing. Dependency graph.
  Sizing estimates. Parallelization plan. Agent context requirements per task.
  Phased delivery milestones.
- **mvp**: Ordered task list with brief descriptions. Key dependencies noted.
  Enough to start working sequentially.
- **custom:depth(1-5)**: Depth 1-2: ordered list. Depth 3: add dependencies
  and sizing. Depth 4-5: full breakdown with parallelization.

## Mode Detection
Update mode if tasks exist. Re-derive from updated architecture.
