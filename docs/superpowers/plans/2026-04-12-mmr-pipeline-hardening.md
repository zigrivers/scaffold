# MMR Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inconsistencies, add foreground-only constraints, add degraded-mode with compensating passes, and standardize vocabulary across the multi-model review pipeline.

**Architecture:** All changes are markdown prompt/content edits — no TypeScript code changes. 10 files modified across 4 workstreams (knowledge entries, CLAUDE.md, review tools, MMR CLI spec). Sections 1-3 deploy atomically in one PR. Section 4 lands independently.

**Tech Stack:** Markdown, YAML (settings.json), bats-core (validation)

**Spec:** `docs/superpowers/specs/2026-04-12-mmr-pipeline-hardening-design.md`

---

### Task 1: Update `multi-model-review-dispatch` knowledge entry

**Files:**
- Modify: `content/knowledge/core/multi-model-review-dispatch.md`

**Context:** This entry owns all dispatch mechanics. Six changes per the spec: foreground constraint, two-step CLI check, `!` prefix, remove severity defs, remove gcloud fallback, adapt quality gates for degraded mode.

- [ ] **Step 1: Read the current file**

Read `content/knowledge/core/multi-model-review-dispatch.md` in full. Note the locations of:
- CLI Availability Check section (Deep Guidance)
- Any severity definitions (Summary or Deep Guidance)
- The `gcloud` fallback line
- Quality Gates section
- Auth recovery commands (no `!` prefix currently)

- [ ] **Step 2: Add foreground-only constraint**

After the "### Dispatch Mechanics" heading in Deep Guidance, add a new subsection:

```markdown
### Foreground-Only Execution

When an AI agent dispatches CLI reviews via a tool runner (Claude Code Bash tool, Codex exec, etc.), always run commands in the foreground. Background execution (`run_in_background`, `&`, `nohup`) produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations.
```

- [ ] **Step 3: Replace the CLI availability check block**

Find the existing CLI Availability Check code block that contains `which codex` and `which gemini` (and the `gcloud` fallback). Replace the entire block with:

```markdown
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

If auth check times out (~5 seconds), retry once. If still failing, report `auth_timeout`.
If auth succeeds, report `ready` and proceed to dispatch.

**Post-dispatch terminal states:**
- `completed` — channel produced results, use normally
- `partial_timeout` — partial output before timeout; use what was received, note incompleteness. Does NOT trigger compensating pass.
- `failed` — crashed or unparseable output; triggers compensating pass.

Verdict impact: `partial_timeout` and `failed` channels mean the review is degraded. Maximum verdict is `degraded-pass` when any channel has a non-`completed` terminal state.
```

- [ ] **Step 4: Fix auth recovery commands throughout the file**

Search the entire file for any auth recovery commands that lack the `!` prefix. Replace:
- `Run: codex login` → `Run: ! codex login`
- `Run: gemini -p 'hello'` → `Run: ! gemini -p "hello"`

- [ ] **Step 5: Remove severity definitions**

Find any severity definition blocks (P0/P1/P2/P3 definitions). These may be in the Summary or in the prompt template. Replace the inline definitions with:

```markdown
See `review-methodology` for severity definitions (P0-P3). This entry uses those severities but does not define them.
```

**IMPORTANT:** Do NOT remove severity definitions from inside prompt templates (the `## Output Format` prompt example). Those must stay inline because external models cannot resolve cross-references. Only remove severity definitions from the entry's own instructional prose.

- [ ] **Step 6: Adapt quality gates for degraded mode**

Find the "### Quality Gates" section. Add these clarifications after the existing quality gate table:

```markdown
#### Degraded-Mode Gate Adaptation

When channels are skipped and compensating passes are used:

- **Minimum finding count** gate: compensating passes count toward the total but are not treated as separate external channels for consensus purposes.
- **Cross-model disagreement documentation** gate: applies whenever 2+ distinct model perspectives participate (Claude + one external counts). N/A only when Claude is the sole perspective (no external models and no compensating passes that introduce genuinely different framing).
- **Coverage threshold** gate: compensating passes satisfy the "every pass has at least one finding or explicit no-issues note" requirement.
- The reconciled output must record which channels were real, which were compensating, and which were skipped, so the orchestration layer can apply appropriate verdict logic.
```

- [ ] **Step 7: Run validation**

```bash
make validate
```

Expected: PASS. Frontmatter should be unchanged.

- [ ] **Step 8: Commit**

```bash
git add content/knowledge/core/multi-model-review-dispatch.md
git commit -m "fix: update multi-model-review-dispatch with foreground, two-step CLI, degraded-mode gates"
```

---

### Task 2: Restructure `automated-review-tooling` knowledge entry

**Files:**
- Modify: `content/knowledge/core/automated-review-tooling.md`

**Context:** This entry is being restructured to own orchestration/verdicts/compensating passes. Remove duplicated severity defs and reconciliation. Remove downstream-specific content. Add degraded-mode behavior. Heaviest restructure of all knowledge entries.

- [ ] **Step 1: Read the current file**

Read `content/knowledge/core/automated-review-tooling.md` in full. Note:
- Summary severity definitions (lines ~26-33) — to be replaced with cross-ref
- Summary reconciliation paragraph — to be replaced with cross-ref
- Deep Guidance "Review Finding Reconciliation" subsection — to be replaced with cross-ref
- "AGENTS.md Structure" subsection — to be removed (downstream-specific)
- "CLI Review Script Pattern" subsection — to be removed (downstream-specific)
- References to `scripts/cli-pr-review.sh`, `scripts/await-pr-review.sh` — to be removed
- References to `docs/review-standards.md` authoring guidance — to be removed
- Keep: security checklist, performance patterns, false positives, metrics, PR workflow (generalized)

- [ ] **Step 2: Thin the Summary**

Replace the severity definitions block in the Summary with:

```markdown
### Review Severity and Reconciliation

See `review-methodology` for severity definitions (P0-P3). See `multi-model-review-dispatch` for finding reconciliation rules.

**Action thresholds:** P0/P1/P2 findings must be fixed before proceeding to the next task. P3 findings are recorded but not actioned.
```

- [ ] **Step 3: Add degraded-mode behavior section**

After the thinned Summary (before Deep Guidance), add this new section:

```markdown
### Degraded-Mode Behavior

#### Verdict Definitions

These are the authoritative verdict definitions. Tool files (`review-code.md`, `review-pr.md`) reference these.

| Verdict | Condition |
|---------|-----------|
| `pass` | All configured channels ran, no unresolved P0/P1/P2 |
| `degraded-pass` | Channels skipped/compensated, no unresolved P0/P1/P2 |
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
```

- [ ] **Step 4: Replace reconciliation in Deep Guidance**

Find the "### Review Finding Reconciliation" subsection (with the Codex/Gemini/Action table) in Deep Guidance. Replace the entire subsection with:

```markdown
### Finding Reconciliation

After all channels complete (including compensating passes), reconcile findings using the rules in `multi-model-review-dispatch`. This orchestration entry triggers reconciliation; the dispatch entry defines how to perform it.
```

- [ ] **Step 5: Remove downstream-project-specific content**

Remove these subsections from Deep Guidance entirely:
- "### AGENTS.md Structure" (the template for what AGENTS.md should contain)
- "### CLI Review Script Pattern" (the `cli-pr-review.sh` bash pattern)
- "### Review Standards Document" (guidance for creating `docs/review-standards.md`)
- "### Updating Review Standards Over Time"
- "### Integration with CLAUDE.md" (the workflow-audit table pattern)

Also remove any references to:
- `scripts/cli-pr-review.sh`
- `scripts/await-pr-review.sh`
- `docs/review-standards.md` (as something to create)

**Keep** these subsections (update if they reference removed content):
- "### Security-Focused Review Checklist"
- "### Performance Review Patterns"
- "### Common False Positives"
- "### Review Metrics and Continuous Improvement"
- "### Fallback When Models Unavailable" — update to reference compensating passes

- [ ] **Step 6: Update the fallback subsection**

Find "### Fallback When Models Unavailable". Replace with:

```markdown
### Fallback When Models Unavailable

When external CLIs are unavailable, the degraded-mode behavior defined above applies:

1. For each unavailable external channel, queue a compensating Claude self-review pass focused on that channel's strength area.
2. Label findings as `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.
3. Treat compensating findings as single-source confidence.
4. Maximum verdict is `degraded-pass` when any channel is compensated.
5. When both external channels are unavailable, note "All findings are single-model" in the review summary.
```

- [ ] **Step 7: Run validation**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add content/knowledge/core/automated-review-tooling.md
git commit -m "fix: restructure automated-review-tooling with verdicts, compensating passes, scope delineation"
```

---

### Task 3: Update `multi-model-research-dispatch` knowledge entry

**Files:**
- Modify: `content/knowledge/core/multi-model-research-dispatch.md`

**Context:** Four changes: foreground constraint, `which` → `command -v`, two-step error handling, verify `!` prefix.

- [ ] **Step 1: Read the current file**

Read `content/knowledge/core/multi-model-research-dispatch.md` in full. Note:
- Summary fallback chain (uses `which codex`, `which gemini`)
- Deep Guidance CLI Availability Check code blocks (uses `which`)
- Auth recovery commands (should already have `!` prefix)

- [ ] **Step 2: Add foreground-only constraint**

After the "### CLI Availability Check" heading in Deep Guidance, add a new subsection before the code blocks:

```markdown
### Foreground-Only Execution

When an AI agent dispatches research or challenge prompts via a tool runner, always run commands in the foreground. Background execution (`run_in_background`, `&`, `nohup`) produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations.
```

- [ ] **Step 3: Replace `which` with `command -v` everywhere**

In the Summary, find the fallback chain text that says `which codex`, `which gemini`. Replace all occurrences:
- `` `which codex` `` → `` `command -v codex` ``
- `` `which gemini` `` → `` `command -v gemini` ``

In Deep Guidance code blocks, replace:
- `which codex >/dev/null 2>&1` → `command -v codex >/dev/null 2>&1`
- `which gemini >/dev/null 2>&1` → `command -v gemini >/dev/null 2>&1`

- [ ] **Step 4: Verify two-step error handling**

Verify the file distinguishes between:
- Not installed (`command -v` fails) → silent skip + note in Session Metadata
- Auth failed → loud failure with `!` recovery command

If the current text blurs these, update to match the two-step pattern from Task 1.

- [ ] **Step 5: Verify `!` prefix on recovery commands**

Confirm the file already uses:
- `! codex login`
- `! gemini -p "hello"`

If correct, no change needed. If missing, add the `!` prefix.

- [ ] **Step 6: Run validation**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add content/knowledge/core/multi-model-research-dispatch.md
git commit -m "fix: update multi-model-research-dispatch with foreground, command -v, two-step handling"
```

---

### Task 4: Update `multi-model-dispatch` SKILL.md

**Files:**
- Modify: `content/skills/multi-model-dispatch/SKILL.md`

**Context:** Four changes: foreground constraint, verify `command -v` and `!` prefix, replace reconciliation table, protect inline severity in prompt templates.

- [ ] **Step 1: Read the current file**

Read `content/skills/multi-model-dispatch/SKILL.md` in full. Note:
- CLI Detection & Auth Verification section (should already use `command -v`)
- Auth recovery commands (should already use `!` prefix)
- "## Dual-Model Reconciliation" table
- "## Context Bundling" template with inline severity definitions

- [ ] **Step 2: Add foreground-only constraint**

After the "## Correct Invocation Patterns" section, add:

```markdown
## Foreground-Only Execution

Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty or truncated output from both CLIs. Multiple foreground calls in a single message are fine — the tool runner supports parallel invocations.

This means: when dispatching reviews, make each CLI call a separate foreground Bash tool invocation. Do NOT use shell `&` or background subshells.
```

- [ ] **Step 3: Verify `command -v` and `!` prefix**

Confirm the file already uses `command -v` (not `which`) for installation checks and `!` prefix for auth recovery. The current file should already be correct — verify and move on.

- [ ] **Step 4: Replace the reconciliation table**

Find the "## Dual-Model Reconciliation" section. Replace the reconciliation table and its surrounding text with:

```markdown
## Finding Reconciliation

When multiple models produce findings, reconcile them using the rules defined in `multi-model-review-dispatch`. Key principles:

- **Independence rule**: Never share one model's review output with the other. Each model must review the artifact independently to avoid confirmation bias.
- **Round tracking**: For iterative reviews (like PR review loops), track the round number. After 3 fix rounds, merge with a warning and create a follow-up issue for remaining findings.

For the full consensus rules, confidence scoring, and disagreement resolution process, see `multi-model-review-dispatch`.
```

- [ ] **Step 5: Verify inline severity definitions in prompt templates are preserved**

Check the "## Context Bundling" section's prompt template. The severity definitions inside the template (P0/P1/P2/P3 definitions within the prompt text) **MUST remain inline**. External models receive only the assembled prompt — they cannot resolve cross-references to knowledge entries. Confirm these are NOT removed. If they are intact, no change needed.

- [ ] **Step 6: Run validation**

```bash
make validate
```

Expected: PASS. Note: SKILL.md may not be covered by frontmatter validation.

- [ ] **Step 7: Commit**

```bash
git add content/skills/multi-model-dispatch/SKILL.md
git commit -m "fix: update multi-model-dispatch skill with foreground, reconciliation cross-ref"
```

---

### Task 5: Update CLAUDE.md and PostToolUse hook

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/settings.json`

**Context:** Replace the "Mandatory 3-Channel PR Review" section in CLAUDE.md with the streamlined version from the spec. Update the PostToolUse hook to match.

- [ ] **Step 1: Read the current CLAUDE.md review section**

Read `CLAUDE.md` lines 110-155. Identify the exact start and end of the "### Mandatory 3-Channel PR Review" section.

- [ ] **Step 2: Replace the review section**

Replace the entire "### Mandatory 3-Channel PR Review" subsection (from `### Mandatory 3-Channel PR Review` through the end of the `**Rules:**` list, before `## Project Structure Quick Reference`) with the exact text from the spec Section 2. The replacement text is:

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
  Run a compensating Claude self-review pass for each missing **external**
  channel (Codex or Gemini), focused on that channel's strength area and
  labeled `[compensating: Codex-equivalent]` or
  `[compensating: Gemini-equivalent]`. Compensating findings are single-source
  confidence. (Superpowers is a Claude subagent and is always available — no
  compensating pass needed.)
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
```bash
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
```

- [ ] **Step 3: Update the PostToolUse hook**

Read `.claude/settings.json`. Find the PostToolUse hook command that matches on `gh pr create`. Replace the echo content with:

```json
{
  "type": "command",
  "command": "if echo \"$CC_BASH_COMMAND\" | grep -q 'gh pr create'; then echo '\\n⚠️  MANDATORY: Run `scaffold run review-pr` to execute the 3-channel review.\\n\\nAuth recovery if needed: `! codex login` (Codex) / `! gemini -p \"hello\"` (Gemini)\\nAlways run CLI commands in foreground — never use run_in_background.\\nFix all P0/P1/P2 findings before moving on. Do NOT skip any channel.'; fi"
}
```

- [ ] **Step 4: Run validation**

```bash
make check-all
```

Expected: PASS. This validates CLAUDE.md content and settings.json format.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/settings.json
git commit -m "fix: streamline CLAUDE.md review section with foreground, verdicts, compensating passes"
```

---

### Task 6: Update `review-code.md` tool

**Files:**
- Modify: `content/tools/review-code.md`

**Context:** Already the most aligned tool. Add foreground constraint, compensating passes, canonical statuses, verdict cap for degraded mode. Six changes.

- [ ] **Step 1: Read the current file**

Read `content/tools/review-code.md` in full. Note:
- Step 4 channel dispatch sections (Codex, Gemini, Superpowers)
- Step 6 reconciliation table
- Step 8 verdicts (already has 4 verdicts)
- Step 9 report format (channel status lines)
- Process Rules section (if present, or find where to add)

- [ ] **Step 2: Add foreground note to Step 4**

Before the "#### Channel 1: Codex CLI" heading in Step 4, add:

```markdown
**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output. Multiple foreground calls in a single message are fine.
```

- [ ] **Step 3: Add compensating-pass logic to channel dispatch**

After each channel's auth failure handling block, add compensating-pass queuing. For Codex:

After "If auth fails: tell the user to run `! codex login`..." add:

```markdown
If auth cannot be recovered, or if Codex is not installed, queue a compensating Claude self-review pass focused on implementation correctness, security, and API contracts. Label findings as `[compensating: Codex-equivalent]`. This pass runs after all channel dispatch attempts complete.
```

For Gemini, add similar text focused on architectural patterns, design reasoning, and broad context, labeled `[compensating: Gemini-equivalent]`.

After the Superpowers section, add:

```markdown
**After all channels:** Run any queued compensating passes as foreground Claude self-review passes. Each compensating pass uses the same review prompt as the missing channel, focusing on that channel's strength area.
```

- [ ] **Step 4: Add compensating row to Step 6 reconciliation**

In the Step 6 reconciliation table, add a row:

```markdown
| Compensating-pass P0/P1/P2 finding | Single-source confidence — fix per normal thresholds, but label as compensating in summary |
```

- [ ] **Step 5: Update Step 8 verdict for degraded mode**

After the existing verdict definitions, add:

```markdown
When compensating passes ran for any channel, the maximum achievable verdict is `degraded-pass` — never `pass`, even if all findings are resolved. When both external channels were compensated, the review summary must note: "All findings are single-model (Claude only)."
```

- [ ] **Step 6: Update Step 9 report with canonical statuses**

Replace the channel status options in the report template:

```markdown
### Channels Executed
- Codex CLI — [completed / not installed / auth failed / auth timeout / failed / compensating (Codex-equivalent)]
- Gemini CLI — [completed / not installed / auth failed / auth timeout / failed / compensating (Gemini-equivalent)]
- Superpowers code-reviewer — [completed / error]
```

- [ ] **Step 7: Add Process Rules**

If a Process Rules section exists, add to it. If not, add before "## After This Step":

```markdown
## Process Rules

1. **Foreground only** — Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
2. **All 3 channels are mandatory** — skip only when a tool is genuinely not installed, never by choice.
3. **Auth failures are not silent** — always surface to the user with recovery instructions.
4. **Independence** — never share one channel's output with another.
5. **Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.
6. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-pr.md` and `post-implementation-review.md`.
```

- [ ] **Step 8: Run validation**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add content/tools/review-code.md
git commit -m "fix: update review-code with foreground, compensating passes, canonical statuses"
```

---

### Task 7: Overhaul `review-pr.md` tool

**Files:**
- Modify: `content/tools/review-pr.md`

**Context:** Most work needed. Seven changes: two-step CLI check, foreground, compensating dispatch, 4-verdict system replacing prose, final verdict step, fallback table, process rules.

- [ ] **Step 1: Read the current file**

Read `content/tools/review-pr.md` in full. Note:
- Step 3 channel dispatch (no `command -v`, jumps to auth)
- Step 4 reconciliation table
- Step 5 report format (prose verdicts: "All channels approve / Fix required / User adjudication needed")
- Step 6 fix cycle
- Step 7 confirm completion
- Fallback Behavior table
- Process Rules section

- [ ] **Step 2: Add foreground + command -v to Step 3**

Before "#### Channel 1: Codex CLI", add:

```markdown
**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.
```

For each external channel (Codex, Gemini), add an installation check BEFORE the auth check:

```markdown
**Installation check:**
```bash
command -v codex >/dev/null 2>&1
```
- If `codex` is not installed: queue a compensating Claude self-review pass focused on implementation correctness, security, and API contracts. Record status `not installed`. Skip to next channel.
```

Then the existing auth check follows. After the auth failure handling, add:

```markdown
If auth cannot be recovered, queue a compensating pass (same focus as above). Record status `auth failed`.
```

Add the same pattern for Gemini (with architectural patterns, design reasoning, broad context as focus).

After all three channel sections, add:

```markdown
**After all channels:** Run any queued compensating passes as foreground Claude self-review passes. Each uses the same review prompt as the missing channel, focused on that channel's strength area. Label findings as `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.
```

- [ ] **Step 3: Add compensating row to Step 4 reconciliation**

Add to the reconciliation table:

```markdown
| Compensating-pass P0/P1/P2 finding | Single-source confidence — fix per normal thresholds, label as compensating |
```

- [ ] **Step 4: Replace Step 5 report format**

Replace the prose verdict in the report template. The Channels Executed section becomes:

```markdown
### Channels Executed
- [ ] Codex CLI — [completed / not installed / auth failed / auth timeout / failed / compensating (Codex-equivalent)]
- [ ] Gemini CLI — [completed / not installed / auth failed / auth timeout / failed / compensating (Gemini-equivalent)]
- [ ] Superpowers code-reviewer — [completed / error]
```

Replace the Verdict line:

```markdown
### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

- [ ] **Step 5: Add Final Verdict step**

After Step 5 (Report Results) and before Step 6 (Fix), add a new step:

```markdown
### Step 5a: Final Verdict

Return exactly one verdict:

- `pass` — all channels ran, no unresolved P0/P1/P2
- `degraded-pass` — channels skipped/compensated, no unresolved P0/P1/P2
- `blocked` — unresolved P0/P1/P2 after 3 fix rounds
- `needs-user-decision` — contradictions or unresolvable findings

Verdict precedence: `needs-user-decision` > `blocked` > `degraded-pass` > `pass`.

When compensating passes ran, maximum achievable verdict is `degraded-pass`. When both external channels were compensated, note "All findings are single-model."
```

- [ ] **Step 6: Update fix cycle**

In the fix step (Step 6), add:

```markdown
**Fix cycle channel rule:** Re-run only channels that originally completed or ran as compensating passes. Never retry a channel marked `not installed`, `auth failed`, or `auth timeout` during fix rounds — its availability does not change within a session.
```

- [ ] **Step 7: Replace Fallback Behavior table**

Replace the entire Fallback Behavior table with:

```markdown
## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Channel not installed | Queue compensating pass, report status `not installed` |
| Auth expired, user recovers | Retry dispatch |
| Auth expired, user declines | Queue compensating pass, report status `auth failed` |
| Channel fails during execution | Queue compensating pass, report status `failed` |
| Both external channels unavailable | Two compensating passes, max verdict: `degraded-pass`, note "All findings single-model" |
| Superpowers unavailable | Run available CLIs, warn user (Superpowers is always-available Claude — no compensating pass) |
```

- [ ] **Step 8: Add/update Process Rules**

Replace or add the Process Rules section:

```markdown
## Process Rules

1. **Foreground only** — Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
2. **All three channels are mandatory** — skip only when a tool is genuinely not installed, never by choice.
3. **Auth failures are not silent** — always surface to the user with the exact recovery command.
4. **Independence** — never share one channel's output with another. Each reviews the diff independently.
5. **Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.
6. **3-round limit** — never attempt more than 3 fix rounds. Surface unresolved findings to the user.
7. **Document everything** — the review summary must show which channels ran and which were skipped, with reasons.
8. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-code.md` and `post-implementation-review.md`.
```

- [ ] **Step 9: Update Step 7 confirm completion**

Update the completion output to include the formal verdict:

```markdown
```
Code review complete. Verdict: [pass/degraded-pass]. All 3 channels executed. PR #[number] is ready for merge.
```
```

- [ ] **Step 10: Run validation**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add content/tools/review-pr.md
git commit -m "fix: overhaul review-pr with 4-verdict system, compensating passes, canonical statuses"
```

---

### Task 8: Update `post-implementation-review.md` tool

**Files:**
- Modify: `content/tools/post-implementation-review.md`

**Context:** Moderate changes. Uses coverage indicators (not 4 verdicts). Add foreground + compensating to Phase 1 and Phase 2 subagents. Session-scoped availability. Coverage indicator mapping.

- [ ] **Step 1: Read the current file**

Read `content/tools/post-implementation-review.md` in full. Note:
- Step 4 Phase 1 channel dispatch
- Step 5d Phase 2 subagent instructions
- Step 7 report format
- Step 10 completion summary
- Fallback Behavior table
- Process Rules section

- [ ] **Step 2: Add foreground note to Step 4**

Before "#### Channel 1: Codex CLI" in Step 4, add:

```markdown
**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.
```

- [ ] **Step 3: Add compensating-pass logic to Phase 1 channels**

After each external channel's auth failure handling, add compensating-pass queuing (same pattern as Task 6 Step 3, adapted for post-implementation context).

After all Phase 1 channels, add:

```markdown
**After all Phase 1 channels:** Run any queued compensating passes. Record which channels were real, compensating, or skipped. This availability map is used for Phase 2.
```

- [ ] **Step 4: Update Phase 2 subagent instructions**

In Step 5d, update the subagent dispatch instructions to include:

```markdown
**Session-scoped channel availability:** Phase 1 has already probed channel installation and auth. Pass the Phase 1 channel availability results to each Phase 2 subagent. Subagents do NOT re-probe — if Codex was `auth failed` in Phase 1, every Phase 2 subagent treats Codex as unavailable and runs a compensating pass immediately.

Phase 2 compensating passes adapt the focus to story context:
- Missing Codex → focus compensating pass on implementation correctness and edge cases for this story's acceptance criteria.
- Missing Gemini → focus compensating pass on design coherence and architectural alignment for this story.
```

Also add the foreground-only note to the subagent channel dispatch instructions.

- [ ] **Step 5: Update Step 7 report format**

Add a coverage indicator line to the report Summary section:

```markdown
- **Coverage:** [full-coverage / degraded-coverage / partial-coverage]
- **Channels (Phase 1):** Codex [status] | Gemini [status] | Superpowers [completed]
- **Channels (Phase 2):** [N] stories reviewed, [N] with full channels, [N] with compensating passes
```

Coverage indicator mapping:
- `full-coverage` — all channels completed in all Phase 1 + Phase 2 dispatches, no compensating passes
- `degraded-coverage` — compensating passes used OR channels have partial coverage, but all phases ran
- `partial-coverage` — a phase was skipped entirely (e.g., Phase 2 skipped for missing user-stories.md), or a channel produced no results with no compensation

- [ ] **Step 6: Replace Fallback Behavior table**

Replace with canonical vocabulary version (same pattern as Task 7 Step 7).

- [ ] **Step 7: Add/update Process Rules**

Add foreground-only rule and cross-reference comment (same pattern as Task 6 Step 7, adapted for this tool):

```markdown
8. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-code.md` and `review-pr.md`.
```

- [ ] **Step 8: Run validation**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add content/tools/post-implementation-review.md
git commit -m "fix: update post-implementation-review with foreground, compensating, coverage indicators"
```

---

### Task 9: Update MMR CLI spec (Section 4)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md`

**Context:** Errata across all sections per the design spec Section 4. This can land independently from Sections 1-3.

- [ ] **Step 1: Read the current MMR spec**

Read `docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md` in full.

- [ ] **Step 2: Add background execution bullet to Problem section**

After the existing problem bullets, add:

```markdown
- Background execution (`run_in_background`) produces empty output from both Codex and Gemini CLIs, forcing foreground-only dispatch that blocks the agent
```

- [ ] **Step 3: Add compensating passes to Solution section**

After the existing solution features list, add:

```markdown
- **Compensating passes** — when a channel is unavailable, mmr optionally runs a one-shot compensating Claude self-review pass focused on the missing channel's strength area, with explicit labeling and single-source confidence
```

- [ ] **Step 4: Update CLI Interface**

Add `--compensate`/`--no-compensate` to `mmr review` options.

Replace the per-command exit code sections with the global exit code table from the design spec.

Add `--sync` exit semantics note.

- [ ] **Step 5: Update Auth Verification Layer**

Remove "Auth is verified every time before dispatch — never cached or assumed." Replace with auth cache description (5min TTL, bust on failure, machine-local).

Add `auth_timeout` row to critical distinction table.

Fix recovery commands: use raw commands in config (no `!` prefix), note that platform wrappers add `!` dynamically.

Add foreground note with `--sync` recommendation.

- [ ] **Step 6: Add Core Prompt Engine note**

After the Layer 1 description, add:

```markdown
Layer 1 severity definitions are intentionally duplicated from `review-methodology`. External models receive only the assembled prompt — they cannot resolve cross-references to knowledge entries.
```

- [ ] **Step 7: Update Job Manager**

Replace the lifecycle diagram with the updated version including preflight states and GATE_NEEDS_USER.

Add `.meta.json` schema definition per channel.

- [ ] **Step 8: Update Reconciliation Engine**

Add compensation eligibility table.

Replace the consensus rules table with the unified 8-row version.

Add confidence cap rule, severity-never-capped note.

Replace gate logic with the 4-state version including gate_degraded and gate_needs_user.

Add quality gate failure mapping.

- [ ] **Step 9: Update Configuration**

Add `compensate`, `auth_cache_ttl`, and `compensate_focus` to the defaults example.

Fix `!` prefix in recovery commands.

- [ ] **Step 10: Update Platform Wrappers**

Add `--sync` as recommended mode for AI agents.

- [ ] **Step 11: Add output surfaces note**

Add a section listing all output surfaces needing canonical vocabulary update.

- [ ] **Step 12: Update Package Structure**

Add `core/compensator.ts` to the package tree.

- [ ] **Step 13: Update Success Criteria**

Add criteria 8-10.

- [ ] **Step 14: Add Rationale notes**

Fold the 5 lessons-learned observations into their respective spec sections as Rationale notes.

- [ ] **Step 15: Commit**

```bash
git add docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md
git commit -m "docs: update MMR CLI spec with compensating passes, auth cache, exit codes, lifecycle

BREAKING CHANGE: exit code semantics changed for mmr status and mmr results"
```

---

### Task 10: Final validation and integration check

**Files:**
- All modified files from Tasks 1-9

**Context:** Run all quality gates and verify consistency across the modified files. This is a main-agent/integrator task (not subagent-safe).

- [ ] **Step 1: Run full quality gates**

```bash
make check-all
```

Expected: PASS. All frontmatter validation, linting, and tests should pass.

- [ ] **Step 2: Run scaffold build**

```bash
scaffold build
```

Expected: PASS. The knowledge entries modified in Tasks 1-3 are assembled at build time. Verify no assembly errors.

- [ ] **Step 3: Spot-check cross-file consistency**

Verify these terms appear consistently across all modified files:
- `command -v` (not `which`) — grep all modified files
- `! codex login` and `! gemini -p "hello"` — grep all modified files
- Verdict vocabulary: `pass`, `degraded-pass`, `blocked`, `needs-user-decision` — only in knowledge entries and merge-gating tools (review-code, review-pr), NOT in post-implementation-review
- Coverage indicators: `full-coverage`, `degraded-coverage`, `partial-coverage` — only in post-implementation-review
- `compensating` as a coverage label — in all tool files and knowledge entries

```bash
# Verify no remaining 'which codex' or 'which gemini'
grep -r "which codex\|which gemini" content/knowledge/ content/skills/ content/tools/ CLAUDE.md
# Expected: no matches

# Verify ! prefix on recovery commands
grep -rn "codex login\|gemini -p" content/knowledge/ content/tools/ CLAUDE.md | grep -v "! codex\|! gemini\|command"
# Expected: only matches inside prompt templates (external model prompts that don't use ! prefix)
```

- [ ] **Step 4: Verify the review-methodology prerequisite**

```bash
grep -l "P0.*P1.*P2.*P3\|P0.*blocks\|P0.*critical" content/knowledge/review/review-methodology.md
```

Expected: match found — severity definitions are present.

- [ ] **Step 5: Commit any fixups**

If any consistency issues were found, fix them and commit:

```bash
git add -A
git commit -m "fix: address cross-file consistency issues from integration check"
```

If no issues, skip this step.
