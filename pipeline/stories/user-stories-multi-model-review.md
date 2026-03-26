---
name: user-stories-multi-model-review
description: Multi-model review of user stories for 100% PRD coverage validation
phase: "stories"
order: 62
dependencies: [user-stories]
outputs: [docs/reviews/user-stories/review-summary.md]
conditional: "if-needed"
knowledge-base: [review-methodology, user-stories]
---

## Purpose
Dispatch user stories to independent AI models (Codex, Gemini) for parallel
coverage audits, then synthesize findings into an actionable review. Enforces
100% PRD coverage with hard traceability — every atomic PRD requirement must
map to at least one user story. Catches single-model blind spots through
multi-model validation.

## Inputs
- docs/plan.md (required) — PRD with atomic requirements to trace
- docs/user-stories.md (required) — stories to validate for coverage
- docs/reviews/user-stories/ artifacts (optional) — prior review findings in update mode

## Expected Outputs
- docs/reviews/user-stories/requirements-index.md — atomic requirements extracted
  from PRD with REQ-xxx IDs
- docs/reviews/user-stories/coverage.json — requirement-to-story mapping matrix
- docs/reviews/user-stories/codex-review.json — Codex model review findings
- docs/reviews/user-stories/gemini-review.json — Gemini model review findings
- docs/reviews/user-stories/review-summary.md — synthesized findings with
  coverage gaps, ambiguity issues, and recommended story updates

## Quality Criteria
- Every atomic PRD requirement has a REQ-xxx ID in the requirements index
- Coverage matrix maps every REQ to at least one US (100% coverage target)
- Both model reviews completed independently (no cross-contamination)
- Findings synthesized with consensus/disagreement analysis
- No new features invented (reviewers critique, not create)
- All story IDs (US-xxx) preserved (referenced by Beads tasks and plans)
- Coverage gaps result in actionable recommendations (not vague suggestions)

## Methodology Scaling
- **deep**: Full multi-model review with requirements extraction, independent
  Codex and Gemini dispatches, coverage matrix, consensus analysis, and
  detailed recommendation report.
- **mvp**: Single-model coverage check (Claude only). Requirements index and
  basic coverage mapping. Skip Codex/Gemini dispatches.
- **custom:depth(1-5)**: Depth 1-2: Claude-only coverage check. Depth 3: add
  requirements index. Depth 4: add one external model. Depth 5: full
  multi-model with consensus analysis.

## Mode Detection
Update mode if docs/reviews/user-stories/review-summary.md exists. In update
mode: re-run full review pipeline, preserve prior findings still valid, never
renumber requirement IDs (coverage.json references them), new requirements get
next available ID.
