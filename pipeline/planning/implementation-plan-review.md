---
name: implementation-plan-review
description: Review implementation tasks for coverage, feasibility, and multi-model validation
phase: "planning"
order: 1220
dependencies: [implementation-plan]
outputs: [docs/reviews/review-tasks.md, docs/reviews/implementation-plan/task-coverage.json, docs/reviews/implementation-plan/review-summary.md]
conditional: null
knowledge-base: [review-methodology, review-implementation-tasks, task-decomposition, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
critical path inaccuracy, and invalid parallelization assumptions. At depth 4+,
dispatch to independent AI models (Codex/Gemini CLIs) for multi-model validation
and produce a structured coverage matrix and review summary.

## Inputs
- docs/implementation-plan.md (required) — tasks to review
- docs/system-architecture.md (required) — for coverage checking
- docs/domain-models/ (required) — for completeness
- docs/user-stories.md (required) — for AC coverage mapping
- docs/plan.md (required) — for traceability
- docs/project-structure.md (required) — for file contention analysis
- docs/tdd-standards.md (required) — for test requirement verification

## Expected Outputs
- docs/reviews/review-tasks.md — findings and resolution log
- docs/implementation-plan.md — updated with fixes
- docs/reviews/implementation-plan/task-coverage.json — AC-to-task coverage matrix (depth 3+)
- docs/reviews/implementation-plan/review-summary.md — multi-model review summary (depth 4+)
- docs/reviews/implementation-plan/codex-review.json — raw Codex findings (depth 4+, if available)
- docs/reviews/implementation-plan/gemini-review.json — raw Gemini findings (depth 4+, if available)

## Quality Criteria
- Architecture coverage verified (every component has tasks)
- Dependency graph is valid DAG
- No task is too large for a single agent session
- Critical path is accurate
- Parallelization assumptions are valid
- Every acceptance criterion maps to at least one task (100% AC coverage)
- Every task has verb-first description, >= 1 input file reference, >= 1 acceptance criterion, and defined output artifact
- At depth 4+: independent model reviews completed and reconciled

## Methodology Scaling
- **deep**: Full multi-pass review with multi-model validation. AC coverage
  matrix. Independent Codex/Gemini dispatches. Detailed reconciliation report.
- **mvp**: Coverage check only. No external model dispatch.
- **custom:depth(1-5)**: Depth 1-2: coverage check. Depth 3: add dependency
  analysis and AC coverage matrix. Depth 4: add one external model. Depth 5:
  full multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/implementation-plan/, preserve prior findings still valid.
