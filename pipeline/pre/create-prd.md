---
name: create-prd
description: Create a product requirements document from a project idea
phase: "pre"
order: 1
dependencies: []
outputs: [docs/plan.md]
conditional: null
knowledge-base: [prd-craft]
---

## Purpose
Transform a project idea into a structured product requirements document that
defines the problem, target users, features, constraints, and success criteria.
This is the foundation document that all subsequent phases reference.

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
