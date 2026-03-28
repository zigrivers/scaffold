---
name: scope-creep-check
description: Verify specs stay aligned to PRD boundaries
phase: "validation"
order: 1370
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/scope-creep-check.md]
conditional: null
knowledge-base: [scope-management]
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
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

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
multi-model artifacts exist under docs/validation/scope-creep-check/,
they are regenerated each run.
