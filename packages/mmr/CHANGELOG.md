# Changelog

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
