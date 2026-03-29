---
name: review-domain-modeling
description: Review domain models for completeness, consistency, and downstream readiness
summary: "Verifies every PRD feature maps to a domain entity, checks that business rules are enforceable, and ensures the shared vocabulary is consistent across all project files."
phase: "modeling"
order: 520
dependencies: [domain-modeling]
outputs: [docs/reviews/review-domain-modeling.md, docs/reviews/domain-modeling/review-summary.md, docs/reviews/domain-modeling/codex-review.json, docs/reviews/domain-modeling/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-domain-modeling, multi-model-review-dispatch, review-step-template]
---

## Purpose
Deep multi-pass review of the domain models, targeting the specific failure modes
of domain modeling artifacts. Identify issues, create a fix plan, execute fixes,
and re-validate.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/domain-models/ (required) — domain models to review
- docs/plan.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/review-domain-modeling.md — review findings, fix plan, and resolution log
- docs/domain-models/ — updated with fixes
- docs/reviews/domain-modeling/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/domain-modeling/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/domain-modeling/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) All review passes executed with findings documented
- (mvp) Every finding categorized by severity (P0-P3). Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan created for P0 and P1 findings
- (mvp) Fixes applied and re-validated
- (mvp) Downstream readiness confirmed (decisions phase can proceed)
- (mvp) Entity coverage verified (every PRD feature maps to at least one entity)
- (deep) Aggregate boundaries verified (each aggregate protects at least one invariant)
- (deep) Ubiquitous language consistency verified across all domain model files
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Quick consistency check. Focus on blocking issues only.
- **custom:depth(1-5)**: Depth 1: single pass — blocking issues only (entity
  coverage against PRD). Depth 2: two passes — entity coverage + ubiquitous
  language consistency. Depth 3: four passes — entity coverage, ubiquitous
  language, aggregate boundary validation, and cross-domain consistency.
  Depth 4: all review passes + one external model (if CLI available).
  Depth 5: all review passes + multi-model with reconciliation.

## Mode Detection
If docs/reviews/review-domain-modeling.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated models.
If multi-model review artifacts exist under docs/reviews/domain-modeling/,
preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-domain-modeling.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
