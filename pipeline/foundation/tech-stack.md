---
name: tech-stack
description: Research and document tech stack decisions with rationale for each choice
phase: "foundation"
order: 220
dependencies: []
outputs: [docs/tech-stack.md]
conditional: null
knowledge-base: [tech-stack-selection]
---

## Purpose
Research frameworks, languages, databases, and tools that fit the PRD requirements,
then document every technology choice with rationale, alternatives considered, and
AI compatibility notes. This becomes the definitive technology reference that all
subsequent phases depend on for framework-specific decisions.

## Inputs
- docs/plan.md (required) — PRD features, integrations, and technical requirements
- User preferences (gathered via questions) — language, framework, deployment target, constraints

## Expected Outputs
- docs/tech-stack.md — complete technology reference with architecture overview,
  backend, database, frontend (if applicable), infrastructure, developer tooling,
  and third-party services sections, plus a Quick Reference dependency list

## Quality Criteria
- Every PRD feature cross-referenced against the proposed stack (no capability gaps)
- Each technology choice documents what, why, why not alternatives, and AI compatibility
- Architecture pattern chosen and justified (monolith vs. microservices, MVC vs. clean, etc.)
- No speculative technologies ("might need someday")
- Every choice is a decision, not a menu of options
- Quick Reference section lists every dependency with version
- Stack optimizes for AI familiarity, convention over configuration, minimal dependencies,
  strong typing, and mature ecosystem

## Methodology Scaling
- **deep**: Comprehensive research with competitive analysis for each category.
  Detailed AI compatibility notes per library. Version pinning with upgrade
  strategy. Infrastructure and DevOps recommendations. 10-15 pages.
- **mvp**: Core stack decisions only (language, framework, database, test runner).
  Brief rationale. Quick Reference with versions. 2-3 pages.
- **custom:depth(1-5)**: Depth 1-2: MVP decisions. Depth 3: add infrastructure
  and tooling. Depth 4: add AI compatibility analysis. Depth 5: full competitive
  analysis and upgrade strategy.

## Mode Detection
Update mode if docs/tech-stack.md exists. In update mode: never change a
technology choice without user approval, preserve version pins exactly, update
Quick Reference to match any structural changes.
