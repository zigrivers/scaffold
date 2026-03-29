---
name: innovate-prd
description: Discover feature-level innovation opportunities in the PRD
summary: "Analyzes the PRD for feature-level gaps — competitive blind spots, UX enhancements, AI-native possibilities — and proposes additions for your approval."
phase: "pre"
order: 130
dependencies: [review-prd]
outputs: [docs/prd-innovation.md, docs/plan.md, docs/reviews/prd-innovation/review-summary.md, docs/reviews/prd-innovation/codex-review.json, docs/reviews/prd-innovation/gemini-review.json]
conditional: "if-needed"
knowledge-base: [prd-innovation, prd-craft, multi-model-review-dispatch]
---

## Purpose
Discover feature-level innovation opportunities within the PRD. This covers
new capabilities, competitive positioning, and defensive product gaps. It is
NOT UX-level enhancement (that belongs in user story innovation) — it focuses
on whether the right features are in the PRD at all.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent innovation brainstorming — different models surface different
creative opportunities and competitive insights.

## Inputs
- docs/plan.md (required) — PRD to analyze for innovation opportunities
- docs/reviews/pre-review-prd.md (optional) — review findings for context

## Expected Outputs
- docs/prd-innovation.md — innovation findings, suggestions with cost/impact
  assessment, and disposition (accepted/rejected/deferred)
- docs/plan.md — updated with approved innovations
- docs/reviews/prd-innovation/review-summary.md (depth 4+) — multi-model innovation synthesis
- docs/reviews/prd-innovation/codex-review.json (depth 4+, if available) — raw Codex suggestions
- docs/reviews/prd-innovation/gemini-review.json (depth 4+, if available) — raw Gemini suggestions

## Quality Criteria
- (mvp) Enhancements are feature-level, not UX-level polish
- (mvp) Each suggestion has a cost estimate (trivial/moderate/significant)
- (mvp) Each suggestion has a clear user benefit and impact assessment
- (mvp) Each approved innovation includes: problem it solves, target users, scope boundaries, and success criteria
- (mvp) PRD scope boundaries are respected — no uncontrolled scope creep
- (mvp) User approval is obtained before modifying the PRD
- (mvp) User approval for each accepted innovation documented as a question-response pair with timestamp (e.g., "Q: Accept feature X? A: Yes — 2025-01-15T14:30Z")
- (mvp) Each innovation marked with approval status: approved, deferred, or rejected, with user decision timestamp
- (depth 4+) Multi-model suggestions deduplicated and synthesized with unique ideas from each model highlighted

## Methodology Scaling
- **deep**: Full innovation pass across all categories (competitive research,
  UX gaps, AI-native opportunities, defensive product thinking). Cost/impact
  matrix. Detailed integration of approved innovations into PRD. Multi-model
  innovation dispatched to Codex and Gemini if available, with graceful
  fallback to Claude-only enhanced brainstorming.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**:
  - Depth 1: Skip (not enough context for meaningful innovation at this depth).
  - Depth 2: Skip (not enough context for meaningful innovation at this depth).
  - Depth 3: Quick scan for obvious gaps and missing expected features.
  - Depth 4: Full innovation pass across all categories + one external model (if CLI available).
  - Depth 5: Full innovation pass + multi-model with deduplication and synthesis.

## Conditional Evaluation
Enable when: project has a competitive landscape section in plan.md, user explicitly
requests an innovation pass, or the PRD review (review-prd) identifies feature gaps
or missing capabilities. Skip when: PRD is minimal/exploratory, depth < 3, or user
explicitly declines innovation.

## Mode Detection
If docs/prd-innovation.md exists, this is a re-innovation pass. Read previous
suggestions and their disposition (accepted/rejected/deferred), focus on new
opportunities from PRD changes since last run. If multi-model artifacts exist
under docs/reviews/prd-innovation/, preserve prior suggestion dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/prd-innovation.md exists with suggestion
  dispositions
- **Preserve**: accepted/rejected/deferred dispositions from prior runs,
  cost/impact assessments already reviewed by user, multi-model review artifacts
- **Triggers for update**: PRD scope changed (new features added or removed),
  user requests re-evaluation of deferred suggestions, new external model
  available for additional perspectives
- **Conflict resolution**: if a previously rejected suggestion is now relevant
  due to PRD changes, re-propose with updated rationale referencing the change
