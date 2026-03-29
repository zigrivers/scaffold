---
name: user-stories
description: Translate PRD features into user stories with acceptance criteria
summary: "Breaks every PRD feature into user stories organized by epic, each with testable acceptance criteria in Given/When/Then format."
phase: "pre"
order: 140
dependencies: [review-prd]
outputs: [docs/user-stories.md]
reads: [innovate-prd]
conditional: null
knowledge-base: [user-stories]
---

## Purpose
Translate PRD features and requirements into user stories that define user-facing
behavior. Each story captures who wants what and why, with acceptance criteria
that are testable and specific enough to drive domain modeling, UX design, and
task decomposition downstream.

## Inputs
- docs/plan.md (required) — features, personas, and requirements to translate
- docs/reviews/pre-review-prd.md (optional) — review findings for context
- docs/prd-innovation.md (optional) — innovation findings and approved enhancements

## Expected Outputs
- docs/user-stories.md — user stories organized by epic, each with acceptance
  criteria scaled to the configured depth level

## Quality Criteria
- (mvp) Every PRD feature maps to at least one user story
- (deep) Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- (mvp) Acceptance criteria are testable — unambiguous pass/fail: (a) free of adjectives like 'valid', 'properly', 'quickly', (b) names specific inputs and expected outputs
- (deep) No story has more than 7 acceptance criteria
- (mvp) Every PRD persona is represented in at least one story
- (mvp) Stories describe user behavior, not implementation details
- (mvp) Each story is independent — reordering stories does not break acceptance criteria

## Methodology Scaling
- **deep**: Full story template with IDs, persona journey maps, cross-story
  dependency graphs, Given/When/Then acceptance criteria with parameterized
  examples, story-to-domain-event mapping for domain modeling consumption.
- **mvp**: Flat list of one-liner stories grouped by PRD section. One bullet
  per story for the primary success condition. No epics, no scope boundaries.
- **custom:depth(1-5)**:
  - Depth 1: Flat list of one-liner stories grouped by PRD section. One bullet per story.
  - Depth 2: Flat list with brief acceptance criteria (1-2 criteria per story).
  - Depth 3: Full template with story IDs, epics, Given/When/Then acceptance criteria.
  - Depth 4: Add dependency mapping, traceability to PRD features, and UI/UX notes.
  - Depth 5: Full suite with story splitting rationale, persona journey maps, and story-to-domain-event mapping.

## Mode Detection
If docs/user-stories.md exists, operate in update mode: read existing stories,
identify changes needed based on updated PRD, categorize as ADD/RESTRUCTURE/
PRESERVE, get approval before modifying. Preserve existing story IDs.

## Update Mode Specifics
- **Detect prior artifact**: docs/user-stories.md exists
- **Preserve**: existing story IDs, epic groupings, acceptance criteria that
  haven't been invalidated, story-to-PRD-feature traceability, enhancement
  markers (`<!-- enhancement: ... -->`), priority decisions, story ID format
  (US-xxx)
- **Triggers for update**: PRD features added or changed, innovation suggestions
  accepted, user personas expanded, review findings require story adjustments
- **Conflict resolution**: never reuse a retired story ID; if a story's scope
  changed, update its acceptance criteria in-place rather than creating a
  duplicate story
