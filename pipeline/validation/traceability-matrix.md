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
- (mvp) Every PRD requirement maps to >= 1 user story
- (mvp) Every user story maps to >= 1 implementation task
- (deep) Every acceptance criterion maps to >= 1 test case (verified against `docs/story-tests-map.md`)
- (deep) Every test case maps to >= 1 implementation task
- (deep) No orphan items in either direction at any layer
- (deep) Bidirectional traceability verified: PRD → Stories → Domain → Architecture → Tasks
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
- **custom:depth(1-5)**: Depth 1: PRD requirement to user story mapping only. Depth 2: add story to implementation task mapping. Depth 3: full bidirectional chain (PRD → story → task → test → eval). Depth 4: add external model verification of coverage gaps. Depth 5: multi-model reconciliation with gap resolution recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/traceability-matrix/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/traceability-matrix/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
