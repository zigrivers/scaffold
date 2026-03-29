---
name: review-user-stories
description: Multi-pass review of user stories for PRD coverage, quality, and downstream readiness
phase: "pre"
order: 150
dependencies: [user-stories]
outputs: [docs/reviews/pre-review-user-stories.md, docs/reviews/user-stories/requirements-index.md, docs/reviews/user-stories/coverage.json, docs/reviews/user-stories/review-summary.md]
conditional: null
knowledge-base: [review-methodology, review-user-stories, multi-model-review-dispatch, review-step-template]
---

## Purpose
Deep multi-pass review of user stories, targeting failure modes specific to
story artifacts. Identify coverage gaps, quality issues, and downstream
readiness problems. Create a fix plan, execute fixes, and re-validate.

At higher depths, builds a formal requirements index with traceability matrix
and optionally dispatches to external AI models (Codex, Gemini) for
independent coverage validation.

## Inputs
- docs/user-stories.md (required) — stories to review
- docs/plan.md (required) — source requirements for coverage checking
- docs/reviews/user-stories/ artifacts (optional) — prior review findings in update mode

## Expected Outputs
- docs/reviews/pre-review-user-stories.md — review findings, fix plan, and resolution log
- docs/user-stories.md — updated with fixes
- docs/reviews/user-stories/requirements-index.md (depth 4+) — atomic requirements
  extracted from PRD with REQ-xxx IDs
- docs/reviews/user-stories/coverage.json (depth 4+) — requirement-to-story mapping
- docs/reviews/user-stories/review-summary.md (depth 5) — multi-model review
  synthesis with coverage verification

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Every story has at least one testable acceptance criterion, and every PRD feature maps to at least one story
- (depth 4+) Every atomic PRD requirement has a REQ-xxx ID in the requirements index
- (depth 4+) Coverage matrix maps every REQ to at least one US (100% coverage target)
- (depth 5) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: All 6 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Requirements
  index and coverage matrix built. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Pass 1 only (PRD coverage). Focus on blocking gaps — PRD features
  with no corresponding story.
- **custom:depth(1-5)**: Depth 1: pass 1 only. Depth 2: passes 1-2.
  Depth 3: passes 1-4. Depth 4: all 6 passes + requirements index + coverage
  matrix. Depth 5: all of depth 4 + multi-model review (if CLIs available).

## Mode Detection
If docs/reviews/pre-review-user-stories.md exists, this is a re-review. Read
previous findings, check which were addressed, run review passes again on
updated stories. If docs/reviews/user-stories/requirements-index.md exists,
preserve requirement IDs — never renumber REQ-xxx IDs.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-user-stories.md` exists with tracking comment
- **Preserve**: Prior findings still valid, REQ-xxx IDs, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
