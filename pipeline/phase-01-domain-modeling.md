---
name: phase-01-domain-modeling
description: Deep domain modeling across all identified project domains
phase: "1"
dependencies: [create-prd]
outputs: [docs/domain-models/]
conditional: null
knowledge-base: [domain-modeling]
---

## Purpose
Identify and model all domains in the project. For each domain, define entities,
value objects, aggregates, domain events, invariants, and bounded context
boundaries. Establish the ubiquitous language that all subsequent phases use.

## Inputs
- docs/prd.md (required) — requirements defining the problem space
- docs/prd-gap-analysis.md (optional) — refined requirements

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
- Every PRD feature maps to at least one domain
- Entity relationships are explicit (not implied)
- Aggregate boundaries are justified (why this grouping?)
- Domain events cover all state transitions
- Invariants are testable assertions, not vague rules
- Ubiquitous language is consistent across all domain models
- Cross-domain relationships are documented at context boundaries

## Methodology Scaling
- **deep**: Full DDD tactical patterns. Detailed entity specs with TypeScript-style
  interfaces. Domain event flows with sequence diagrams. Context maps showing
  relationships between bounded contexts. Separate file per domain.
- **mvp**: Key entities and their relationships in a single file. Core business
  rules listed. Enough to inform architecture decisions.
- **custom:depth(1-5)**: Depth 1-2: single-file entity overview. Depth 3: separate
  files per domain with entities and events. Depth 4-5: full DDD approach with
  context maps and detailed invariants.

## Mode Detection
If docs/domain-models/ exists, operate in update mode: read existing models,
identify changes needed based on updated PRD or new understanding. Preserve
existing decisions unless explicitly revisiting them.
