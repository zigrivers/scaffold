---
name: multi-model-review-dispatch
description: Patterns for dispatching reviews to AI models (Codex, Gemini, Claude) via CLI, including fallback strategies and finding reconciliation
topics: [multi-model, code-review, codex, gemini, claude, review-synthesis]
---

# Multi-Model Review Dispatch

Reviews benefit from independent validation by multiple AI models. Different models have different blind spots — Codex excels at code-centric analysis, Gemini brings strength in design and architectural reasoning, and Claude provides plan alignment and code quality assessment. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review runs all enabled channels on every review. The MMR CLI (`mmr review --sync`) is the primary entry point and handles dispatch, parsing, reconciliation, and verdict derivation automatically.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |
| **Claude** (Anthropic) | Plan alignment, code quality, testing thoroughness | Code reviews, plan verification, test coverage |

All enabled channels run on every review. When a channel is unavailable, a compensating pass is dispatched via `claude -p` focused on the missing channel's strength area.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

See `review-methodology` for severity definitions (P0-P3). This entry uses those severities but does not define them.

### Dispatch Mechanics

#### Foreground-Only Execution

When an AI agent dispatches CLI reviews via a tool runner (Claude Code Bash tool, Codex exec, etc.), always run commands in the foreground. Background execution (`run_in_background`, `&`, `nohup`) produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations.

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated using a two-step process that produces distinct statuses for the orchestration layer:

**Step 1 — Installation check:**

```bash
# Codex: not found -> status: "not_installed"
command -v codex >/dev/null 2>&1

# Gemini: not found -> status: "not_installed"
command -v gemini >/dev/null 2>&1
```

If the CLI is not found, report status `not_installed` to the orchestration layer. Do not prompt the user to install it.

**Step 2 — Auth verification (only if installed):**

```bash
# Codex: fail -> status: "auth_failed"
codex login status 2>/dev/null

# Gemini: exit 41 -> status: "auth_failed"
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

If auth fails, report status `auth_failed` and surface recovery to the user:
- Codex: "Codex auth expired — run `! codex login` to re-authenticate"
- Gemini: "Gemini auth expired — run `! gemini -p \"hello\"` to re-authenticate"

If auth check times out (~5 seconds), retry once. If still failing, report `timeout`.
If auth succeeds, report `ready` and proceed to dispatch.

**Post-dispatch terminal states:**
- `completed` — channel produced results, use normally
- `timeout` — channel exceeded time limit; triggers compensating pass
- `failed` — crashed or unparseable output; triggers compensating pass

Verdict impact: `timeout` and `failed` channels mean the review is degraded. Maximum verdict is `degraded-pass` when any channel has a non-`completed` terminal state.

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
    "description": "description of the issue",
    "suggestion": "recommended fix"
  }
]

Note: `id` and `category` are optional — the CLI auto-generates IDs (F-001, F-002, ...) when omitted.
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, location, description, suggestion)
- Discard malformed entries rather than failing the entire parse

The CLI stores raw output at `~/.mmr/jobs/{job-id}/` per channel. Review results
are available via `mmr results <job-id>`.

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
- Claude CLI — [available/unavailable/timeout]
- Codex CLI — [available/unavailable/timeout]
- Gemini CLI — [available/unavailable/timeout]

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

Always preserve the raw JSON output from each channel, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

The CLI stores raw output at `~/.mmr/jobs/{job-id}/` with per-channel result files.
Results are accessible via `mmr results <job-id>`.

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Coverage threshold | Every channel has at least one finding or explicit "no issues found" note | Ensures all channels were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | Per-channel results exist for all dispatched channels | Audit trail |

Zero findings across all channels is a valid outcome when the diff is clean.

#### Degraded-Mode Gate Adaptation

When channels are skipped and compensating passes are used:

- **Reconciliation completeness** gate (cross-model disagreement documentation): applies whenever 2+ distinct model perspectives participate (Claude + one external counts). N/A only when Claude is the sole perspective (no external models and no compensating passes that introduce genuinely different framing).
- **Coverage threshold** gate: compensating passes satisfy the "every channel has at least one finding or explicit no-issues note" requirement.
- The reconciled output must record which channels were real, which were compensating, and which were skipped, so the orchestration layer can apply appropriate verdict logic.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The CLI automatically dispatches compensating passes via `claude -p` when channels are unavailable.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.
