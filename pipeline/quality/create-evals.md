---
name: create-evals
description: Generate project-specific eval checks from standards documentation
phase: "quality"
order: 20.5
dependencies: [tdd]
outputs: [tests/evals/, docs/eval-standards.md]
conditional: null
knowledge-base: [eval-craft, testing-strategy]
---

## Purpose
Generate automated eval checks that verify AI-generated code meets the project's
own documented standards. Evals are test files in the project's own test framework
— not a separate tool. They check four categories: consistency (doc-code sync),
structure (file placement), adherence (coding conventions), and coverage
(requirement-to-test mapping).

## Inputs
- docs/tech-stack.md (required) — determines test framework and stack-specific patterns
- docs/coding-standards.md (required) — adherence patterns to check
- docs/tdd-standards.md (required) — test co-location rules, mocking strategy
- docs/project-structure.md (required) — file placement rules for structure evals
- CLAUDE.md (required) — Key Commands table for consistency evals
- Makefile or package.json (required) — build targets to match against
- docs/user-stories.md (optional) — acceptance criteria for coverage evals
- docs/plan.md (optional) — feature list for coverage evals

## Expected Outputs
- tests/evals/consistency.test.* — command matching, format checking, cross-doc refs
- tests/evals/structure.test.* — file placement, shared code rules, test co-location
- tests/evals/adherence.test.* — coding convention patterns, mock rules, TODO format
- tests/evals/coverage.test.* — feature-to-code mapping, AC-to-test mapping
- tests/evals/helpers.* — shared utilities for reading files, globbing, parsing docs
- docs/eval-standards.md — documents what each eval checks, exclusions, and explicit non-checks
- make eval target (or equivalent) added to Makefile/package.json

## Quality Criteria
- All four eval categories generated (coverage only if user-stories.md exists)
- Evals use the project's own test framework from docs/tech-stack.md
- All generated evals pass on the current codebase (no false positives)
- Adherence evals include exclusion mechanisms (file-level and line-level)
- Eval results are binary PASS/FAIL, not scores
- docs/eval-standards.md explicitly documents what evals do NOT check
- make eval is separate from make test and make check (opt-in for CI)
- Full eval suite runs in under 15 seconds

## Methodology Scaling
- **deep**: All four eval categories. Stack-specific adherence patterns from
  tech-stack.md. Coverage evals with keyword extraction from user stories and
  plan. Confidence-level reporting for coverage matches. Comprehensive exclusion
  documentation.
- **mvp**: Consistency and structure evals only. Skip adherence and coverage.
  Enough to verify doc-code sync and file placement rules.
- **custom:depth(1-5)**: Depth 1-2: consistency only. Depth 3: add structure.
  Depth 4: add adherence with exclusions. Depth 5: full suite with coverage.

## Mode Detection
Update mode if tests/evals/ directory exists. In update mode: regenerate
consistency and structure evals, preserve adherence eval exclusions, regenerate
coverage evals only if plan.md or user-stories.md changed.
