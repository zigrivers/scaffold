---
name: innovate-prd
description: Discover feature-level innovation opportunities in the PRD
phase: "pre"
order: 130
dependencies: [review-prd]
outputs: [docs/prd-innovation.md]
conditional: "if-needed"
knowledge-base: [prd-innovation, prd-craft]
---

## Purpose
Discover feature-level innovation opportunities within the PRD. This covers
new capabilities, competitive positioning, and defensive product gaps. It is
NOT UX-level enhancement (that belongs in user story innovation) — it focuses
on whether the right features are in the PRD at all.

## Inputs
- docs/plan.md (required) — PRD to analyze for innovation opportunities
- docs/reviews/pre-review-prd.md (optional) — review findings for context

## Expected Outputs
- docs/prd-innovation.md — innovation findings, suggestions with cost/impact
  assessment, and disposition (accepted/rejected/deferred)
- docs/plan.md — updated with approved innovations

## Quality Criteria
- Enhancements are feature-level, not UX-level polish
- Each suggestion has a cost estimate (trivial/moderate/significant)
- Each suggestion has a clear user benefit and impact assessment
- Approved innovations are documented to the same standard as existing features
- PRD scope boundaries are respected — no uncontrolled scope creep
- User approval is obtained before modifying the PRD

## Methodology Scaling
- **deep**: Full innovation pass across all categories (competitive research,
  UX gaps, AI-native opportunities, defensive product thinking). Cost/impact
  matrix. Detailed integration of approved innovations into PRD.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: not typically enabled. Depth 3: quick scan
  for obvious gaps and missing expected features. Depth 4-5: full innovation
  pass with evaluation framework.

## Mode Detection
If docs/prd-innovation.md exists, this is a re-innovation pass. Read previous
suggestions and their disposition (accepted/rejected/deferred), focus on new
opportunities from PRD changes since last run.
