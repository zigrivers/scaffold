---
description: "Run all configured code review channels on a PR (Codex CLI, Gemini CLI, Superpowers code-reviewer)"
long-description: "Run all three code review channels on a pull request and reconcile findings."
---

## Purpose

Run all three code review channels on a pull request and reconcile findings.
This is the single entry point for PR code review — agents call this once instead
of remembering three separate review invocations.

The three channels are:
1. **Codex CLI** — OpenAI's code analysis (implementation correctness, security, API contracts)
2. **Gemini CLI** — Google's design reasoning (architectural patterns, broad context)
3. **Superpowers code-reviewer** — Claude subagent review (plan alignment, code quality, testing)

## Inputs

- $ARGUMENTS — PR number (optional; auto-detected from current branch if omitted)
- docs/review-standards.md (optional) — severity definitions and review criteria
- docs/coding-standards.md (required) — coding conventions for review context
- docs/tdd-standards.md (optional) — test coverage expectations
- AGENTS.md (optional) — reviewer instructions with project-specific rules

## Expected Outputs

- All three review channels executed (or fallback documented)
- P0/P1/P2 findings fixed before proceeding
- Review summary with per-channel results and reconciliation

## Instructions

### Step 1: Identify the PR

```bash
# Use argument if provided, otherwise detect from current branch
PR_NUMBER="${ARGUMENTS:-$(gh pr view --json number -q .number 2>/dev/null)}"
```

If no PR is found, stop and tell the user to create a PR first.

### Step 2: Gather Review Context

Collect the PR diff and project standards for review prompts:

```bash
PR_DIFF=$(gh pr diff "$PR_NUMBER")
```

Read these files for review context (skip any that don't exist):
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/review-standards.md`
- `AGENTS.md`

### Step 3: Run All Three Review Channels

Run all three channels. Track which ones complete successfully.

#### Channel 1: Codex CLI

**Auth check first** (auth tokens expire — always re-verify):

```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

If Codex is not installed, skip this channel and note it in the summary.
If auth fails, tell the user: "Codex auth expired. Run: `! codex login`" — do NOT
silently fall back. After the user re-authenticates, retry.

**Run the review:**

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null
```

The review prompt must include:
- The PR diff
- Coding standards from docs/coding-standards.md
- Review standards from docs/review-standards.md (if exists)
- Instruction to report P0/P1/P2 findings as JSON with severity, location (file:line), description, and suggestion

#### Channel 2: Gemini CLI

**Auth check first:**

```bash
GEMINI_AUTH_CHECK=$(NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1)
GEMINI_EXIT=$?
if [ "$GEMINI_EXIT" -eq 0 ]; then
  echo "gemini authenticated"
elif [ "$GEMINI_EXIT" -eq 41 ]; then
  echo "gemini NOT authenticated (exit 41: auth error)"
fi
```

If Gemini is not installed, skip this channel and note it in the summary.
If auth fails (exit 41), tell the user: "Gemini auth expired. Run: `! gemini -p \"hello\"`" — do NOT silently fall back. After the user re-authenticates, retry.

**Run the review:**

```bash
NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

Same review prompt content as Codex. Do NOT share one model's output with the other —
each reviews independently.

#### Channel 3: Superpowers Code-Reviewer Subagent

Dispatch the `superpowers:code-reviewer` subagent. This channel always runs (it uses
Claude, which is always available).

```bash
BASE_SHA=$(gh pr view "$PR_NUMBER" --json baseRefOid -q .baseRefOid)
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid)
```

Dispatch with the Agent tool using `superpowers:code-reviewer` as the subagent type,
providing:
- `WHAT_WAS_IMPLEMENTED` — PR title and description
- `PLAN_OR_REQUIREMENTS` — coding standards and review standards
- `BASE_SHA` — base commit
- `HEAD_SHA` — head commit
- `DESCRIPTION` — PR summary

### Step 4: Reconcile Findings

After all channels complete, reconcile findings:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Multiple channels flag same issue | **High** | Fix immediately |
| All channels approve (no findings) | **High** | Proceed to merge |
| One channel flags P0, others approve | **High** | Fix it — P0 is critical from any source |
| One channel flags P1, others approve | **Medium** | Fix it — P1 findings are mandatory regardless of source count |
| Channels contradict each other | **Low** | Present to user for adjudication |

### Step 5: Report Results

Output a review summary in this format:

```
## Code Review Summary — PR #[number]

### Channels Executed
- [ ] Codex CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- [ ] Gemini CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- [ ] Superpowers code-reviewer — [completed / error]

### Consensus Findings (High Confidence)
[Findings flagged by 2+ channels]

### Single-Source Findings
[Findings from only one channel, with attribution]

### Disagreements
[Contradictions between channels]

### Verdict
[All channels approve / Fix required (list P0/P1/P2 items) / User adjudication needed]
```

### Step 6: Fix P0/P1/P2 Findings

If any P0, P1, or P2 findings exist:
1. Fix them in the code
2. Push the fixes: `git push`
3. Re-run the channels that produced findings to verify fixes
4. After 3 fix rounds with unresolved P0/P1/P2 findings, stop and ask the user for direction — do NOT merge automatically. Document remaining findings and let the user decide whether to continue fixing, create follow-up issues, or override.

### Step 7: Confirm Completion

After all findings are resolved (or 3 rounds complete), output:

```
Code review complete. All 3 channels executed. PR #[number] is ready for merge.
```

Do NOT proceed to the next task or merge until this confirmation is output.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Neither Codex nor Gemini installed | Run Superpowers code-reviewer only; document as "single-channel review" |
| One CLI installed, one not | Run available CLI + Superpowers; document missing channel |
| CLI auth expired | Surface to user with recovery command; do NOT silently skip |
| Superpowers plugin not installed | Run both CLIs; warn user to install superpowers plugin |
| All external channels unavailable | Superpowers code-reviewer only; warn user that review coverage is reduced |

## Process Rules

1. **All three channels are mandatory** — skip only when the tool is genuinely unavailable (not installed), never by choice.
2. **Auth failures are not silent** — always surface to the user with recovery instructions.
3. **Independence** — never share one channel's output with another. Each reviews the diff independently.
4. **Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.
5. **Document everything** — the review summary must show which channels ran and which were skipped, with reasons.

---

## After This Step

When code review is complete, tell the user:

---
**Code review complete** — All channels executed for PR #[number].

**Results:**
- Channels run: [list which of the 3 ran]
- Findings fixed: [count]
- Remaining: [none / list]

**Next:** Return to the task execution loop — mark the task complete and pick up
the next unblocked task with `/scaffold:single-agent-start`.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### automated-review-tooling

*Patterns for setting up automated PR code review using AI models (Codex, Gemini) via local CLI, including dual-model review, reconciliation, and CI integration*

# Automated Review Tooling

Automated PR review leverages AI models to provide consistent, thorough code review without manual reviewer bottlenecks. This knowledge covers the local CLI approach (no GitHub Actions), dual-model review patterns, and integration with the PR workflow.

## Summary

### Architecture: Local CLI Review

The scaffold approach uses local CLI review rather than GitHub Actions:
- **No CI secrets required** — models run locally via CLI tools
- **Dual-model review** — run Codex and Gemini (when available) for independent perspectives
- **Agent-managed loop** — Claude orchestrates the review-fix cycle locally

Components:
- `AGENTS.md` — reviewer instructions with project-specific rules
- `docs/review-standards.md` — severity definitions (P0-P3) and criteria
- `scripts/cli-pr-review.sh` — dual-model review script
- `scripts/await-pr-review.sh` — polling script for external bot mode

### Review Severity Levels

Consistent with the pipeline's review step severity:
- **P0 (blocking)** — must fix before merge (security, data loss, broken functionality)
- **P1 (important)** — should fix before merge (bugs, missing tests, performance)
- **P2 (suggestion)** — consider fixing (style, naming, documentation)
- **P3 (nit)** — optional (personal preference, minor optimization)

### Dual-Model Review Pattern

When both Codex CLI and Gemini CLI are available:
1. Run both reviewers independently on the PR diff
2. Collect findings from each
3. Reconcile: consensus findings get higher confidence
4. Disagreements are flagged for the implementing agent to resolve

### Integration with PR Workflow

The review step integrates into the standard PR flow:
1. Agent creates PR
2. Agent runs `scripts/cli-pr-review.sh` (or review runs automatically)
3. Review findings are posted as PR comments or written to a local file
4. Agent addresses P0/P1/P2 findings, pushes fixes
5. Re-review until no P0/P1/P2 findings remain
6. PR is ready for merge

## Deep Guidance

### AGENTS.md Structure

The `AGENTS.md` file provides reviewer instructions:

```markdown
# Code Review Instructions

## Project Context
[Brief description of what this project does]

## Review Focus Areas
- Security: [project-specific security concerns]
- Performance: [known hot paths or constraints]
- Testing: [coverage requirements, test patterns]

## Coding Standards Reference
See docs/coding-standards.md for:
- Naming conventions
- Error handling patterns
- Logging standards

## Known Patterns
[Project-specific patterns reviewers should enforce]

## Out of Scope
[Things reviewers should NOT flag]
```

### CLI Review Script Pattern

The `cli-pr-review.sh` script follows this structure:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Get the PR diff
diff=$(gh pr diff "$PR_NUMBER")

# 2. Run Codex review (if available)
if command -v codex &>/dev/null; then
  codex_findings=$(echo "$diff" | codex review --context AGENTS.md)
fi

# 3. Run Gemini review (if available)
if command -v gemini &>/dev/null; then
  gemini_findings=$(echo "$diff" | gemini review --context AGENTS.md)
fi

# 4. Reconcile findings
# - Findings from both models: HIGH confidence
# - Findings from one model: MEDIUM confidence
# - Contradictions: flagged for human review
```

### Review Standards Document

`docs/review-standards.md` should define:
- Severity levels with concrete examples per project
- What constitutes a blocking review (P0/P1/P2 threshold)
- Auto-approve criteria (when review can be skipped)
- Review SLA (how long before auto-approve kicks in)

### Fallback When Models Unavailable

If neither Codex nor Gemini CLI is available:
1. Claude performs an enhanced self-review of the diff
2. Focus on the AGENTS.md review criteria
3. Apply the same severity classification
4. Document that the review was single-model

### Updating Review Standards Over Time

As the project evolves:
- Add new review focus areas when new patterns emerge
- Remove rules that linters now enforce automatically
- Update AGENTS.md when architecture changes
- Track false-positive rates and adjust thresholds

### Review Finding Reconciliation

When running dual-model review, reconcile findings systematically:

```
Finding Classification:
┌─────────────────┬──────────┬──────────┬───────────────────┐
│                 │ Codex    │ Gemini   │ Action            │
├─────────────────┼──────────┼──────────┼───────────────────┤
│ Same issue      │ Found    │ Found    │ HIGH confidence   │
│ Unique finding  │ Found    │ -        │ MEDIUM confidence │
│ Unique finding  │ -        │ Found    │ MEDIUM confidence │
│ Contradiction   │ Fix X    │ Keep X   │ Flag for agent    │
└─────────────────┴──────────┴──────────┴───────────────────┘
```

HIGH confidence findings are always addressed. MEDIUM confidence findings are addressed if P0/P1/P2. Contradictions require the implementing agent to make a judgment call and document the reasoning.

### Security-Focused Review Checklist

Every automated review should check:
- No secrets or credentials in the diff (API keys, passwords, tokens)
- No `eval()` or equivalent unsafe operations introduced
- SQL queries use parameterized queries (no string concatenation)
- User input is validated before use
- Authentication/authorization checks are present on new endpoints
- Dependencies added are from trusted sources with known versions

### Performance Review Patterns

Look for these performance anti-patterns:
- N+1 queries (loop with individual DB calls)
- Missing pagination on list endpoints
- Synchronous operations that should be async
- Large objects passed by value instead of reference
- Missing caching for expensive computations
- Unbounded growth in arrays or maps

### Integration with CLAUDE.md

The workflow-audit step should add review commands to CLAUDE.md:

```markdown
## Code Review
| Command | Purpose |
|---------|---------|
| `scripts/cli-pr-review.sh <PR#>` | Run dual-model review |
| `scripts/await-pr-review.sh <PR#>` | Poll for external review |
```

This ensures agents always know how to trigger reviews without consulting separate docs.

### Common False Positives

Track and suppress recurring false positives:
- Test files flagged for "hardcoded values" (test fixtures are intentional)
- Migration files flagged for "raw SQL" (migrations must use raw SQL)
- Generated files flagged for style issues (generated code has its own conventions)

Add suppressions to AGENTS.md under "Out of Scope" to prevent repeated false findings.

### Review Metrics and Continuous Improvement

Track these metrics over time to improve review quality:
- **False positive rate** — findings that are dismissed without action
- **Escape rate** — bugs that reach production despite review
- **Time to resolve** — average time between finding and fix
- **Coverage** — percentage of PRs that receive automated review
- **Model agreement rate** — how often Codex and Gemini agree

Use these metrics to calibrate severity thresholds and update AGENTS.md focus areas.
