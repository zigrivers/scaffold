---
description: "Audit naming, assumptions, data flows, and interface contracts across all phases"
long-description: "Cross-references every documentation artifact produced across pipeline phases to detect naming inconsistencies, incompatible assumptions, data shape mismatches, and interface contract conflicts. Produces an actionable findings report sorted by severity."
---

Audit all pipeline artifacts for cross-phase consistency. When different phases produce documents independently, inconsistencies compound — a renamed entity in one phase propagates confusion into every downstream artifact. Your job is to catch every mismatch between artifacts before implementation begins.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/prd.md` — Requirements and scope
- `docs/domain-models/` — Entities, aggregates, value objects, events, invariants
- `docs/adrs/` — Architectural decision records
- `docs/system-architecture.md` — Components, data flows, interfaces
- `docs/database-schema.md` or `docs/schema/` — Tables, columns, types, constraints
- `docs/api-contracts.md` or `docs/api/` — Endpoints, request/response shapes
- `docs/ux-specification.md` or `docs/ux/` — Screens, flows, components
- `docs/user-stories.md` — Stories and acceptance criteria
- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown and dependencies

## What to Check

### 1. Naming Consistency

Extract every named concept from the domain model (aggregates, entities, value objects, events). For each name, search every downstream artifact and flag:
- Spelling variations, abbreviations, or synonyms referring to the same concept (e.g., "User" vs "Account" vs "Member")
- Names in downstream artifacts that do not appear in the domain model (undocumented concepts)
- Singular/plural mismatches across layers (e.g., `Order` entity but `order_items` table without `order_item` entity)

Build an entity registry table:

| Concept | Domain Model | ADRs | Architecture | Schema | API | UX | Tasks |
|---------|-------------|------|-------------|--------|-----|-----|-------|

Flag any row with missing cells or naming mismatches.

### 2. Shared Assumptions

For each phase from architecture onward, identify every assumption about earlier artifacts and verify it is explicitly stated in the source:
- Cardinality (one-to-many vs many-to-many)
- Optionality (required vs optional fields)
- Ordering guarantees (ordered vs unordered collections)
- Uniqueness constraints
- Temporal assumptions (real-time vs eventual consistency)
- Enum value sets (status fields, role types)

### 3. Data Shape Consistency

For each core entity, trace its shape from domain model through schema through API through UX:
- Every domain attribute should map to a schema column (or have a documented reason for omission)
- Every schema column exposed externally should appear in an API contract field
- Types must be compatible (e.g., domain `Money` value object maps to `DECIMAL(10,2)` in schema, formatted string in API)
- Date/time formats, ID formats, and money formats must be consistent or have documented transformations

Build a field-level comparison table for each core entity:

| Field | Domain | Schema | API | UX |
|-------|--------|--------|-----|-----|

### 4. Interface Contract Matching

Extract every component interface from the architecture (method signatures, event subscriptions, data flows). For each:
- Verify a corresponding endpoint or function exists in API contracts
- Verify parameter names and types match
- Verify return types match
- Verify error cases at the interface level are handled at the implementation level

### 5. Data Flow Completeness

Walk each data flow diagram step by step:
- Verify the source component has an API that provides the data
- Verify the target component has an API that accepts the data
- Verify data shapes match between source and target
- Check for orphaned components (appear in flows but have no endpoints or tables)

### 6. Constraint Propagation

Verify ADR constraints are respected in all downstream artifacts:
- Technology choice ADRs align with architecture component annotations
- Pattern ADRs (e.g., "use event sourcing") are reflected in schema and API design
- NFR ADRs have corresponding test criteria

## Findings Format

For each issue found:
- **ID**: CPC-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which file/section
- **Fix**: Specific remediation

### Common patterns to flag as P0:
- Orphaned domain events (defined but never consumed, or consumed but never published)
- Enum drift (values differ between domain model, schema, API, and UX)
- Format divergence without documented transformations (ISO dates in API, Unix timestamps in schema)
- ADR-vs-artifact contradictions (ADR mandates one approach, artifact implements another)

## Process

1. Read all input artifacts listed above
2. Build the entity registry (Pass 1)
3. Trace data shapes field-by-field for each core entity (Pass 2)
4. Walk each data flow end-to-end (Pass 3)
5. Cross-reference ADR constraints against downstream artifacts (Pass 4)
6. Compile findings report sorted by severity
7. Present to user for review
8. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Cross-Phase Consistency complete** — Naming, assumptions, data flows, and interface contracts audited across all phases.

**Next:** Run `/scaffold:traceability-matrix` — Verify every requirement traces from PRD through stories to tasks and tests.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
