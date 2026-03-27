---
description: "ADR review for completeness and quality"
long-description: "Performs a structured multi-pass review of Architecture Decision Records, targeting failure modes specific to ADR artifacts. Covers decision coverage, rationale quality, contradiction detection, implied decisions, status hygiene, cross-references, and downstream readiness for system architecture."
---

Perform a structured multi-pass review of ADRs, targeting failure modes specific to Architecture Decision Record artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-adrs.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated ADRs
3. Run all review passes again on the current ADR set
4. Focus on: remaining unresolved findings, regressions from fixes, and any new ADRs added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read all files in `docs/adrs/` completely. Also read `docs/domain-models/` and `docs/plan.md` as upstream artifacts for cross-reference and coverage checking.

### Step 2: Multi-Pass Review

Execute 7 review passes. For each pass, re-read the artifacts with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Decision Coverage**
Read domain models and architecture for implied decisions. List every decision implied by the structure: technology choices (language, framework, database), architectural patterns (monolith vs microservices, event-driven vs request-response), component boundaries, integration mechanisms, data storage strategies. For each, find the corresponding ADR. Flag visible decisions with no ADR.

**Pass 2: Rationale Quality**
For each ADR, check that at least 2-3 alternatives are genuinely viable — not "do nothing" or obviously bad options. Verify each alternative has honest pros and cons. Check consequences include negatives (every decision has trade-offs — all-positive consequences indicate dishonest analysis). Confirm the rationale explains WHY, not just WHAT. Look for evaluation criteria used to compare options.

**Pass 3: Contradiction Detection**
Build a decision matrix: for each ADR, note what it decides and what domain it constrains. Find overlapping constraints between ADRs. For each overlap, determine agreement or contradiction. For contradictions, check if the later ADR references the earlier one. Look for implicit contradictions (e.g., "minimize dependencies" vs "add three external services"). Verify supersession chains are clean.

**Pass 4: Implied Decision Mining**
Read domain models for architectural assumptions embedded in narrative. Check for pattern assumptions ("RESTful API" assumed without an ADR choosing REST). Look for constraint assumptions ("single database," "multi-tenant") without formal analysis. Check deployment assumptions (cloud provider, containerization, CI/CD). Review domain event patterns for undocumented synchronous vs asynchronous decisions.

**Pass 5: Status Hygiene**
List all ADRs and statuses. Flag "proposed" or "draft" ADRs — are they genuinely pending or accepted but not updated? For "superseded" ADRs, verify replacement references. For "accepted" ADRs, check if a later ADR has effectively superseded them. Verify sequential numbering with no unexplained gaps (gaps suggest deleted ADRs, which violates ADR principles).

**Pass 6: Cross-Reference Integrity**
For each ADR, extract all references to other ADRs. Verify referenced ADRs exist. Verify the referenced ADR actually says what the referencing ADR claims. Check for circular chains (A references B references C references A). Verify "supersedes" relationships are bidirectional. Check that domain model and architecture references are accurate.

**Pass 7: Downstream Readiness**
Verify the system architecture step can proceed with all architecture-constraining decisions in "accepted" status. Check coverage: technology stack decisions (language, framework, database, infrastructure), architectural pattern decisions, integration pattern decisions, deployment topology, cross-cutting concerns (logging, monitoring, auth, error handling), and data management decisions. Flag intentionally deferred categories with missing timelines.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| ADR-R01 | P0 | Pass 1 | [description] | [ADR file] |
| ADR-R02 | P1 | Pass 3 | [description] | [ADR files] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing decision — write one ADR
- **Same ADR**: Findings in the same record — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected ADR files.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to files in `docs/adrs/`. For each fix, verify it does not introduce new contradictions or break cross-references.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not introduce new contradictions or break cross-references
3. Check for new implied decisions introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-adrs.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns in the `multi-model-dispatch` skill.

1. **Detect CLIs**: Check for `codex` and `gemini` CLI availability
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- ADR files in `docs/adrs/` (the reviewed artifact)
- `docs/plan.md` (PRD)
- `docs/tech-stack.md`
- Focus areas: undocumented decisions, weak rationales, subtle contradictions, missing ADRs

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read all files in `docs/adrs/`, `docs/domain-models/`, and `docs/plan.md`
2. Execute all 7 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-adrs.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — ADR review findings documented in `docs/reviews/review-adrs.md`.

**Next:** Run `/scaffold:system-architecture` to create the system architecture informed by the reviewed decisions.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
