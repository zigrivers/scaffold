---
name: innovate-user-stories
description: Discover UX-level enhancements and innovation opportunities in user stories
summary: "Identifies UX enhancement opportunities — progressive disclosure, smart defaults, accessibility improvements — and integrates approved changes into existing stories."
phase: "pre"
order: 160
dependencies: [review-user-stories]
outputs: [docs/user-stories-innovation.md, docs/reviews/user-stories-innovation/review-summary.md, docs/reviews/user-stories-innovation/codex-review.json, docs/reviews/user-stories-innovation/gemini-review.json]
conditional: "if-needed"
knowledge-base: [user-stories, user-story-innovation, multi-model-review-dispatch]
---

## Purpose
Discover UX-level enhancements and innovation opportunities within the existing
user stories. This is NOT feature-level innovation (that belongs in PRD
innovation — `innovate-prd`) — it focuses on making existing features better
through smart defaults,
progressive disclosure, accessibility improvements, and AI-native capabilities.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent UX innovation brainstorming — different models surface different
enhancement opportunities.

## Inputs
- docs/user-stories.md (required) — stories to enhance
- docs/plan.md (required) — PRD boundaries (innovation must not exceed scope)

## Expected Outputs
- docs/user-stories-innovation.md — innovation findings, suggestions with
  cost/impact assessment, and disposition (accepted/rejected/deferred)
- docs/user-stories.md — updated with approved enhancements
- docs/reviews/user-stories-innovation/review-summary.md (depth 4+) — multi-model innovation synthesis
- docs/reviews/user-stories-innovation/codex-review.json (depth 4+, if available) — raw Codex suggestions
- docs/reviews/user-stories-innovation/gemini-review.json (depth 4+, if available) — raw Gemini suggestions

## Quality Criteria
- (mvp) Enhancements are UX-level, not new features
- (mvp) Each suggestion has a cost estimate (trivial/moderate/significant)
- (mvp) Each suggestion has a clear user benefit
- (mvp) Approved enhancements are integrated into existing stories (not new stories)
- (mvp) PRD scope boundaries are respected — no scope creep
- User approval for each accepted innovation documented as a question-response pair with timestamp (e.g., "Q: Accept enhancement X? A: Yes — 2025-01-15T14:30Z")
- (depth 4+) Multi-model suggestions deduplicated and synthesized with unique ideas from each model highlighted

## Methodology Scaling
- **deep**: Full innovation pass across all three categories (high-value
  low-effort, differentiators, defensive gaps). Cost/impact matrix.
  Detailed integration of approved enhancements into stories. Multi-model
  innovation dispatched to Codex and Gemini if available, with graceful
  fallback to Claude-only enhanced brainstorming.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**:
  - Depth 1: Skip (not enough context for meaningful innovation at this depth).
  - Depth 2: Skip (not enough context for meaningful innovation at this depth).
  - Depth 3: Quick scan for obvious UX improvements and low-hanging enhancements.
  - Depth 4: Full innovation pass across all three categories + one external model (if CLI available).
  - Depth 5: Full innovation pass + multi-model with deduplication and synthesis.

## Conditional Evaluation
Enable when: user stories review identifies UX gaps, project targets a consumer-facing
audience, or progressive disclosure patterns would benefit users. Skip when: stories
are backend-only with no user-facing UI, depth < 3, or user explicitly declines
innovation.

## Mode Detection
If docs/user-stories-innovation.md exists, this is a re-innovation pass. Read
previous suggestions and their disposition (accepted/rejected), focus on new
opportunities from story changes since last run. If multi-model artifacts
exist under docs/reviews/user-stories-innovation/, preserve prior suggestion
dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/user-stories-innovation.md exists with
  suggestion dispositions
- **Preserve**: accepted/rejected dispositions from prior runs, cost/impact
  assessments already reviewed, multi-model review artifacts
- **Triggers for update**: user stories changed (new stories added, existing
  stories rewritten), PRD innovation accepted new features that need UX
  enhancement analysis
- **Conflict resolution**: if a previously rejected UX enhancement is now
  relevant due to story changes, re-propose with updated rationale; never
  re-suggest rejected enhancements without a material change in context
