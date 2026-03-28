---
name: critical-path-walkthrough
description: Walk critical user journeys end-to-end across all specs
phase: "validation"
order: 1340
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/critical-path-walkthrough.md]
conditional: null
knowledge-base: [critical-path-analysis]
---

## Purpose
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through user stories, UX spec, API contracts,
architecture components, database operations, and implementation tasks.
Use story acceptance criteria as the definition of "correct behavior" when
verifying completeness and consistency at every layer.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent journey walkthroughs — different models catch different
spec gaps along the critical path.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/critical-path-walkthrough.md — findings report
- docs/validation/critical-path-walkthrough/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/critical-path-walkthrough/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/critical-path-walkthrough/gemini-review.json (depth 4+, if available) — raw Gemini findings

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
multi-model artifacts exist under docs/validation/critical-path-walkthrough/,
they are regenerated each run.
