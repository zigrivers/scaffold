---
name: platform-parity-review
description: Audit all documentation for platform-specific gaps across target platforms
phase: "parity"
order: 1010
dependencies: [review-architecture, review-database, review-api, review-ux]
outputs: [docs/reviews/platform-parity-review.md, docs/reviews/platform-parity/review-summary.md, docs/reviews/platform-parity/codex-review.json, docs/reviews/platform-parity/gemini-review.json]
reads: [user-stories, coding-standards, tech-stack, project-structure, tdd]
conditional: "if-needed"
knowledge-base: [cross-phase-consistency, multi-model-review-dispatch, review-step-template]
---

## Purpose
When the project targets multiple platforms (web, iOS, Android, desktop), audit
all documentation to ensure every target platform is thoroughly addressed.
Identify gaps where one platform was assumed but another was not considered,
verify feature parity across targets, and ensure platform-specific testing,
input patterns, and UX considerations are documented.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent platform gap analysis.

## Inputs
- docs/plan.md (required) — target platforms and version requirements
- docs/tech-stack.md (required) — cross-platform framework and build approach
- docs/user-stories.md (required) — stories to check for platform coverage
- docs/coding-standards.md (required) — platform-specific conventions
- docs/project-structure.md (optional) — platform-specific file organization
- docs/tdd-standards.md (optional) — platform-specific testing approach
- docs/design-system.md (optional) — responsive breakpoints and platform patterns
- docs/implementation-plan.md (optional) — tasks covering each platform
- CLAUDE.md (required) — platform-specific workflow notes

## Expected Outputs
- docs/reviews/platform-parity-review.md — platform gap analysis report with
  findings per document, feature parity matrix, and recommended fixes
- docs/reviews/platform-parity/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/platform-parity/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/platform-parity/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- All target platforms identified from PRD and tech-stack.md
- Every user story checked for platform-specific acceptance criteria
- Feature parity matrix shows which features work on which platforms
- Input pattern differences documented (touch vs. mouse, keyboard shortcuts, gestures)
- Platform-specific testing documented (Playwright for web, Maestro for mobile)
- Navigation patterns appropriate per platform (sidebar vs. tab bar, etc.)
- Offline/connectivity handling addressed per platform (if applicable)
- Web version is treated as first-class (not afterthought) if PRD specifies it
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Comprehensive platform audit across all documents, feature parity
  matrix, input pattern analysis, navigation pattern review, offline handling,
  accessibility per platform, and detailed fix recommendations. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Quick check of user stories and tech-stack for platform coverage.
  Identify top 3 platform gaps. Skip detailed feature parity matrix.
- **custom:depth(1-5)**: Depth 1-2: user stories platform check. Depth 3: add
  tech-stack and coding-standards. Depth 4: add feature parity matrix + one
  external model (if CLI available). Depth 5: full suite across all documents
  + multi-model with reconciliation.

## Mode Detection
Update mode if docs/reviews/platform-parity-review.md exists. In update mode:
re-run audit against current documents, preserve prior findings still valid,
note which gaps have been addressed since last review. If multi-model review
artifacts exist under docs/reviews/platform-parity/, preserve prior findings
still valid.

## Update Mode Specifics
- **Detect prior artifact**: docs/reviews/platform-parity-review.md exists
- **Preserve**: existing parity findings still valid, platform-specific decisions,
  feature parity matrix entries for unchanged features
- **Triggers for update**: specification changes (tech-stack.md, user-stories.md,
  system-architecture.md updated), new target platform added to PRD, platform-specific
  coding standards changed
- **Conflict resolution**: preserve platform-specific decisions already made,
  merge new findings alongside existing ones rather than replacing
