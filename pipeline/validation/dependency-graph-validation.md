---
name: dependency-graph-validation
description: Verify task dependency graphs are acyclic, complete, correctly ordered
phase: "validation"
order: 1360
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/dependency-graph-validation.md]
conditional: null
knowledge-base: [dependency-validation]
---

## Purpose
Verify task dependency graphs are acyclic, complete, correctly ordered.
Validate that the implementation task dependency graph forms a valid DAG,
that all dependencies are satisfied before dependent tasks, and that no
critical tasks are missing from the graph.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/dependency-graph-validation.md — findings report

## Quality Criteria
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Scale thoroughness with depth.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts.
