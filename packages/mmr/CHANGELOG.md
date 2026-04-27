# Changelog

## Unreleased

### Fixed
- `mmr review --diff -` and `mmr reconcile ... --input -` now accept the bare `-` token for stdin when written with a space separator. Previously yargs treated the `-` as an unknown positional and rejected the command unless callers used `--diff=-` / `--input=-`. This unblocks the `git diff HEAD | mmr review --diff -` pattern documented in CLAUDE.md.

## [1.2.0] — 2026-04-22

### Changed
- **Raise default auth-check timeout for `claude` and `gemini` channels
  from 5s to 20s.** Both CLIs' auth probes (`claude -p "respond with ok"`,
  `NO_BROWSER=true gemini -p "respond with ok" -o json`) are full LLM
  round-trips that routinely take 9-14s, so 5s false-failed normal
  environments and silently dropped them into compensating passes.
  Codex's auth probe (`codex login status`) stays at 5s since it's a
  local file check, not a round-trip. Defined in
  `packages/mmr/src/config/defaults.ts`; callers can still override
  via `~/.mmr/config.yaml` or a project `.mmr.yaml`.

## [1.1.0] — 2026-04-13

### Added
- `mmr reconcile <job-id> --channel <name> --input <source>` — inject external review findings into a job for unified reconciliation
- `normalizeExternalInput` helper — handles wrapper and bare-array input with strict validation, markdown fence stripping, prose-wrapped extraction
- Strict validators (`validateFindingStrict`, `validateParsedOutputStrict`) that throw on invalid input
- Exported parser helpers for reuse: `stripMarkdownFences`, `extractJson`, `fixTrailingCommas`

### Changed
- Tool specs updated for 4-channel flow: 3 CLI channels via `mmr review` + agent skill via `mmr reconcile`
- CLAUDE.md updated with `mmr reconcile` quick reference

## [1.0.0] — 2026-04-13

### Added
- **P0-6:** Degraded-mode lifecycle tests — partial failure, all-failed, timeout+parse paths
- **P1-16:** Spawn error test for nonexistent commands
- **P3-39:** JSDoc comment on JobStatus documenting intentional subset relationship

### Summary
All 45 findings from the MMR CLI audit are resolved across 10 batches (v0.2.0–v1.0.0).
The CLI is now production-ready with comprehensive test coverage, proper type system,
verdict-based gating, compensating passes, and spec-aligned documentation.

## [0.9.0] — 2026-04-13

### Changed
- **P1-7:** Tool spec (`review-pr.md`) updated for CLI-first architecture — 3 CLI channels (claude, gemini, codex), `mmr review --sync` as primary entry point
- **P1-12:** Fix cycle documented as orchestration concern, not CLI responsibility
- **P1-13:** Knowledge base entries (`multi-model-review-dispatch`, `automated-review-tooling`) updated to match CLI implementation
- **P1-14:** CLAUDE.md MMR section updated with CLI-first model and correct channel names

### Removed
- **P2-30:** Removed `sarif` from OutputFormat (no formatter exists)
- Superpowers subagent references replaced with Claude CLI channel
- Depth-based scaling removed from knowledge base (CLI always runs all enabled channels)

## [0.8.0] — 2026-04-13

### Fixed
- **P2-24:** Job ID uses 6 random bytes (12 hex chars) to reduce collision risk
- **P2-25:** loadJob validates job metadata structure after JSON parse
- **P2-26:** Reconciler uses longest description as representative (deterministic)
- **P2-28:** Markdown formatter escapes newlines with `<br>` in table cells
- **P2-35:** deepMerge skips undefined overlay values

### Added
- **P3-41:** `approved` boolean and `summary` string added to ReconciledResults
- **P3-43:** Gemini channel default timeout set to 360s (was inheriting global 300s)

### Changed
- **P3-42:** Recovery commands no longer include `Run:` prefix — consumers add formatting

## [0.7.0] — 2026-04-13

### Fixed
- **P2-20:** Parent process now cleans up child processes on SIGINT/SIGTERM
- **P2-21:** Stderr modes `suppress`, `capture`, `passthrough` correctly mapped to child stdio
- **P2-27:** `resolveDiff` uses 10MB maxBuffer to handle large diffs
- **P2-37:** Status command exit codes aligned with results command (5=CLI error)

## [0.6.0] — 2026-04-13

### Added
- **P0-2:** Compensating passes — when channels are unavailable (not_installed, auth_failed, timeout), a Claude-based review is dispatched focused on the missing channel's strength area
- **P2-33:** Compensating findings assigned `low` confidence in reconciliation
- Codex-equivalent focus: implementation correctness, security, API contracts
- Gemini-equivalent focus: architectural patterns, design consistency
- Generic focus for unknown channels

## [0.5.0] — 2026-04-13

### Added
- **P0-1:** `--sync` flag on `mmr review` — single-command entry point that dispatches, parses, reconciles, formats, and exits with verdict code
- Extracted `runResultsPipeline` shared helper — eliminates code duplication between review --sync and results command
- Fixed latent bug where `loadChannelOutput` returned JSON-encoded strings that the parser couldn't handle (double-encoding from `saveChannelOutput`)

## [0.4.0] — 2026-04-13

### Fixed
- **P1-18:** Use POSIX-portable `command -v` instead of `which` for installation checks
- **P1-19:** Auth check retries once on timeout before reporting failure
- **P2-22:** Skipped and auth-failed channels now recorded in job metadata with status and recovery info

## [0.3.0] — 2026-04-13

### Added
- **P0-3:** Verdict system — `pass`, `degraded-pass`, `blocked`, `needs-user-decision` replaces binary `gate_passed`
- **P1-8:** Exit codes — 0=pass/degraded-pass, 2=blocked, 3=needs-user-decision, 5=CLI error
- **P1-17:** `not_installed` channel status for missing CLI tools
- **P2-34:** Optional `id` (auto-generated F-001) and `category` fields on Finding type

### Changed
- **P3-38:** `TERMINAL_STATUSES` exported from types.ts; duplicated lists removed from dispatcher, status, results
- **P2-36:** Removed unused `divergent` from Agreement type
- Verdict derivation considers channel health: degraded-pass when some channels failed, needs-user-decision when none completed

## [0.2.0] — 2026-04-13

### Fixed
- **P0-4:** Concurrent job.json writes race — derive channel state on read from per-channel status files with atomic temp+rename writes
- **P0-5:** stdin.write() crash — handle EPIPE when child closes stdin early
- **P1-15:** Timeout/close race condition — in-memory settled flag prevents double status writes
- **P1-9:** Sequential dispatch was broken — dispatchChannel now returns completion Promise; channels only dispatched inside loop when parallel is false
- **P1-10:** extractJson brace counting failed on braces inside JSON strings — now string-aware with escaped quote handling
- **P1-11:** Gemini parser skipped validation on unwrapped output — unsafe cast replaced with validateParsedOutput
- **P2-23:** Parser names 'claude'/'codex' silently fell back to 'default' — made explicit

### Added
- Channel name validation across all file operations (path traversal prevention)
- Centralized `channelFilePath` helper for consistent channel file path construction
- `listJobs` now derives channel state consistently via `loadJob`
- Dispatch result output reflects actual completion status instead of hard-coded 'dispatched'
- Tests for concurrent channel updates, stdin pipe errors, awaitable dispatch, string braces, empty input, unbalanced braces, unsafe channel names
