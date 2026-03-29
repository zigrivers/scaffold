---
name: cross-phase-consistency
description: Audit naming, assumptions, data flows, interface contracts across all phases
summary: "Traces every named concept (entities, fields, API endpoints) across all documents and flags any naming drift, terminology mismatches, or data shape inconsistencies."
phase: "validation"
order: 1310
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/cross-phase-consistency.md, docs/validation/cross-phase-consistency/review-summary.md, docs/validation/cross-phase-consistency/codex-review.json, docs/validation/cross-phase-consistency/gemini-review.json]
conditional: null
knowledge-base: [cross-phase-consistency, multi-model-review-dispatch]
---

## Purpose
Audit naming, assumptions, data flows, interface contracts across all phases.
Ensure consistent terminology, compatible assumptions, and aligned interfaces
between every pair of phase artifacts.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent consistency validation — different models catch different
drift patterns.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/cross-phase-consistency.md — findings report
- docs/validation/cross-phase-consistency/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/cross-phase-consistency/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/cross-phase-consistency/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Entity names are consistent across domain models, database schema, and API contracts (zero mismatches)
- (mvp) Technology references match `docs/tech-stack.md` in all documents
- (deep) Data flow descriptions in architecture match API endpoint definitions
- (deep) Every named entity in the domain model has exactly one name used consistently across domain-models/, api-contracts.md, database-schema.md, and ux-spec.md
- Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

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
- **custom:depth(1-5)**: Depth 1: entity name check across PRD, user stories, and domain models. Depth 2: add tech stack reference consistency. Depth 3: full terminology audit across all documents with naming collision detection. Depth 4: add external model cross-check. Depth 5: multi-model reconciliation of consistency findings.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/cross-phase-consistency/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/cross-phase-consistency/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
