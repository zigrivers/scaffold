---
name: phase-04a-review-database
description: Review database schema for correctness and completeness
phase: "4a"
dependencies: [phase-04-database-schema]
outputs: [docs/reviews/phase-04a-review.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-database-schema]
---

## Purpose
Review database schema targeting schema-specific failure modes: entity coverage
gaps, normalization trade-off issues, missing indexes, migration safety, and
referential integrity vs. domain invariants.

## Inputs
- docs/database-schema.md (required) — schema to review
- docs/domain-models/ (required) — for entity coverage
- docs/system-architecture.md (required) — for query pattern coverage

## Expected Outputs
- docs/reviews/phase-04a-review.md — findings and resolution log
- docs/database-schema.md — updated with fixes

## Quality Criteria
- Entity coverage verified
- Normalization decisions justified
- Index coverage for known query patterns verified
- Migration safety assessed
- Referential integrity matches domain invariants

## Methodology Scaling
- **deep**: Full multi-pass review targeting all schema failure modes.
- **mvp**: Entity coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
