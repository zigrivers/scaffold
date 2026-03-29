---
name: review-database
description: Review database schema for correctness and completeness
phase: "specification"
order: 820
dependencies: [database-schema]
outputs: [docs/reviews/review-database.md, docs/reviews/database/review-summary.md, docs/reviews/database/codex-review.json, docs/reviews/database/gemini-review.json]
conditional: "if-needed"
knowledge-base: [review-methodology, review-database-design, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review database schema targeting schema-specific failure modes: entity coverage
gaps, normalization trade-off issues, missing indexes, migration safety, and
referential integrity vs. domain invariants.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/database-schema.md (required) — schema to review
- docs/domain-models/ (required) — for entity coverage
- docs/system-architecture.md (required) — for query pattern coverage

## Expected Outputs
- docs/reviews/review-database.md — findings and resolution log
- docs/database-schema.md — updated with fixes
- docs/reviews/database/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/database/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/database/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every domain entity has a corresponding table/collection or documented denormalization rationale
- (mvp) Normalization decisions justified
- (deep) Index coverage for known query patterns verified
- (deep) Migration safety assessed
- (mvp) Referential integrity matches domain invariants
- (mvp) Every finding categorized P0-P3 with specific table, column, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to database-schema.md and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before API contracts proceed
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review targeting all schema failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Entity coverage check only.
- **custom:depth(1-5)**: Depth 1: entity coverage and normalization pass only. Depth 2: add index strategy and migration safety passes. Depth 3: add query performance and data integrity passes. Depth 4: add external model review. Depth 5: multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/database/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-database.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
