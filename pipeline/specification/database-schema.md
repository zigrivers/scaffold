---
name: database-schema
description: Design database schema from domain models
phase: "specification"
order: 810
dependencies: [review-architecture]
outputs: [docs/database-schema.md]
conditional: "if-needed"
knowledge-base: [database-design]
---

## Purpose
Translate domain models into a concrete database schema. Define tables/collections,
relationships, indexes, constraints, and migration strategy. Every domain entity
maps to a table with appropriate normalization, and every domain invariant is
enforced at the database level through constraints. Indexing strategy is derived
from the application's query patterns.

## Inputs
- docs/domain-models/ (required) — entities and relationships to model
- docs/system-architecture.md (required) — data layer architecture decisions
- docs/adrs/ (required) — technology choices (database type, ORM)

## Expected Outputs
- docs/database-schema.md — schema design with tables, relationships, indexes,
  constraints, and migration strategy

## Quality Criteria
- (mvp) Every domain entity maps to a table/collection (or justified denormalization)
- (mvp) Relationships match domain model relationships
- (deep) Indexes cover known query patterns from architecture data flows
- (deep) Constraints enforce domain invariants at the database level
- (deep) Migration strategy specifies: migration tool, forward migration approach, rollback approach, and data preservation policy

## Methodology Scaling
- **deep**: Full schema specification. CREATE TABLE statements or equivalent.
  Index justification with query patterns. Normalization analysis. Migration
  plan with rollback strategy. Seed data strategy.
- **mvp**: Entity-to-table mapping. Key relationships. Primary indexes only.
- **custom:depth(1-5)**: Depth 1-2: mapping only. Depth 3: add indexes and
  constraints. Depth 4-5: full specification with migrations.

## Mode Detection
Check for docs/database-schema.md. If it exists, operate in update mode: read
existing schema and diff against current domain models in docs/domain-models/.
Preserve existing table definitions, relationships, constraints, and migration
history. Add new entities from updated domain models. Update indexes for new
query patterns identified in architecture data flows. Never drop existing
tables without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/database-schema.md exists
- **Preserve**: existing table/collection definitions, relationships, constraints,
  migration history, index justifications, seed data strategy
- **Triggers for update**: domain models changed (new entities or relationships),
  ADRs changed database technology, architecture introduced new query patterns
- **Conflict resolution**: if domain model renamed an entity, create a migration
  that renames rather than drops and recreates; flag breaking changes for user
  review
