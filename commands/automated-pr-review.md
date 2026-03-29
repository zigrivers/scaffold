---
description: "Agent-driven automated PR review with external reviewers (Codex Cloud, Gemini Code Assist, or custom)"
long-description: "Configures automated code review — using Codex and/or Gemini CLIs for dual-model review when available, or an external bot — with severity definitions and review criteria tailored to your project."
---

## Purpose
Configure an agent-driven automated PR review system using local CLI reviewers
(Codex, Gemini — runs both when available for dual-model quality) or external
GitHub App reviewers. Zero GitHub Actions workflows. The agent manages the
entire review-fix loop locally.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- scripts/cli-pr-review.sh (local CLI mode) — dual-model review with reconciliation
- scripts/await-pr-review.sh (external bot mode) — polling script with JSON output
- docs/git-workflow.md updated with review loop integration
- CLAUDE.md updated with agent-driven review workflow

## Quality Criteria
- (mvp) External reviewer configured and verified (AGENTS.md created)
- (mvp) Review standards document matches project coding conventions
- (deep) Await script handles all exit conditions (approved, findings, cap, skip, timeout)
- (mvp) CLAUDE.md workflow documents the agent-driven loop
- (mvp) No GitHub Actions workflows created (zero Actions minutes)
- (mvp) No ANTHROPIC_API_KEY secret required
- (deep) Legacy GitHub Actions workflows detected and cleanup offered
- (deep) Dual-model review enabled when both CLIs available

## Methodology Scaling
- **deep**: Full setup with local CLI review (dual-model when both available),
  review-standards.md, AGENTS.md, and comprehensive CLAUDE.md workflow.
  Falls back to external bot review if no CLIs available.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**: Depth 1: disabled — local self-review from git-workflow
  suffices. Depth 2: disabled — same as depth 1. Depth 3: basic
  review-standards.md + single-CLI review (whichever CLI is available).
  Depth 4: add dual-model review when both CLIs available, AGENTS.md with
  project-specific rules. Depth 5: full suite with dual-model review,
  legacy Actions cleanup, and comprehensive CLAUDE.md workflow integration.

## Conditional Evaluation
Enable when: project uses GitHub for version control, team size > 1 or CI/CD is
configured, or git-workflow.md establishes a PR-based workflow. Skip when: solo
developer with no CI, depth < 3, or project uses a non-GitHub VCS host.

## Mode Detection
Check if AGENTS.md exists first. If it exists, check for scaffold tracking comment
(`<!-- scaffold:automated-pr-review -->`).
- If AGENTS.md exists with tracking comment: UPDATE MODE — preserve custom review rules,
  reviewer bot name, and round cap settings. Detect legacy GitHub Actions
  workflows (code-review-trigger.yml, code-review-handler.yml) and offer removal.
- If AGENTS.md does not exist: FRESH MODE — configure from scratch.

## Update Mode Specifics
- **Detect prior artifact**: AGENTS.md exists
- **Preserve**: custom review rules, reviewer bot configuration, round cap
  settings, severity definitions in docs/review-standards.md, CLI review
  script customizations
- **Triggers for update**: coding-standards.md changed (new review criteria),
  tdd-standards.md changed (coverage expectations), new external reviewer
  CLI became available, git-workflow.md changed PR workflow steps
- **Conflict resolution**: if review criteria changed in coding-standards.md,
  update AGENTS.md review rules to match; if both CLI reviewers are now
  available, offer to enable dual-model review

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

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
4. Agent addresses P0/P1 findings, pushes fixes
5. Re-review until no P0/P1 findings remain
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
- What constitutes a blocking review (P0/P1 threshold)
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

HIGH confidence findings are always addressed. MEDIUM confidence findings are addressed if P0/P1. Contradictions require the implementing agent to make a judgment call and document the reasoning.

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
