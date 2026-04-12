# MMR CLI Audit Findings

**Date:** 2026-04-13
**Scope:** Full audit of `packages/mmr/` — code quality, spec alignment, test coverage, design spec alignment
**Architecture decision:** CLI-first (A) — the MMR CLI is the source of truth; specs/docs will be updated to match

## Status Legend

- [ ] Not started
- [x] Fixed

---

## P0 — Critical

### P0-1: `--sync` flag accepted but silently ignored
- **File:** `packages/mmr/src/commands/review.ts:112-116`
- **Issue:** The `--sync` flag is defined in yargs but the handler never reads `args.sync`. The review command always dispatches and returns immediately. This is the spec's "recommended single-command entry point for AI agents and CI/CD."
- **Fix:** Implement sync mode — after dispatching, await all channels, parse outputs, reconcile, evaluate gate, format and print results, exit with appropriate code.
- [ ] Not started

### P0-2: Compensating passes entirely unimplemented
- **File:** Missing `packages/mmr/src/core/compensator.ts`
- **Issue:** When a channel is unavailable, the CLI just marks it `skipped`. No Claude self-review pass is queued. This is the core degraded-mode behavior.
- **Fix:** Under CLI-first model, implement compensating passes as additional `claude -p` dispatches with focused prompts (Codex-equivalent focuses on implementation/security, Gemini-equivalent on architecture/design). Label findings as `[compensating: X-equivalent]`.
- [ ] Not started

### P0-3: Verdict system not implemented
- **File:** `packages/mmr/src/types.ts:71`
- **Issue:** The four-verdict system (`pass`/`degraded-pass`/`blocked`/`needs-user-decision`) is replaced by a binary `gate_passed: boolean`. Agents can't distinguish "all green" from "degraded but acceptable."
- **Fix:** Add `Verdict` type, implement verdict derivation in reconciler based on channel availability and finding severity, update `ReconciledResults`.
- [ ] Not started

### P0-4: Concurrent `job.json` writes cause lost updates
- **File:** `packages/mmr/src/core/job-store.ts:108-113`
- **Issue:** `updateChannel()` does `loadJob()` -> modify -> `saveJob()`. With `parallel: true`, concurrent channel completions race on read-modify-write, silently losing status updates.
- **Fix:** Write per-channel status files (`channels/{name}.status.json`) and derive aggregate on read. Eliminates the race without needing file locking.
- [ ] Not started

### P0-5: Unhandled `stdin.write()` error crashes the process
- **File:** `packages/mmr/src/core/dispatcher.ts:50-58`
- **Issue:** No error handler on `proc.stdin`. If the pipe buffer fills or child closes stdin early, the unhandled `'error'` event crashes Node and orphans the child process.
- **Fix:** Add `proc.stdin.on('error', () => {})` before the `write()` call. Set channel status to `failed` on stdin error.
- [ ] Not started

### P0-6: No degraded-mode or all-failed lifecycle test coverage
- **File:** `packages/mmr/tests/e2e/review-lifecycle.test.ts`
- **Issue:** The e2e test only covers happy path (2 channels succeed). No test for partial failure or total failure.
- **Fix:** Add lifecycle tests: one channel auth-fails + review continues; all channels fail; timeout + parse pipeline.
- [ ] Not started

---

## P1 — Important

### P1-7: Superpowers channel concept replaced by `claude` CLI channel
- **File:** `packages/mmr/src/config/defaults.ts`
- **Issue:** Specs describe Superpowers (Agent tool subagent, always available). Implementation has `claude` CLI channel. Under CLI-first decision, this is correct — specs need updating.
- **Fix:** Update `content/tools/review-pr.md`, `CLAUDE.md`, knowledge base entries to describe 3 CLI channels: claude, gemini, codex. Remove Superpowers subagent references.
- [ ] Not started

### P1-8: Exit codes don't match spec
- **File:** `packages/mmr/src/commands/results.ts:167`
- **Issue:** Spec: 0=success, 2=gate-failed, 3=degraded, 4=channel-failure, 5=CLI-error. Implementation: `process.exit(gatePassed ? 0 : 1)`.
- **Fix:** Implement spec exit codes: 0=pass, 1=in-progress, 2=gate-failed, 3=degraded-pass, 4=channel-failure, 5=CLI-error.
- [ ] Not started

### P1-9: Sequential dispatch (`parallel: false`) is broken
- **File:** `packages/mmr/src/commands/review.ts:227-233`
- **Issue:** All `dispatchChannel()` calls start immediately when pushed to the array. The sequential `for await` just awaits already-running promises.
- **Fix:** Only call `dispatchChannel()` inside the loop when `parallel: false`.
- [ ] Not started

### P1-10: `extractJson` doesn't handle braces inside JSON strings
- **File:** `packages/mmr/src/core/parser.ts:28-43`
- **Issue:** Brace counting doesn't track string context. `"use { carefully"` causes early extraction termination.
- **Fix:** Track whether position is inside a JSON string (handle escaped quotes) when counting brace depth.
- [ ] Not started

### P1-11: Gemini parser skips validation on unwrapped output
- **File:** `packages/mmr/src/core/parser.ts:99`
- **Issue:** Returns `outer as ParsedOutput` without calling `validateParsedOutput`. Malformed output propagates to reconciler.
- **Fix:** Change to `return validateParsedOutput(outer)`.
- [ ] Not started

### P1-12: Fix cycle not implemented
- **File:** `packages/mmr/src/commands/review.ts`
- **Issue:** Spec describes fix-push-rerun up to 3 rounds. CLI dispatches once and exits.
- **Fix:** Under CLI-first model, this is an orchestration concern. The CLI provides the building blocks (review, results). Document that fix cycles are handled by the caller (agent or CI script). Remove fix-cycle language from CLI spec; keep it in tool spec as agent behavior.
- [ ] Not started

### P1-13: Knowledge base describes unbuilt features as authoritative
- **Files:** `content/knowledge/core/automated-review-tooling.md`, `multi-model-review-dispatch.md`
- **Issue:** Verdict definitions, compensating passes, fix-cycle rules described as implemented but aren't (or will be implemented differently under CLI-first).
- **Fix:** Update knowledge base entries to match CLI-first implementation after code changes land.
- [ ] Not started

### P1-14: CLAUDE.md channel names don't match implementation
- **File:** `CLAUDE.md:126`
- **Issue:** Says "Superpowers code-reviewer." Implementation has `claude` channel.
- **Fix:** Update CLAUDE.md MMR section to describe CLI-first model with claude/gemini/codex channels.
- [ ] Not started

### P1-15: Timeout/close race condition in dispatcher
- **File:** `packages/mmr/src/core/dispatcher.ts:78-124`
- **Issue:** Timeout handler writes `status: 'timeout'` to store; SIGKILL triggers close handler which re-reads store. File I/O race window.
- **Fix:** Use an in-memory `settled` boolean flag (like `auth.ts` does) instead of reading from filesystem.
- [ ] Not started

### P1-16: Dispatcher test doesn't verify successful dispatch saves output
- **File:** `packages/mmr/tests/core/dispatcher.test.ts`
- **Issue:** Happy-path test only checks PID file. Never verifies stdout capture, `saveChannelOutput`, or `completed` status.
- **Fix:** Add test that dispatches `echo '{"approved":true,"findings":[],"summary":"ok"}'`, waits for completion, verifies output saved and status is `completed`.
- [ ] Not started

### P1-17: `ChannelStatus` type missing spec-required values
- **File:** `packages/mmr/src/types.ts:10-17`
- **Issue:** Missing `not_installed`, `auth_timeout`. Uses `skipped` as catch-all. `JobStatus` lacks terminal gate states.
- **Fix:** Add `not_installed` status. Keep `auth_failed` for auth failures. Map auth timeout to `auth_failed` with a reason field. Add gate-aware job terminal states.
- [ ] Not started

### P1-18: Auth check uses `which` instead of `command -v`
- **File:** `packages/mmr/src/core/auth.ts:19`
- **Issue:** `which` may not exist on all POSIX platforms. Specs mandate `command -v`.
- **Fix:** Change spawn from `which` to `sh -c 'command -v <cmd>'`.
- [ ] Not started

### P1-19: No auth timeout retry
- **File:** `packages/mmr/src/core/auth.ts:29-72`
- **Issue:** Auth timeout returns immediately. Spec says retry once on timeout.
- **Fix:** On timeout, retry the auth check once before returning timeout status.
- [ ] Not started

---

## P2 — Improvement

### P2-20: Orphan processes on parent crash
- **File:** `packages/mmr/src/core/dispatcher.ts:51,137`
- **Issue:** `detached: true` + `proc.unref()` means children survive parent death.
- **Fix:** Remove `proc.unref()` for sync path. Add parent exit handler that kills child PIDs.
- [ ] Not started

### P2-21: `stderr` mapping is lossy
- **File:** `packages/mmr/src/commands/review.ts:224`
- **Issue:** Schema allows `suppress`/`capture`/`passthrough` but dispatcher only handles `capture`/`ignore`. `passthrough` silently becomes `ignore`.
- **Fix:** Handle all three values in dispatcher, or validate in review.ts.
- [ ] Not started

### P2-22: Skipped channels not recorded in job metadata
- **File:** `packages/mmr/src/commands/review.ts:186-192`
- **Issue:** Auth-failed channels absent from `job.channels`. Can't reconstruct what happened.
- **Fix:** Add skipped/auth-failed channels to job metadata with status and recovery message.
- [ ] Not started

### P2-23: Named parsers `'claude'`/`'codex'` reference non-existent parsers
- **File:** `packages/mmr/src/config/defaults.ts:37,68`
- **Issue:** Fall back to `default` silently. Misleading config.
- **Fix:** Change to `output_parser: 'default'` or register explicit parsers.
- [ ] Not started

### P2-24: Job ID collision risk with 3 random bytes
- **File:** `packages/mmr/src/core/job-store.ts:22-23`
- **Issue:** Only 16.7M possible IDs. Birthday paradox risk at scale.
- **Fix:** Use 6+ bytes (12 hex chars) or add timestamp prefix.
- [ ] Not started

### P2-25: `loadJob` has no JSON validation
- **File:** `packages/mmr/src/core/job-store.ts:63-66`
- **Issue:** `JSON.parse(raw) as JobMetadata` is unsafe cast. Corrupted files cause downstream crashes.
- **Fix:** Validate through Zod schema or check required fields.
- [ ] Not started

### P2-26: Non-deterministic reconciliation
- **File:** `packages/mmr/src/core/reconciler.ts:70-72`
- **Issue:** Representative finding uses `group[0]` depending on iteration order.
- **Fix:** Prefer finding with longest description, or merge descriptions from all sources.
- [ ] Not started

### P2-27: `resolveDiff` has no maxBuffer limit
- **File:** `packages/mmr/src/commands/review.ts:34-57`
- **Issue:** Large diffs hit Node's default buffer limit.
- **Fix:** Set explicit `maxBuffer` and add `--max-diff-size` option.
- [ ] Not started

### P2-28: Markdown formatter doesn't escape newlines
- **File:** `packages/mmr/src/formatters/markdown.ts:22-27`
- **Issue:** Only escapes `|`. Newlines break table layout.
- **Fix:** Replace newlines with `<br>` in table cells.
- [ ] Not started

### P2-29: Review context files not read at review time
- **File:** `packages/mmr/src/core/prompt.ts`
- **Issue:** Spec says read `docs/coding-standards.md` etc. Implementation only uses config strings.
- **Fix:** Under CLI-first, this is a config concern. Document that users add project criteria via `.mmr.yaml` `review_criteria`. Remove expectation of auto-reading project docs.
- [ ] Not started

### P2-30: SARIF formatter not implemented
- **File:** `packages/mmr/src/types.ts:25`
- **Issue:** `'sarif'` in `OutputFormat` type but no formatter exists.
- **Fix:** Either implement SARIF formatter or remove from type.
- [ ] Not started

### P2-31: `config add-channel` subcommand not implemented
- **File:** `packages/mmr/src/commands/config.ts:96`
- **Issue:** Spec defines it but not in choices list.
- **Fix:** Implement or remove from spec.
- [ ] Not started

### P2-32: `mmr status` output missing spec fields
- **File:** `packages/mmr/src/commands/status.ts`
- **Issue:** Missing `root_cause`, `coverage_status`, `findings_count` per channel.
- **Fix:** Add fields after implementing root-cause status taxonomy.
- [ ] Not started

### P2-33: Reconciler confidence never assigns `low`
- **File:** `packages/mmr/src/core/reconciler.ts`
- **Issue:** `Confidence` type includes `'low'` but never assigned. Spec says compensating findings get `low`.
- **Fix:** After compensating passes are implemented, assign `low` to compensating-only findings.
- [ ] Not started

### P2-34: Finding schema missing `id` and `category` fields
- **File:** `packages/mmr/src/types.ts:27-32`
- **Issue:** Uses `description` instead of `finding`. Missing `id` and `category`.
- **Fix:** Add `id` (auto-generated F-001 format) and `category` to Finding type.
- [ ] Not started

### P2-35: `deepMerge` doesn't handle `undefined` overlay values
- **File:** `packages/mmr/src/config/loader.ts:22-45`
- **Issue:** `undefined` in overlay overwrites valid base values.
- **Fix:** Add `if (overVal === undefined) continue`.
- [ ] Not started

### P2-36: `divergent` agreement type defined but never assigned
- **File:** `packages/mmr/src/types.ts:21`
- **Issue:** Dead code. Reconciler only assigns `consensus`, `majority`, `unique`.
- **Fix:** Remove from type or implement detection of contradicting findings.
- [ ] Not started

### P2-37: `process.exit()` in command handlers prevents testing
- **Files:** `packages/mmr/src/commands/status.ts:19,38`, `results.ts:167`
- **Issue:** Direct `process.exit()` makes commands untestable.
- **Fix:** Return exit code or throw typed error. Let CLI entry point handle process.exit.
- [ ] Not started

---

## P3 — Nit

### P3-38: `TERMINAL_STATUSES` duplicated across 4 locations
- **Fix:** Export from `types.ts` and reuse everywhere.
- [ ] Not started

### P3-39: `JobStatus` not derived from `ChannelStatus`
- **Fix:** Derive or add comment noting intentional subset.
- [ ] Not started

### P3-40: `import.meta.url` is ESM-only
- **Fix:** Document ESM-only requirement in package.json.
- [ ] Not started

### P3-41: `approved`/`summary` fields parsed but lost in reconciliation
- **Fix:** Include in `ReconciledResults`.
- [ ] Not started

### P3-42: Recovery command strings include `Run:` prefix
- **Fix:** Use raw commands; let consumers add prefix.
- [ ] Not started

### P3-43: Gemini per-channel timeout should be 360s per spec
- **Fix:** Set `timeout: 360` in gemini channel defaults.
- [ ] Not started

### P3-44: Undocumented CLI input modes (`--staged`, `--base`/`--head`, `--diff`)
- **Fix:** Document in spec.
- [ ] Not started

### P3-45: Raw JSON saved to `~/.mmr/jobs/` not `docs/reviews/`
- **Fix:** Under CLI-first, `~/.mmr/jobs/` is correct. Update spec.
- [ ] Not started

---

## Test Coverage Gaps (folded into fixes above)

Additional test gaps to address alongside their related code fixes:

- **auth.test.ts:** Missing command injection validation test, spawn error path, non-matching exit code, env propagation
- **dispatcher.test.ts:** Missing successful dispatch verification, SIGKILL on timeout, spawn error, non-zero exit, empty stdout edge case, stderr capture
- **job-store.test.ts:** Missing loadJob nonexistent, saveChannelOutput roundtrip, deriveJobStatus logic, concurrent writes, malformed dir skip
- **parser.test.ts:** Missing unbalanced braces, empty input, malformed findings, missing `approved`, multiple JSON objects, gemini fallback, unknown parser name
- **prompt.test.ts:** Missing templateCriteria, wrapper without placeholder, empty diff
- **reconciler.test.ts:** Missing 3+ channel reconciliation, explicit majority assertion, divergent type, same-channel duplicates, location normalization, output sorting, gate threshold boundaries
- **formatter tests:** Missing zero-findings, channel section, pipe escaping, multiple findings, gate-passed case
- **lifecycle test:** Missing degraded mode, all-failed, timeout+parse, parse failure, actual dispatcher integration, job status progression
