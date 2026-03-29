---
name: domain-modeling
description: Deep domain modeling across all identified project domains
summary: "Analyzes your user stories to identify the core concepts in your project (entities, their relationships, the rules that must always hold true), and establishes a shared vocabulary that all docs and code will use."
phase: "modeling"
order: 510
dependencies: [review-user-stories]
outputs: [docs/domain-models/]
reads: [coding-standards, innovate-user-stories]
conditional: null
knowledge-base: [domain-modeling]
---

## Purpose
Identify and model all domains in the project. For each domain, define entities,
value objects, aggregates, domain events, invariants, and bounded context
boundaries. Establish the ubiquitous language that all subsequent phases use.
Use user stories and their acceptance criteria to discover entities, events,
and aggregate boundaries. User actions reveal the domain model.

## Inputs
- docs/plan.md (required) — requirements defining the problem space
- docs/reviews/pre-review-prd.md (optional) — review findings for context
- docs/prd-innovation.md (optional) — innovation findings and approved enhancements
- docs/user-stories.md (required) — user stories with acceptance criteria for domain discovery

## Expected Outputs
- docs/domain-models/ — one file per domain, each containing:
  - Entity definitions with attributes and relationships
  - Value objects and their validation rules
  - Aggregate boundaries and roots
  - Domain events and their triggers
  - Invariants (business rules that must always hold)
  - Bounded context boundary and its interfaces to other contexts
- docs/domain-models/index.md — overview of all domains and their relationships

## Quality Criteria
- (mvp) Every PRD feature maps to >= 1 domain
- (mvp) Entity relationships are explicit (not implied)
- (mvp) Each aggregate boundary documents: the invariant it protects, the consistency boundary it enforces, and why included entities must change together
- (deep) Domain events cover all state transitions
- (mvp) Each invariant is expressible as a runtime-checkable condition (assertion, validation rule, or database constraint) (e.g., `order.total >= 0`, `user.email matches /^[^@]+@[^@]+$/`), not a narrative description
- (mvp) Every entity name in one domain-model file uses the same name (no synonyms) in all other domain-model files
- (deep) Cross-aggregate event flows documented for every state change that crosses aggregate boundaries
- (deep) Cross-domain relationships are documented at context boundaries

## Methodology Scaling
- **deep**: Full DDD tactical patterns. Detailed entity specs with TypeScript-style
  interfaces. Domain event flows with sequence diagrams. Context maps showing
  relationships between bounded contexts. Separate file per domain.
- **mvp**: Key entities and their relationships in a single file. Core business
  rules listed. Enough to inform architecture decisions.
- **custom:depth(1-5)**: Depth 1: single-file entity list with key relationships.
  Depth 2: single-file entity overview with attributes and core business rules.
  Depth 3: separate files per domain with entities, events, and aggregate boundaries.
  Depth 4: full DDD approach with context maps, detailed invariants, and domain
  event flows. Depth 5: full DDD approach with cross-context integration contracts
  and sequence diagrams for all cross-aggregate flows.

## Mode Detection
If docs/domain-models/ exists, operate in update mode: read existing models,
identify changes needed based on updated PRD or new understanding. Preserve
existing decisions unless explicitly revisiting them.

## Update Mode Specifics
- **Detect prior artifact**: docs/domain-models/ directory exists with model files
- **Preserve**: existing entity definitions, aggregate boundaries, domain events,
  invariants, ubiquitous language terms, bounded context interfaces
- **Triggers for update**: PRD features added or changed, user stories revealed
  new domain concepts, innovation suggestions accepted new capabilities,
  implementation revealed modeling gaps
- **Conflict resolution**: if a new feature introduces an entity name that
  conflicts with existing ubiquitous language, resolve by renaming the new
  entity and documenting the distinction; never silently merge aggregates
