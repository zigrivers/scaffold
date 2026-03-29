---
name: review-vision
description: Multi-pass review of the product vision for clarity, coherence, and downstream readiness
phase: "vision"
order: 020
dependencies: [create-vision]
outputs: [docs/reviews/vision-review-vision.md]
conditional: null
knowledge-base: [review-methodology, vision-craft, multi-model-review-dispatch, review-step-template, review-vision]
---

## Purpose
Deep multi-pass review of the product vision document, targeting the specific
failure modes of strategic vision artifacts. Identify issues, create a fix plan,
execute fixes, and re-validate. Ensures the vision is inspiring, coherent,
strategically sound, and ready for the PRD to consume.

## Inputs
- docs/vision.md (required) — Vision document to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/vision-review-vision.md — review findings, fix plan, and resolution log
- docs/vision.md — updated with fixes

## Quality Criteria
- All 5 review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Every vision section has content specific enough to derive a PRD without asking strategic clarification questions

## Methodology Scaling
- **deep**: All 5 review passes. Full findings report with severity
  categorization. Fixes applied and re-validated.
- **mvp**: Passes 1 and 5 only (Vision Clarity and Downstream Readiness).
  Focus on blocking gaps — is the vision clear enough to write a PRD from?
- **custom:depth(1-5)**: Depth 1-2: passes 1 and 5 only. Depth 3: passes 1,
  2, 5 (add Audience Precision). Depth 4: passes 1-3, 5 (add Competitive
  Rigor). Depth 5: all 5 passes.

## Mode Detection
If docs/reviews/vision-review-vision.md exists, this is a re-review. Read
previous findings and focus on whether fixes were applied and any new issues
introduced.

## Update Mode Specifics
- **Detect prior artifact**: docs/reviews/vision-review-vision.md exists
- **Preserve**: Findings from prior review that are still valid, resolution
  decisions made by user
- **Triggers for update**: Vision document changed since last review, user
  requests re-review after edits
- **Conflict resolution**: if a previously resolved finding reappears, note
  it as a regression

## Instructions

Review docs/vision.md using a structured 5-pass approach. Each pass targets
a specific failure mode of product vision documents.

### Pass 1: Vision Clarity

Evaluate the vision statement and elevator pitch for quality:
- Is the vision statement inspiring, concise, and memorable?
- Could someone repeat it from memory after hearing it once?
- Does it describe positive change in the world, not a product feature?
- Is it enduring — would it survive a pivot in approach?
- Apply Roman Pichler's checklist: Inspiring, Shared, Ethical, Concise, Ambitious, Enduring
- Is the elevator pitch (Geoffrey Moore template) filled in with specific, non-generic language?
- Does the vision statement pass the "decision test" — could you evaluate a product decision against it?

### Pass 2: Audience Precision

Evaluate whether the target audience is defined well enough for product decisions:
- Are personas defined by behaviors and motivations, not demographics?
- Is the primary persona clearly identified and distinct from secondary personas?
- Could two people read the persona descriptions and agree on design decisions?
- Are "context of use" descriptions specific enough to inform UX decisions?
- Is there an implicit "Everything User" persona (contradictory needs)?

### Pass 3: Competitive Rigor

Evaluate the competitive analysis for honesty and completeness:
- Are direct competitors identified with specific strengths and weaknesses?
- Are indirect alternatives considered (different approaches to the same problem)?
- Is the "do nothing" option considered as a competitor?
- Is differentiation genuine or wishful thinking?
- Are competitor strengths acknowledged honestly, not dismissed?
- Is the market gap validated with evidence, not just asserted?

### Pass 4: Strategic Coherence

Evaluate whether the strategic elements hold together:
- Do guiding principles actually constrain decisions (or are they platitudes)?
- Would a reasonable team choose the opposite of each principle?
- Does the anti-vision name specific traps, not just vague disclaimers?
- Are success criteria measurable and time-bound?
- Does the business model intuition hold together with the target audience and value proposition?
- Are strategic risks honest about severity, with actual mitigation thinking?
- Do all sections tell a consistent story about the same product?

### Pass 5: Downstream Readiness

Evaluate whether the PRD can be written from this vision:
- Can the PRD's problem statement be derived directly from the Problem Space section?
- Is the target audience clear enough to write user personas and stories?
- Are guiding principles concrete enough to inform tech stack and architecture decisions?
- Is there enough competitive context to differentiate features?
- Are there unresolved Open Questions that would block product definition?
- Could an AI agent write a PRD from this vision without asking strategic questions?

### Review Process

1. Execute each pass, documenting findings with severity (P0-P3):
   - P0: Vision is fundamentally unclear or contradictory — blocks all downstream work
   - P1: Significant gap that would cause PRD to make wrong assumptions
   - P2: Minor gap or vagueness that could be improved
   - P3: Nitpick or style suggestion
2. Create a fix plan for all P0 and P1 findings
3. Present the fix plan to the user for approval
4. Apply approved fixes to docs/vision.md
5. Re-validate that fixes resolved the issues
6. Document all findings and resolutions in the review report

### Output Format

Create docs/reviews/vision-review-vision.md with:

| Pass | Finding | Severity | Fix | Status |
|------|---------|----------|-----|--------|
| 1 | Vision statement references a feature ("AI-powered...") | P1 | Reframe around positive change | Fixed |
| ... | ... | ... | ... | ... |

## After This Step

When this step is complete, tell the user:

---
**Review complete** — `docs/reviews/vision-review-vision.md` created, fixes applied to `docs/vision.md`.

**Next:** Run `/scaffold:innovate-vision` (optional) — Explore strategic innovation opportunities.
Or skip to: `/scaffold:create-prd` — Start product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
