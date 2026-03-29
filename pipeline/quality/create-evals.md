---
name: create-evals
description: Generate project-specific eval checks from standards documentation
phase: "quality"
order: 920
dependencies: [tdd, story-tests]
outputs: [tests/evals/, docs/eval-standards.md]
reads: [security, dev-env-setup, api-contracts, database-schema, ux-spec]
conditional: null
knowledge-base: [eval-craft, testing-strategy]
---

## Purpose
Generate automated eval checks that verify AI-generated code meets the project's
own documented standards. Evals are test files in the project's own test framework
— not a separate tool. They check up to 13 categories: 5 core (always generated)
and 8 conditional (generated when their source document exists). Core: consistency,
structure, adherence, coverage, cross-doc. Conditional: architecture conformance,
API contract, security patterns, database schema, accessibility, performance budget,
configuration validation, error handling completeness.

## Inputs
- docs/tech-stack.md (required) — determines test framework and stack-specific patterns
- docs/coding-standards.md (required) — adherence and error handling patterns
- docs/tdd-standards.md (required) — test co-location rules, mocking strategy
- docs/project-structure.md (required) — file placement rules for structure evals
- CLAUDE.md (required) — Key Commands table for consistency evals
- Makefile or package.json (required) — build targets to match against
- tests/acceptance/ (optional) — story test skeletons for coverage validation
- docs/user-stories.md (optional) — acceptance criteria for coverage evals
- docs/plan.md (optional) — feature list for coverage evals, performance NFRs
- docs/system-architecture.md (optional) — architecture conformance evals
- docs/api-contracts.md (optional) — API contract validation evals
- docs/security-review.md (optional) — security pattern verification evals
- docs/database-schema.md (optional) — database schema conformance evals
- docs/ux-spec.md (optional) — accessibility compliance evals
- docs/dev-setup.md (optional) — configuration validation evals

## Expected Outputs

Core (always generated):
- tests/evals/consistency.test.* — command matching, format checking, cross-doc refs
- tests/evals/structure.test.* — file placement, shared code rules, test co-location
- tests/evals/adherence.test.* — coding convention patterns, mock rules, TODO format
- tests/evals/coverage.test.* — feature-to-code mapping, AC-to-test mapping
- tests/evals/cross-doc.test.* — tech stack consistency, path consistency, terminology

Conditional (generated when source doc exists):
- tests/evals/architecture.test.* — layer direction, module boundaries, circular deps
- tests/evals/api-contract.test.* — endpoint existence, methods, error codes
- tests/evals/security.test.* — auth middleware, secrets, input validation, SQL injection
- tests/evals/database.test.* — migration coverage, columns, indexes, relationships
- tests/evals/accessibility.test.* — ARIA, alt text, focus styles, contrast
- tests/evals/performance.test.* — budget files, bundle tracking, perf test existence
- tests/evals/config.test.* — env var docs, dead config, startup validation
- tests/evals/error-handling.test.* — bare catches, error responses tested, custom errors

Supporting:
- tests/evals/helpers.* — shared utilities
- docs/eval-standards.md — documents what is and isn't checked
- make eval target added to Makefile/package.json

## Quality Criteria
- (mvp) Consistency + Structure evals generated
- (mvp) Evals use the project's own test framework from docs/tech-stack.md
- (mvp) All generated evals pass on the current codebase (no false positives)
- (mvp) Eval results are binary PASS/FAIL, not scores
- (mvp) make eval is separate from make test and make check (opt-in for CI)
- (deep) All applicable eval categories generated including security, API, DB, accessibility (conditional on source doc existence)
- (deep) Adherence, security, and error-handling evals include exclusion mechanisms
- (deep) docs/eval-standards.md explicitly documents what evals do NOT check
- (deep) Full eval suite runs in under 30 seconds
- (mvp) `make eval` (or equivalent) runs and all generated evals pass
- (deep) Eval false-positive assessment: each eval category documents at least one scenario where valid code might incorrectly fail, with exclusion mechanism

## Methodology Scaling
- **deep**: All 13 eval categories (conditional on doc existence). Stack-specific
  patterns. Coverage with keyword extraction. Cross-doc consistency. Architecture
  conformance. API contract validation. Security patterns. Full suite.
- **mvp**: Consistency + Structure only. Skip everything else.
- **custom:depth(1-5)**:
  - Depth 1-2: Consistency + Structure
  - Depth 3: Add Adherence + Cross-doc
  - Depth 4: Add Coverage + Architecture + Config + Error handling
  - Depth 5: All 13 categories (Security, API, Database, Accessibility, Performance)

## Mode Detection
Update mode if tests/evals/ directory or docs/eval-standards.md exists. In
update mode: regenerate consistency, structure, cross-doc, and conditional
category evals. Preserve adherence, security, and error-handling eval
exclusions. Regenerate coverage evals only if plan.md or user-stories.md
changed. Add/remove conditional categories based on whether their source doc
exists.

## Update Mode Specifics
- **Detect prior artifact**: tests/evals/ directory exists with eval test files
- **Preserve**: adherence eval exclusions, security eval exclusions,
  error-handling eval exclusions, custom helper utilities in tests/evals/helpers,
  make eval target configuration
- **Triggers for update**: source docs changed (coding-standards, project-structure,
  tech-stack), new conditional source docs appeared (e.g., security-review.md
  now exists), Makefile targets changed, user-stories.md changed
- **Conflict resolution**: if a source doc was removed, archive its conditional
  eval category rather than deleting; if exclusion patterns conflict with new
  standards, flag for user review
