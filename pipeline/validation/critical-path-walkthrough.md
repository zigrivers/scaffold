---
name: critical-path-walkthrough
description: Walk critical user journeys end-to-end across all specs
summary: "Walks the most important user journeys end-to-end across every spec layer — PRD to stories to UX to API to database to tasks — and flags any broken handoffs or missing layers."
phase: "validation"
order: 1340
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/critical-path-walkthrough.md, docs/validation/critical-path-walkthrough/review-summary.md, docs/validation/critical-path-walkthrough/codex-review.json, docs/validation/critical-path-walkthrough/gemini-review.json]
conditional: null
knowledge-base: [critical-path-analysis, multi-model-review-dispatch]
---

## Purpose
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through user stories, UX spec, API contracts,
architecture components, database operations, and implementation tasks.
Use story acceptance criteria as the definition of "correct behavior" when
verifying completeness and consistency at every layer.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent journey walkthroughs — different models catch different
spec gaps along the critical path.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/critical-path-walkthrough.md — findings report
- docs/validation/critical-path-walkthrough/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/critical-path-walkthrough/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/critical-path-walkthrough/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) User specifies >= 3 Must-have epics as critical user journeys; each traced end-to-end
- (deep) Every journey verified at each layer: PRD → Story → UX → API → Architecture → DB → Task
- (deep) Each critical path verified against story acceptance criteria for behavioral correctness
- (mvp) Missing layers or broken handoffs documented with specific gap description
- (mvp) Findings categorized P0-P3 with specific file, section, and issue for each
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
- **custom:depth(1-5)**: Depth 1: identify critical path and verify task ordering. Depth 2: add dependency bottleneck analysis. Depth 3: full walkthrough simulating agent execution of critical path tasks. Depth 4: add external model simulation. Depth 5: multi-model walkthrough with divergence analysis.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/critical-path-walkthrough/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/critical-path-walkthrough/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
