---
name: automated-review-tooling
description: Patterns for setting up automated PR code review using AI models (Codex, Gemini) via local CLI, including dual-model review, reconciliation, and CI integration
topics: [code-review, automation, codex, gemini, pull-requests, ci-cd, review-tooling]
---

# Automated Review Tooling

Automated PR review leverages AI models to provide consistent, thorough code review without manual reviewer bottlenecks. This knowledge covers the local CLI approach (no GitHub Actions), dual-model review patterns, and integration with the PR workflow.

## Summary

### Review Severity and Reconciliation

See `review-methodology` for severity definitions (P0-P3). See `multi-model-review-dispatch` for finding reconciliation rules.

**Action thresholds:** P0/P1/P2 findings must be fixed before proceeding to the next task. P3 findings are recorded but not actioned.

### Degraded-Mode Behavior

#### Verdict Definitions

These are the authoritative verdict definitions. Tool files (`review-code.md`, `review-pr.md`) reference these.

| Verdict | Condition |
|---------|-----------|
| `pass` | All configured channels ran, no unresolved P0/P1/P2 |
| `degraded-pass` | Channels skipped, compensated, or have non-full coverage (e.g., partial timeout), no unresolved P0/P1/P2 |
| `blocked` | Unresolved P0/P1/P2 after 3 fix rounds |
| `needs-user-decision` | Contradictions or unresolvable findings |

**Verdict precedence:** `needs-user-decision` > `blocked` > `degraded-pass` > `pass`. When multiple conditions apply, the higher-precedence verdict wins.

**Both external channels missing:** Maximum achievable verdict is `degraded-pass` — never `pass`. Review summary must note: "All findings are single-model (Claude only). External validation was unavailable."

#### Status Model

`compensating` is a **coverage label** applied to a channel's output, not a replacement for the root-cause status. Each channel retains its root-cause status (`not_installed`, `auth_failed`, `auth_timeout`, `failed`) AND gains a coverage label (`compensating (X-equivalent)`) when a compensating pass ran. The fix cycle uses the **root-cause status** to decide whether to retry (never retry `not_installed`, `auth_failed`, `auth_timeout`). The report uses the **coverage label** to show the reader what ran.

#### Compensating Passes

When an external channel (Codex or Gemini) is unavailable, run a compensating Claude self-review pass:

- Same prompt structure as the missing channel, executed as a Claude self-review pass.
- Labeled `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]` in the review summary.
- Missing Codex → focus on implementation correctness, security, API contracts.
- Missing Gemini → focus on architectural patterns, design reasoning, broad context.
- Missing both → two compensating passes (one per missing channel's strength area).
- Compensating-pass findings are **single-source confidence** — they do NOT raise to high confidence even if they agree with another channel's findings.
- Normal mandatory-fix thresholds apply: P0/P1/P2 findings from compensating passes still require fixing.

**Superpowers channel:** No compensating pass needed — Superpowers is a Claude subagent and is always available. If the Superpowers plugin is not installed, run available external CLIs and warn the user that review coverage is reduced.

#### Foreground-Only Execution

Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations.

This constraint is intentionally duplicated from `multi-model-review-dispatch`. Knowledge entries are injected independently by the assembly engine — an agent may receive this entry without `multi-model-review-dispatch`, so both need the constraint.

## Deep Guidance

### Finding Reconciliation

After all channels complete (including compensating passes), reconcile findings using the rules in `multi-model-review-dispatch`. This orchestration entry triggers reconciliation; the dispatch entry defines how to perform it.

Reconciliation normalizes findings from all channels (real and compensating) to a common schema, then matches findings across channels by location and category. The purpose is to detect when multiple independent channels agree on a finding (raising confidence) and to surface contradictions that require human judgment. A finding reported by Codex alone has lower confidence than the same finding reported by both Codex and Gemini.

The reconciliation output is a deduplicated list of findings with confidence scores. High-confidence findings (agreed by 2+ real channels) are actionable without further discussion. Low-confidence findings (single-source, or from compensating passes) still require action at P0/P1/P2 but should be noted as lower-confidence in the review summary.

Findings that appear in all three channels (Codex, Gemini, Superpowers) are considered maximum-confidence and should be surfaced first in the review summary. Findings that appear in only one channel should include the channel name in the finding description to help the developer assess confidence independently.

```bash
# Orchestration reconciliation workflow
# 1. Collect findings from all channels (real + compensating)
# 2. Normalize to common schema (severity, category, location, description)
# 3. Match findings across channels by location + category
# 4. Apply consensus rules from multi-model-review-dispatch
# 5. Produce reconciled findings list with confidence scores
```

### Channel Dispatch Pattern and Orchestration

Each external channel (Codex, Gemini) follows the same dispatch pattern: check installation, check auth, then dispatch as a foreground call. If any step fails, record the root-cause status, queue a compensating pass, and continue to the next channel. The Superpowers channel is always available as a Claude subagent and does not require installation or auth checks.

```bash
# Channel dispatch pattern
# For each external channel (Codex, Gemini):
#   1. command -v <tool> >/dev/null 2>&1 || { status=not_installed; queue_compensating; continue; }
#   2. <auth_check> || { status=auth_failed; queue_compensating; continue; }
#   3. <dispatch_foreground> || { status=failed; queue_compensating; continue; }
# For Superpowers: dispatch subagent (always available)
# After all: run queued compensating passes → reconcile → verdict
```

After all channels and compensating passes complete, run the reconciliation workflow above and apply the verdict decision flow. Channel results and compensating-pass labels must be preserved in the review output for auditability — do not collapse or omit them even when findings are empty.

### Degraded-Mode Worked Example

When Codex is unavailable (not installed or auth failure), the orchestration proceeds as follows:

1. The installation check (`command -v codex`) fails. Codex channel status is set to `not_installed`.
2. A compensating Codex-equivalent pass is queued: a Claude self-review focused on implementation correctness, security, and API contracts.
3. Gemini and Superpowers channels run normally.
4. The compensating pass runs, producing findings labeled `[compensating: Codex-equivalent]`.
5. Reconciliation merges findings from all four sources (Gemini, Superpowers, compensating-Codex, compensating-Gemini if applicable).
6. Maximum achievable verdict is `degraded-pass` because a real channel was absent.
7. The review summary notes: "Codex channel: not_installed (compensating: Codex-equivalent pass ran)."

**Fix-cycle channel rule:** During fix rounds, never retry a channel with status `not_installed`, `auth_failed`, or `auth_timeout`. These statuses indicate a persistent environment condition that will not resolve between fix rounds. Only retry channels with status `failed` (transient execution error).

### Verdict Decision Flow

Apply the following evaluation order to determine the final verdict. The first matching condition wins; all subsequent conditions are skipped.

```
Verdict evaluation order:
1. Any contradictions or unresolvable findings? → needs-user-decision
2. Any unresolved P0/P1/P2 after 3 fix rounds? → blocked
3. Any channel not at full coverage? → degraded-pass
4. All channels completed, no findings? → pass
```

A "contradiction" exists when two channels report opposite conclusions about the same code location — for example, Codex flags a function as insecure while Gemini explicitly approves it. Contradictions cannot be resolved by the agent alone and must be surfaced to the user.

A channel is "not at full coverage" when: it ran as a compensating pass instead of a real tool, it timed out partially, or the Superpowers plugin is not installed and available channels do not cover the full diff.

**Verdict precedence reminder:** `needs-user-decision` > `blocked` > `degraded-pass` > `pass`. If multiple conditions apply simultaneously (for example, both a contradiction and an unresolved P0 exist), the higher-precedence verdict wins.

The verdict is always computed after all fix rounds are exhausted — do not emit a partial verdict mid-cycle. If a fix round resolves all P0/P1/P2 findings and no contradictions remain, the verdict upgrades from `blocked` to `pass` or `degraded-pass` depending on channel coverage. This upgrade must be verified explicitly by re-running the reconciliation step after each fix round, not assumed from the fact that fixes were applied.

### Security-Focused Review Checklist

Every automated review should check:
- No secrets or credentials in the diff (API keys, passwords, tokens, private keys)
- No `eval()` or equivalent unsafe operations introduced (dynamic code execution, shell injection)
- SQL queries use parameterized queries — no string concatenation with user input
- User input is validated and sanitized before use in queries, commands, or output
- Authentication/authorization checks are present on all new endpoints and operations
- Dependencies added are from trusted sources with known, pinned versions
- No new global state or singletons that could cause cross-request data leaks
- Error messages do not expose internal paths, stack traces, or sensitive system details
- File system operations use safe path handling (no path traversal vulnerabilities)
- Cryptographic operations use approved algorithms and key lengths

When reviewing diffs that touch authentication, authorization, or data handling, elevate any security-related finding by one severity level. A finding that would normally be P2 (recommended) becomes P1 (required) in security-sensitive code paths. This conservative stance reflects the asymmetric cost of security failures versus the cost of over-caution during review.

### Performance Review Patterns

Look for these performance anti-patterns in the diff:
- N+1 queries (loop containing individual DB calls — use batch queries or eager loading)
- Missing pagination on list endpoints (unbounded result sets)
- Synchronous operations that should be async (blocking I/O in hot paths)
- Large objects passed by value instead of reference (unnecessary deep copies)
- Missing caching for expensive computations that are called repeatedly
- Unbounded growth in arrays or maps (no eviction, no size limits)
- Missing indexes on columns used in WHERE clauses of new queries
- Eager loading where lazy loading would suffice (over-fetching)
- Missing connection pooling or connection reuse for external services

### Common False Positives

Track and suppress recurring false positives to reduce noise in future reviews:
- Test files flagged for "hardcoded values" (test fixtures and expected values are intentional)
- Migration files flagged for "raw SQL" (migrations must use raw SQL for schema changes)
- Generated files flagged for style issues (generated code follows its own generator's conventions)
- Intentional use of `any` types in TypeScript adapter layers or third-party type overrides
- Deliberate `eslint-disable` comments that are already justified in surrounding context
- Seed data files flagged for hardcoded credentials (test-only, not production)

Add suppressions to AGENTS.md under "Out of Scope" to prevent repeated false findings across review cycles.

### Review Metrics and Continuous Improvement

Track these metrics over time to improve review quality and calibrate thresholds:

| Metric | Definition | Use |
|--------|------------|-----|
| False positive rate | Findings dismissed without action / total findings | Calibrate severity thresholds |
| Escape rate | Bugs reaching production despite review / total bugs | Identify coverage gaps |
| Time to resolve | Average time between finding logged and fix merged | Identify bottlenecks |
| Coverage | PRs receiving automated review / total PRs merged | Track adoption |
| Model agreement rate | Findings agreed by 2+ channels / total findings | Tune reconciliation rules |
| Compensating-pass rate | Reviews using compensating passes / total reviews | Track environment health |

Use the false positive rate to determine whether a severity category is over-triggering. Use the escape rate to determine whether the review is missing entire classes of bugs. Use the compensating-pass rate to identify when the review environment needs maintenance (expired auth tokens, broken CLI installs).

Log metric snapshots in AGENTS.md after each major project milestone. A declining model agreement rate over time suggests either that the review prompts are drifting in quality or that the codebase is accumulating technical debt in areas where models diverge. A rising escape rate despite consistent review coverage is a signal to revisit the severity thresholds or the focus areas in the review prompts.

### Fallback When Models Unavailable

When external CLIs are unavailable, the degraded-mode behavior defined in the Summary section applies. To summarize the operational steps:

1. For each unavailable external channel, queue a compensating Claude self-review pass focused on that channel's strength area.
2. Label findings as `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.
3. Treat compensating findings as single-source confidence — they do not raise to high confidence even when they agree with another channel.
4. Maximum verdict is `degraded-pass` when any channel ran as compensating instead of real.
5. When both external channels are unavailable, note "All findings are single-model (Claude only). External validation was unavailable." in the review summary.
6. Never silently drop unavailable channels — always record the channel status and compensating coverage label in the review output.

**Superpowers channel exception:** Superpowers is a Claude subagent and requires no external CLI or auth. It is always available as long as the Superpowers plugin is installed in the Claude Code environment. If the plugin is not installed, run available external CLIs and warn the user that review coverage is reduced — but do not run a compensating pass for Superpowers (the compensating-pass mechanism only applies to external CLIs that have an installation/auth gate).
