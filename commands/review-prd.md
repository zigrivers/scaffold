---
description: "PRD review for completeness and quality"
long-description: "Performs a structured multi-pass review of the Product Requirements Document, targeting failure modes specific to requirements artifacts. Covers problem statement rigor, persona coverage, feature scoping, success criteria, NFRs, constraints, edge cases, and downstream readiness for user stories."
---

Perform a structured multi-pass review of the PRD, targeting failure modes specific to product requirements artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/pre-review-prd.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated PRD
3. Run all review passes again on the current PRD
4. Focus on: remaining unresolved findings, regressions from fixes, and any new content added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/plan.md` (or `docs/plan.md`) completely. Also read any upstream context (project brief, user-provided problem statement) for cross-reference.

### Step 2: Multi-Pass Review

Execute 8 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Problem Statement Rigor**
Check that the problem is specific, testable, and grounded in observable reality. Verify quantitative evidence exists (hours wasted, error rates, revenue lost, support tickets). Ensure no solutions are prescribed ("we need to build X" is a solution, not a problem). Confirm a specific user group is named — not "users," "everyone," or "stakeholders." A vague problem statement produces vague requirements that compound through the entire pipeline.

**Pass 2: Persona & Stakeholder Coverage**
Verify personas are goal-driven with constraints, current behavior, and success criteria. Check all stakeholder groups are represented (end users, admins, support, integrators, billing). Flag the "Everything User" anti-pattern (contradictory persona that wants both simplicity and power). Expect 2-4 meaningful personas — fewer than 2 means secondary users are missing, more than 6 means scope is too broad.

**Pass 3: Feature Scoping Completeness**
Verify in-scope, out-of-scope, and deferred lists all exist. Check features are specific enough that two different people would agree on what to build. Confirm prioritization is applied (MoSCoW or equivalent) — if all features are "must-have," prioritization has not happened. Flag requirements that prescribe solutions (HOW) instead of describing behavior (WHAT).

**Pass 4: Success Criteria Measurability**
Verify every criterion has a target value (a number, percentage, or threshold) AND a measurement method (tool or process). Check criteria are tied to the problem statement, not generic ("increase user satisfaction" is a hope, not a criterion). Confirm coverage across types: user behavior metrics, business metrics, technical metrics, adoption metrics.

**Pass 5: NFR Quantification**
Check all NFR categories: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring. Verify quantification with numbers, not adjectives ("p95 under 200ms" not "fast"). Check conditions are specified — under what load, on what hardware, at what percentile. Flag compliance standards (SOC 2, GDPR, PCI DSS) where applicable.

**Pass 6: Constraint & Dependency Documentation**
Verify technical, timeline, budget, team size/skills, and regulatory constraints are present. Check each constraint traces to downstream architectural impact — "3 developers" without scope implications is a disconnected constraint. Verify external integrations have API limitations, costs, rate limits, and authentication requirements documented.

**Pass 7: Error & Edge Case Coverage**
Check sad paths for every feature with user input or external dependencies. Verify session expiry, network failure, and concurrent access scenarios. Check data edge cases: duplicate submissions, race conditions, large data volumes. Confirm failure modes, retry logic, and fallback behavior for third-party integrations are documented.

**Pass 8: Downstream Readiness for User Stories**
Verify features are specific enough to map to stories (one feature = one or more stories). Confirm personas are specific enough to be story actors ("As a [persona]"). Check business rules are explicit enough to become acceptance criteria. Verify error scenarios are detailed enough for Given/When/Then negative test scenarios. Attempt to write story titles from 3-5 representative features — if you cannot fill in the blanks, the PRD is too vague.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| PRD-001 | P0 | Pass 1 | [description] | [section] |
| PRD-002 | P1 | Pass 3 | [description] | [section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing concept — fix once
- **Same section**: Findings in the same part of the artifact — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/plan.md` (or `docs/plan.md`). For each fix, verify it does not break other artifacts or introduce new inconsistencies.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break anything in the same pass scope
3. Check for inconsistencies with other sections introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/pre-review-prd.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

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
- `docs/plan.md` (or `docs/plan.md`) — this is the top-level artifact; no upstream dependencies
- Focus areas: vague requirements, missing personas, unquantified NFRs, undocumented constraints

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/plan.md` (or `docs/plan.md`) and any upstream context
2. Execute all 8 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
9. Write review report to `docs/reviews/pre-review-prd.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — PRD review findings documented in `docs/reviews/pre-review-prd.md`.

**Next:** Run `/scaffold:innovate-prd` to strengthen the PRD with innovation patterns, or `/scaffold:user-stories` to proceed to story decomposition.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
