---
name: prd-gap-analysis
description: Systematically find gaps in the product requirements document
phase: "pre"
dependencies: [create-prd]
outputs: [docs/prd-gap-analysis.md]
conditional: null
knowledge-base: [gap-analysis, prd-craft]
---

## Purpose
Systematically analyze the PRD for gaps, ambiguities, contradictions, and
missing requirements. Produce a report of findings and update the PRD to
address them.

## Inputs
- docs/prd.md (required) — the PRD to analyze

## Expected Outputs
- docs/prd-gap-analysis.md — analysis report with findings and recommendations
- docs/prd.md — updated with fixes for identified gaps

## Quality Criteria
- Every section of the PRD is examined for completeness
- Ambiguous requirements are identified and clarified
- Missing edge cases and error scenarios are surfaced
- Contradictions between sections are resolved
- Non-functional requirements gaps are identified
- User journey gaps are found (paths not covered)

## Methodology Scaling
- **deep**: Multi-pass analysis. Separate passes for completeness, consistency,
  edge cases, NFRs, user journeys, and security implications. Categorized
  findings with severity. Innovation suggestions for missed opportunities.
- **mvp**: Single-pass review focused on blocking gaps — requirements that are
  too vague to implement. Brief findings list.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add edge case and
  NFR passes. Depth 4-5: full multi-pass with innovation suggestions.

## Mode Detection
If docs/prd-gap-analysis.md exists, operate in update mode: re-analyze the
PRD (which may have been updated), identify new gaps or gaps that were
previously found but not addressed.
