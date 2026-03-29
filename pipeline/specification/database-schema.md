---
name: database-schema
description: Design database schema from domain models
summary: "Translates your domain model into database tables with constraints that enforce business rules, indexes optimized for your API query patterns, and a reversible migration strategy."
phase: "specification"
order: 810
dependencies: [review-architecture]
outputs: [docs/database-schema.md]
reads: [domain-modeling, system-architecture, adrs]
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
- (mvp) If domain-models/ does not exist, entities derived from user story nouns and PRD feature descriptions
- (mvp) Relationships match domain model relationships
- (mvp) Constraints enforce domain invariants at the database level
- (deep) Migration strategy specifies: migration tool, forward migration approach, rollback approach, and data preservation policy
- (deep) Every migration is reversible (rollback script or equivalent exists)
- (mvp) Indexes cover all query patterns referenced in docs/api-contracts.md (if it exists)
- (mvp) Schema does not contradict upstream domain models (entity names, relationships, and invariants match docs/domain-models/)

## Methodology Scaling
- **deep**: Full schema specification. CREATE TABLE statements or equivalent.
  Index justification with query patterns. Normalization analysis. Migration
  plan with rollback strategy. Seed data strategy.
- **mvp**: Entity-to-table mapping. Key relationships. Primary indexes only.
- **custom:depth(1-5)**: Depth 1: entity-to-table mapping with primary keys
  only. Depth 2: entity-to-table mapping with key relationships and primary
  indexes. Depth 3: add secondary indexes, constraints enforcing domain
  invariants, and normalization analysis. Depth 4: full specification with
  migration plan, rollback strategy, and index justification with query
  patterns. Depth 5: full specification with seed data strategy, performance
  annotations, and multi-environment migration considerations.

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
