---
name: adrs
description: Document architecture decisions as ADRs
summary: "Documents every significant design decision — what was chosen, what alternatives were considered with pros and cons, and what consequences follow — so future contributors understand why, not just what."
phase: "decisions"
order: 610
dependencies: [review-domain-modeling]
outputs: [docs/adrs/]
reads: [create-prd, domain-modeling]
conditional: null
knowledge-base: [adr-craft]
---

## Purpose
Identify and document all significant architecture decisions. Each decision gets
its own ADR with context, options considered, decision made, and consequences.
Technology selection (language, framework, database, infrastructure) is a key
ADR category — tech stack decisions are documented here.

## Inputs
- docs/domain-models/ (required) — domain structure driving architecture choices
- docs/plan.md (required) — requirements and constraints

## Expected Outputs
- docs/adrs/ — one ADR file per decision (ADR-NNN-title.md format)
- docs/adrs/index.md — decision log overview

## Quality Criteria
- (mvp) ADRs exist for: language, framework, database, ORM, deployment target, API style, authentication, and any decision referenced in system-architecture.md
- (deep) Each ADR documents alternatives considered with pros/cons
- (mvp) Decisions map to PRD requirements or domain model constraints
- (mvp) No ADR contradicts another without explicit acknowledgment
- (deep) Technology selections include team expertise and maintenance considerations
- (deep) Decision dependencies documented — if ADR-002 depends on ADR-001's outcome, the dependency is explicit

## Methodology Scaling
- **deep**: Comprehensive ADR set. 3+ alternatives per decision with detailed
  evaluation. Risk assessment for each decision. Cross-references between
  related ADRs. Supersession tracking.
- **mvp**: Core technology choices only (language, framework, database, hosting).
  Brief rationale. Single-paragraph ADRs.
- **custom:depth(1-5)**:
  - Depth 1: core tech choices only (language, framework, database) with single-paragraph rationale.
  - Depth 2: core tech choices plus hosting and ORM with brief rationale.
  - Depth 3: add pattern and integration decisions with 2+ alternatives per decision.
  - Depth 4: full evaluation with 3+ alternatives, risk assessment, and decision dependency tracking.
  - Depth 5: full evaluation with cross-references between related ADRs, supersession tracking, and team expertise considerations.

## Mode Detection
If docs/adrs/ exists, operate in update mode: review existing ADRs against
current domain models and requirements. Add new ADRs for undocumented decisions.
Supersede ADRs whose context has changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/adrs/ directory exists with ADR files
- **Preserve**: existing ADR numbers and titles, accepted decisions and their
  rationale, supersession chain integrity, index.md decision log
- **Triggers for update**: domain models changed (new architectural decisions
  needed), requirements changed (existing decisions may need revisiting),
  implementation revealed unforeseen trade-offs
- **Conflict resolution**: never modify an accepted ADR — instead create a new
  ADR that supersedes it, linking back to the original with explanation of
  what changed
