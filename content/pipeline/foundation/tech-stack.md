---
name: tech-stack
description: Research and document tech stack decisions with rationale for each choice
summary: "Researches technology options for your project — language, framework, database, hosting, auth — evaluates each against your requirements, and documents every choice with rationale and alternatives considered."
phase: "foundation"
order: 220
dependencies: []
outputs: [docs/tech-stack.md]
reads: [create-prd]
conditional: null
knowledge-base: [tech-stack-selection, multi-model-review-dispatch]
---

## Purpose
Research frameworks, languages, databases, and tools that fit the PRD requirements,
then document every technology choice with rationale, alternatives considered, and
AI compatibility notes. This becomes the definitive technology reference that all
subsequent phases depend on for framework-specific decisions.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent technology research — different models have different knowledge
about ecosystem maturity, alternatives, and gotchas.

## Inputs
- docs/plan.md (required) — PRD features, integrations, and technical requirements
- User preferences (gathered via questions) — language, framework, deployment target, constraints

## Expected Outputs
- docs/tech-stack.md — complete technology reference with architecture overview,
  backend, database, frontend (if applicable), infrastructure, developer tooling,
  and third-party services sections, plus a Quick Reference dependency list
- docs/reviews/tech-stack/review-summary.md (depth 4+) — multi-model research synthesis
- docs/reviews/tech-stack/codex-review.json (depth 4+, if available) — raw Codex recommendations
- docs/reviews/tech-stack/gemini-review.json (depth 4+, if available) — raw Gemini recommendations

## Quality Criteria
- (mvp) Every PRD feature cross-referenced against the proposed stack (no capability gaps)
- (mvp) Each technology choice documents what, why, why not alternatives, and AI compatibility
- (mvp) Architecture pattern chosen and justified (monolith vs. microservices, MVC vs. clean, etc.)
- (mvp) No speculative technologies ("might need someday")
- (mvp) Every choice is a decision, not a menu of options
- (mvp) Quick Reference section lists every dependency with version
- (deep) Each technology choice documents AI compatibility assessment (training data availability, convention strength); total direct dependencies counted and justified
- (depth 4+) Multi-model recommendations synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Comprehensive research with competitive analysis for each category.
  Detailed AI compatibility notes per library. Version pinning with upgrade
  strategy. Infrastructure and DevOps recommendations. 10-15 pages. Multi-model
  research dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced research.
- **mvp**: Core stack decisions only (language, framework, database, test runner).
  Brief rationale. Quick Reference with versions. 2-3 pages.
- **custom:depth(1-5)**:
  - Depth 1: Core stack decisions only (language, framework, database). Brief rationale. 1 page.
  - Depth 2: Depth 1 + test runner choice and Quick Reference with versions. 2-3 pages.
  - Depth 3: Add infrastructure, tooling, and developer experience recommendations.
  - Depth 4: Add AI compatibility analysis + one external model research (if CLI available).
  - Depth 5: Full competitive analysis per category, upgrade strategy, + multi-model with cross-referencing.

## Mode Detection
Update mode if docs/tech-stack.md exists. In update mode: never change a
technology choice without user approval, preserve version pins exactly, update
Quick Reference to match any structural changes. If multi-model artifacts exist
under docs/reviews/tech-stack/, preserve prior recommendation dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/tech-stack.md exists
- **Preserve**: all technology choices and their rationale, version pins,
  Quick Reference dependency list, multi-model review artifacts and dispositions
- **Triggers for update**: PRD requirements changed (new integrations needed),
  user requests technology swap, security vulnerability in a dependency,
  new PRD features require capabilities not covered by current stack
- **Conflict resolution**: if a new requirement conflicts with an existing
  technology choice, document the conflict and propose alternatives with
  migration cost — never silently swap a technology
