---
name: user-stories
description: Translate PRD features into user stories with acceptance criteria
phase: "pre"
order: 4
dependencies: [review-prd]
outputs: [docs/user-stories.md]
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
- Every PRD feature maps to at least one user story
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Acceptance criteria are testable — unambiguous pass/fail
- No story too large to implement in 1-3 focused agent sessions
- Every PRD persona is represented in at least one story
- Stories describe user behavior, not implementation details

## Methodology Scaling
- **deep**: Full story template with IDs, persona journey maps, cross-story
  dependency graphs, Given/When/Then acceptance criteria with parameterized
  examples, story-to-domain-event mapping for domain modeling consumption.
- **mvp**: Flat list of one-liner stories grouped by PRD section. One bullet
  per story for the primary success condition. No epics, no scope boundaries.
- **custom:depth(1-5)**: Depth 1-2: flat list with brief acceptance criteria.
  Depth 3: full template with IDs, epics, Given/When/Then. Depth 4-5: add
  dependency mapping, traceability, UI/UX notes, story splitting rationale.

## Mode Detection
If docs/user-stories.md exists, operate in update mode: read existing stories,
identify changes needed based on updated PRD, categorize as ADD/RESTRUCTURE/
PRESERVE, get approval before modifying. Preserve existing story IDs.
