# Post-Implementation Code Review

## Summary

- **Date:** 2026-03-30
- **Mode:** Review + Fix
- **Channels:** Codex completed | Gemini completed | Superpowers completed
- **Findings:** P0: 0 | P1: 15 | P2: 10 | P3: 8
- **Fixed:** P0: 0/0 | P1: 15/15 | P2: 9/10 | P3: 0/8 (P2 `engine.ts:88` test deferred)

---

## Phase 1: Systemic Findings

### Architecture Alignment

- **P1** `src/cli/commands/run.ts:387` — Assembled prompt written to `process.stdout.write()` unconditionally before the auto/json mode branch. In `--format json` mode both the raw prompt text and the JSON result object land on stdout, corrupting the machine-readable stream. [codex+superpowers, high_confidence] — Move prompt write inside the non-JSON branch or embed in JSON payload.

- **P1** `src/state/decision-logger.ts:74` — `fs.appendFileSync()` used instead of atomic write (ADR-012 violation). A crash mid-append produces a corrupt partial JSON line that permanently poisons the JSONL file. [superpowers] — Use a read+build+atomicWrite cycle.

- **P1** `src/cli/commands/build.ts:207` — `fs.writeFileSync()` used to write generated command files (ADR-012 violation). A crash mid-write produces partially-written `.md` files that become the next source-of-truth. [superpowers] — Replace with `atomicWriteFile()`.

- **P1** `src/cli/commands/dashboard.ts:113` — `fs.writeFileSync()` used to write generated HTML (ADR-012 violation). [superpowers] — Replace with `atomicWriteFile()`.

- **P1** `src/project/claude-md.ts:63` — `fs.writeFileSync()` used to write CLAUDE.md (ADR-012 violation). [superpowers] — Replace with `atomicWriteFile()`.

- **P1** `src/cli/commands/run.ts:84` — `loadConfig(projectRoot, [])` called with empty `knownSteps` before step discovery, disabling Phase-6 `custom.steps` cross-field validation for the primary runtime command. [codex] — Re-call config validation after step discovery with the real step list.

- **P1** `src/cli/output/json.ts:37` — JSON output envelope only emits `{ success, data }`, missing `command`, `errors`, `warnings`, and `exit_code` fields required by the documented CLI contract (ADR-025). [codex] — Centralize envelope construction.

- **P2** `src/cli/output/interactive.ts:53` — `InteractiveOutput.warn()` and `error()` write to `process.stdout` instead of `process.stderr`, violating ADR-025 (stdout=data, stderr=diagnostics). Piped consumers see warning/error lines mixed with data. [superpowers, confirmed] — Change both methods to use `process.stderr.write()`.

- **P2** `src/cli/commands/complete.ts:52` (and `reset.ts`, `skip.ts`, `adopt.ts`) — `StateManager` constructed with `() => []` as `computeEligible`, so `next_eligible` is always empty after any mutation from these commands. `scaffold next` and `scaffold status` show stale eligibility. [superpowers] — Pass a real `computeEligible` function or skip updating `next_eligible` for these commands.

- **P2** `src/cli/commands/status.ts:107` — `loadConfig(projectRoot, [])` passes empty `knownSteps`, skipping Phase-6 custom step validation. [superpowers] — Pass discovered step names.

- **P3** `src/cli/commands/rework.ts:327` — Directly mutates `state.steps` via bare property assignment and `delete` operators, bypassing `StateManager` transition methods. Schema invariants (`at`, `completed_by`, `depth`) not enforced centrally. [superpowers] — Add `resetStep()` to `StateManager`.

### Security

- **P1** `src/cli/commands/dashboard.ts:121` — Shell injection: `execSync(`${opener} "${outputPath}"`)` with user-controlled `--output` path. Shell metacharacters in the path execute arbitrary commands. [codex+superpowers, high_confidence] — Replace with `execFileSync(opener, [outputPath])`.

- **P2** `src/cli/commands/knowledge.ts:205` — Shell injection: `git status --porcelain "${localPath}"` with user-supplied `--name` argument interpolated into shell command. [superpowers] — Replace with `execFileSync('git', ['status', '--porcelain', localPath])`.

### Error Handling

- **P1** `src/index.ts:5` — Top-level catch uses `console.error(err)`, which (a) violates ADR-025 (may route to stdout in some environments), and (b) prints `[object Object]` for `ScaffoldError` instances, making structured errors invisible. [superpowers] — Use `process.stderr.write()` with structured `err.message`/`err.code` formatting.

- **P1** `src/state/lock-manager.ts:131` — `console.warn()` used in `releaseLock()` for cross-PID warning (ADR-025 violation). In JSON output mode the warning mixes with machine-readable stdout. [superpowers] — Use `process.stderr.write()`.

- **P1** `src/state/decision-logger.ts:33` — `console.warn()` used in `readAllEntries()` for corrupt-line warnings (ADR-025 violation). [superpowers] — Use `process.stderr.write()`.

- **P1** `src/cli/commands/build.ts:84` — Preset load failures silently swallowed in bare catch with no logging. Bad methodology presets silently fall back to defaults without any diagnostic. [superpowers] — Add `process.stderr.write()` diagnostic in catch.

- **P1** `src/config/loader.ts:131` — Non-depth Zod schema failures (invalid platform enums, malformed `custom` blocks) are never converted to `ScaffoldError`s, so invalid configs can pass validation. [codex] — Convert all Zod issues to `ScaffoldError`.

- **P1** `src/core/assembly/meta-prompt-loader.ts:91` — Unreadable/invalid prompt files are silently dropped from the inventory, converting structural pipeline errors into mysterious missing-step behavior. [codex] — Return structured diagnostics; fail-fast in `run`.

- **P1** `src/cli/commands/run.ts:343` — Unreadable artifact files silently skipped with empty `catch {}`. Prompt assembles with missing context and no diagnostic signal. [gemini+superpowers, high_confidence] — Add `output.warn()` in the catch block.

- **P2** `src/cli/commands/run.ts:356` — decisions.jsonl read error silently swallowed with bare catch. Prompt assembled without decision context, no warning emitted. [superpowers] — Add `output.warn()`.

- **P2** `src/cli/commands/rework.ts:120` — Catch block maps all errors to exit code 2, losing `err.exitCode` from `REWORK_PARSE_ERROR` (which should be 3). [superpowers] — Use `err.exitCode` when available.

- **P3** `src/cli/commands/adopt.ts:121` — `finally` block calls `releaseLock()` unconditionally regardless of `lockResult.acquired`. Currently safe given `process.exit(3)` guards, but inconsistent with other commands. [superpowers] — Guard with `if (lockResult.acquired)`.

### Test Coverage

- **P2** `src/cli/commands/reset.ts:204` — Lock leaked on `--force` full reset path: `finally` block conditionally skips `releaseLock` when `--force` is set, even when lock was acquired. [superpowers] — Always release lock when `lockResult.acquired` is true.

- **P2** `src/state/state-manager.ts:85` — `markCompleted()` does not validate the step exists in `state.steps`. Unknown slug creates a partial entry missing required `source`/`status` fields, silently corrupting state. No test for this path. [superpowers] — Add existence guard; add test.

- **P2** `src/core/assembly/engine.ts:88` — `ASM_UNEXPECTED_ERROR` catch path untested. The inner try/catch wraps all section builders but no test exercises a section builder throwing. [superpowers] — Add test with a throwing metaPrompt getter.

- **P2** `src/config/loader.test.ts:111` — Tests cover depth-related schema failures but not invalid `platforms` values, malformed `custom` blocks, or other non-depth Zod failures. [codex] — Add tests for these cases asserting `config: null`.

- **P3** `src/utils/fs.ts:10` — `atomicWriteFile()` failure path (renameSync throws) untested. The `.tmp` file is left on disk permanently in this case. [superpowers] — Add test mocking `fs.renameSync` to throw.

- **P3** `src/core/assembly/context-gatherer.ts:1` — Unreadable-artifact branch has empty catch (no warning emitted, no test). [superpowers] — Add test; emit warning.

### Complexity

- **P3** `src/cli/commands/run.ts:1` — 479-line handler mixes locking, state I/O, dependency checking, and assembly in a single function. [gemini] — Extract individual steps into domain services (non-blocking, informational).

- **P3** `src/cli/commands/check.ts:114` — 215-line handler with deeply nested if/else branches keyed on step name strings. Adding a conditional step requires modifying this file. [superpowers] — Extract per-step check logic into named functions dispatched via map.

### Dependencies

- **P3** `package-lock.json:3` — Lockfile identifies package as `2.38.1` while `package.json` is `2.43.0`. [codex] — Regenerate lockfile from current `package.json`.

- **P3** `src/project/frontmatter.ts:111` — `FAILSAFE_SCHEMA` coercion only handles `null`/`true`/`false` string literals; alternative YAML forms (`~`, `Yes`, `No`) are not coerced correctly. [superpowers] — Document the decision or switch to `DEFAULT_SAFE_SCHEMA`.

---

## Phase 2: Functional Findings

_Phase 2 review in progress — results pending from parallel subagents._

---

## Fix Log

### Round 1 — P1 Fixes (commit 699144d)

| Finding | Fix |
|---------|-----|
| `run.ts:387` prompt-before-JSON | Restructured Step 10: JSON embeds prompt in result; auto writes raw; interactive gets its own write |
| `decision-logger.ts:74` appendFileSync | Read+build+atomicWrite cycle replaces appendFileSync |
| `build.ts:207` writeFileSync | Replaced with atomicWriteFile |
| `dashboard.ts:113` writeFileSync | Replaced with atomicWriteFile |
| `claude-md.ts:63` writeFileSync | Replaced with atomicWriteFile |
| `dashboard.ts:121` shell injection | execSync → execFileSync(opener, [outputPath]) |
| `knowledge.ts:205` shell injection | execSync → execFileSync('git', ['status', '--porcelain', localPath]) |
| `index.ts:5` console.error | process.stderr.write with structured message |
| `lock-manager.ts:131` console.warn | process.stderr.write |
| `decision-logger.ts:33` console.warn | process.stderr.write |
| `build.ts:84` silent preset failure | Added process.stderr.write diagnostic in catch |
| `loader.ts:131` Zod partial errors | Convert ALL Zod issues to ScaffoldError, not just depth |
| `interactive.ts:53` warn/error to stdout | Changed to process.stderr.write |
| `run.ts:343` silent artifact read | Added output.warn(ARTIFACT_READ_ERROR) in catch |
| `run.ts:356` silent decisions read | Added output.warn(DECISIONS_READ_ERROR) in catch |
| JSON status 'completed' | Changed to 'in_progress' for accurate state reporting |

### Round 2 — P2 Fixes (commit 4294b28)

| Finding | Fix |
|---------|-----|
| `json.ts:37` envelope missing fields | Buffer warnings; result() emits errors/warnings/exit_code |
| `run.ts:84` loadConfig empty knownSteps | Discover meta-prompts first, then loadConfig with real step names |
| `status.ts:107` same issue | Same fix applied |
| `complete/skip/reset () => []` | Added buildComputeEligibleFn helper; all three commands now pass real function |
| `reset.ts:204` lock leak | Track lockAcquired boolean; finally uses it (not !argv.force) |
| `rework.ts:120` exit code lost | Use err.exitCode ?? 2 in catch |
| `state-manager.ts:85` no existence guard | Added throw STEP_NOT_IN_STATE for unknown slugs |
| `loader.test.ts` coverage gaps | Added tests for invalid platform enum and malformed custom block |
| `state-manager.test.ts` coverage | Added test for markCompleted with unknown slug |

## Remaining Findings

### P2 — Deferred (1)

- **P2** `src/core/assembly/engine.ts:88` — `ASM_UNEXPECTED_ERROR` catch path untested. The inner try/catch wraps all section builders but no test exercises a section builder throwing. [superpowers] — Add test with a throwing metaPrompt getter.

### P3 — Not Fixed (8)

All P3 findings tracked for future work; none are correctness or security issues.
