---
name: create-prd
description: Create a product requirements document from a project idea
summary: "Translates your vision (or idea, if no vision exists) into a product requirements document with problem statement, user personas, prioritized feature list, constraints, non-functional requirements, and measurable success criteria."
phase: "pre"
order: 110
dependencies: []
outputs: [docs/plan.md]
conditional: null
knowledge-base: [prd-craft]
reads: [create-vision]
---

## Purpose
Transform a project idea into a structured product requirements document that
defines the problem, target users, features, constraints, and success criteria.
This is the foundation document that all subsequent phases reference.
The PRD drives user stories, architecture decisions, and implementation planning
throughout the entire pipeline.

## Inputs
- Project idea (provided by user verbally or in a brief)
- Existing project files (if brownfield — any README, docs, or code)

## Expected Outputs
- docs/plan.md — Product requirements document

## Quality Criteria
- (mvp) Problem statement names a specific user group, a specific pain point, and a falsifiable hypothesis about the solution
- (mvp) Target users are identified with their needs
- (mvp) Each feature defines at least one explicit out-of-scope item (what it does NOT do) in addition to what it does
- (mvp) Success criteria are measurable
- (mvp) Each non-functional requirement has a measurable target or threshold (e.g., 'page load < 2s', 'WCAG AA')
- (mvp) No two sections contain contradictory statements about the same concept
- (deep) Constraints (technical, timeline, budget, team) are documented

## Methodology Scaling
- **deep**: Comprehensive PRD. Competitive analysis, detailed user personas,
  feature prioritization matrix (MoSCoW or similar), risk assessment, phased
  delivery plan. 15-20 pages.
- **mvp**: Problem statement, core features list, primary user description,
  success criteria. 1-2 pages. Just enough to start building.
- **custom:depth(1-5)**:
  - Depth 1: MVP-style — problem statement, core features list, primary user. 1 page.
  - Depth 2: MVP + success criteria and basic constraints. 1-2 pages.
  - Depth 3: Add user personas and feature prioritization (MoSCoW). 3-5 pages.
  - Depth 4: Add competitive analysis, risk assessment, and phased delivery plan. 8-12 pages.
  - Depth 5: Full PRD with competitive analysis, phased delivery, and detailed non-functional requirements. 15-20 pages.

## Mode Detection
If docs/plan.md exists, operate in update mode: read existing content, identify
what has changed or been learned since it was written, propose targeted updates.
Preserve existing decisions unless explicitly revisiting them.

## Update Mode Specifics
- **Detect prior artifact**: docs/plan.md exists
- **Preserve**: problem statement, existing feature definitions, success criteria,
  user personas, scope boundaries, and enhancement markers (`<!-- enhancement: ... -->`)
  unless user explicitly requests changes
- **Triggers for update**: user provides new requirements, scope adjustment
  requested, constraints changed (timeline, budget, team), new user research
- **Conflict resolution**: new features are appended to the feature list with
  clear versioning; changed constraints are documented with rationale for change

### Understand the Vision

**If `docs/vision.md` exists**: Read it completely. This is your strategic foundation — the vision document has already established the problem space, target audience, value proposition, competitive landscape, and guiding principles. Skip the vision discovery questions below and use the vision document as the North Star for this PRD. Reference it throughout, ensuring every requirement aligns with the stated vision and guiding principles. Focus your discovery questions on translating the vision into concrete product requirements rather than re-exploring strategic direction.

**If `docs/vision.md` does NOT exist**:
- What problem does this solve and for whom? Push me to be specific about the target user.
- What does success look like? How will we know this is working?
- What's the single most important thing this app must do well?
