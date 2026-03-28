---
description: "Multi-pass review of the product vision for clarity, coherence, and downstream readiness"
long-description: "Deep multi-pass review of the product vision document, targeting the specific failure modes of strategic vision artifacts. Identify issues, create a fix plan, execute fixes, and re-validate. Ensures the vision is inspiring, coherent, strategically sound, and ready for the PRD to consume."
---

Review docs/vision.md using a structured 5-pass approach. Each pass targets
a specific failure mode of product vision documents.

## Mode Detection

Check if `docs/reviews/vision-review-vision.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated vision
3. Run all review passes again on the current vision
4. Focus on: remaining unresolved findings, regressions from fixes, and any new content added since the last review
5. Update the review report rather than replacing it — preserve the fix history
6. If multi-model review artifacts exist under `docs/reviews/vision/` (e.g., `review-summary.md`, `codex-review.json`, `gemini-review.json`), preserve prior findings still valid.

## Review Process

### Step 1: Read the Artifact

Read `docs/vision.md` completely. Also read any upstream context (project brief, user-provided idea) for cross-reference.

### Step 2: Multi-Pass Review

Execute 5 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Vision Clarity**

Evaluate the vision statement and elevator pitch for quality:
- Is the vision statement inspiring, concise, and memorable?
- Could someone repeat it from memory after hearing it once?
- Does it describe positive change in the world, not a product feature?
- Is it enduring — would it survive a pivot in approach?
- Apply Roman Pichler's checklist: Inspiring, Shared, Ethical, Concise, Ambitious, Enduring
- Is the elevator pitch (Geoffrey Moore template) filled in with specific, non-generic language?
- Does the vision statement pass the "decision test" — could you evaluate a product decision against it?

**Pass 2: Audience Precision**

Evaluate whether the target audience is defined well enough for product decisions:
- Are personas defined by behaviors and motivations, not demographics?
- Is the primary persona clearly identified and distinct from secondary personas?
- Could two people read the persona descriptions and agree on design decisions?
- Are "context of use" descriptions specific enough to inform UX decisions?
- Is there an implicit "Everything User" persona (contradictory needs)?

**Pass 3: Competitive Rigor**

Evaluate the competitive analysis for honesty and completeness:
- Are direct competitors identified with specific strengths and weaknesses?
- Are indirect alternatives considered (different approaches to the same problem)?
- Is the "do nothing" option considered as a competitor?
- Is differentiation genuine or wishful thinking?
- Are competitor strengths acknowledged honestly, not dismissed?
- Is the market gap validated with evidence, not just asserted?

**Pass 4: Strategic Coherence**

Evaluate whether the strategic elements hold together:
- Do guiding principles actually constrain decisions (or are they platitudes)?
- Would a reasonable team choose the opposite of each principle?
- Does the anti-vision name specific traps, not just vague disclaimers?
- Are success criteria measurable and time-bound?
- Does the business model intuition hold together with the target audience and value proposition?
- Are strategic risks honest about severity, with actual mitigation thinking?
- Do all sections tell a consistent story about the same product?

**Pass 5: Downstream Readiness**

Evaluate whether the PRD can be written from this vision:
- Can the PRD's problem statement be derived directly from the Problem Space section?
- Is the target audience clear enough to write user personas and stories?
- Are guiding principles concrete enough to inform tech stack and architecture decisions?
- Is there enough competitive context to differentiate features?
- Are there unresolved Open Questions that would block product definition?
- Could an AI agent write a PRD from this vision without asking strategic questions?

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| VIS-001 | P0 | Pass 1 | [description] | [section] |
| VIS-002 | P1 | Pass 3 | [description] | [section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing concept — fix once
- **Same section**: Findings in the same part of the artifact — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/vision.md`. For each fix, verify it does not break other sections or introduce new inconsistencies.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break anything in the same pass scope
3. Check for inconsistencies with other sections introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/vision-review-vision.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Severity Definitions

- **P0**: Vision is fundamentally unclear or contradictory — blocks all downstream work
- **P1**: Significant gap that would cause PRD to make wrong assumptions
- **P2**: Minor gap or vagueness that could be improved
- **P3**: Nitpick or style suggestion

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/vision.md` — the artifact under review
- Focus areas: vision clarity, audience precision, competitive rigor, strategic coherence, downstream readiness

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/vision.md` and any upstream context
2. Execute all 5 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3)
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
9. Write review report to `docs/reviews/vision-review-vision.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — `docs/reviews/vision-review-vision.md` created, fixes applied to `docs/vision.md`.

**Next:** Run `/scaffold:innovate-vision` (optional) — Explore strategic innovation opportunities.
Or skip to: `/scaffold:create-prd` — Start product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
