---
name: multi-model-review-tasks
description: Multi-model review of implementation plan tasks for coverage and quality
phase: "planning"
order: 80
dependencies: [implementation-plan]
outputs: [docs/reviews/implementation-plan/review-summary.md]
conditional: "if-needed"
knowledge-base: [review-methodology, task-decomposition]
---

## Purpose
Dispatch implementation plan tasks to independent AI models (Codex, Gemini) for
parallel quality and coverage audits. Catch coverage gaps (acceptance criteria
not mapped to tasks), description ambiguities, dependency problems, sizing
mismatches, and architecture inconsistencies. Enforces agent-implementable
tasks with full acceptance criteria coverage.

## Inputs
- docs/implementation-plan.md (required) — task graph to review
- docs/user-stories.md (required) — acceptance criteria for coverage mapping
- docs/plan.md (required) — PRD requirements for traceability
- docs/tech-stack.md (optional) — architecture reference for coherence checks
- docs/project-structure.md (optional) — file placement for contention analysis

## Expected Outputs
- docs/reviews/implementation-plan/task-coverage.json — AC-to-task mapping matrix
- docs/reviews/implementation-plan/codex-review.json — Codex model review findings
- docs/reviews/implementation-plan/gemini-review.json — Gemini model review findings
- docs/reviews/implementation-plan/review-summary.md — synthesized findings with
  coverage gaps, description issues, dependency problems, and recommendations

## Quality Criteria
- Every acceptance criterion in user stories maps to at least one task (100% AC coverage)
- Task descriptions are unambiguous enough for AI agents to implement without clarification
- No missing dependencies or circular dependencies in the task graph
- No file contention between tasks marked as parallelizable
- Every task is completable in one Claude Code session (sizing check)
- Tasks are consistent with documented project structure and standards
- Both model reviews completed independently
- Findings synthesized with consensus/disagreement analysis
- No new tasks invented (reviewers critique, not create)

## Methodology Scaling
- **deep**: Full multi-model review with AC-to-task coverage matrix, independent
  Codex and Gemini dispatches, dependency graph analysis, file contention check,
  sizing validation, and detailed recommendation report.
- **mvp**: Single-model coverage check (Claude only). Basic AC-to-task mapping.
  Skip external model dispatches and file contention analysis.
- **custom:depth(1-5)**: Depth 1-2: Claude-only coverage check. Depth 3: add
  dependency analysis. Depth 4: add one external model. Depth 5: full
  multi-model with contention and sizing checks.

## Mode Detection
Update mode if docs/reviews/implementation-plan/review-summary.md exists. In
update mode: re-run full review pipeline, preserve prior findings still valid,
never renumber or rename Beads task IDs (dependencies and commit messages
reference them).
