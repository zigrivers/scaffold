# Design: argument passthrough for `scaffold run`

**Date:** 2026-05-31
**Status:** Approved (pending spec review)
**Branch:** `worktree-scaffold-run-arg-passthrough`

## Problem

Across downstream projects, agents invoking `scaffold run review-pr <PR#>` report
that the command "is invalid (step name only)" — it prints the meta-prompt text
without binding the PR number, so agents abandon it and fall back to running
`mmr review --pr <PR#> --sync` directly. That fallback loses the Superpowers
agent channel, finding reconciliation, and verdict logic that the full
`review-pr` workflow adds.

A representative downstream note:

> Note on scaffold run review-pr: `scaffold run review-pr 376` is invalid (step
> name only). Used `mmr review --pr 376 --sync` per project standards; the
> scaffold step printed methodology text without running channels.

## Root cause (verified)

`scaffold run <step>` is a **prompt emitter**: it assembles a meta-prompt and
prints it for the agent to execute. It is designed to support an `$ARGUMENTS`
placeholder that is string-substituted at assembly time
(`src/core/assembly/engine.ts:98-100`):

```ts
content: options.arguments != null
  ? options.metaPrompt.body.replace(/\$ARGUMENTS/g, options.arguments)
  : options.metaPrompt.body,
```

`content/tools/review-pr.md` is built around this: it references `$ARGUMENTS`
(line 48) and Step 1 parses a PR number and optional `--fix-threshold` out of it.
The `scaffold-runner` skill (`skills/scaffold-runner/SKILL.md:157`) even documents
argument passthrough as a working feature.

Two wires are crossed in `src/cli/commands/run.ts`:

1. **The CLI never captures trailing arguments.** The yargs command is
   `run <step>` (line 45) with `step` as the only positional. When an agent runs
   `scaffold run review-pr 376`, the `376` lands in `argv._` and is silently
   dropped.
2. **`arguments` is wired to the wrong source.** Line 502 sets
   `arguments: argv.instructions` — so the *only* way to populate `$ARGUMENTS`
   today is `--instructions "376"`. A bare `376` does nothing.

Net effect: the emitted prompt still contains a literal `$ARGUMENTS`, the agent
reads a wall of un-bound "methodology text," correctly concludes the PR number
did nothing, and bails to a raw `mmr` command.

This was confirmed by reading `src/cli/commands/run.ts` (builder at 44-71,
wiring at 495-509) and `src/core/assembly/engine.ts:98-100`.

## Goals

- `scaffold run <step> <args…>` binds trailing arguments into `$ARGUMENTS` for
  **any** step/tool, including unknown flags like `--fix-threshold P1`.
- The emitted prompt is unambiguously a runnable workflow, so agents execute it
  instead of falling back to raw commands.
- Existing `--instructions` behavior for pipeline steps is preserved.

## Non-goals (YAGNI)

- **Not** making the CLI a direct executor that shells out to `mmr` itself. The
  `review-pr` workflow requires an agent in the loop (Superpowers agent channel,
  reconciliation, verdict). The prompt-emitter model is retained deliberately.
- **Not** formalizing `argument-hint` in the frontmatter TypeScript schema. The
  forward-compat `[key: string]: unknown` already preserves it; nothing reads it.
- **Not** editing `scaffold-runner/SKILL.md`. Its passthrough claim (line 157)
  becomes *correct* once this lands, so it needs no change.

## Design

### 1. CLI argument capture — `src/cli/commands/run.ts`

Change the command from `run <step>` to `run <step> [args..]` (variadic
positional) and set `.parserConfiguration({ 'unknown-options-as-args': true })`
on the builder.

Behavior:

| Invocation | `args` captured |
|---|---|
| `scaffold run review-pr 376` | `['376']` |
| `scaffold run review-pr 376 --fix-threshold P1` | `['376', '--fix-threshold', 'P1']` |
| `scaffold run create-prd --force` | `[]` (`--force` is a known option, consumed) |
| `scaffold run review-pr` | `[]` |

`scaffold`'s own defined flags (`--depth`, `--instructions`, `--force`,
`--service`, `--root`, `--format`) remain recognized and consumed; only unknown
tokens fall through into `args`. The `RunArgs` interface gains `args?: string[]`.

> Implementation note: `unknown-options-as-args` is set inside the `run` command
> builder so it scopes to that command's parser. The TDD tests assert the exact
> `args` arrays above; if yargs scoping misbehaves, fall back to reconstructing
> trailing tokens from `process.argv` after the step token while still consuming
> known scaffold flags. The observable contract (the table above) is fixed
> regardless of mechanism.

### 2. Wiring — `src/cli/commands/run.ts` (~line 502)

```ts
const toolArgs = (argv.args ?? []).join(' ').trim()
// …
arguments: toolArgs !== '' ? toolArgs : (argv.instructions ?? ''),
```

- Trailing positionals take precedence (the new path).
- `--instructions "376"` still populates `$ARGUMENTS` as a fallback when no
  positionals are given (backward compat).
- The default is `''` (empty string), not `null`, so `$ARGUMENTS` is **always**
  substituted and never leaks as a literal token. This also fixes the no-arg
  case (`scaffold run review-pr` for auto-detect now emits clean text).
- Line 501 `instructions` (the `loadInstructions` result, fed by
  `argv.instructions`) is unchanged — the pipeline inline-guidance path is
  untouched.

### 3. CLI-emitted run header — `src/cli/commands/run.ts` (text output only)

When emitting a prompt in human/agent text mode, prepend a short, unambiguous
banner:

```
═══ scaffold run: review-pr — EXECUTE NOW ═══
This is a runnable workflow, not reference text.
ARGUMENTS: 376
Follow every step below in order. Do not substitute an ad-hoc command (e.g. a bare `mmr review`).
════════════════════════════════════════════
```

Constraints:

- **Text mode only.** Suppressed under `--format json` and `--auto` so
  machine-readable output stays clean. Gated on the resolved output mode
  (`resolveOutputMode` / `createOutputContext`).
- The `ARGUMENTS:` line shows the bound args, or `(none — auto-detect)` when
  empty, so the agent can see what it received.
- One header serves all steps; the "EXECUTE NOW" framing is most load-bearing
  for tools but reads correctly for pipeline steps too.

### 4. `review-pr.md` imperative preamble — `content/tools/review-pr.md`

Add a short bolded preamble immediately after the H1, before the Mode/Step 1
content:

> **You are now executing the `review-pr` workflow for PR `$ARGUMENTS` (blank =
> auto-detect from the current branch). Run every step below now. Do not shortcut
> to a bare `mmr review` — the full workflow adds the Superpowers agent channel,
> reconciliation, and verdict logic that a raw command skips.**

The existing Step 1 `$ARGUMENTS`-parsing bash is preserved. The phrasing reads
cleanly when `$ARGUMENTS` is empty.

## Testing (TDD — write failing tests first)

**`src/cli/commands/run.test.ts`** (vitest; mocks `AssemblyEngine.assemble`):

- `run review-pr 376` → `assemble` called with `arguments: '376'`
- `run review-pr 376 --fix-threshold P1` → `arguments: '376 --fix-threshold P1'`
- `run review-pr` (no args) → `arguments: ''`
- `run create-prd --instructions "foo"` (no positionals) → `arguments: 'foo'`
  (backward compat)
- positionals + `--instructions` together → positionals win
- header present in text mode; absent under `--format json`

**`src/core/assembly/engine.test.ts`** (extend if not covered): `$ARGUMENTS`
replaced with provided value; empty string removes the token.

**bats** (optional, only if vitest leaves an integration gap): `scaffold run
review-pr 376` output contains `376` and the EXECUTE NOW header.

## Files touched

- `src/cli/commands/run.ts` — builder, `RunArgs`, wiring, header
- `src/cli/commands/run.test.ts` — new tests
- `content/tools/review-pr.md` — preamble
- `src/core/assembly/engine.test.ts` — substitution test (if needed)

## Risks

- **yargs `unknown-options-as-args` scope.** Could affect parsing of other
  commands if it leaks globally. Mitigated by setting it within the `run`
  builder and asserting exact `args` arrays in tests; `process.argv` fallback
  documented in §1.
- **Empty-string default change.** Steps that previously relied on a literal
  `$ARGUMENTS` surviving in output would now see it removed. No current pipeline
  step depends on that; engine tests guard the substitution contract.
