---
name: database-schema
description: Design database schema from domain models
phase: "specification"
order: 13
dependencies: [system-architecture]
outputs: [docs/database-schema.md]
conditional: "if-needed"
knowledge-base: [database-design]
---

## Purpose
Translate domain models into a concrete database schema. Define tables/collections,
relationships, indexes, constraints, and migration strategy.

## Inputs
- docs/domain-models/ (required) — entities and relationships to model
- docs/system-architecture.md (required) — data layer architecture decisions
- docs/adrs/ (required) — technology choices (database type, ORM)

## Expected Outputs
- docs/database-schema.md — schema design with tables, relationships, indexes,
  constraints, and migration strategy

## Quality Criteria
- Every domain entity maps to a table/collection (or justified denormalization)
- Relationships match domain model relationships
- Indexes cover known query patterns from architecture data flows
- Constraints enforce domain invariants at the database level
- Migration strategy handles schema evolution

## Methodology Scaling
- **deep**: Full schema specification. CREATE TABLE statements or equivalent.
  Index justification with query patterns. Normalization analysis. Migration
  plan with rollback strategy. Seed data strategy.
- **mvp**: Entity-to-table mapping. Key relationships. Primary indexes only.
- **custom:depth(1-5)**: Depth 1-2: mapping only. Depth 3: add indexes and
  constraints. Depth 4-5: full specification with migrations.

## Mode Detection
Update mode if schema exists. Diff against current domain models.
