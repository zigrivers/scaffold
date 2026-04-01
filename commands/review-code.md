---
description: "Run all configured code review channels on local code before commit or push"
long-description: "Review the current local delivery candidate with Codex CLI, Gemini CLI, and Superpowers before committing or pushing, using staged changes, an explicit ref range, or the current branch diff."
---

## Purpose

Run the same three-channel review stack used by `review-pr`, but on local code
before commit or push. This is the preflight review entry point for bug fixes,
small features, and quick tasks when the user wants multi-model review before
anything leaves the machine.

The three channels are:
1. **Codex CLI** — implementation correctness, security, API contracts
2. **Gemini CLI** — architectural patterns, broad-context reasoning
3. **Superpowers code-reviewer** — Claude subagent review of code quality, tests, and plan alignment

## Inputs

- `$ARGUMENTS` (optional) — review scope flags:
  - `--base <ref>` — explicit base ref for diff review
  - `--head <ref>` — explicit head ref for diff review
  - `--staged` — review only staged changes (`git diff --cached`)
  - `--report-only` — collect findings and verdict, but do not apply fixes
- `docs/coding-standards.md` (required) — coding conventions for review context
- `docs/tdd-standards.md` (optional) — test expectations
- `docs/review-standards.md` (optional) — severity definitions and review criteria
- `AGENTS.md` (optional) — project-specific reviewer rules
- Local git state — staged diff, unstaged diff, branch diff, and changed file contents

## Expected Outputs

- A three-channel review summary for the local delivery candidate
- One of these verdicts: `pass`, `degraded-pass`, `blocked`, `needs-user-decision`
- Fixed code when findings are resolved in normal mode

## Instructions

### Step 1: Detect Mode

Parse `$ARGUMENTS` and set:

- `REPORT_ONLY=true` if `$ARGUMENTS` contains `--report-only`
- `STAGED_ONLY=true` if `$ARGUMENTS` contains `--staged`
- `BASE_REF` from `--base <ref>` if present
- `HEAD_REF` from `--head <ref>` if present

If `--head` is provided without `--base`, stop and tell the user both refs are
required for explicit-range review.

### Step 2: Build the Review Scope

Determine the delivery candidate to review.

#### Mode A: Explicit ref range

If both `BASE_REF` and `HEAD_REF` are provided:

```bash
git rev-parse --verify "$BASE_REF"
git rev-parse --verify "$HEAD_REF"
REVIEW_DIFF=$(git diff "$BASE_REF...$HEAD_REF")
CHANGED_FILES=$(git diff --name-only "$BASE_REF...$HEAD_REF")
```

Set the scope label to:

```text
ref-range: BASE_REF...HEAD_REF
```

If the diff is empty, stop and tell the user there is nothing to review in that range.

#### Mode B: Staged-only review

If `--staged` is provided:

```bash
REVIEW_DIFF=$(git diff --cached)
CHANGED_FILES=$(git diff --cached --name-only)
```

Set the scope label to:

```text
staged changes
```

If the staged diff is empty, stop and tell the user there are no staged changes.

#### Mode C: Default local delivery candidate

If no scope flags are provided, review everything that would be part of the next
delivery candidate:

1. Determine a reasonable base for committed work:
   - Prefer `origin/main` if it exists
   - Otherwise prefer `main`
   - Otherwise use `HEAD~1` if it exists
   - Otherwise treat this as a working-tree-only review
2. Collect these diff segments:
   - **Committed branch diff** from the base ref to `HEAD` (if a base ref exists and differs)
   - **Staged diff** from `git diff --cached`
   - **Unstaged diff** from `git diff`
3. Concatenate all non-empty segments into one review bundle with labels:

```text
=== COMMITTED DIFF (BASE...HEAD) ===
[diff]

=== STAGED DIFF ===
[diff]

=== UNSTAGED DIFF ===
[diff]
```

4. Build `CHANGED_FILES` as the union of file names from all non-empty segments

If all three segments are empty, stop and tell the user there is nothing to review.

### Step 3: Gather Review Context

Read these files if they exist:
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/review-standards.md`
- `AGENTS.md`

Then read the full contents of changed files from `CHANGED_FILES`, excluding:
- `node_modules/`
- `.git/`
- build artifacts (`dist/`, `build/`, `coverage/`, `.next/`)

If more than 15 files changed, prioritize:
1. Production files directly modified
2. New files
3. Test files covering the change
4. Config files affecting behavior or quality gates

Format the changed-file context like:

```text
=== relative/path/to/file.ts ===
[full file contents]
```

### Step 4: Run All Three Review Channels

Each channel reviews independently. Do NOT share one channel's output with another.

#### Channel 1: Codex CLI

Check installation and auth:

```bash
command -v codex >/dev/null 2>&1
codex login status 2>/dev/null
```

- If `codex` is not installed: skip this channel and record `skipped (not installed)`
- If auth fails: stop with verdict `blocked` and tell the user to run `! codex login`

Run:

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null
```

#### Channel 2: Gemini CLI

Check installation and auth:

```bash
command -v gemini >/dev/null 2>&1
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

- If `gemini` is not installed: skip this channel and record `skipped (not installed)`
- If auth fails (including exit 41): stop with verdict `blocked` and tell the user to run `! gemini -p "hello"`

Run:

```bash
NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

#### Channel 3: Superpowers code-reviewer

Dispatch the `superpowers:code-reviewer` subagent.

- If explicit refs are being reviewed, provide `BASE_SHA` and `HEAD_SHA`
- Otherwise provide:
  - the scope label
  - the unified review diff bundle
  - the changed-file contents
  - project review standards

This channel must review the same local delivery candidate, even when no PR or
clean ref range exists.

### Step 5: Use This Review Prompt

All channels should receive an equivalent prompt bundle built from the local review scope:

```text
You are reviewing local code changes before commit or push. Report only P0, P1,
and P2 issues.

## Scope
[scope label]

## Review Standards
[docs/review-standards.md if present, otherwise define P0/P1/P2]

## Coding Standards
[docs/coding-standards.md]

## Test Standards
[docs/tdd-standards.md if present]

## Project Review Rules
[AGENTS.md excerpts if present]

## Delivery Candidate Diff
[review diff bundle]

## Changed File Contents
[changed file contents]

## Output Format
Respond with JSON:
{
  "approved": true/false,
  "findings": [
    {
      "severity": "P0" | "P1" | "P2",
      "location": "file:line or section",
      "description": "what is wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}
```

### Step 6: Reconcile Findings

Use these rules:

| Scenario | Action |
|----------|--------|
| Same issue flagged by 2+ channels | High confidence — fix immediately |
| Any single P0 | Fix immediately |
| Any single P1 | Fix immediately |
| Any single P2 | Fix unless clearly inapplicable; if disputed, surface to user |
| All executed channels approve | Candidate passes review |
| Strong contradiction on a medium-severity issue | Verdict becomes `needs-user-decision` |

### Step 7: Apply Fixes Unless in Report-Only Mode

If `REPORT_ONLY=true`:
- Do NOT edit code
- Output the review summary and final verdict
- Stop

Otherwise:
1. Fix all P0/P1/P2 findings
2. Re-run the channels that produced findings
3. Repeat for up to 3 fix rounds
4. If any finding remains unresolved after 3 rounds, stop with verdict `needs-user-decision`

### Step 8: Final Verdict

Return exactly one verdict:

- `pass` — all available channels ran and no unresolved P0/P1/P2 findings remain
- `degraded-pass` — at least one channel was skipped because the tool is not installed, but all executed channels passed
- `blocked` — auth failure, reviewer execution failure, or unresolved mandatory findings
- `needs-user-decision` — reviewer disagreement or findings still unresolved after 3 fix rounds

### Step 9: Report Results

Output a concise summary in this format:

```text
## Code Review Summary — Local Delivery Candidate

### Scope
[scope label]

### Channels Executed
- Codex CLI — [completed / skipped (not installed) / blocked (auth failed) / error]
- Gemini CLI — [completed / skipped (not installed) / blocked (auth failed) / error]
- Superpowers code-reviewer — [completed / error]

### Findings
[consensus findings first, then single-source findings]

### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

If the verdict is `pass` or `degraded-pass`, explicitly say the code is ready
for the next delivery step (commit, push, or PR creation).

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
