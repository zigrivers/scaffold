---
name: decision-completeness
description: Verify all decisions are recorded, justified, non-contradictory
summary: "Checks that every technology choice and architectural pattern has a recorded decision with rationale, and that no two decisions contradict each other."
phase: "validation"
order: 1330
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/decision-completeness.md, docs/validation/decision-completeness/review-summary.md, docs/validation/decision-completeness/codex-review.json, docs/validation/decision-completeness/gemini-review.json]
conditional: null
knowledge-base: [decision-completeness, multi-model-review-dispatch]
---

## Purpose
Verify all decisions are recorded, justified, non-contradictory. Ensure every
significant architectural and technology decision has a corresponding ADR,
that no two ADRs contradict each other, and that all decisions have clear
rationale.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent decision audit — different models surface different implicit
decisions.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/decision-completeness.md — findings report
- docs/validation/decision-completeness/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/decision-completeness/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/decision-completeness/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every technology choice in `docs/tech-stack.md` has a corresponding ADR
- (mvp) No two ADRs contradict each other
- (deep) Every ADR has alternatives-considered section with pros/cons
- (deep) Every ADR referenced in `docs/system-architecture.md` exists in `docs/adrs/`
- Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Depth 1: verify each major tech choice has an ADR. Depth 2: add alternatives-considered check. Depth 3: full ADR completeness audit (rationale, consequences, status). Depth 4: add external model review of decision quality. Depth 5: multi-model reconciliation of decision coverage.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/decision-completeness/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/decision-completeness/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
