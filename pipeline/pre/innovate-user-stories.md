---
name: innovate-user-stories
description: Discover UX-level enhancements and innovation opportunities in user stories
phase: "pre"
order: 6
dependencies: [review-user-stories]
outputs: [docs/user-stories-innovation.md]
conditional: "if-needed"
knowledge-base: [user-stories, user-story-innovation]
---

## Purpose
Discover UX-level enhancements and innovation opportunities within the existing
user stories. This is NOT feature-level innovation (that belongs in PRD
innovation — `innovate-prd`) — it focuses on making existing features better
through smart defaults,
progressive disclosure, accessibility improvements, and AI-native capabilities.

## Inputs
- docs/user-stories.md (required) — stories to enhance
- docs/prd.md (required) — PRD boundaries (innovation must not exceed scope)

## Expected Outputs
- docs/user-stories-innovation.md — innovation findings, suggestions with
  cost/impact assessment, and disposition (accepted/rejected/deferred)
- docs/user-stories.md — updated with approved enhancements

## Quality Criteria
- Enhancements are UX-level, not new features
- Each suggestion has a cost estimate (trivial/moderate/significant)
- Each suggestion has a clear user benefit
- Approved enhancements are integrated into existing stories (not new stories)
- PRD scope boundaries are respected — no scope creep

## Methodology Scaling
- **deep**: Full innovation pass across all three categories (high-value
  low-effort, differentiators, defensive gaps). Cost/impact matrix.
  Detailed integration of approved enhancements into stories.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: not typically enabled. Depth 3: quick
  scan for obvious improvements. Depth 4-5: full innovation pass with
  evaluation framework.

## Mode Detection
If docs/user-stories-innovation.md exists, this is a re-innovation pass. Read
previous suggestions and their disposition (accepted/rejected), focus on new
opportunities from story changes since last run.
