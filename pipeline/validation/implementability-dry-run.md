---
name: implementability-dry-run
description: Dry-run specs as implementing agent, catching ambiguity
phase: "validation"
order: 1350
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/implementability-dry-run.md]
conditional: null
knowledge-base: [implementability-review]
---

## Purpose
Dry-run specs as implementing agent, catching ambiguity. Simulate what an
AI agent would experience when picking up each implementation task: are the
inputs clear, are the acceptance criteria testable, are there ambiguities
that would force the agent to guess?

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent dry-runs — different models encounter different ambiguities
when simulating implementation.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/implementability-dry-run.md — findings report
- docs/validation/implementability-dry-run/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/implementability-dry-run/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/implementability-dry-run/gemini-review.json (depth 4+, if available) — raw Gemini findings

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
multi-model artifacts exist under docs/validation/implementability-dry-run/,
they are regenerated each run.
