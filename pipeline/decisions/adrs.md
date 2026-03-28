---
name: adrs
description: Document architecture decisions as ADRs
phase: "decisions"
order: 610
dependencies: [review-domain-modeling]
outputs: [docs/adrs/]
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
- Every significant decision has an ADR (technology, patterns, trade-offs)
- Each ADR documents alternatives considered with pros/cons
- Decisions trace to PRD requirements or domain model constraints
- No ADR contradicts another without explicit acknowledgment
- Technology selections include team expertise and maintenance considerations

## Methodology Scaling
- **deep**: Comprehensive ADR set. 3+ alternatives per decision with detailed
  evaluation. Risk assessment for each decision. Cross-references between
  related ADRs. Supersession tracking.
- **mvp**: Core technology choices only (language, framework, database, hosting).
  Brief rationale. Single-paragraph ADRs.
- **custom:depth(1-5)**: Depth 1-2: core tech choices. Depth 3: add pattern
  and integration decisions. Depth 4-5: full evaluation with risk assessment.

## Mode Detection
If docs/adrs/ exists, operate in update mode: review existing ADRs against
current domain models and requirements. Add new ADRs for undocumented decisions.
Supersede ADRs whose context has changed.
