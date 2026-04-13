# MMR CLI Fix Design — CLI-First Architecture

**Date:** 2026-04-13
**Decision:** CLI-first (Option A) — the MMR CLI is the source of truth; specs/docs updated to match
**Findings:** See `2026-04-13-mmr-cli-audit-findings.md` (45 findings: 6 P0, 13 P1, 18 P2, 8 P3)

## Architecture Decision

The MMR CLI (`packages/mmr/`) is a standalone tool that dispatches reviews to external CLIs (claude, gemini, codex). The Superpowers subagent concept from the original spec is dropped. Compensating passes are implemented as additional `claude -p` dispatches with focused prompts. The `review-pr.md` tool spec, CLAUDE.md, and knowledge base entries are updated to match the CLI's model.

## Batching Strategy

### Batch 1 — Critical Code Fixes
**Findings:** P0-4, P0-5, P1-15, P1-9
**Scope:** Concurrent job.json writes race, stdin crash, timeout/close race, broken sequential dispatch
**Approach:**
- P0-4: Write per-channel status files (`channels/{name}.status.json`), derive aggregate on read
- P0-5: Add `proc.stdin.on('error', ...)` handler before write
- P1-15: Use in-memory `settled` boolean flag instead of filesystem reads for race guard
- P1-9: Only call `dispatchChannel()` inside the loop when `parallel: false`

### Batch 2 — Parser Hardening
**Findings:** P1-10, P1-11, P2-23
**Scope:** String-aware brace extraction, Gemini validation, parser name cleanup
**Approach:**
- P1-10: Track string context (handle escaped quotes) when counting brace depth
- P1-11: Change line 99 to `return validateParsedOutput(outer)`
- P2-23: Change defaults to `output_parser: 'default'` for claude and codex channels

**Release:** `mmr-v0.2.0` after Batch 2

### Batch 3 — Type System & Status Taxonomy
**Findings:** P1-17, P1-8, P0-3, P3-38, P3-39, P2-36, P2-34
**Scope:** Add `not_installed` status, verdict enum, exit codes, deduplicate terminal statuses, finding schema
**Approach:**
- Add `Verdict = 'pass' | 'degraded-pass' | 'blocked' | 'needs-user-decision'`
- Add `not_installed` to `ChannelStatus`; remove `skipped` (map to `not_installed` or keep both)
- Implement verdict derivation in reconciler
- Replace `gate_passed: boolean` with `verdict: Verdict` in `ReconciledResults`
- Implement exit code mapping: 0=pass, 1=in-progress, 2=gate-failed, 3=degraded, 4=channel-failure, 5=CLI-error
- Export `TERMINAL_STATUSES` from types.ts, reuse everywhere
- Add `id` (auto-generated) and `category` to Finding type

### Batch 4 — Auth Improvements
**Findings:** P1-18, P1-19, P2-22
**Scope:** POSIX-portable install check, retry on timeout, record skipped channels
**Approach:**
- P1-18: Change `spawn('which', [cmd])` to `spawn('sh', ['-c', \`command -v ${cmd}\`])`
- P1-19: On timeout, retry auth check once before returning timeout
- P2-22: Add auth-failed/not-installed channels to job metadata with status and recovery

### Batch 5 — `--sync` Mode
**Findings:** P0-1
**Scope:** Implement synchronous review — dispatch, await, parse, reconcile, format, exit
**Depends on:** Batches 1-4 (needs verdict system, exit codes, parser fixes)
**Approach:**
- When `--sync` (or `--sync` is default for agents), after dispatching:
  1. Await all channel promises
  2. Load and parse each channel's output
  3. Run reconciliation
  4. Evaluate gate, derive verdict
  5. Format output (json/text/markdown)
  6. Print to stdout
  7. Exit with verdict-mapped exit code

**Release:** `mmr-v0.3.0` after Batch 5

### Batch 6 — Compensating Passes
**Findings:** P0-2, P2-33
**Scope:** Implement compensating passes via `claude -p` when channels unavailable
**Depends on:** Batch 5 (--sync mode)
**Approach:**
- New `core/compensator.ts` module
- When a channel is `not_installed` or `auth_failed`, queue a compensating pass:
  - Missing codex → `claude -p` with prompt focused on implementation correctness, security, API contracts
  - Missing gemini → `claude -p` with prompt focused on architectural patterns, design reasoning
- Label compensating findings with source `[compensating: X-equivalent]`
- Compensating findings get `confidence: 'low'`
- Verdict: if all external channels missing → `degraded-pass` (all findings single-model)

**Release:** `mmr-v0.4.0` after Batch 6

### Batch 7 — Dispatcher Hardening
**Findings:** P2-20, P2-21, P2-27, P2-37
**Scope:** Orphan cleanup, stderr mapping, maxBuffer, testability
**Approach:**
- P2-20: Remove `proc.unref()` for sync. Add parent SIGINT/SIGTERM handler to kill children
- P2-21: Map `passthrough` to `pipe` (inherit stdio[2]). Map `suppress` to `ignore`
- P2-27: Set `maxBuffer: 10 * 1024 * 1024` (10MB). Add `--max-diff-size` option
- P2-37: Return exit codes from handlers. Move `process.exit()` to CLI entry point

### Batch 8 — Store & Reconciler Polish
**Findings:** P2-24, P2-25, P2-26, P2-28, P2-35, P3-41, P3-42, P3-43
**Scope:** Job ID length, JSON validation, deterministic reconciliation, markdown escaping, misc fixes
**Approach:**
- P2-24: Use `crypto.randomBytes(6)` (12 hex chars)
- P2-25: Add Zod schema for job metadata, validate on load
- P2-26: Pick finding with longest description as representative
- P2-28: Replace newlines with `<br>` in markdown table cells
- P2-35: Skip `undefined` values in deepMerge overlay
- P3-41: Add `approved`/`summary` to `ReconciledResults`
- P3-42: Remove `Run:` prefix from recovery commands
- P3-43: Set `timeout: 360` in gemini channel defaults

### Batch 9 — Spec & Doc Alignment
**Findings:** P1-7, P1-12, P1-13, P1-14, P2-29, P2-30, P2-31, P2-32, P3-40, P3-44, P3-45
**Scope:** Update all specs and docs to match CLI-first implementation
**Approach:**
- Update `content/tools/review-pr.md`: 3 CLI channels, CLI-first orchestration, remove Superpowers
- Update `CLAUDE.md` MMR section: CLI-first model, correct channel names, correct commands
- Update knowledge base entries: match implementation, remove aspirational features
- Either implement SARIF + add-channel or remove from types/spec
- Document ESM-only requirement
- Document all CLI input modes

**Release:** `mmr-v0.5.0` or `mmr-v1.0.0` after all batches

### Batch 10 — Test Coverage
**Findings:** P0-6, P1-16, plus all test gaps from audit
**Scope:** Fill all identified test gaps
**Approach:** TDD where possible (tests written alongside code fixes in earlier batches). Remaining gaps filled in this batch.

## What's NOT Changing

- CLI command structure (`review`, `status`, `results`, `config`, `jobs`)
- Job store directory layout (`~/.mmr/jobs/`)
- Config merge order (defaults -> user -> project -> CLI)
- 4-layer prompt assembly engine
- Core prompt template (`templates/core-prompt.md`)
