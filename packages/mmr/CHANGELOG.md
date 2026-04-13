# Changelog

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
