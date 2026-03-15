---
name: implementation-tasks
description: Break architecture into implementable tasks with dependencies
phase: "planning"
order: 25
dependencies: [testing-strategy, operations, security]
outputs: [docs/implementation-tasks.md]
conditional: null
knowledge-base: [task-decomposition]
---

## Purpose
Decompose user stories and system architecture into concrete, implementable
tasks suitable for AI agents. Each task should be independently executable,
have clear inputs/outputs, and be small enough for a single agent session.
The primary mapping is Story → Task(s), with PRD as the traceability root.

## Inputs
- docs/system-architecture.md (required) — components to implement
- docs/domain-models/ (required) — domain logic to implement
- docs/adrs/ (required) — technology constraints
- docs/prd.md (required) — features to trace tasks back to
- docs/user-stories.md (required) — stories to derive tasks from
- docs/testing-strategy.md (required) — testing requirements to incorporate into tasks
- docs/operations-runbook.md (optional) — ops requirements to incorporate into tasks
- docs/security-review.md (optional) — security requirements to incorporate into tasks
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
- Tasks incorporate testing requirements from the testing strategy
- Tasks incorporate security controls from the security review where applicable
- Tasks incorporate operational requirements (monitoring, deployment) where applicable
- Critical path is identified
- Parallelization opportunities are marked
- Every user story maps to at least one task

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
