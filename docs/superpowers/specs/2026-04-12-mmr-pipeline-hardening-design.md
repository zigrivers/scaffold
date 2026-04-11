# MMR Pipeline Hardening Design

**Date:** 2026-04-12
**Status:** Design complete, pending implementation plan

## Problem

The multi-model review (MMR) pipeline — knowledge entries, CLAUDE.md instructions, review tool prompts, and the MMR CLI spec — has accumulated inconsistencies and gaps from real-world usage. During the spark tool implementation (v3.11.0), we observed:

- Background execution (`run_in_background`) produces empty output from both Codex and Gemini CLIs
- Auth tokens expire mid-session; recovery is inconsistent across files
- No compensating behavior when channels are unavailable — reviews simply skip channels and proceed
- Severity definitions, reconciliation rules, and channel status vocabulary are duplicated across 4+ files with drift
- The review tool prompts (`review-code.md`, `review-pr.md`, `post-implementation-review.md`) have inconsistent dispatch patterns, verdict systems, and fallback behavior
- The MMR CLI spec (2026-04-05) predates these observations and needs updates

## Solution

A bottom-up fix across four workstreams:

1. **Knowledge entry fixes** — delineate scopes, add foreground constraint, add degraded-mode with compensating passes
2. **CLAUDE.md fixes** — streamline the review section, add foreground constraint, reference tool entry point
3. **Review tool prompt fixes** — standardize all three tools on shared dispatch pattern, canonical statuses, compensating passes
4. **MMR CLI spec updates** — re-review every section against lessons learned, add compensating passes, fix auth model

---

## Section 1: Knowledge Entry Fixes

### Scope Delineation

| Entry | Owns | Does NOT Own |
|-------|------|-------------|
| **`multi-model-review-dispatch`** | All dispatch mechanics: CLI commands, auth checks, timeouts, prompt formatting, output parsing, raw finding reconciliation, **quality gates** (structural thresholds: minimum finding count, coverage completeness, raw output preservation, cross-model disagreement documentation) | Severity definitions (-> review-methodology), orchestration workflow (-> automated-review-tooling), verdict logic (-> automated-review-tooling) |
| **`automated-review-tooling`** | Orchestration workflow: how to coordinate multiple channels, degraded-mode behavior, compensating passes, **verdict logic** (pass/degraded-pass/blocked/needs-user-decision), **action thresholds** (P0/P1/P2 must be fixed before proceeding) | Severity definitions (-> review-methodology), dispatch mechanics (-> multi-model-review-dispatch), reconciliation details (-> multi-model-review-dispatch) |
| **`multi-model-research-dispatch`** | Research and red-team dispatch: research prompts, challenge prompts, single-model fallback personas, research reconciliation | Review dispatch (-> multi-model-review-dispatch) |

**Boundary clarification (quality gates vs verdict logic):** Quality gates are structural thresholds applied during reconciliation (e.g., "at least 3 findings across all models," "all cross-model disagreements documented," "raw output preserved"). They do NOT reference severity levels. Verdict logic is the final orchestration decision about whether the review passes, degrades, or blocks — informed by quality gates, channel availability, and compensating passes.

### Changes to `multi-model-review-dispatch`

1. **Add foreground-only constraint** — new subsection in Deep Guidance after Dispatch Mechanics:

   > "When an AI agent dispatches CLI reviews via a tool runner (Claude Code Bash tool, Codex exec, etc.), always run commands in the foreground. Background execution (`run_in_background`, `&`, `nohup`) produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations."

2. **Replace the entire CLI availability check block** with the two-step pattern. Each step produces a distinct status that the orchestration layer can act on:

   **Step 1 — Installation check:**
   ```bash
   command -v codex >/dev/null 2>&1   # not found -> status: "not_installed"
   command -v gemini >/dev/null 2>&1  # not found -> status: "not_installed"
   ```

   **Step 2 — Auth verification (only if installed):**
   ```bash
   codex login status 2>/dev/null      # fail -> status: "auth_failed"
   NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1  # exit 41 -> status: "auth_failed"
   ```
   Auth timeout -> retry once, then status: "auth_timeout".
   Success -> status: "ready".

   **Channel status reporting:** Each channel's final status (`ready`, `not_installed`, `auth_failed`, `auth_timeout`) must be reported to the orchestration layer so it can trigger degraded-mode and compensating passes.

   **Post-dispatch terminal states:**
   - `completed` -> channel produced results, use normally
   - `partial_timeout` -> partial output before timeout, use what was received, note incompleteness
   - `failed` -> crashed or unparseable output, triggers compensating pass

   Verdict impact: `partial_timeout` and `failed` channels mean the review is degraded. Maximum verdict is `degraded-pass` when any channel has a non-`completed` terminal state.

3. **Add `!` prefix to auth recovery commands:**
   - Codex: "Run `! codex login` to re-authenticate"
   - Gemini: "Run `! gemini -p \"hello\"` to re-authenticate"

4. **Remove severity definitions** — replace with: "See `review-methodology` for severity definitions (P0-P3). This entry uses those severities but does not define them."

5. **Remove the `gcloud` fallback** — line 58's `which gcloud && gcloud ai models list` is stale. Replace with direct `gemini` check only.

6. **Adapt quality gates for degraded mode:**
   - "Minimum finding count" gate: compensating passes count toward the total but are not treated as separate external channels for consensus purposes.
   - "Cross-model disagreement documentation" gate: applies whenever 2+ distinct model perspectives participate (Claude + one external counts). N/A only when Claude is the sole perspective.
   - "Coverage threshold" gate: compensating passes satisfy the "every pass has at least one finding or explicit no-issues note" requirement.
   - The reconciled output must record which channels were real, which were compensating, and which were skipped.

### Changes to `automated-review-tooling`

1. **Thin the Summary** — remove duplicated severity definitions and reconciliation rules. Add cross-reference: "See `review-methodology` for severity definitions (P0-P3)." Add cross-reference: "See `multi-model-review-dispatch` for reconciliation rules." **Keep action thresholds** — "P0/P1/P2 findings must be fixed before proceeding" is an action policy owned here.

2. **Replace the reconciliation table in Deep Guidance** (lines 133-149) with: "After all channels complete, reconcile findings using the rules in `multi-model-review-dispatch`. The orchestration entry triggers reconciliation; the dispatch entry defines how to perform it."

3. **Add degraded-mode behavior** (new section):

   **Verdict definitions** (authoritative source — tool files reference these):

   | Verdict | Condition |
   |---------|-----------|
   | `pass` | All configured channels ran, no unresolved P0/P1/P2 |
   | `degraded-pass` | Channels skipped/compensated, no unresolved P0/P1/P2 |
   | `blocked` | Unresolved P0/P1/P2 after 3 fix rounds |
   | `needs-user-decision` | Contradictions or unresolvable findings |

   **Verdict precedence:** `needs-user-decision` > `blocked` > `degraded-pass` > `pass`.

   **Both external channels missing:** Maximum achievable verdict is `degraded-pass` — never `pass`. Review summary must note: "All findings are single-model (Claude only). External validation was unavailable."

   **Status model clarification:** `compensating` is a **coverage label** applied to a channel's output, not a replacement for the root-cause status. Each channel retains its root-cause status (`not_installed`, `auth_failed`, `auth_timeout`, `failed`) AND gains a coverage label (`compensating (X-equivalent)`) when a compensating pass ran. The fix cycle uses the root-cause status to decide whether to retry. The report uses the coverage label for the reader.

   **Compensating passes:**
   - Same prompt structure as the missing channel, executed as a Claude self-review pass.
   - Labeled `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.
   - Missing Codex -> focus on implementation correctness, security, API contracts.
   - Missing Gemini -> focus on architectural patterns, design reasoning, broad context.
   - Missing both -> two compensating passes.
   - Single-source confidence regardless. Normal mandatory-fix thresholds (P0/P1/P2 still require fixing).

4. **Add foreground-only constraint** — same language as `multi-model-review-dispatch`. Intentional duplication: knowledge entries are injected independently by the assembly engine — an agent may receive one without the other.

5. **Remove downstream-project-specific content** — the `AGENTS.md` structure template, `scripts/cli-pr-review.sh` pattern, `scripts/await-pr-review.sh`, and `docs/review-standards.md` authoring guidance. These are downstream project patterns, not scaffold's own review infrastructure.

6. **Keep and update**: PR workflow integration (generalized), security-focused review checklist, performance review patterns, common false positives, review metrics.

### Changes to `multi-model-research-dispatch`

1. **Add foreground-only constraint.**
2. **Standardize `which` -> `command -v`** at 3 locations: line 21 (prose), lines 41/45 (code blocks).
3. **Apply same two-step error handling** as review dispatch.
4. **Verify `!` prefix** — already correct.

### Changes to `multi-model-dispatch` SKILL.md

1. **Add foreground-only constraint.**
2. **Verify `command -v` and `!` prefix** — already correct.
3. **Replace reconciliation table** (lines 213-225) with cross-reference to `multi-model-review-dispatch`.
4. **Severity definitions in prompt templates** (lines 147-150) **MUST remain inline** — external models cannot resolve cross-references. Only meta-level prose outside templates should cross-reference.

### Implementation ordering

Section 1 is not safe to deploy without Section 3. Once knowledge entries define formal verdicts and degraded-mode behavior, the tool files must match. Deploy together.

### Consumer tools deferred to Section 3

All three tool files (`review-code.md`, `review-pr.md`, `post-implementation-review.md`).

---

## Section 2: CLAUDE.md Fixes

### New "Mandatory 3-Channel PR Review" section

Replace CLAUDE.md lines 114-149 with:

```markdown
### Mandatory 3-Channel PR Review

After creating every PR, run **all three** code review channels before moving
to the next task. A PostToolUse hook on `gh pr create` will remind you.

**Entry point:** Use `scaffold run review-pr` or follow the instructions in
`content/tools/review-pr.md`. The tool handles dispatch, auth checks,
reconciliation, and verdict logic.

**The three channels:**
1. **Codex CLI** — implementation correctness, security, API contracts
2. **Gemini CLI** — architectural patterns, broad-context reasoning
3. **Superpowers code-reviewer** — plan alignment, code quality, testing

**Critical rules:**
- **Foreground only** — Always run Codex and Gemini CLI commands as foreground
  Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background
  execution produces empty output. Multiple foreground calls in a single
  message are fine (the tool runner supports parallel invocations).
- **All 3 channels are required** — A channel enters degraded mode when it is
  not installed (`command -v` fails), auth fails and the user cannot recover,
  or it fails during execution (non-zero exit, malformed output, timeout).
  Run a compensating Claude
  self-review pass for each missing channel, focused on that channel's
  strength area and labeled `[compensating: Codex-equivalent]` or
  `[compensating: Gemini-equivalent]`. Compensating findings are single-source
  confidence.
- **Auth failures are NOT silent** — surface to the user with recovery commands:
  - Codex: `! codex login`
  - Gemini: `! gemini -p "hello"`
- **Independence** — never share one channel's output with another.
- **Fix all P0/P1/P2** findings before proceeding to the next task.
- **Verdict handling** — proceed only on `pass` or `degraded-pass`. If the
  review returns `blocked` or `needs-user-decision`, stop and surface the
  verdict and remaining findings to the user. Do NOT merge automatically.
- **3-round limit** — after 3 fix rounds with unresolved findings, stop and
  ask the user.

**Quick reference** (when `scaffold run` is unavailable):
<!-- Escape hatch only. Canonical commands live in content/tools/review-pr.md.
     Update both if CLI syntax changes. -->

    # Installation checks
    command -v codex >/dev/null 2>&1 || echo "Codex not installed"
    command -v gemini >/dev/null 2>&1 || echo "Gemini not installed"

    # Auth checks
    codex login status 2>/dev/null
    NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1

    # Review dispatch (foreground only — never run_in_background)
    codex exec --skip-git-repo-check -s read-only --ephemeral "PROMPT" 2>/dev/null
    NO_BROWSER=true gemini -p "PROMPT" --output-format json --approval-mode yolo 2>/dev/null

    # Superpowers code-reviewer
    BASE_SHA=$(gh pr view --json baseRefOid -q .baseRefOid)
    HEAD_SHA=$(gh pr view --json headRefOid -q .headRefOid)
    # Dispatch superpowers:code-reviewer subagent with base/head SHAs and PR description
```

### PostToolUse hook update

Update `.claude/settings.json` hook on `gh pr create` to:

```
Run `scaffold run review-pr` to execute the mandatory 3-channel review.
Auth recovery if needed: `! codex login` (Codex) / `! gemini -p "hello"` (Gemini)
Always run CLI commands in foreground — never use run_in_background.
```

### Section 3 dependency

Sections 2 and 3 **must be deployed atomically** (same commit or same PR). The new CLAUDE.md references verdicts and degraded-mode behavior that only exist after Section 3 updates the tool files.

### Implementation note

During implementation, verify whether any other files reference the old review-pr behavior (e.g., scaffold runner skill, pipeline review steps). If found, add them to the Section 3 update scope.

---

## Section 3: Review Tool Prompt Fixes

### Shared changes across all three tools

1. **Foreground-only constraint** — exact Process Rule text:
   > "Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output. Multiple foreground calls in a single message are fine."

2. **Canonical channel status vocabulary:**
   - Preflight: `not_installed`, `auth_failed`, `auth_timeout`
   - Post-dispatch: `completed`, `partial_timeout`, `failed`
   - Compensating: `compensating (Codex-equivalent)`, `compensating (Gemini-equivalent)`

   **Pre-MMR note:** `partial_timeout` is deferred to the MMR CLI implementation. Pre-MMR tools record a killed CLI as `failed`.

   **Status mapping:**

   | Current | Canonical | Report display |
   |---------|-----------|---------------|
   | `completed` | `completed` | "completed" |
   | `skipped (not installed)` | `not_installed` | "not installed" |
   | `skipped (auth failed)` | `auth_failed` | "auth failed" |
   | `error` | `failed` | "failed" |
   | *(new)* | `auth_timeout` | "auth timeout" |
   | *(new)* | `compensating` | "compensating (X-equivalent)" |

   **Status model:** `compensating` is a coverage label, not a replacement for root-cause status. Each channel retains root-cause AND gains coverage label. Fix cycle uses root-cause; reports use coverage label.

3. **Compensating-pass dispatch** — triggered by ANY unavailability (`not_installed`, `auth_failed`, `auth_timeout`, `failed`):
   - Same prompt structure as missing channel, Claude self-review
   - Labeled `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`
   - Single-source confidence
   - Missing Codex -> implementation correctness, security, API contracts
   - Missing Gemini -> architectural patterns, design reasoning, broad context
   - Missing both -> two passes, max `degraded-pass`/`degraded-coverage`, "All findings single-model"

4. **Installation check** — `command -v` before auth, as distinct step.

5. **Cross-reference comment** in Process Rules:
   > "Dispatch pattern follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-code.md`, `review-pr.md`, and `post-implementation-review.md`."

### Shared dispatch pattern

```
For each channel (Codex, Gemini, Superpowers):
  1. Check installation: command -v <tool> >/dev/null 2>&1
     -> not found: status = not_installed, queue compensating pass
  2. Check auth: <auth command> with 5s mental timeout
     -> auth failed: surface with ! recovery. If unrecoverable:
       status = auth_failed, queue compensating pass
     -> auth timeout: retry once. Still failing: status = auth_timeout, queue compensating
  3. Dispatch review (foreground only)
     -> completed: use results
     -> CLI killed by tool runner: status = failed, queue compensating pass
  4. After all channels: run queued compensating passes (foreground)
  5. Reconcile all findings (real + compensating)
  6. Apply verdict logic (PR tools) or coverage indicator (report tools)
```

**Fix cycle rule:** Re-run only channels that completed or ran as compensating. Never retry `not_installed`, `auth_failed`, or `auth_timeout` during fix rounds.

**Design decision:** `failed` channels are NOT retried during fix rounds. Compensating pass covers the gap. MMR CLI will add structured retry — pre-MMR tools keep it simple.

### `review-code.md` changes

1. Add foreground + verify `command -v` for all channels.
2. Compensating-pass queue after ANY channel failure (not just auth).
3. Compensating row in Step 6 reconciliation.
4. Step 8 verdict: compensating = max `degraded-pass`. Both missing = "all single-model."
5. Step 9 report: canonical status vocabulary.
6. Process Rules: foreground + cross-reference.

### `review-pr.md` changes

1. Two-step per channel: `command -v` first, then auth.
2. Foreground + compensating dispatch.
3. Replace prose verdicts with 4-verdict system:

   | Before | After |
   |--------|-------|
   | "All channels approve" | `pass` |
   | "Fix required (...)" | `blocked` |
   | "User adjudication needed" | `needs-user-decision` |
   | *(no equivalent)* | `degraded-pass` |

4. New Final Verdict step with precedence: `needs-user-decision` > `blocked` > `degraded-pass` > `pass`.
5. Fix cycle: don't retry failed channels.
6. Updated fallback table with canonical vocabulary.
7. Process Rules: foreground + cross-reference.

### `post-implementation-review.md` changes

Uses **coverage indicator** (not 4 verdicts) — it's report-oriented, not merge-gating.

1. Foreground + compensating in Phase 1 and Phase 2 subagents.
2. Phase 2: subagents inherit compensating rules, adapt focus to story context.
3. **Session-scoped channel availability:** Phase 1 probes once. Phase 2 subagents inherit Phase 1's availability results — no re-probing. Avoids N repeated timeouts.
4. Coverage indicator mapping:

   | Indicator | Condition |
   |-----------|-----------|
   | `full-coverage` | All channels completed in all phases, no compensating |
   | `degraded-coverage` | Compensating passes used, but all phases ran |
   | `partial-coverage` | Phase skipped or channel produced no results with no compensation |

5. Updated report: coverage indicator + Phase 1/Phase 2 channel breakdown.
6. Fallback + Process Rules updated.

---

## Section 4: MMR CLI Spec Updates

Updates to `docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md`.

### Problem — Add bullet

> "Background execution (`run_in_background`) produces empty output from both Codex and Gemini CLIs, forcing foreground-only dispatch that blocks the agent"

### Solution — Add feature

> **Compensating passes** — when a channel is unavailable, mmr optionally runs a one-shot compensating Claude self-review pass focused on the missing channel's strength area, with explicit labeling and single-source confidence. Compensating passes do not retry.

### CLI Interface

1. **Add `--compensate`/`--no-compensate` flags.**

2. **Global exit code table** (replaces per-command exit codes):

   | Exit Code | Meaning | Commands |
   |-----------|---------|----------|
   | 0 | Success | all |
   | 1 | In progress (polling) | `mmr status` only |
   | 2 | Gate failed | `mmr results` only |
   | 3 | Gate degraded (passed with compensating) | `mmr results` only |
   | 4 | Channel failure (no reconciled result possible) | `mmr status`, `mmr results` |
   | 5 | CLI error | all |

   **CI/CD note:** Use `mmr review --sync` for gate decisions, never `mmr status` directly. Exit 3 is a warning, not failure.

   **Exit code precedence:** Gate codes (0/2/3) take precedence over channel-failure (4) when a reconciled result exists. Exit 4 = no result possible.

3. **`mmr status` canonical statuses:** root_cause + coverage per channel.

### Auth Verification

1. **Replace `--skip-auth-check` with internal auth cache:**
   - `~/.mmr/auth-cache.json` per channel with timestamp
   - TTL: 5 minutes (configurable via `defaults.auth_cache_ttl`)
   - Busts immediately on auth failure
   - Never in project config — machine-local runtime state

   **Spec update:** Remove "Auth is verified every time before dispatch — never cached or assumed." Replace with auth cache description and rationale.

2. **Add `auth_timeout` row** to critical distinction table.

3. **Recovery commands:** Raw in config, platform wrappers add `!` prefix:
   ```yaml
   codex:
     auth:
       recovery: "codex login"
       recovery_claude_code: "! codex login"
   ```

4. **Foreground note:** `--sync` recommended for all AI agent contexts.

### Core Prompt Engine

Layer 1 severity definitions are intentionally inline. Note: "External models receive only the assembled prompt — they cannot resolve cross-references."

### Job Manager

1. **Updated lifecycle:**
   ```
   Per-channel:
     DISPATCHED -> RUNNING -> COMPLETED
                    |
                    +-> TIMEOUT -> PARTIAL_TIMEOUT (if partial output)
                    +-> FAILED
                    +-> AUTH_FAILED -> COMPENSATING -> COMP_COMPLETED / COMP_FAILED

   Per-job (terminal):
     GATE_PASSED / GATE_FAILED / GATE_DEGRADED
   ```

2. **`.meta.json` schema:**
   ```json
   {
     "root_cause": "auth_failed",
     "coverage_status": "compensating",
     "compensated_by": "claude",
     "original_channel": "gemini",
     "compensate_focus": ["architectural patterns", "design reasoning"],
     "compensate_elapsed": "15s"
   }
   ```
   `root_cause`: `null | auth_failed | auth_timeout | timeout | partial_timeout | failed | not_installed`
   `coverage_status`: `full | partial | compensating | none`

### Reconciliation Engine

1. **Compensation eligibility:**

   | Root Cause | Eligible? | Rationale |
   |-----------|-----------|-----------|
   | `not_installed` | Yes | Tool absent |
   | `auth_failed` | Yes | Compensate immediately; discard if auth recovers |
   | `auth_timeout` (after retry) | Yes | Transient |
   | `timeout` (no output) | Yes | No data |
   | `partial_timeout` | No | Use partial results |
   | `failed` | Yes | No output |

2. **Unified consensus table:**

   | Scenario | Confidence | Action |
   |----------|-----------|--------|
   | 2+ real channels, same location + severity | **High** | Report at agreed severity |
   | 2+ real channels, same location, different severity | **Medium** | Report at higher severity |
   | Real + compensating agree | **Medium** | Report, note compensating source |
   | All real channels approve | **High** | Gate passed |
   | One real P0, others approve | **High** | Report P0 |
   | One real P1/P2, others approve | **Medium** | Report with attribution |
   | Compensating-only finding | **Low** | Report, flag single-source |
   | Real channels contradict | **Low** | User adjudication |

   **Confidence cap rule:** Compensating evidence caps confidence at Medium only when it is necessary to reach the agreement threshold. Existing multi-real-channel consensus is not downgraded.

   **Severity is never capped.** A compensating P0 is still reported as P0 with Low confidence. Fix threshold gates on severity, not confidence.

3. **Gate logic:**
   ```
   gate_passed  = no finding <= fix_threshold
   gate_degraded = gate_passed AND any channel coverage_status = "compensating"
   gate_failed  = any finding <= fix_threshold unresolved
   ```

### Configuration

```yaml
defaults:
  compensate: true
  auth_cache_ttl: 300
  compensate_focus:
    codex:
      aspects: ["implementation correctness", "security", "API contracts"]
    gemini:
      aspects: ["architectural patterns", "design reasoning", "broad context"]
```

`compensate_focus.aspects` additive with `--focus`.

### Platform Wrappers

`--sync` is the primary mode for AI agents. Three-command async flow available for long-running reviews.

### All output surfaces needing update

`mmr status`, `mmr results` (all formats), `mmr jobs list`, `mmr review --replay`, error messages — all must use canonical `root_cause` / `coverage_status` vocabulary.

### Package Structure — Add `core/compensator.ts`

### Success Criteria — Add:

8. Compensating passes run automatically for unavailable channels when `--compensate` is enabled
9. Compensating findings are labeled and never inflate confidence scores
10. `--sync` mode works reliably for AI agent workflows

### Lessons Learned

Folded into spec sections as Rationale notes (no standalone appendix):
1. Background execution -> foreground note rationale
2. Auth friction -> loud failures rationale
3. Compensating value -> compensation eligibility rationale
4. Vocabulary drift -> Layer 1 immutability rationale
5. Partial results -> gate_degraded rationale

---

## Implementation Scope

### Files to create
*(none)*

### Files to modify

| File | Section | Changes |
|------|---------|---------|
| `content/knowledge/core/multi-model-review-dispatch.md` | 1 | Foreground, two-step CLI, `!` prefix, remove severity defs, remove gcloud, adapt quality gates |
| `content/knowledge/core/automated-review-tooling.md` | 1 | Thin summary, add degraded-mode + verdicts + compensating, foreground, remove downstream content |
| `content/knowledge/core/multi-model-research-dispatch.md` | 1 | Foreground, `which` -> `command -v`, two-step error handling |
| `content/skills/multi-model-dispatch/SKILL.md` | 1 | Foreground, replace reconciliation table, protect inline severity |
| `CLAUDE.md` | 2 | Replace review section, add escape hatch |
| `.claude/settings.json` | 2 | Update PostToolUse hook message |
| `content/tools/review-code.md` | 3 | Foreground, compensating, canonical statuses, verdict cap |
| `content/tools/review-pr.md` | 3 | Major: 4 verdicts, `command -v`, foreground, compensating, fallback table |
| `content/tools/post-implementation-review.md` | 3 | Foreground, compensating, coverage indicator, session-scoped availability |
| `docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md` | 4 | Errata across all sections per Section 4 |

### Deployment order

Sections 1, 2, and 3 must be deployed atomically (same PR). Section 4 is an additive spec update that can land independently.

### Testing approach

- `make validate` — frontmatter validation for modified pipeline/tool files
- `make check-all` — full quality gates
- Manual verification: run `scaffold run review-pr` at various channel availability levels
- Verify compensating pass labeling in review output
- Verify degraded-pass verdict when channels are missing
