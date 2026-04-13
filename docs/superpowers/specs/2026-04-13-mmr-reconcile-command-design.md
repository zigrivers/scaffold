# MMR `reconcile` Command + Tool Spec Alignment Design

**Date:** 2026-04-13
**Decision:** MMR handles 3 external CLI channels; 4th+ channels are agent-dispatched and injected via `mmr reconcile`

## Problem

MMR CLI dispatches reviews to 3 external CLI tools (claude, gemini, codex). But agents also have their own built-in review capabilities (e.g., Superpowers code-reviewer in Claude Code, Gemini's skill system, Codex's review mode). These agent-internal skills can't be invoked by MMR because they run inside the calling agent's context, not as child processes.

The current workaround is to skip the 4th channel or manually merge results. This loses the benefit of unified reconciliation and verdict derivation.

## Solution

Add a generic `mmr reconcile` subcommand that accepts external findings from any source, re-runs reconciliation across all channels (original + injected), and re-derives the verdict.

## Architecture

```
Agent                          MMR CLI
  │                              │
  ├── mmr review --sync ────────►│ dispatch 3 CLI channels
  │                              │ parse, reconcile, verdict
  │◄── results (3-channel) ──────┤
  │                              │
  ├── dispatch own review skill  │
  │   (superpowers, etc.)        │
  │                              │
  ├── mmr reconcile <job-id> ───►│ inject external findings
  │   --channel <name>           │ re-reconcile all sources
  │   --input <file or stdin>    │ re-derive verdict
  │◄── results (N-channel) ──────┤
```

Multiple injections are supported — call `mmr reconcile` sequentially, once per external channel. **Concurrent `reconcile` calls against the same job are not supported** — callers must serialize injections.

## `mmr reconcile` Command

### Interface

```
mmr reconcile <job-id> --channel <name> --input <file|-|json-string> [--format json|text|markdown]
```

**Arguments:**
- `<job-id>` — existing MMR job ID (e.g., `mmr-a1b2c3d4e5f6`)
- `--channel <name>` — name for the external channel (e.g., `superpowers`, `internal-review`, `security-audit`). Any valid channel name (alphanumeric, dots, hyphens). **Lowercased on input** for case-insensitive filesystem safety. **Must not collide with an existing channel in the job** — rejects with exit 5 if the name already exists.
- `--input <source>` — findings data. Detection order:
  1. `-` → read from stdin
  2. `input.trimStart()` starts with `{` or `[` → parse as inline JSON (checked before filesystem to avoid `ENAMETOOLONG` on large strings)
  3. Attempt `fs.existsSync(input)` wrapped in try/catch (catches `ENAMETOOLONG`) → if file exists, read contents
  4. Otherwise → exit 5 with error ("Input not found: not a file, stdin, or valid JSON")
- `--format` — output format (default: `args.format ?? job.format ?? 'json'`)

**No `--parser` flag.** Injected channels always use the `default` parser since input is pre-normalized to `ParsedOutput` format before storage. The `output_parser` field is always set to `'default'`.

### Input Normalization

Accepts two input formats. Raw input may include markdown fences or surrounding text — the normalization helper strips fences and handles JSON extraction.

**Wrapper format** (what channels typically produce):
```json
{
  "approved": false,
  "findings": [
    {"severity": "P1", "location": "file.ts:10", "description": "bug", "suggestion": "fix"}
  ],
  "summary": "one issue found"
}
```

**Bare array format** (simpler for callers):
```json
[
  {"severity": "P1", "location": "file.ts:10", "description": "bug", "suggestion": "fix"}
]
```

Both are normalized to the internal `ParsedOutput` wrapper format **before storage**. Bare arrays are wrapped as:
```json
{
  "approved": <true if no P0/P1 findings, false otherwise>,
  "findings": [...the array...],
  "summary": "Injected external findings"
}
```

**Note on `approved` field:** The `approved` inference (P0/P1 check) is decorative. The results pipeline independently derives `approved` from the verdict, which uses the job's `fix_threshold`. The wrapper `approved` field is never authoritative.

The `normalizeExternalInput` helper:
1. Strips markdown fences via `stripMarkdownFences`
2. Trims whitespace
3. Detects shape: if trimmed text starts with `[`, skip `extractJson` (which only handles `{...}` objects) and call `JSON.parse` directly after `fixTrailingCommas`. If trimmed text starts with `{` or contains surrounding text, use `extractJson` to locate the JSON object, then `fixTrailingCommas`, then `JSON.parse`.
4. If result is an array → validate each element with **strict** `validateFindingStrict` (throws on missing/invalid `severity`, `location`, or `description` — unlike the permissive `validateFinding` which coerces to defaults). Wrap in `ParsedOutput` with inferred `approved` and `"Injected external findings"` summary.
5. If result is an object with `findings` array → validate via **strict** `validateParsedOutputStrict` (throws on invalid findings instead of coercing)
6. Otherwise → throw with "Invalid input format"

**Strict vs. permissive validation:** The existing `validateFinding` silently coerces malformed findings (e.g., missing severity → `P2`, missing location → `'unknown'`). This is appropriate for parsing raw model output where quirks are expected. For `mmr reconcile`, the input is from an agent that already has structured findings — silent coercion would mask bugs. The strict variant throws on missing required fields.

**Storage round-trip:** The normalized `ParsedOutput` object is passed to `saveChannelOutput`, which calls `JSON.stringify(output, null, 2)` to write it to disk as a JSON string. When `results-pipeline.ts` later loads it via `loadChannelOutput` (returns the raw file string), it calls `JSON.parse` → gets an object (not a string) → sets `raw = stored` (the file string). `defaultParser` then calls `extractJson` on that string, successfully extracts the `ParsedOutput`-shaped JSON, and returns it via `validateParsedOutput`. This works because `extractJson` finds the top-level `{` of the serialized object.

### Execution Flow

1. Load the existing job from the job store (exit 5 if not found)
2. Verify all existing channels are in terminal state (exit 1 if not — "Channels still running", matching `results.ts` behavior)
3. Lowercase the `--channel` name. Compare against all existing channel names (also lowercased) to detect case-insensitive collisions. Exit 5 if collision — "Channel 'X' already exists in job"
4. Read input from the detected source (stdin/file/inline)
5. Normalize and validate the input fully in memory via `normalizeExternalInput`
6. **Only after validation succeeds — commit sequence:**
   a. Register the channel in `job.json` via `registerChannel` with `output_parser: 'default'`
   b. Save the normalized `ParsedOutput` object via `saveChannelOutput` (which calls `JSON.stringify` internally)
   c. Call `updateChannel` with `{ status: 'completed', started_at: now, completed_at: now }` to write the per-channel status file atomically via tmp+rename with `started_at` and `completed_at` set to current timestamp (so `elapsed` and `total_elapsed` are meaningful in output)
7. Re-run `runResultsPipeline` across ALL channels (original + injected) — this re-parses, re-reconciles, re-derives verdict
8. Save updated results, output formatted results
9. Exit with verdict-mapped code (0/2/3)

**Atomicity:** Steps 6a-6c are the commit sequence. If step 5 (validation) fails, no job state is modified. Each individual write within the sequence is atomic (`updateChannel` uses tmp+rename, `saveChannelOutput` uses `writeFileSync`), but the multi-step sequence is not transactional. If the sequence fails partway (e.g., disk full after `registerChannel` but before `saveChannelOutput`), the job may have a stranded channel. This is a known limitation — callers should create a new job and re-run `mmr review` if this occurs.

### Exit Codes

- `0` — pass or degraded-pass
- `1` — channels still running (precondition failure, matches `results.ts`)
- `2` — blocked (findings at or above threshold)
- `3` — needs-user-decision (no channels completed)
- `5` — CLI error (job not found, invalid input, duplicate channel, etc.)

## Tool Spec Changes

### review-pr.md

Update to describe the 4-channel flow:

```markdown
### Step 2: Run MMR Review (3 CLI channels)
mmr review --pr "$PR_NUMBER" --sync --format json

### Step 3: Run Agent Code Review (4th channel)
Dispatch your platform's code-reviewer skill:
- Claude Code: dispatch superpowers:code-reviewer subagent
- Gemini CLI: use built-in review capability
- Codex CLI: use built-in review capability

### Step 4: Inject Agent Review into MMR
mmr reconcile <job-id> --channel superpowers --input - <<< "$AGENT_FINDINGS"

The reconcile command re-runs reconciliation across all 4 channels
and outputs the unified verdict.
```

### review-code.md

Update to use MMR CLI instead of manual dispatch:
- `mmr review --staged --sync` for staged changes
- `mmr review --base main --sync` for branch diff
- Same 4th-channel injection pattern

### post-implementation-review.md

Phase 1: Use MMR + agent skill injection
Phase 2: Per-story subagents use same `mmr review --sync` + `mmr reconcile` pattern

## What Does NOT Change

- MMR's 3-channel dispatch (`review` command)
- Reconciliation engine (`reconcile` function in `reconciler.ts`)
- Verdict derivation (`deriveVerdict`)
- Job store structure
- Results pipeline (`runResultsPipeline`)
- Existing `--sync` flow
- Config schema, defaults, auth logic

## Implementation Scope

### New code:
- `packages/mmr/src/commands/reconcile.ts` — new yargs command (`reconcileCommand`)
- `packages/mmr/src/core/normalize-input.ts` — `normalizeExternalInput` helper (strips fences, extracts JSON, detects wrapper vs bare array, validates findings, wraps with defaults)
- Register `reconcileCommand` in `packages/mmr/src/cli.ts`

### Modified code:
- `packages/mmr/src/core/parser.ts` — export `stripMarkdownFences`, `extractJson`, `fixTrailingCommas`, `validateParsedOutput`, `validateFinding`; add strict variants `validateFindingStrict` and `validateParsedOutputStrict` that throw on missing/invalid fields instead of coercing
- `content/tools/review-pr.md` — 4-channel flow
- `content/tools/review-code.md` — use MMR CLI
- `content/tools/post-implementation-review.md` — use MMR + injection
- `CLAUDE.md` — update MMR section for 4-channel model
- `packages/mmr/CHANGELOG.md` — v1.1.0 entry

### Tests:
- `packages/mmr/tests/commands/reconcile.test.ts` — new
- `packages/mmr/tests/core/normalize-input.test.ts` — new
- Input normalization: wrapper format, bare array, markdown fences, malformed, missing fields, `approved` inference
- Channel name lowercasing and case-insensitive collision detection
- Duplicate channel name rejection
- "Still running" precondition rejection (exit 1)
- Pre-validation-then-commit (no state change on invalid input)
- Re-reconciliation with injected channel (findings from new channel appear in reconciled output)
- Verdict re-derivation after injection (pass → blocked when injected findings breach threshold; pass stays pass when injected findings are below threshold)
- Multiple sequential injections (different channel names)
- Input detection: file path, stdin, inline JSON
- Timestamps set on injected channel (`started_at`, `completed_at`)
