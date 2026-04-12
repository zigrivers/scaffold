# mmr — Multi-Model Review CLI

**Date:** 2026-04-05
**Status:** Design approved, pending implementation plan

## Problem

AI-assisted code reviews using multiple model CLIs (Claude, Gemini, Codex) are unreliable in practice. Real-world observations from production usage:

- Reviews take 4–6+ minutes; agents block or improvise polling loops
- `timeout` (GNU coreutils) is unavailable on macOS, breaking the first dispatch attempt
- Auth tokens expire mid-session; agents don't detect this consistently
- Each agent (Claude Code, Codex App, Gemini CLI) reinvents the dispatch/parse/reconcile flow every time
- Prompt format and severity definitions vary across invocations
- Output parsing is fragile (Gemini wraps JSON in metadata, Codex emits thinking tokens to stderr)
- Finding reconciliation across channels is manual and inconsistent
- No structured gate mechanism — agents decide ad-hoc whether findings are blocking
- Background execution (`run_in_background`) produces empty output from both Codex and Gemini CLIs, forcing foreground-only dispatch that blocks the agent

## Solution

`mmr` is a standalone CLI that any AI agent can call to dispatch, monitor, and reconcile multi-model code reviews. It provides:

- **Async job model** — fire reviews, continue working, poll for results
- **Portable timeouts** — Node.js AbortController, no GNU coreutils dependency
- **Per-channel auth verification** — loud failures with recovery commands, never silent skips
- **Immutable core prompt** — consistent severity definitions and output format across all channels
- **Automated reconciliation** — consensus rules produce a unified findings list
- **Configurable severity gates** — project default + CLI override for which findings block the gate
- **Structured output** — JSON default, with text/markdown/SARIF formatters
- **Compensating passes** — when a channel is unavailable, mmr optionally runs a one-shot compensating Claude self-review pass focused on the missing channel's strength area, with explicit labeling and single-source confidence

## Architecture

### Form Factor

Hybrid: a CLI core (`@zigrivers/mmr`) handles all logic. Thin platform wrappers (Claude Code skill, AGENTS.md instructions, GEMINI.md instructions) provide native integration for each AI environment.

### Monorepo Placement

Lives in the scaffold monorepo as an independent workspace package:

```
scaffold/
  packages/
    mmr/
      package.json        # @zigrivers/mmr — independently installable via npm
      src/
      templates/
      tests/
      bin/
```

Scaffold's existing review skills/tools are updated to call `mmr` under the hood. Non-scaffold users install `mmr` standalone via `npm install -g @zigrivers/mmr` or `brew install mmr`.

## CLI Interface

### Commands

| Command | Purpose |
|---------|---------|
| `mmr review` | Dispatch a review job to all configured channels |
| `mmr status <job-id>` | Check progress of a running job |
| `mmr results <job-id>` | Collect, reconcile, and output findings |
| `mmr config` | Manage channel configuration |
| `mmr jobs` | List, prune, or replay jobs |

### `mmr review`

```
mmr review --diff <file|->            # Diff to review (file path or stdin)
mmr review --pr <number>              # Auto-extract diff from a PR
mmr review --staged                   # Review staged changes
mmr review --base <ref> --head <ref>  # Review a commit range

Options:
  --focus "description"               # Focus areas appended to core prompt
  --fix-threshold P0|P1|P2|P3        # Severity gate (default: from config)
  --channels claude,gemini            # Override which channels to use
  --timeout <seconds>                 # Per-channel timeout (default: from config)
  --template <name>                   # Use a named prompt template
  --format json|text|markdown|sarif   # Output format (applied at results time)
  --sync                              # Block until all channels complete or timeout; returns reconciled results directly
  --compensate              # Run compensating Claude passes for unavailable channels (default: from config)
  --no-compensate           # Skip compensating passes
```

Returns a job ID immediately (unless `--sync`). See Global Exit Codes below for exit code semantics.

### `mmr status <job-id>`

```json
{
  "job_id": "mmr-a1b2c3",
  "status": "running",
  "channels": {
    "claude": { "status": "completed", "root_cause": null, "coverage_status": "full", "elapsed": "47s", "findings_count": 2 },
    "gemini": { "status": "running", "elapsed": "2m12s" },
    "codex": { "status": "completed", "root_cause": null, "coverage_status": "full", "elapsed": "1m03s", "findings_count": 0 }
  }
}
```

### `mmr results <job-id>`

Returns reconciled findings when all channels are complete (or timed out).

### Global Exit Codes

| Exit Code | Meaning | Commands |
|-----------|---------|----------|
| 0 | Success (dispatched / all complete / gate passed) | all |
| 1 | In progress (still running) | `mmr status` only |
| 2 | Gate failed (findings above threshold) | `mmr results`, `mmr review --sync` |
| 3 | Gate degraded (passed with compensating channels) | `mmr results`, `mmr review --sync` |
| 4 | Channel failure (no reconciled result possible) | `mmr status`, `mmr results` |
| 5 | CLI error (bad arguments, config error) | all |

**`mmr review --sync` exit semantics:** `--sync` blocks until all channels complete (or timeout), runs reconciliation, and returns the same exit codes as `mmr results`. It is the recommended single-command entry point for AI agents and CI/CD.

**CI/CD note:** Use `mmr review --sync` for gate decisions, never `mmr status` directly. Exit 3 is a warning, not failure.

**Exit code precedence:** Gate codes (0/2/3) take precedence over channel-failure (4) when a reconciled result exists. Exit 4 = no result possible. `needs-user-decision` verdict maps to exit 2 with a `verdict: "needs-user-decision"` field in JSON output.

### `mmr config`

```
mmr config init                  # Create .mmr.yaml, auto-detect installed CLIs
mmr config channels              # List configured channels
mmr config add-channel <name>    # Add a new review channel interactively
mmr config test                  # Verify all channels (installation + auth)
```

### `mmr jobs`

```
mmr jobs list                    # Show recent jobs with status
mmr jobs prune                   # Remove jobs older than retention period
mmr review --replay <job-id> --channel <name>  # Re-run a channel with same prompt
```

## Auth Verification Layer

### Per-Channel Auth Config

Each channel definition includes an `auth` block with a check command, timeout, failure exit codes, and a human-readable recovery instruction.

### Auth Lifecycle

Auth results are cached internally for up to `auth_cache_ttl` seconds (default: 300). The cache is machine-local (`~/.mmr/auth-cache.json`), never written to project config, and busts immediately on any auth failure. This balances the original "verify every time" principle against the practical cost of repeated slow auth probes in session-scoped workflows.

> **Rationale:** Auth tokens expire mid-session without warning. Pre-flight checks are non-negotiable, but repeated 5-second probes across N story reviews in post-implementation-review waste minutes. The TTL-based cache was chosen over a `--skip-auth-check` flag to prevent cargo-culting in CI scripts.

1. Check CLI installed (`command -v <tool>`)
   - Not installed → silent skip, noted in job metadata
2. Run auth check command (5s timeout)
   - Exit code matches `failure_exit_codes` → **AUTH FAILED** — record failure + recovery command
   - Timeout → treat as transient, retry once
   - Success → dispatch review

### Critical Distinction

| Condition | Behavior | User Action |
|-----------|----------|-------------|
| CLI not installed | Silent skip, note in results | Install the CLI |
| Auth expired/invalid | **Loud failure**, surface recovery command | Re-authenticate |
| Auth check timeout | Retry once, then record `auth_timeout` (distinct from `auth_failed`) | Check network |

Auth failures are **never silent**. The initial `mmr review` response includes immediate auth status:

```json
{
  "job_id": "mmr-a1b2c3",
  "dispatched": {
    "claude": { "auth": "ok", "status": "dispatched" },
    "gemini": { "auth": "failed", "recovery": "Run: gemini -p 'hello'", "status": "skipped" },
    "codex": { "auth": "ok", "status": "dispatched" }
  },
  "auth_failures": 1,
  "message": "2/3 channels dispatched. Gemini auth expired."
}
```

Recovery commands are stored as raw commands in `.mmr.yaml`. Platform wrappers (Claude Code skill, AGENTS.md) add the `!` prefix dynamically for interactive contexts.

### `mmr config test`

Pre-flight check for all channels:

```
$ mmr config test

  claude    ✓ installed    ✓ authenticated
  gemini    ✓ installed    ✗ auth expired → Run: gemini -p 'hello'
  codex     ✗ not installed (skipped)

  2/3 channels ready. 1 auth failure.
```

> **Foreground note:** AI agents calling `mmr` must run it in the foreground. Background execution produces empty output. `--sync` is the recommended mode for agent workflows.

## Core Prompt Engine

### Layered Assembly

Prompts are assembled from four layers. The core is immutable; user context is additive.

**Layer 1 — Core (immutable, owned by mmr):**
- Severity definitions (P0: critical/security/data-loss, P1: bugs/inconsistency, P2: improvements, P3: trivial nits)
- Output JSON schema specification
- Review criteria: correctness, regressions, edge cases, test coverage, security
- Instruction: return ONLY structured findings or NO FINDINGS

**Layer 2 — Project (from `.mmr.yaml` `review_criteria`):**
- Project-specific review criteria (e.g., "Verify parameterized DB queries", "Check HIPAA compliance")
- Coding standards references

**Layer 3 — Invocation (from CLI `--focus` flag):**
- Per-review focus areas (e.g., "price consistency, closed-session date logic")
- File-scoped context if provided

**Layer 4 — Diff/Code:**
- The actual diff, PR content, or staged changes

### Per-Channel Adaptation

The prompt **content** is identical across channels. The **delivery** is adapted per channel:

- **Prompt wrapper:** Per-channel template that wraps the core prompt (e.g., Gemini gets "Return raw JSON only. No markdown fences.")
- **Output parser:** Handles CLI-specific output quirks (Gemini metadata wrapper, Codex stderr thinking tokens, trailing commas)
- **Stderr handling:** Configurable per channel (suppress, capture, or pass through)

### Named Templates

Projects can define additional prompt templates for specialized reviews:

```yaml
templates:
  pr: {}           # Default PR review (core prompt only)
  plan:            # Implementation plan review
    criteria:
      - "Check task coverage against user stories"
      - "Verify dependency ordering"
  pipeline:        # Pipeline prompt review
    criteria:
      - "Verify frontmatter dependencies"
      - "Check mode detection blocks"
```

Invoked as: `mmr review --template plan --diff plan.md`

## Job Manager

### Job Lifecycle

```
mmr review → DISPATCHED → RUNNING → COMPLETED
                            │            │
                            ├→ TIMEOUT   ├→ GATE_PASSED
                            ├→ FAILED    └→ GATE_FAILED
                            └→ AUTH_FAILED
```

### Job State Directory

```
~/.mmr/jobs/
  mmr-a1b2c3/
    job.json          # Metadata: channels, thresholds, timestamps, status
    prompt.txt        # Assembled prompt (for debugging/replay)
    diff.patch        # Input diff (for re-runs)
    channels/
      claude.json     # Raw output
      claude.pid      # PID for monitoring
      claude.log      # stderr capture
      gemini.json
      gemini.pid
      gemini.log
    results.json      # Reconciled output (written by mmr results)
```

Jobs are retained for 7 days by default (configurable via `defaults.job_retention_days`).

## Reconciliation Engine

### Consensus Rules

| Scenario | Confidence | Action |
|----------|------------|--------|
| 2+ channels flag same location + same severity | **High** | Report at agreed severity |
| 2+ channels flag same location, different severity | **Medium** | Report at the *higher* severity, note disagreement |
| All channels approve (no findings) | **High** | Gate passed |
| One channel flags P0, others approve | **High** | Report P0 — critical from any single source |
| One channel flags P1/P2, others approve | **Medium** | Report with attribution, flag as single-source |
| Channels contradict | **Low** | Present both, mark for user adjudication |

### Reconciled Output Schema

```json
{
  "job_id": "mmr-a1b2c3",
  "gate_passed": false,
  "fix_threshold": "P2",
  "reconciled_findings": [
    {
      "severity": "P1",
      "confidence": "high",
      "location": "file.py:142",
      "description": "Description of the issue",
      "suggestion": "Specific fix recommendation",
      "sources": ["claude", "codex"],
      "agreement": "consensus"
    }
  ],
  "per_channel": {
    "claude": { "status": "completed", "elapsed": "47s", "raw_findings": 3 },
    "gemini": { "status": "timeout", "elapsed": "300s", "partial_findings": 1 },
    "codex": { "status": "completed", "elapsed": "63s", "raw_findings": 1 }
  },
  "metadata": {
    "channels_dispatched": 3,
    "channels_completed": 2,
    "channels_partial": 1,
    "total_elapsed": "5m03s"
  }
}
```

### Gate Logic

```
gate_passed = no reconciled finding has severity ≤ fix_threshold
```

Default `fix_threshold: P2` means P0, P1, and P2 findings fail the gate. P3-only results pass.

Raw per-channel output is available via `mmr results <job-id> --raw`.

## Configuration

### Project Config: `.mmr.yaml`

```yaml
version: 1

defaults:
  fix_threshold: P2
  timeout: 300
  format: json
  parallel: true
  job_retention_days: 7

review_criteria:
  - "Project-specific criterion here"

channels:
  claude:
    enabled: true
    command: claude -p
    flags: []
    env: {}
    auth:
      check: "claude -p 'respond with ok' 2>/dev/null"
      timeout: 5
      failure_exit_codes: [1]
      recovery: "Run: claude login"
    prompt_wrapper: "{{prompt}}"
    output_parser: default
    timeout: 300

  gemini:
    enabled: true
    command: gemini -p
    flags:
      - "--approval-mode yolo"
      - "--output-format json"
    env:
      NO_BROWSER: "true"
    auth:
      check: "NO_BROWSER=true gemini -p 'respond with ok' -o json 2>&1"
      timeout: 5
      failure_exit_codes: [41]
      recovery: "Run: gemini -p 'hello' (interactive, opens browser)"
    prompt_wrapper: "{{prompt}}\nIMPORTANT: Return raw JSON only. No markdown fences."
    output_parser: gemini
    timeout: 360

  codex:
    enabled: true
    command: codex exec
    flags:
      - "--skip-git-repo-check"
      - "-s read-only"
      - "--ephemeral"
    env: {}
    auth:
      check: "codex login status 2>/dev/null"
      timeout: 5
      failure_exit_codes: [1]
      recovery: "Run: codex login"
    prompt_wrapper: "{{prompt}}"
    output_parser: default
    stderr: suppress
```

### User Config: `~/.mmr/config.yaml`

Machine-level defaults (e.g., which channels are installed). Overridden by project config.

### Merge Order

User defaults (`~/.mmr/config.yaml`) → Project (`.mmr.yaml`) → CLI flags. Each layer overrides the previous.

### Adding a New Channel

Add to `.mmr.yaml` with command, flags, env, auth block, and output parser. Zero code changes to `mmr`.

## Platform Wrappers

### Claude Code

- **Skill** (`skills/mmr/SKILL.md`): Maps `/mmr review` to `mmr review`, handles async polling, presents findings
- **PostToolUse hook**: After `gh pr create`, auto-dispatches `mmr review --pr <number>`
- **Scaffold runner integration**: Review gate calls `mmr` instead of manual 3-channel orchestration

### Codex CLI / Gemini CLI

AGENTS.md / GEMINI.md instructions:

```
After creating a PR, run: mmr review --pr <number>
Poll with: mmr status <job-id>
Collect with: mmr results <job-id>
Fix all findings above threshold before merging.
```

The wrappers are intentionally thin — three commands is the entire integration surface.

### Agent Experience (Before vs. After)

**Before:** Agent manually runs auth checks, dispatches 3 CLI commands with tool-specific flags, improvises timeout handling, polls process status, parses tool-specific output formats, manually reconciles findings, decides gate pass/fail.

**After:** Agent runs `mmr review`. Checks `mmr status`. Reads `mmr results`. Fixes what the gate says to fix.

## Scaffold Integration

### What Changes

| Before | After |
|--------|-------|
| 35-line CLAUDE.md review section | `mmr review --pr <number>` |
| `scripts/cli-pr-review.sh` | Removed — replaced by `mmr` |
| `scripts/implementation-plan-mmr.sh` (495 lines) | Simplified to `mmr review --template plan` |
| Manual 3-channel dispatch in skills | Skills call `mmr` |
| PostToolUse hook injects 6-line reminder | Hook runs `mmr review` directly |

### Existing Content Updates

- `content/skills/multi-model-dispatch/SKILL.md` → updated to reference `mmr` as the execution engine
- `content/tools/review-pr.md` → simplified to `mmr review --pr`
- `content/tools/review-code.md` → simplified to `mmr review --staged`
- `content/knowledge/core/multi-model-review-dispatch.md` → updated with `mmr` patterns

## Package Structure

```
packages/mmr/
  package.json             # @zigrivers/mmr
  tsconfig.json
  src/
    cli.ts                 # Entry point, argument parsing
    commands/
      review.ts            # mmr review
      status.ts            # mmr status
      results.ts           # mmr results
      config.ts            # mmr config (init, test, add-channel)
      jobs.ts              # mmr jobs (list, prune, replay)
    core/
      dispatcher.ts        # Parallel channel dispatch + process management
      auth.ts              # Per-channel auth verification
      prompt.ts            # Layered prompt assembly engine
      reconciler.ts        # Multi-channel finding reconciliation
      parser.ts            # Output parsers (default, gemini, custom)
      job-store.ts         # Job state directory management
    config/
      loader.ts            # Merge ~/.mmr/config.yaml + .mmr.yaml + CLI flags
      schema.ts            # Config validation (zod)
      defaults.ts          # Built-in channel presets
    formatters/
      json.ts
      text.ts
      markdown.ts
      sarif.ts
  templates/
    core-prompt.md         # Immutable Layer 1 prompt
  tests/
    dispatcher.test.ts
    auth.test.ts
    prompt.test.ts
    reconciler.test.ts
    parser.test.ts
    e2e/                   # End-to-end with mock channels
  bin/
    mmr                    # Shebang entry point
```

## Technology Choices

| Choice | Rationale |
|--------|-----------|
| TypeScript | Same as scaffold; shared build/lint/test pipeline |
| Node.js `child_process.spawn` | Manages background CLI processes, no external deps |
| `AbortController` + `setTimeout` | Portable timeouts — no GNU coreutils dependency |
| yaml (config) | Already a scaffold dependency; human-readable |
| zod (validation) | Already in scaffold; validates config and output schemas |

## Distribution

- **npm:** `npm install -g @zigrivers/mmr` (standalone) or bundled with `@zigrivers/scaffold`
- **Homebrew:** `brew install mmr` or bundled with `brew install scaffold`
- **Monorepo:** Scaffold workspace package with independent publishability

## Success Criteria

1. Any AI agent can dispatch a multi-model review with a single command
2. Auth failures are always surfaced with recovery instructions, never silently skipped
3. Reviews never block the agent — async dispatch with polling
4. Output format is identical regardless of which channels were used
5. Severity gate is configurable per-project and per-invocation
6. Adding a new model CLI requires only a YAML config change, no code
7. Reconciliation produces a unified findings list with confidence and attribution
