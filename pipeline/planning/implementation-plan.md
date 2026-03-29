---
name: implementation-plan
description: Break architecture into implementable tasks with dependencies
phase: "planning"
order: 1210
dependencies: [tdd, operations, security, review-architecture, create-evals]
outputs: [docs/implementation-plan.md]
reads: [create-prd, story-tests, database-schema, api-contracts, ux-spec]
conditional: null
knowledge-base: [task-decomposition]
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
- (mvp) Every architecture component has implementation tasks
- (mvp) Task dependencies form a valid DAG (no cycles)
- (mvp) Each task produces ~150 lines of net-new application code (excluding tests and generated files)
- (mvp) Tasks include acceptance criteria (how to know it's done)
- (mvp) Tasks incorporate testing requirements from the testing strategy
- (deep) Tasks reference corresponding test skeletons from tests/acceptance/ where applicable
- (deep) Tasks incorporate security controls from the security review where applicable
- (deep) Tasks incorporate operational requirements (monitoring, deployment) where applicable
- (deep) Critical path is identified
- (deep) Parallelization opportunities are marked with wave plan
- (mvp) Every user story maps to at least one task
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
- **custom:depth(1-5)**: Depth 1-2: ordered list. Depth 3: add dependencies
  and sizing. Depth 4-5: full breakdown with parallelization.

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
