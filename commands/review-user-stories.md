---
description: "User stories review for completeness and quality"
long-description: "Performs a structured multi-pass review of user stories, targeting failure modes specific to story artifacts. Covers PRD coverage, acceptance criteria quality, story independence, persona coverage, sizing, and downstream readiness for domain modeling. At depth 4+, builds a formal requirements index and coverage matrix. At depth 5, dispatches to external AI models for independent validation."
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
6. If `docs/reviews/user-stories/requirements-index.md` exists (from a prior depth 4+ run), preserve all REQ-xxx IDs — never renumber. New requirements get the next available ID in sequence.

## Review Process

### Step 1: Read the Artifact

Read `docs/user-stories.md` completely. Also read `docs/plan.md` (or `docs/plan.md`) as the upstream artifact for cross-reference and coverage checking.

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

### Step 6: Requirements Index & Coverage Matrix (Depth 4+)

**Skip this step if running at depth 1-3.**

Build a formal requirements traceability system to enforce 100% PRD coverage.

#### 6a: Build Atomic PRD Requirements Index

Read `docs/plan.md` thoroughly. Extract every distinct, testable requirement into an atomic list.

Create `docs/reviews/user-stories/requirements-index.md`:

```markdown
# PRD Requirements Index

Atomic requirements extracted from docs/plan.md for traceability.

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-001 | Users can create an account with email and password | User Authentication | Must |
| REQ-002 | Users can reset their password via email link | User Authentication | Must |
| ... | ... | ... | ... |
```

Rules:
- One requirement per row — split compound requirements ("X and Y") into separate rows
- Each requirement must be testable (a developer could write a pass/fail test for it)
- Include implicit requirements (error handling, validation, accessibility) if the PRD implies them
- Priority comes from PRD emphasis (Must/Should/Could/Won't)

#### 6b: Create Coverage Map

Map each requirement to the user story (or stories) that cover it.

Create `docs/reviews/user-stories/coverage.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "total_requirements": 47,
  "covered": 45,
  "uncovered": 2,
  "requirements": {
    "REQ-001": {
      "text": "Users can create an account with email and password",
      "stories": ["US-001", "US-002"],
      "status": "covered"
    },
    "REQ-042": {
      "text": "App sends push notification on task reminder",
      "stories": [],
      "status": "uncovered"
    }
  }
}
```

#### 6c: Coverage Quality Gate

The coverage map must show zero uncovered requirements.

If any requirements are uncovered:
1. List the uncovered requirements
2. Ask the user whether to add stories for them or mark them as intentionally deferred
3. If adding stories: create new stories with the next available US-xxx ID, update `docs/user-stories.md`
4. If deferred: add `"status": "deferred"` with a `"reason"` field in coverage.json

### Step 7: Multi-Model Review (Depth 5)

**Skip this step if running at depth 1-4.**

Dispatch user stories to independent AI models for parallel coverage validation. This catches blind spots that a single model misses.

#### Prerequisites

Check if at least one external review CLI is available AND authenticated. Follow the `multi-model-dispatch` skill's CLI Detection & Auth Verification steps:

1. **Check installation**: `command -v codex`, `command -v gemini`
2. **Verify auth** (tokens expire mid-session):
   - Codex: `codex login status` (exit 0 = authenticated)
   - Gemini: `NO_BROWSER=true gemini -p "respond with ok" -o json` (exit 41 = auth failure)
3. **If auth fails**: Tell the user and offer interactive recovery — `! codex login` or `! gemini -p "hello"` (the `!` prefix runs it in the user's terminal). **Do not silently skip.**

- `codex` — Codex CLI (install: `npm install -g @openai/codex`)
- `gemini` — Gemini CLI (install: `npm install -g @google/gemini-cli`)

**If neither CLI is available or the user declines to re-authenticate**: Fall back to structured self-review. Re-read the requirements index and coverage matrix with an adversarial lens — actively try to find requirements that are technically "covered" but where the story doesn't actually address the requirement's intent. Document findings in the review summary. This is less thorough than multi-model review but still adds value.

#### 7a: Dispatch External Reviews

Bundle the PRD, requirements index, coverage map, and user stories into a review package. Follow the invocation patterns from the `multi-model-dispatch` skill:

- **Codex**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null` — independently review coverage, identify missing requirements, flag vague acceptance criteria, find contradictions, and report overlaps. Request structured JSON output.
- **Gemini**: `NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null` — same prompt and output structure as Codex. Run independently — do not share one model's findings with the other.

Do NOT edit the review JSON files — they are raw evidence from independent reviewers.

#### 7b: Reconcile Findings

Read both review outputs (whichever are available). For each finding, apply these rules:

| Scenario | Action |
|----------|--------|
| Both models agree | High confidence — apply fix |
| One model only, severity critical/high | Apply fix |
| One model only, severity medium/low | Use judgment; present to user if uncertain |
| Contradictory findings | Present both to user, let them decide |

**Hard scope boundary**: No new features — reviewers critique existing stories, they don't invent new product capabilities.

**Single-writer rule**: Only Claude edits `docs/user-stories.md`. External models only critique.

Apply fixes:
- **Missing requirements**: Add new user stories with the next available US-xxx ID
- **Story issues**: Fix acceptance criteria, scope boundaries, data requirements in-place
- **Contradictions**: Resolve by aligning story with PRD (PRD is source of truth)
- **Overlaps**: Clarify boundaries or consolidate (preserve IDs)

Use AskUserQuestionTool for any findings where the right action isn't clear.

#### 7c: Write Review Summary

Create `docs/reviews/user-stories/review-summary.md`:

```markdown
# User Stories Coverage Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: [Claude / Codex CLI / Gemini CLI — list whichever participated]
- **Stories reviewed**: N
- **PRD requirements**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Count | Applied |
|----------|-------|---------|
| Missing requirements | N | N |
| Story issues | N | N |
| Contradictions | N | N |
| Overlaps | N | N |

## Actions Taken

### Stories Added
- US-xxx: [title] — covers REQ-xxx

### Stories Modified
- US-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Coverage Verification
- Total PRD requirements: N
- Covered by user stories: N
- Uncovered: 0 (or list deferred items)
```

Update `docs/reviews/user-stories/coverage.json` with the post-fix state.

## Process

1. Read `docs/user-stories.md` and `docs/plan.md`
2. Execute all 6 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/pre-review-user-stories.md`
9. (Depth 4+) Build requirements index and coverage matrix
10. (Depth 5) Dispatch multi-model review and reconcile findings

## After This Step

When this step is complete, tell the user:

---
**Review complete** — User stories review findings documented in `docs/reviews/pre-review-user-stories.md`.

**Next:** Run `/scaffold:innovate-user-stories` to strengthen stories with innovation patterns, or `/scaffold:domain-modeling` to proceed to domain model discovery.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
