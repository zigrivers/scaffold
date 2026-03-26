---
name: implementation-plan-review
description: Review implementation tasks for coverage and feasibility
phase: "planning"
order: 26
dependencies: [implementation-plan]
outputs: [docs/reviews/review-tasks.md]
conditional: null
knowledge-base: [review-methodology, review-implementation-tasks]
---

## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
critical path inaccuracy, and invalid parallelization assumptions.

## Inputs
- docs/implementation-plan.md (required) — tasks to review
- docs/system-architecture.md (required) — for coverage checking
- docs/domain-models/ (required) — for completeness

## Expected Outputs
- docs/reviews/review-tasks.md — findings and resolution log
- docs/implementation-plan.md — updated with fixes

## Quality Criteria
- Architecture coverage verified (every component has tasks)
- Dependency graph is valid DAG
- No task is too large for a single agent session
- Critical path is accurate
- Parallelization assumptions are valid

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
