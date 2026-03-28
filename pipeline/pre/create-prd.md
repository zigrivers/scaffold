---
name: create-prd
description: Create a product requirements document from a project idea
phase: "pre"
order: 110
dependencies: []
outputs: [docs/plan.md]
conditional: null
knowledge-base: [prd-craft]
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
- Problem statement is specific and testable (not vague aspirations)
- Target users are identified with their needs
- Features are scoped with clear boundaries (what's in, what's out)
- Success criteria are measurable
- Constraints (technical, timeline, budget, team) are documented
- Non-functional requirements are explicit (performance, security, accessibility)

## Methodology Scaling
- **deep**: Comprehensive PRD. Competitive analysis, detailed user personas,
  feature prioritization matrix (MoSCoW or similar), risk assessment, phased
  delivery plan. 15-20 pages.
- **mvp**: Problem statement, core features list, primary user description,
  success criteria. 1-2 pages. Just enough to start building.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add user personas
  and feature prioritization. Depth 4-5: full competitive analysis and
  phased delivery.

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
