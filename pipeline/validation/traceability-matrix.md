---
name: traceability-matrix
description: Build traceability from PRD requirements through architecture to implementation tasks
phase: "validation"
order: 1320
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/traceability-matrix.md, docs/validation/traceability-matrix/review-summary.md, docs/validation/traceability-matrix/codex-review.json, docs/validation/traceability-matrix/gemini-review.json]
reads: [story-tests, create-evals]
conditional: null
knowledge-base: [traceability, multi-model-review-dispatch]
---

## Purpose
Build traceability from PRD requirements through user stories and architecture
to implementation tasks. Verify the full chain: PRD → User Stories → Domain
Model → Architecture → Tasks, with no orphans in either direction. Every PRD
requirement must trace to at least one story, every story to at least one task.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent traceability validation — different models catch different
coverage gaps.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)
- docs/story-tests-map.md (required if exists) — AC-to-test-case traceability
- tests/acceptance/ (required if exists) — test skeleton files for verification
- docs/eval-standards.md (required if exists) — eval coverage documentation

## Expected Outputs
- docs/validation/traceability-matrix.md — findings report
- docs/validation/traceability-matrix/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/traceability-matrix/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/traceability-matrix/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- Every PRD requirement maps to >= 1 user story
- Every user story maps to >= 1 implementation task
- Every acceptance criterion maps to >= 1 test case (verified against `docs/story-tests-map.md`)
- Every test case maps to >= 1 implementation task
- No orphan items in either direction at any layer
- Bidirectional traceability verified: PRD → Stories → Domain → Architecture → Tasks
- Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Depth 1-3: scale thoroughness with depth. Depth 4:
  full analysis + one external model (if CLI available). Depth 5: full
  analysis + multi-model with reconciliation.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/traceability-matrix/,
they are regenerated each run.
