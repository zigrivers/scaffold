---
description: "User stories review for completeness and quality"
long-description: "Performs a structured multi-pass review of user stories, targeting failure modes specific to story artifacts. Covers PRD coverage, acceptance criteria quality, story independence, persona coverage, sizing, and downstream readiness for domain modeling."
---

Perform a structured multi-pass review of user stories, targeting failure modes specific to story artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/pre-review-user-stories.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated stories
3. Run all review passes again on the current user stories
4. Focus on: remaining unresolved findings, regressions from fixes, and any new stories added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/user-stories.md` completely. Also read `docs/prd.md` (or `docs/plan.md`) as the upstream artifact for cross-reference and coverage checking.

### Step 2: Multi-Pass Review

Execute 6 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: PRD Coverage**
Extract every distinct feature and requirement from the PRD (including implicit requirements like error handling, validation, accessibility). For each, find the corresponding story or stories. Check every PRD persona has at least one story. Flag compound PRD requirements that should be split into multiple stories. Check that every user journey has stories covering the complete path, not just the happy path. Coverage gaps are the highest-severity failure because they propagate silently through the entire pipeline.

**Pass 2: Acceptance Criteria Quality**
Verify every story has testable, unambiguous acceptance criteria. Check for Given/When/Then format (at depth >= 3). Flag subjective language ("intuitive," "fast," "user-friendly"). Confirm criteria cover the primary success path AND at least one error/edge case. Check boundary conditions: max lengths, empty states, concurrent access. Verify each criterion has a clear pass/fail condition — if you cannot write an automated test from it, it is too vague.

**Pass 3: Story Independence**
Check that stories can be implemented independently without hidden coupling. Look for acceptance criteria that reference behavior defined in another story. Flag shared state assumptions where two stories both read or write the same data entity without acknowledgment. Check for implicit ordering — Story B assumes Story A's output exists but no dependency is documented. Check for circular dependencies. Verify documented dependencies are necessary, not just thematic grouping.

**Pass 4: Persona Coverage**
List all personas from the PRD and count stories attributed to each. Flag personas with zero stories — their entire user journey is unaddressed. Flag stories referencing personas not defined in the PRD. Check that high-priority personas (primary users) have proportionally more stories than secondary personas. Verify each persona's PRD-defined goals are addressed by their assigned stories.

**Pass 5: Sizing & Splittability**
Count acceptance criteria per story — more than 8 suggests the story is too large. Check for stories spanning multiple workflows or user journeys. Check for stories covering multiple data variations that could be split. Flag stories with only 1 trivial criterion — consider combining with a related story. For oversized stories, identify split heuristics: workflow step, data variation, CRUD operation, user role, happy/sad path.

**Pass 6: Downstream Readiness**
Verify the domain modeling step can consume these stories productively. For 3-5 representative stories, attempt to identify entities (nouns), domain events (state changes), and aggregate boundaries from acceptance criteria alone. Verify entity naming consistency across stories — not "User" in one story and "Account" in another. Confirm state transitions are explicit ("status changes from pending to confirmed") and business rules appear in criteria ("a class cannot have more than 30 students").

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| USR-001 | P0 | Pass 1 | [description] | [story ID] |
| USR-002 | P1 | Pass 2 | [description] | [story ID] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing concept — fix once
- **Same story**: Findings in the same story — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected stories.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/user-stories.md`. For each fix, verify it does not break traceability to the PRD or introduce inconsistencies with other stories.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break PRD traceability or introduce inconsistencies with other stories
3. Check for new issues introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/pre-review-user-stories.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Process

1. Read `docs/user-stories.md` and `docs/prd.md`
2. Execute all 6 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/pre-review-user-stories.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — User stories review findings documented in `docs/reviews/pre-review-user-stories.md`.

**Next:** Run `/scaffold:innovate-user-stories` to strengthen stories with innovation patterns, or `/scaffold:domain-modeling` to proceed to domain model discovery.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
