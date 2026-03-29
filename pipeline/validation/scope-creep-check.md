---
name: scope-creep-check
description: Verify specs stay aligned to PRD boundaries
phase: "validation"
order: 1370
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/scope-creep-check.md, docs/validation/scope-creep-check/review-summary.md, docs/validation/scope-creep-check/codex-review.json, docs/validation/scope-creep-check/gemini-review.json]
conditional: null
knowledge-base: [scope-management, multi-model-review-dispatch]
---

## Purpose
Verify specs stay aligned to PRD boundaries. Check that user stories,
architecture, implementation tasks, and other artifacts have not introduced
features, components, or complexity beyond what the PRD requires. User stories
should not introduce features not in the PRD — UX-level enhancements are
allowed only via the innovation step with explicit user approval. Flag any
scope expansion for explicit approval.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent scope analysis — different models interpret PRD boundaries
differently, surfacing subtle creep.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/scope-creep-check.md — findings report
- docs/validation/scope-creep-check/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/scope-creep-check/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/scope-creep-check/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- Every user story traces back to a PRD feature or requirement
- Every architecture component traces to a PRD requirement
- Items beyond PRD scope are flagged with disposition (remove, defer, or justify)
- No "gold-plating" — implementation tasks do not exceed story acceptance criteria
- Feature count has not grown beyond PRD scope without documented justification
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
- **custom:depth(1-5)**: Depth 1: feature count comparison (PRD vs implementation plan). Depth 2: add component-level tracing. Depth 3: full story-level and task-level audit against original PRD scope. Depth 4: add external model scope assessment. Depth 5: multi-model scope review with risk-weighted creep analysis.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/scope-creep-check/,
they are regenerated each run.
