# Agent-Drivability Design Plan: `scaffold init` and `scaffold adopt`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move both bootstrap paths (`scaffold init` for a new project, `scaffold adopt` for a brownfield repo) from "drivable with caveats" to fully agent-drivable, so that an AI coding agent can bootstrap either kind of project end to end with no human in the terminal, no silent misconfiguration, and no unparseable failure.

**Architecture:** Three layers of change, in dependency order. (1) An **output layer** that can express failure in the same JSON envelope it already uses for success, plus a CLI-level failure handler that stops emitting the yargs usage dump. (2) A **contract layer** that turns the nine scattered auto-mode `throw new Error(...)` sites into one declared table, routes every user-facing failure through a coded `ScaffoldError` with a correct `ExitCode`, and makes non-interactive environments behave identically whether or not `--auto` was passed. (3) A **documentation layer** that publishes the exit-code and envelope contracts and repairs the stale bundled install guide. No new commands and no new conventions are introduced; every change activates plumbing that already exists.

**Tech Stack:** TypeScript (ESM, Node >= 18.17.0), yargs 17, Zod 3, vitest for unit and e2e tests, bats-core for content and documentation gates.

**Source audit:** `Scaffold CLI agent-drivability audit`, 2026-07-25, against v3.51.0. Findings F1 through F9, gaps 01 through 08.

---

## Global Constraints

- Node >= 18.17.0 (`package.json:34`, `engines.node`).
- Every exit code must be a member of `ExitCode` in `src/types/enums.ts:17-25`. No new enum members without updating the published table (enforced by Task 9's bats gate).
- Every user-facing failure must be a `ScaffoldError` (`src/types/errors.ts:4-15`): `code` in SCREAMING_SNAKE prefixed by command (`INIT_`, `ADOPT_`), `message`, `exitCode`, and a `recovery` string that names the exact flag or command that fixes it.
- **The `fail()` call convention.** Every terminal failure path uses exactly this shape, and no task may deviate:

  ```typescript
  output.fail(errors)                                     // array, so per-error exit codes survive
  process.exitCode = errors[0]?.exitCode ?? ExitCode.ValidationError
  return
  ```

  Never `process.exit()`, never a hardcoded literal after `fail()`, and never discard `ScaffoldError.exitCode` in favour of a constant. Discarding it is precisely the bug at `src/cli/commands/init.ts:790` that this plan exists to fix, and it would be trivial to reintroduce at a new call site. Where a site's exit code is genuinely fixed and not carried by the error (adopt's lock path, which is `ExitCode.StateCorruption`), pass it explicitly as `fail()`'s second argument rather than assigning it afterwards.
- Reuse existing conventions. Do not introduce a parallel error object, a parallel envelope key, or a second exit-code scheme. The envelope keys `success`, `data`, `errors`, `warnings`, `exit_code` are already emitted by `src/cli/output/json.ts:45-51` and must keep those names.
- Flag-family constants live in `src/cli/init-flag-families.ts`, which is already shared by `init` and `adopt` (per its own header comment at lines 1-11). New shared flag data belongs there, not in a new module.
- Guides: markdown under `content/guides/<topic>/index.md` is the source of truth. After editing, regenerate with `scaffold guides --build`. CI enforces freshness via `make guides-check` and `scripts/check-guides-drift.sh` (job "Guides drift + security gate", `.github/workflows/ci.yml:39`).
- `make check-all` must pass before every commit.
- TDD: every task writes its failing test first and runs it to confirm the failure before implementing.

---

## Citation Verification

The audit's file and line references were re-read against the working tree before this plan was written. All were confirmed. Three details were sharper than the audit's summary and change the design:

| Audit claim | Status | Refinement that affects the design |
|---|---|---|
| 9 project types require a discriminator flag under `--auto` | Confirmed at `src/wizard/questions.ts:154, 202, 275, 309, 358, 484, 535, 581, 630` | The 5 types with **no** discriminator are `game`, `browser-extension`, `macos-native`, `data-science`, `web3`. The table in Task 2 must encode `null` for these, not omit them. |
| `init.ts:790` hardcodes exit 1 | Confirmed | `ScaffoldError` already carries an `exitCode` field (`src/types/errors.ts:10`), and `runWizard` already populates it (`src/wizard/wizard.ts:297`). `init.ts:790` discards it. The plumbing exists; only the call site is wrong. |
| Exit 2 on the `--from` path is semantically wrong | Confirmed at `src/cli/commands/init.ts:844` | The conflict is documented in the codebase itself: `src/utils/user-errors.ts:1-5` states these normalize to "typically 2", while `src/types/enums.ts:20` assigns 2 to `MissingDependency`. Two competing conventions, so Task 8 must fix the doc comment as well as the code. |

No citation required correction. `src/cli/index.ts` still has no `.fail(` handler; `grep -rn "success: false" src/cli/` still returns nothing.

---

## Decisions

Two findings admitted more than one defensible fix. Both were put to the maintainer with a recommendation, and **both were approved as recommended on 2026-07-25**. The rejected options are kept below because the rationale is the reason the tasks look the way they do, and a future reader deciding whether to revisit them needs the tradeoff, not just the outcome.

| ID | Question | Decision | Implemented by |
|---|---|---|---|
| D1 | Non-TTY without `--auto`: refuse, warn, or both? | **A. Refuse** (breaking) | Task 6 |
| D2 | Shape of the failure envelope | **A. Flip the existing keys** | Task 1 |

### D1 (F2): non-TTY without `--auto` should refuse, warn, or both

Today `scaffold init --auto --project-type web-app` fails demanding `--web-rendering`, while `scaffold init --project-type web-app < /dev/null` succeeds and writes `renderingStrategy: spa`, which is `options[0]` rather than a considered default (`src/cli/output/interactive.ts:127-129`, called with `undefined` as the default from `src/wizard/questions.ts:157-163`).

| Option | Change | Tradeoff |
|---|---|---|
| **A. Refuse** | `resolveOutputMode` returns `auto` when stdin or stdout is not a TTY, so both invocations behave identically | Closes the trap completely. **Breaking**: scripts that pipe `init` today and rely on silent defaults begin failing. |
| **B. Warn** | `InteractiveOutput` emits the `(auto) Using default for: ...` stderr breadcrumb that `AutoOutput` already emits (`src/cli/output/auto.ts:33, 38`) when `!canPrompt()` | Non-breaking and purely additive, but the command still succeeds with an arbitrary `options[0]`. The agent gets a trace it has no reason to read. |
| **C. Both, staged** | Ship B in a patch, A in the following minor | Reaches the same destination more slowly, and leaves the defect live in the interim. |

**Decision: A, approved 2026-07-25.** The repo has direct precedent. In v3.48.0 `scaffold adopt` changed from write-on-run to plan-first, and the shipped warning calls the previous behavior "a defect" (`src/cli/commands/adopt.ts:710`). The same reasoning applies here: silently answering a question nobody asked is a defect, not an interface. Option B's breadcrumb is still worth having and is folded into Task 6, because `AutoOutput` delegates its prompts to `InteractiveOutput`. Migration is self-documenting: the new failure names the exact flag to add, so a broken script's error message is also its fix. An escape-hatch environment variable was considered and rejected as new surface that would have to be supported indefinitely.

Because this is the plan's only breaking behavior change, it carries two obligations that Task 6 and the release checklist must honor: a minor version bump rather than a patch, and a CHANGELOG entry under "Behavior change" that names **both** affected cases. Documenting only the first is the likely mistake, because the decision is framed as "non-TTY":

1. **Non-TTY without `--auto`.** `scaffold init --project-type web-app < /dev/null` exits 1 instead of writing `renderingStrategy: spa`.
2. **Any non-prompting mode, including `--format json` in a real TTY.** Step 3b normalizes `argv.auto` for every mode that is not `interactive`, so `scaffold init --format json --project-type web-app` now also requires `--web-rendering`.

The second is intended and consistent: `JsonOutput` never prompts, so it was already silently defaulting and had the same defect. But it widens the break beyond what "non-TTY" suggests, so it needs its own CHANGELOG line and its own e2e case (Task 12, "requires a discriminator under --format json even in a TTY").

### D2 (F4): shape of the failure envelope

`JsonOutput.result()` hardcodes `success: true`, `errors: []`, and `exit_code: 0` (`src/cli/output/json.ts:45-51`). No code path emits a failure envelope.

| Option | Change | Tradeoff |
|---|---|---|
| **A. Flip the existing keys** | On failure emit `{success:false, data:null, errors:[ScaffoldError], warnings:[...], exit_code:N}` | Zero new contract. Consumers who already branch on `success` keep working. Stdout becomes non-empty on failure, which cannot break a parser that currently receives nothing. |
| **B. New top-level `error` object** | Add `error` alongside the existing `errors` array | Introduces a parallel convention for the same information, which the plan's constraints forbid. |
| **C. JSON Lines / streaming** | Emit one object per event | Larger change, no demand from either path, and it breaks every existing single-parse consumer. |

**Decision: A, approved 2026-07-25.** It activates three fields that are currently dead rather than adding a fourth, which is the whole point of the constraint about reusing conventions.

One consequence to hold onto while implementing: because `success` and `exit_code` have always been present but always said "true" and "0", any existing consumer that reads them is already correct and keeps working. The change is only that those fields start telling the truth. That is why this ships as a patch in Release 1 rather than waiting for Release 2 alongside D1.

---

## Findings That Need No Code Change

**F9 (plan_key excludes the repo path).** No code change. The exclusion is deliberate and documented at `src/project/adoption-plan.ts:85-90` as decision D1 of the brownfield design: `generated_at`, `project_root`, and markdown prose never participate in the hash, so the key is content-addressed. The blast radius is bounded, because applying a plan in a second repo only succeeds if the live re-render produces byte-identical dispositions, at which point the two plans genuinely are the same plan. Making the key repo-scoped would break its actual purpose, which is detecting that reality changed between approval and apply. The residual risk is only that an orchestrator caches a key across repos and is surprised. That is a documentation problem, handled by one sentence in Task 9.

All other findings (F1 through F8) receive code changes.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/cli/init-flag-families.ts` | Add `AUTO_REQUIRED_FLAG` table and `autoRequiredSuffix()` helper alongside the existing family constants | Modify |
| `src/wizard/questions.ts` | Replace 9 bare `throw new Error` sites with one coded-error helper; fail instead of silently skipping when no project type resolves | Modify |
| `src/cli/output/context.ts` | Add `fail()` to the `OutputContext` interface | Modify |
| `src/cli/output/json.ts` | Implement `fail()` as the failure envelope | Modify |
| `src/cli/output/interactive.ts` | Implement `fail()`; add the non-TTY default breadcrumb | Modify |
| `src/cli/output/auto.ts` | Implement `fail()` by delegation | Modify |
| `src/cli/middleware/output-mode.ts` | Resolve non-TTY to `auto` | Modify |
| `src/cli/index.ts` | Add `.fail()` so handler errors stop printing the usage block | Modify |
| `src/cli/commands/init.ts` | Honor `err.exitCode`; map `ScaffoldUserError` to coded errors; `requiresArg` on `--from`; emit a result on the `--from` path | Modify |
| `src/cli/commands/adopt.ts` | Route every terminal failure through `output.fail()` | Modify |
| `src/cli/commands/adopt.result-shape.test.ts` | Adopt failure-envelope assertions | Modify |
| `src/utils/user-errors.ts` | Correct the "typically 2" header comment | Modify |
| `content/guides/cli/index.md` | Publish exit codes, the envelope contract, and the agent driving loop | Modify |
| `content/guides/install/index.md` | Repair the stale adopt guidance at lines 125, 148, 151 | Modify |
| `content/skills/scaffold-runner/SKILL.md` | Activate before `.scaffold/` exists; state the init-versus-adopt decision rule | Modify |
| `src/cli/output/json.test.ts` | Unit tests for the failure envelope | Create |
| `src/e2e/agent-drivability.test.ts` | The acceptance test for both paths | Create |
| `tests/guides-agent-contract.bats` | Gate that keeps the published contract in sync with the enum | Create |

---

## Task 1: Failure envelope on the output layer

Closes **F4**, gap **01**. Implements decision **D2 option A**.

**Files:**
- Modify: `src/cli/output/context.ts:13-55` (interface), `src/cli/output/json.ts:44-52`, `src/cli/output/interactive.ts:68-81`, `src/cli/output/auto.ts:20-26`
- Test: `src/cli/output/json.test.ts` (create)

**Interfaces:**
- Produces: `OutputContext.fail(errors: ScaffoldError[], exitCode?: ExitCode): void`. Tasks 2, 4, 5, 7 and 8 call this. When `exitCode` is omitted it is taken from `errors[0].exitCode`, falling back to `ExitCode.ValidationError`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/output/json.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { JsonOutput } from './json.js'
import { ExitCode } from '../../types/enums.js'

function captureStdout(fn: () => void): string {
  let out = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk)
    return true
  })
  try { fn() } finally { spy.mockRestore() }
  return out
}

afterEach(() => { vi.restoreAllMocks() })

describe('JsonOutput.fail', () => {
  it('writes success:false with populated errors and a non-zero exit_code', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail([{
        code: 'INIT_AUTO_FLAG_REQUIRED',
        message: '--cli-interactivity is required in auto mode for cli projects',
        exitCode: ExitCode.ValidationError,
        recovery: 'Pass --cli-interactivity <args-only|interactive|hybrid>',
      }])
    })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(false)
    expect(parsed.data).toBeNull()
    expect(parsed.exit_code).toBe(ExitCode.ValidationError)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].code).toBe('INIT_AUTO_FLAG_REQUIRED')
    expect(parsed.errors[0].recovery).toContain('--cli-interactivity')
  })

  it('carries buffered warnings into the failure envelope', () => {
    const output = new JsonOutput()
    output.warn({ code: 'ADOPT_LOW_ONLY', message: 'Only low-confidence matches found: backend' })
    const raw = captureStdout(() => {
      output.fail([{ code: 'X_FAILED', message: 'boom', exitCode: ExitCode.ValidationError }])
    })
    const parsed = JSON.parse(raw)
    expect(parsed.warnings).toHaveLength(1)
    expect(parsed.warnings[0].code).toBe('ADOPT_LOW_ONLY')
  })

  it('still emits success:true from result()', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => { output.result({ ok: 1 }) })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.exit_code).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/output/json.test.ts`
Expected: FAIL with `output.fail is not a function`

- [ ] **Step 3: Add `fail` to the interface**

```typescript
// src/cli/output/context.ts — inside interface OutputContext, after result()
  /**
   * Terminal failure. In json mode this writes the failure envelope to stdout
   * so an agent always has something to parse. In interactive/auto mode it
   * delegates to error() so human output is unchanged.
   */
  fail(errors: ScaffoldError[], exitCode?: ExitCode): void
```

Add the import at the top of the file:

```typescript
import type { ExitCode } from '../../types/enums.js'
```

- [ ] **Step 4: Implement in JsonOutput**

```typescript
// src/cli/output/json.ts — after result()
  fail(errors: ScaffoldError[], exitCode?: ExitCode): void {
    const resolved = exitCode ?? errors[0]?.exitCode ?? ExitCode.ValidationError
    for (const e of errors) {
      process.stderr.write(`✗ ${e.code}: ${e.message}\n`)
      if (e.recovery) process.stderr.write(`  Recovery: ${e.recovery}\n`)
    }
    process.stdout.write(JSON.stringify({
      success: false,
      data: null,
      errors,
      warnings: this.bufferedWarnings,
      exit_code: resolved,
    }) + '\n')
  }
```

Add to the imports at the top of `json.ts`:

```typescript
import { ExitCode } from '../../types/enums.js'
```

- [ ] **Step 5: Implement in InteractiveOutput and AutoOutput**

```typescript
// src/cli/output/interactive.ts — after result()
  fail(errors: ScaffoldError[], _exitCode?: ExitCode): void {
    for (const e of errors) this.error(e)
  }
```

```typescript
// src/cli/output/auto.ts — after result()
  fail(errors: ScaffoldError[], exitCode?: ExitCode): void {
    this.interactive.fail(errors, exitCode)
  }
```

Both files need `import type { ExitCode } from '../../types/enums.js'` added to their existing type imports.

- [ ] **Step 6: Update the test fakes that implement `OutputContext`**

Adding a required method to the interface breaks every fake that claims to be one. There is no shared test-fake helper in this repo — each file defines its own — so the breakage is distributed. Surveyed before implementation, these four declare an explicit return type and will hard-fail `tsc --noEmit`:

- `src/core/pipeline/resolver.test.ts:9` — `function makeOutput(): OutputContext`
- `src/core/assembly/overlay-state-resolver.test.ts:41` — `function makeOutput(): OutputContext`
- `src/cli/output/error-display.test.ts:35` — `function makeMockOutput(): OutputContext`
- `src/e2e/cross-service-references.test.ts:32` — `function mkOutput(): OutputContext`

A further four sites cast with `as OutputContext`; an object-literal `as` cast still errors when properties are missing, so expect those too.

Add one line to each fake:

```typescript
    fail: vi.fn(),
```

**Do not make `fail()` optional on the interface to avoid this.** An optional method would let a command silently skip emitting the envelope, which is the defect F4 describes. The compiler errors here are the interface doing its job; fix the fakes, not the contract.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/cli/output/ && npx tsc --noEmit`
Expected: PASS, and no type errors from either the three real implementers or the test fakes

- [ ] **Step 8: Commit**

```bash
git add src/cli/output/context.ts src/cli/output/json.ts src/cli/output/interactive.ts src/cli/output/auto.ts src/cli/output/json.test.ts \
  src/core/pipeline/resolver.test.ts src/core/assembly/overlay-state-resolver.test.ts \
  src/cli/output/error-display.test.ts src/e2e/cross-service-references.test.ts
git commit -m "feat(cli): add failure envelope to the output layer (F4, gap 01)"
```

**Agent-visible behavior:** none yet. This task only adds the capability; Tasks 4, 5, 7 and 8 route failures into it.

**Breaking:** No. Purely additive.

---

## Task 2: Declare the auto-mode discriminator flags in one table

Closes **F1** (the undiscoverable half), gap **02**.

**Files:**
- Modify: `src/cli/init-flag-families.ts` (append after `MACOS_NATIVE_FLAGS`, line 96)
- Test: `src/cli/init-flag-families.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces: `AUTO_REQUIRED_FLAG: Readonly<Record<ProjectType, string | null>>` and `autoRequiredSuffix(flag: string): string`. Tasks 3 and 4 consume both.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/init-flag-families.test.ts
import { describe, it, expect } from 'vitest'
import { AUTO_REQUIRED_FLAG, autoRequiredSuffix } from './init-flag-families.js'
import { ProjectTypeSchema } from '../config/schema.js'

describe('AUTO_REQUIRED_FLAG', () => {
  it('has an entry for every project type in the schema', () => {
    for (const type of ProjectTypeSchema.options) {
      expect(Object.hasOwn(AUTO_REQUIRED_FLAG, type)).toBe(true)
    }
  })

  it('marks the nine types that require a discriminator under --auto', () => {
    expect(AUTO_REQUIRED_FLAG['web-app']).toBe('web-rendering')
    expect(AUTO_REQUIRED_FLAG['backend']).toBe('backend-api-style')
    expect(AUTO_REQUIRED_FLAG['cli']).toBe('cli-interactivity')
    expect(AUTO_REQUIRED_FLAG['library']).toBe('lib-visibility')
    expect(AUTO_REQUIRED_FLAG['mobile-app']).toBe('mobile-platform')
    expect(AUTO_REQUIRED_FLAG['data-pipeline']).toBe('pipeline-processing')
    expect(AUTO_REQUIRED_FLAG['ml']).toBe('ml-phase')
    expect(AUTO_REQUIRED_FLAG['research']).toBe('research-driver')
    expect(AUTO_REQUIRED_FLAG['mcp-server']).toBe('mcp-language')
  })

  it('marks the five types that require nothing as null', () => {
    expect(AUTO_REQUIRED_FLAG['game']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['browser-extension']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['macos-native']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['data-science']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['web3']).toBeNull()
  })
})

describe('autoRequiredSuffix', () => {
  it('annotates a discriminator flag', () => {
    expect(autoRequiredSuffix('cli-interactivity')).toBe(' [required with --auto]')
  })

  it('returns an empty string for a non-discriminator flag', () => {
    expect(autoRequiredSuffix('cli-distribution')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/init-flag-families.test.ts`
Expected: FAIL with `AUTO_REQUIRED_FLAG is not exported`

- [ ] **Step 3: Add the table and helper**

```typescript
// src/cli/init-flag-families.ts — append after MACOS_NATIVE_FLAGS (line 96)

/**
 * The single flag each project type must be given under `--auto`, because the
 * wizard has no defensible default for it. `null` means the type is fully
 * defaultable and needs no flag.
 *
 * This table is the one source of truth for three consumers: the `--help`
 * annotation in init.ts, the INIT_AUTO_FLAG_REQUIRED error in questions.ts,
 * and the published contract in content/guides/cli/index.md. Adding a project
 * type without adding a row here fails init-flag-families.test.ts.
 */
export const AUTO_REQUIRED_FLAG: Readonly<Record<string, string | null>> = Object.freeze({
  'web-app': 'web-rendering',
  'backend': 'backend-api-style',
  'cli': 'cli-interactivity',
  'library': 'lib-visibility',
  'mobile-app': 'mobile-platform',
  'data-pipeline': 'pipeline-processing',
  'ml': 'ml-phase',
  'research': 'research-driver',
  'mcp-server': 'mcp-language',
  'game': null,
  'browser-extension': null,
  'macos-native': null,
  'data-science': null,
  'web3': null,
})

/** Help-text annotation for a flag that `--auto` requires. Empty otherwise. */
export function autoRequiredSuffix(flag: string): string {
  const required = Object.values(AUTO_REQUIRED_FLAG).includes(flag)
  return required ? ' [required with --auto]' : ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/init-flag-families.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/init-flag-families.test.ts
git commit -m "feat(init): declare auto-mode discriminator flags in one table (F1, gap 02)"
```

**Agent-visible behavior:** none yet. Task 3 surfaces it in `--help`, Task 4 in the error.

**Breaking:** No.

---

## Task 3: Annotate the discriminator flags in `--help`

Closes **F1** (the discoverability half), gap **02**.

**Files:**
- Modify: `src/cli/commands/init.ts:210` (`web-rendering`), `:231` (`backend-api-style`), `:263` (`cli-interactivity`), and the six other discriminator declarations
- Test: `src/cli/commands/init.test.ts` (append)

**Interfaces:**
- Consumes: `autoRequiredSuffix` from Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/init.test.ts — append
import { AUTO_REQUIRED_FLAG } from '../init-flag-families.js'

describe('init --help discriminator annotation', () => {
  it('marks every auto-required flag as required in its describe string', async () => {
    const yargsMod = (await import('yargs')).default
    const initCommand = (await import('./init.js')).default
    const captured: Record<string, string> = {}
    const fake = {
      option(name: string, cfg: { describe?: string }) {
        captured[name] = cfg.describe ?? ''
        return this
      },
      group() { return this },
      check() { return this },
      middleware() { return this },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initCommand.builder(fake as any)

    const required = Object.values(AUTO_REQUIRED_FLAG).filter((f): f is string => f !== null)
    for (const flag of required) {
      expect(captured[flag], `${flag} describe`).toContain('[required with --auto]')
    }
    expect(captured['cli-distribution']).not.toContain('[required with --auto]')
    void yargsMod
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/init.test.ts -t 'discriminator annotation'`
Expected: FAIL, `expected 'Rendering strategy' to contain '[required with --auto]'`

- [ ] **Step 3: Apply the suffix at each of the nine declarations**

Add the import to `src/cli/commands/init.ts`:

```typescript
import { autoRequiredSuffix } from '../init-flag-families.js'
```

Then change each of the nine `describe` strings. All nine, not just the first:

```typescript
      .option('web-rendering', {
        type: 'string',
        describe: `Rendering strategy${autoRequiredSuffix('web-rendering')}`,
        choices: ['spa', 'ssr', 'ssg', 'hybrid'] as const,
      })
      .option('backend-api-style', {
        type: 'string',
        describe: `API style${autoRequiredSuffix('backend-api-style')}`,
        choices: ['rest', 'graphql', 'grpc', 'trpc', 'none'] as const,
      })
      .option('cli-interactivity', {
        type: 'string',
        describe: `Interactivity model${autoRequiredSuffix('cli-interactivity')}`,
        choices: ['args-only', 'interactive', 'hybrid'] as const,
      })
```

Apply the identical pattern to `lib-visibility`, `mobile-platform`, `pipeline-processing`, `ml-phase`, `research-driver`, and `mcp-language`, wrapping each existing `describe` value in a template literal and appending `autoRequiredSuffix('<that-flag>')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/commands/init.test.ts -t 'discriminator annotation'`
Expected: PASS

- [ ] **Step 5: Verify the rendered help**

Run: `npm run build && node dist/index.js init --help 2>&1 | grep 'required with --auto' | wc -l`
Expected: `9`

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat(init): mark auto-required flags in --help (F1, gap 02)"
```

**Agent-visible behavior:** `scaffold init --help` now reads `--cli-interactivity  Interactivity model [required with --auto]`. An agent reading `--help` can build a valid command on the first attempt.

**Breaking:** No. Help text only.

---

## Task 4: Replace the nine bare throws with one coded error

Closes **F1** (the failure-shape half), feeds gap **01** and **05**.

**Files:**
- Modify: `src/wizard/questions.ts:153-155, 201-203, 274-276, 308-310, 357-359, 483-485, 534-536, 580-582, 629-631`
- Test: `src/wizard/questions.test.ts` (append)

**Interfaces:**
- Consumes: `AUTO_REQUIRED_FLAG` from Task 2.
- Produces: `AutoFlagRequiredError`, an `Error` subclass carrying `.scaffoldError: ScaffoldError`. Tasks 5 and 8 catch it by that property.

- [ ] **Step 1: Write the failing test**

```typescript
// src/wizard/questions.test.ts — append
import { AUTO_REQUIRED_FLAG } from '../cli/init-flag-families.js'
import { ExitCode } from '../types/enums.js'
import { createOutputContext } from '../cli/output/context.js'

describe('auto-mode discriminator enforcement', () => {
  const required = Object.entries(AUTO_REQUIRED_FLAG)
    .filter((entry): entry is [string, string] => entry[1] !== null)

  it.each(required)('throws a coded error for %s naming --%s', async (projectType, flag) => {
    const output = createOutputContext('auto')
    await expect(
      askWizardQuestions({ auto: true, projectType, output } as never),
    ).rejects.toMatchObject({
      scaffoldError: {
        code: 'INIT_AUTO_FLAG_REQUIRED',
        exitCode: ExitCode.ValidationError,
      },
    })
    await askWizardQuestions({ auto: true, projectType, output } as never).catch((e: unknown) => {
      const se = (e as { scaffoldError: { message: string; recovery?: string } }).scaffoldError
      expect(se.message).toContain(`--${flag}`)
      expect(se.recovery).toContain(`--${flag}`)
    })
  })

  // The other half of the table. Without this, a bug that made requireAutoFlag
  // throw on a null entry would pass every test above while breaking auto mode
  // for game, browser-extension, macos-native, data-science and web3.
  const defaultable = Object.entries(AUTO_REQUIRED_FLAG)
    .filter(entry => entry[1] === null)
    .map(([projectType]) => projectType)

  it('covers every project type across the two groups', () => {
    expect(required.length).toBe(9)
    expect(defaultable.length).toBe(5)
    expect(required.length + defaultable.length).toBe(ProjectTypeSchema.options.length)
  })

  it.each(defaultable)('does not demand any flag for %s', async (projectType) => {
    const output = createOutputContext('auto')
    await expect(
      askWizardQuestions({ auto: true, projectType, output } as never),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wizard/questions.test.ts -t 'discriminator enforcement'`
Expected: FAIL, the rejected value is a bare `Error` with no `scaffoldError` property

- [ ] **Step 3: Add the error class and helper**

```typescript
// src/wizard/questions.ts — near the top, after the existing imports
import { AUTO_REQUIRED_FLAG } from '../cli/init-flag-families.js'
import { ExitCode } from '../types/enums.js'
import type { ScaffoldError } from '../types/index.js'

/** Thrown when --auto is set but a project type's discriminator flag is absent. */
export class AutoFlagRequiredError extends Error {
  readonly scaffoldError: ScaffoldError
  constructor(scaffoldError: ScaffoldError) {
    super(scaffoldError.message)
    this.name = 'AutoFlagRequiredError'
    this.scaffoldError = scaffoldError
  }
}

/**
 * Enforce the one flag `--auto` cannot default for this project type.
 * `choices` is rendered into the recovery line so the failure names its own fix.
 */
function requireAutoFlag(
  auto: boolean,
  projectType: string,
  value: unknown,
  choices: readonly string[],
): void {
  if (!auto || value !== undefined) return
  const flag = AUTO_REQUIRED_FLAG[projectType]
  if (!flag) return
  throw new AutoFlagRequiredError({
    code: 'INIT_AUTO_FLAG_REQUIRED',
    message: `--${flag} is required in auto mode for ${projectType} projects`,
    exitCode: ExitCode.ValidationError,
    recovery: `Pass --${flag} <${choices.join('|')}>`,
    context: { projectType, flag },
  })
}
```

- [ ] **Step 4: Replace all nine throw sites**

Each site currently reads like `src/wizard/questions.ts:153-155`. Replace every one; do not stop after the first. The web-app site becomes:

```typescript
    requireAutoFlag(auto, 'web-app', options.webAppFlags?.webRendering,
      ['spa', 'ssr', 'ssg', 'hybrid'])
```

The remaining eight, in file order:

```typescript
    requireAutoFlag(auto, 'backend', options.backendFlags?.backendApiStyle,
      ['rest', 'graphql', 'grpc', 'trpc', 'none'])

    requireAutoFlag(auto, 'cli', options.cliFlags?.cliInteractivity,
      ['args-only', 'interactive', 'hybrid'])

    requireAutoFlag(auto, 'library', options.libraryFlags?.libVisibility,
      ['public', 'internal'])

    requireAutoFlag(auto, 'mobile-app', options.mobileFlags?.mobilePlatform,
      ['ios', 'android', 'cross-platform'])

    requireAutoFlag(auto, 'data-pipeline', options.pipelineFlags?.pipelineProcessing,
      ['batch', 'streaming', 'hybrid'])

    requireAutoFlag(auto, 'ml', options.mlFlags?.mlPhase,
      ['training', 'inference', 'both'])

    requireAutoFlag(auto, 'research', options.researchFlags?.researchDriver,
      ['code-driven', 'config-driven', 'api-driven', 'notebook-driven'])

    requireAutoFlag(auto, 'mcp-server', options.mcpServerFlags?.mcpLanguage,
      ['typescript', 'python'])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/wizard/ && grep -c "is required in auto mode" src/wizard/questions.ts`
Expected: PASS, and the grep returns `1` (the single template in `requireAutoFlag`, not nine literals)

- [ ] **Step 6: Commit**

```bash
git add src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "refactor(init): one coded error for auto-mode discriminators (F1)"
```

**Agent-visible behavior:** after Task 5 wires the handler, `scaffold init --auto --format json --project-type cli` exits 1, stdout carries `{"success":false,...,"errors":[{"code":"INIT_AUTO_FLAG_REQUIRED","recovery":"Pass --cli-interactivity <args-only|interactive|hybrid>"}],"exit_code":1}`, stderr carries the same two lines in human form.

**Breaking:** No. Same exit code (1), same trigger condition; the message gains a code prefix and a recovery line.

---

## Task 5: Stop printing the usage block on handler failure

Closes **F1** (the 200-line-dump half), and improves **F6**'s error.

**Files:**
- Modify: `src/cli/index.ts:36-105`, `src/cli/commands/init.ts:786-792` and `:841-848`
- Test: `src/cli/index.test.ts` (append)

**Interfaces:**
- Consumes: `OutputContext.fail` (Task 1) only. This task deliberately references no Release 2 symbol.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/index.test.ts — append
describe('CLI failure handler', () => {
  it('prints a one-line diagnostic and a help hint, never the usage block', async () => {
    const err: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      err.push(String(c)); return true
    })
    await runCli(['init', '--nonexistent-flag']).catch(() => undefined)
    spy.mockRestore()
    const text = err.join('')
    expect(text).not.toContain('Web-App Configuration:')
    expect(text).not.toContain('Game Configuration:')
    expect(text).toContain('scaffold init --help')
  })

  it('emits a parseable envelope for an argument error under --format json', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c)); return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await runCli(['init', '--format', 'json', '--nonexistent-flag']).catch(() => undefined)
    spy.mockRestore()
    vi.restoreAllMocks()
    const parsed = JSON.parse(out.join(''))
    expect(parsed.success).toBe(false)
    expect(parsed.errors[0].code).toBe('CLI_ARGUMENT_ERROR')
    expect(parsed.errors[0].recovery).toContain('scaffold init --help')
    expect(parsed.exit_code).toBe(1)
  })

  it('resolves on a parse error, so only handler exceptions take the re-throw path', async () => {
    // The handler re-throws whenever `err` is set. A parse error carries only
    // `msg`, so it must be absorbed into the envelope rather than propagating.
    // This is the observable half of "internal errors are not relabelled":
    // if the guard were inverted, this call would reject.
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await expect(runCli(['init', '--nonexistent-flag'])).resolves.toBeUndefined()
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/index.test.ts -t 'failure handler'`
Expected: FAIL, the captured stderr contains `Web-App Configuration:`

- [ ] **Step 3: Add the fail handler**

```typescript
// src/cli/index.ts — insert between .strict() and .demandCommand(), line 97
    .fail((msg, err, yargsInstance) => {
      // A present `err` means a command handler threw and yargs caught it.
      // Those are internal failures: re-throw so they surface as stack traces
      // rather than being mislabelled as bad input. Only `msg` is a genuine
      // yargs parse error, and it must reach stdout as an envelope when the
      // caller asked for json, or the failure is unparseable (acceptance
      // criterion 2: never exit non-zero with empty stdout under --format json).
      if (err) throw err
      const argv = (yargsInstance.parsed && yargsInstance.parsed.argv) || {}
      const command = String((argv._ ?? [])[0] ?? '')
      const hint = command ? `scaffold ${command} --help` : 'scaffold --help'
      const scaffoldError: ScaffoldError = {
        code: 'CLI_ARGUMENT_ERROR',
        message: msg,
        exitCode: ExitCode.ValidationError,
        recovery: `Run \`${hint}\` for available options`,
      }
      const mode = resolveOutputMode(argv as { format?: string; auto?: boolean })
      createOutputContext(mode).fail([scaffoldError])
      process.exitCode = ExitCode.ValidationError
    })
```

Add to the imports at the top of `src/cli/index.ts`:

```typescript
import { ExitCode } from '../types/enums.js'
import type { ScaffoldError } from '../types/errors.js'
import { createOutputContext } from './output/context.js'
import { resolveOutputMode } from './middleware/output-mode.js'
```

- [ ] **Step 4: Route init's own failures through `fail()`**

Replace `src/cli/commands/init.ts:786-792`:

```typescript
          if (!result!.success) {
            output.fail(result!.errors)
            process.exitCode = result!.errors[0]?.exitCode ?? ExitCode.ValidationError
            return
          }
```

**Leave the `catch` block at `src/cli/commands/init.ts:841-848` exactly as it is.** It is rewritten by Task 8, in Release 2.

This boundary is deliberate. Routing that catch through `fail()` requires `toScaffoldError` (Task 8) and the `AutoFlagRequiredError` shape (Task 4), both of which live in Release 2. Reaching for them here would put Release 2 symbols in a Release 1 unit, which cannot compile. It would also drag Task 8's exit-code correction (2 to 1) into what is meant to be a non-breaking patch.

The consequence, stated plainly so it is not mistaken for an oversight: after Release 1 the **wizard** path emits a failure envelope, and the **`--from`** path still exits 2 with empty stdout under `--format json`. Acceptance criterion 2 is therefore only fully satisfied at Release 2, which is why Task 12 ships there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/cli/ && npm run build`
Expected: PASS

- [ ] **Step 6: Verify the end-to-end shape**

Verify against a path Release 1 actually fixes. `INIT_AUTO_FLAG_REQUIRED` does **not** exist yet: Task 4 introduces it in Release 2, and until then the discriminator check is still a bare `throw` that this handler deliberately re-throws. The wizard's preflight error is the Release 1 path, because it arrives via `result.errors` rather than an exception.

```bash
D="$(mktemp -d)"; cd "$D" && git init -q
node "$OLDPWD/dist/index.js" init --auto --format json \
  --project-type cli --cli-interactivity args-only >/dev/null 2>&1   # succeed once
node "$OLDPWD/dist/index.js" init --auto --format json \
  --project-type cli --cli-interactivity args-only > out.json 2>err.txt; echo "exit=$?"
jq -r '"\(.success) \(.errors[0].code) \(.exit_code)"' out.json
grep -c 'Web-App Configuration:' err.txt   # expected: 0
```
Expected: `exit=1`, `false INIT_SCAFFOLD_EXISTS 1`, and `0` usage-block lines.

Also verify the argument-error path, which Release 1 does close:

```bash
node "$OLDPWD/dist/index.js" init --format json --nonexistent-flag > arg.json 2>/dev/null; echo "exit=$?"
jq -r '.errors[0].code' arg.json    # expected: CLI_ARGUMENT_ERROR
```

- [ ] **Step 7: Commit**

```bash
git add src/cli/index.ts src/cli/commands/init.ts src/cli/index.test.ts
git commit -m "feat(cli): route failures through the output layer, drop the usage dump (F1, F4)"
```

**Agent-visible behavior:** every failure is at most a few lines on stderr plus a parseable envelope on stdout. The ~200-line help dump and the raw Node stack trace are gone.

**Breaking:** stderr formatting changes for humans. Not a machine contract; note in CHANGELOG.

---

## Task 6: Make non-TTY behave like `--auto`

Closes **F2**, gap **03**. Implements decision **D1 option A**.

**Files:**
- Modify: `src/cli/middleware/output-mode.ts:11-30`, `src/cli/output/interactive.ts:87-129`
- Test: `src/cli/middleware/output-mode.test.ts` (append)

**Interfaces:**
- Produces: `resolveOutputMode(argv, tty?)`. The optional second parameter defaults to real process state, keeping the function pure and testable in the style the existing tests use.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/middleware/output-mode.test.ts — append
describe('resolveOutputMode TTY detection', () => {
  it('returns "auto" when no flags are set and stdout is not a TTY', () => {
    expect(resolveOutputMode({}, { stdin: false, stdout: false })).toBe('auto')
  })

  it('returns "interactive" when no flags are set and both streams are TTYs', () => {
    expect(resolveOutputMode({}, { stdin: true, stdout: true })).toBe('interactive')
  })

  it('returns "auto" when only stdin is redirected', () => {
    expect(resolveOutputMode({}, { stdin: false, stdout: true })).toBe('auto')
  })

  it('still lets --format json win over a non-TTY', () => {
    expect(resolveOutputMode({ format: 'json' }, { stdin: false, stdout: false })).toBe('json')
  })
})

describe('createOutputModeMiddleware auto normalization', () => {
  it('sets argv.auto when the resolved mode is non-interactive', () => {
    const middleware = createOutputModeMiddleware()
    const argv: Record<string, unknown> = { format: 'json' }
    middleware(argv)
    expect(argv['auto']).toBe(true)
  })

  it('leaves argv.auto false in interactive mode', () => {
    const middleware = createOutputModeMiddleware()
    const argv: Record<string, unknown> = { auto: false }
    // Interactive requires a real TTY; in the test process stdout is not one,
    // so assert through resolveOutputMode's injectable form instead.
    void middleware
    expect(resolveOutputMode(argv, { stdin: true, stdout: true })).toBe('interactive')
  })

  // This is the only place the "json mode alone normalizes auto" claim can be
  // proved. The e2e helper always runs without a TTY, so a pass there cannot
  // distinguish json-mode normalization from non-TTY normalization. Here TTY
  // state is injected, so the two causes are separable.
  it('normalizes auto for json mode even when both streams ARE TTYs', () => {
    const tty = { stdin: true, stdout: true }
    expect(resolveOutputMode({ format: 'json' }, tty)).toBe('json')
    expect(resolveOutputMode({}, tty)).toBe('interactive')   // control: TTY alone does not
  })
})
```

Because `createOutputModeMiddleware` reads real process TTY state internally, give it the same injectable seam as `resolveOutputMode` so the assertion above can be made through the middleware too:

```typescript
// src/cli/middleware/output-mode.ts — signature only; body as in Step 3b
export function createOutputModeMiddleware(
  tty?: { stdin: boolean; stdout: boolean },
): (argv: Record<string, unknown>) => void
```

Pass `tty` straight through to `resolveOutputMode`. Production callers omit it and get real process state.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/middleware/output-mode.test.ts -t 'TTY detection'`
Expected: FAIL, `expected 'interactive' to be 'auto'`

- [ ] **Step 3: Implement**

```typescript
// src/cli/middleware/output-mode.ts — replace resolveOutputMode
/**
 * Resolve the output mode from parsed argv flags and environment.
 *
 * Priority:
 * 1. --format json  -> 'json'
 * 2. --auto         -> 'auto'
 * 3. Not a TTY      -> 'auto'   (an environment that cannot answer a prompt is
 *                                treated as non-interactive whether or not the
 *                                caller remembered --auto)
 * 4. Default        -> 'interactive'
 */
export function resolveOutputMode(
  argv: { format?: string; auto?: boolean },
  tty: { stdin: boolean; stdout: boolean } = {
    stdin: process.stdin.isTTY === true,
    stdout: process.stdout.isTTY === true,
  },
): OutputMode {
  if (argv.format === 'json') return 'json'
  if (argv.auto === true) return 'auto'
  if (!tty.stdin || !tty.stdout) return 'auto'
  return 'interactive'
}
```

- [ ] **Step 3b: Normalize `argv.auto` in the middleware — this is the half that actually closes the trap**

Changing the output context is **not sufficient on its own**. The discriminator checks in `src/wizard/questions.ts` are gated on `options.auto`, which `src/cli/commands/init.ts:686` populates from `argv.auto ?? false`, the *explicit flag*. Without this step a non-TTY run still falls through to `AutoOutput.select()` and takes `options[0]`, and the trap stays open while appearing fixed.

```typescript
// src/cli/middleware/output-mode.ts — replace createOutputModeMiddleware
/**
 * Resolve output mode and normalize `auto`.
 *
 * Any non-interactive mode implies auto. Commands read `argv.auto` to decide
 * whether a question may be defaulted, so normalizing here is what makes a
 * piped invocation behave identically to an explicit `--auto` one. Setting
 * only `outputMode` would change how answers are printed without changing
 * whether they may be invented.
 */
export function createOutputModeMiddleware(): (argv: Record<string, unknown>) => void {
  return (argv: Record<string, unknown>) => {
    const mode = resolveOutputMode(argv as { format?: string; auto?: boolean })
    argv['outputMode'] = mode
    if (mode !== 'interactive') argv['auto'] = true
  }
}
```

- [ ] **Step 4: Add the breadcrumb to the non-TTY interactive path**

`AutoOutput` delegates its non-prompt methods to `InteractiveOutput`, so `select` and `multiSelect` still resolve silently. Add the same breadcrumb `AutoOutput.prompt` already emits (`src/cli/output/auto.ts:33`):

```typescript
// src/cli/output/interactive.ts — in select(), replace the !canPrompt() branch
    if (!canPrompt()) {
      const chosen = defaultValue ?? normalized[0]?.value ?? ''
      process.stderr.write(`(auto) Using default for: ${message} -> ${chosen}\n`)
      return chosen
    }
```

```typescript
// src/cli/output/interactive.ts — in multiSelect(), replace the !canPrompt() branch
    if (!canPrompt()) {
      const chosen = defaults ?? []
      process.stderr.write(`(auto) Using default for: ${message} -> ${chosen.join(', ')}\n`)
      return chosen
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/cli/ src/wizard/`
Expected: PASS. Any existing test that asserted silent non-TTY success on a discriminator type will now fail; update those tests to assert the `INIT_AUTO_FLAG_REQUIRED` failure, because that is the behavior change this task ships.

- [ ] **Step 6: Verify the closed trap**

Run:
```bash
D="$(mktemp -d)"; cd "$D" && git init -q
node "$OLDPWD/dist/index.js" init --project-type web-app < /dev/null; echo "exit=$?"
test -f "$D/.scaffold/config.yml" && echo "REGRESSION: config was written" || echo "no config written"
```
Expected: `exit=1` with `INIT_AUTO_FLAG_REQUIRED`, and `no config written`. Before this task the same command exited 0 and wrote `renderingStrategy: spa`.

The second assertion is the one that matters. An earlier draft of this task changed only the output context, which made the command *print* differently while still writing the invented config. Checking the exit code alone would have passed that draft.

- [ ] **Step 7: Commit**

```bash
git add src/cli/middleware/output-mode.ts src/cli/output/interactive.ts src/cli/middleware/output-mode.test.ts
git commit -m "fix(cli)!: treat a non-TTY as --auto instead of silently defaulting (F2, gap 03)"
```

**Agent-visible behavior:** a piped `scaffold init` no longer answers its own questions. It either succeeds with flags the caller chose, or fails naming the flag it needs.

**Breaking: yes.** Scripts that pipe `init` for a discriminator project type without passing the discriminator now exit 1. Migration: none required beyond reading the error, which names the exact flag. CHANGELOG entry under "Behavior change", following the v3.48.0 `scaffold adopt` precedent (`src/cli/commands/adopt.ts:710`).

---

## Task 7: Refuse a typeless auto init

Closes **F3**, gap **04**.

**Files:**
- Modify: `src/wizard/questions.ts:131-145`
- Test: `src/wizard/questions.test.ts` (append)

**Interfaces:**
- Consumes: `AutoFlagRequiredError` from Task 4 (reused, with a different code).

- [ ] **Step 1: Write the failing test**

```typescript
// src/wizard/questions.test.ts — append
describe('auto-mode project type enforcement', () => {
  it('throws INIT_PROJECT_TYPE_REQUIRED when auto mode cannot resolve a project type', async () => {
    const output = createOutputContext('auto')
    await expect(
      askWizardQuestions({ auto: true, output } as never),
    ).rejects.toMatchObject({
      scaffoldError: {
        code: 'INIT_PROJECT_TYPE_REQUIRED',
        exitCode: ExitCode.ValidationError,
      },
    })
  })

  it('does not throw once both the type and its discriminator are resolved', async () => {
    // This asserts only that a fully-resolved input passes the two guards. It
    // does NOT test type inference: inference happens upstream in the
    // flag-family layer (src/cli/init-flag-families.ts), not here, so proving
    // it requires driving the real CLI. That case lives in Task 12's e2e suite
    // ("infers the project type from a type-specific flag alone").
    const output = createOutputContext('auto')
    await expect(
      askWizardQuestions({
        auto: true,
        projectType: 'cli',
        cliFlags: { cliInteractivity: 'args-only' },
        output,
      } as never),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wizard/questions.test.ts -t 'project type enforcement'`
Expected: FAIL, the promise resolves instead of rejecting

- [ ] **Step 3: Implement**

```typescript
// src/wizard/questions.ts — replace the block at 131-145
  // Project type question (skip if --project-type was provided)
  let projectType: ProjectType | undefined
  if (options.projectType) {
    projectType = options.projectType as ProjectType
  } else if (auto) {
    // Auto mode has no defensible default here: a config with no projectType
    // silently disables every type-conditional step, which is the exact class
    // of defect this refuses to produce.
    throw new AutoFlagRequiredError({
      code: 'INIT_PROJECT_TYPE_REQUIRED',
      message: 'A project type is required in auto mode',
      exitCode: ExitCode.ValidationError,
      recovery: `Pass --project-type <${ProjectTypeSchema.options.join('|')}>, `
        + 'or any type-specific flag such as --cli-interactivity, which implies the type',
    })
  } else {
    showBannerOnce()
    const ptCopy = coreCopy.projectType
    const selected = await output.select(
      'What type of project is this?',
      optionsFromCopy(ptCopy.options, [...ProjectTypeSchema.options]),
      'web-app',
      ptCopy,
    )
    projectType = selected as ProjectType
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wizard/`
Expected: PASS

- [ ] **Step 5: Verify**

Run:
```bash
cd "$(mktemp -d)" && git init -q
node "$OLDPWD/dist/index.js" init --auto --format json; echo "exit=$?"
```
Expected: `exit=1`, stdout parses with `errors[0].code === 'INIT_PROJECT_TYPE_REQUIRED'`. Before this task the same command exited 0 and wrote a config with no `projectType` key.

- [ ] **Step 6: Commit**

```bash
git add src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "fix(init)!: refuse a typeless auto init instead of reporting success (F3, gap 04)"
```

**Breaking: yes.** `scaffold init --auto` with no type flag now exits 1. Migration: pass `--project-type` or any type-specific flag. Same CHANGELOG entry as Task 6.

---

## Task 8: One error path per condition, with correct exit codes

Closes **F7**, gap **05**.

**Files:**
- Modify: `src/utils/user-errors.ts:1-5` (header comment) and append `toScaffoldError`; `src/cli/commands/init.ts:844`
- Test: `src/utils/user-errors.test.ts` (create), `src/cli/commands/init.test.ts` (append)

**Interfaces:**
- Produces: `toScaffoldError(err: ScaffoldUserError): ScaffoldError`. Task 5's temporary inline shim is replaced by this.

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/user-errors.test.ts
import { describe, it, expect } from 'vitest'
import {
  toScaffoldError, ExistingScaffoldError, FlagConflictError,
  InvalidYamlError, FromPathReadError, TTYStdinError,
} from './user-errors.js'
import { ExitCode } from '../types/enums.js'

describe('toScaffoldError', () => {
  it('maps ExistingScaffoldError to INIT_SCAFFOLD_EXISTS with exit 1', () => {
    const e = toScaffoldError(new ExistingScaffoldError('/tmp/p'))
    expect(e.code).toBe('INIT_SCAFFOLD_EXISTS')
    expect(e.exitCode).toBe(ExitCode.ValidationError)
    expect(e.recovery).toContain('--force')
  })

  it('maps every user-error subclass to a validation exit code with non-empty recovery', () => {
    const cases = [
      new FlagConflictError('--methodology'),
      new InvalidYamlError('cfg.yml', 'bad indent'),
      new InvalidConfigError('cfg.yml', 'methodology: invalid'),
      new FromPathReadError('cfg.yml', 'ENOENT'),
      new TTYStdinError(),
      new ExistingScaffoldError('/tmp/p'),
      new MultiServiceNotSupportedError('init'),
      new ServiceRequiredError('tech-stack'),
      new ServiceRejectedError('tech-stack'),
      new ServiceNotFoundError('api'),
      new ServiceFlagWithoutServicesError(),
      new MultiServiceOverlayMissingError(),
    ]
    for (const c of cases) {
      const mapped = toScaffoldError(c)
      expect(mapped.exitCode, `${c.name} exitCode`).toBe(ExitCode.ValidationError)
      expect(mapped.code, `${c.name} code`).toMatch(/^(INIT|RUN)_[A-Z_]+$/)
      expect(mapped.recovery ?? '', `${c.name} recovery`).not.toBe('')
    }
  })

  it('throws on an unmapped subclass rather than emitting a recovery-less error', () => {
    class NewlyAddedError extends ScaffoldUserError {
      constructor() { super('something new') }
    }
    expect(() => toScaffoldError(new NewlyAddedError())).toThrow(/Unmapped ScaffoldUserError/)
  })

  // The real exhaustiveness gate. The hand-written list above proves the
  // current subclasses behave; it cannot prove a FUTURE subclass was mapped,
  // because whoever forgets the mapping also forgets the list entry. This
  // reflects over the module's own exports, so adding an exported subclass
  // fails here with no list to maintain.
  it('has a mapping for every exported ScaffoldUserError subclass', async () => {
    const mod = await import('./user-errors.js')
    const subclasses = Object.values(mod).filter(
      (v): v is new (...args: never[]) => ScaffoldUserError =>
        typeof v === 'function'
        && v !== mod.ScaffoldUserError
        && v.prototype instanceof mod.ScaffoldUserError,
    )
    expect(subclasses.length).toBeGreaterThanOrEqual(12)
    const unmapped = subclasses
      .map(Cls => Cls.name)
      .filter(name => !(name in USER_ERROR_CODES))
    expect(unmapped, `unmapped subclasses: ${unmapped.join(', ')}`).toEqual([])
  })

  it('gives every mapped entry a non-empty recovery', () => {
    for (const [name, entry] of Object.entries(USER_ERROR_CODES)) {
      expect(entry.recovery, `${name} recovery`).toBeTruthy()
      expect(entry.recovery.length, `${name} recovery`).toBeGreaterThan(10)
    }
  })
})
```

This requires exporting the map: change `const USER_ERROR_CODES` to `export const USER_ERROR_CODES` in `src/utils/user-errors.ts`, and import it plus `ScaffoldUserError` in the test.

The `>= 12` floor is deliberate. A refactor that stopped exporting the subclasses would otherwise leave `subclasses` empty and the `unmapped` assertion trivially green, so the gate would silently stop gating.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/user-errors.test.ts`
Expected: FAIL, `toScaffoldError is not exported`

- [ ] **Step 3: Fix the header comment**

```typescript
// src/utils/user-errors.ts — replace lines 1-5
/**
 * Base class for user-facing errors that the CLI handler layer normalizes
 * to a coded ScaffoldError via toScaffoldError(). Every subclass maps to
 * ExitCode.ValidationError (1); exit code 2 is MissingDependency
 * (src/types/enums.ts:20) and must not be used for input errors.
 * Internal errors that should surface as stack traces do NOT extend this.
 */
```

- [ ] **Step 4: Add the mapper**

```typescript
// src/utils/user-errors.ts — append after isScaffoldUserError
import { ExitCode } from '../types/enums.js'
import type { ScaffoldError } from '../types/errors.js'

// `recovery` is REQUIRED, not optional. The global constraint and acceptance
// criterion 4 both say every user-facing failure names its own fix, so a
// mapping that permits an entry without one would let that guarantee rot
// silently. The type enforces it; the exhaustiveness test below enforces that
// every subclass has an entry.
const USER_ERROR_CODES: Record<string, { code: string; recovery: string }> = {
  ExistingScaffoldError: {
    code: 'INIT_SCAFFOLD_EXISTS',
    recovery: 'Use --force to back up and reinitialize',
  },
  FlagConflictError: {
    code: 'INIT_FLAG_CONFLICT',
    recovery: 'Use --from on its own, or drop --from and pass the config flags directly',
  },
  InvalidYamlError: {
    code: 'INIT_INVALID_YAML',
    recovery: 'Fix the reported YAML syntax error and re-run',
  },
  InvalidConfigError: {
    code: 'INIT_INVALID_CONFIG',
    recovery: 'Correct the fields listed in the message and re-run',
  },
  FromPathReadError: {
    code: 'INIT_FROM_READ_FAILED',
    recovery: 'Check the --from path exists and is readable',
  },
  TTYStdinError: {
    code: 'INIT_FROM_TTY_STDIN',
    recovery: 'Pipe the config in: cat config.yml | scaffold init --from=-',
  },
  MultiServiceNotSupportedError: {
    code: 'INIT_MULTI_SERVICE_UNSUPPORTED',
    recovery: 'Remove services[] from the config, or run the per-service commands directly',
  },
  ServiceRequiredError: {
    code: 'RUN_SERVICE_REQUIRED',
    recovery: 'Pass --service <name>, using a name from services[] in .scaffold/config.yml',
  },
  ServiceRejectedError: {
    code: 'RUN_SERVICE_REJECTED',
    recovery: 'Drop --service; this step runs once across all services',
  },
  ServiceNotFoundError: {
    code: 'RUN_SERVICE_NOT_FOUND',
    recovery: 'Use a service name listed under services[] in .scaffold/config.yml',
  },
  ServiceFlagWithoutServicesError: {
    code: 'RUN_SERVICE_WITHOUT_SERVICES',
    recovery: 'Drop --service, or add a services[] block to .scaffold/config.yml',
  },
  MultiServiceOverlayMissingError: {
    code: 'INIT_OVERLAY_MISSING',
    recovery: 'Add multi-service-overlay.yml, or remove services[] from the config',
  },
}

/**
 * Normalize a ScaffoldUserError into the coded ScaffoldError the CLI emits.
 *
 * Throws on an unmapped subclass rather than falling back to a generic code.
 * A silent fallback would emit an error with no actionable recovery, which is
 * the exact failure mode this plan exists to remove; failing loudly during
 * development is strictly better than shipping an unhelpful error.
 */
export function toScaffoldError(err: ScaffoldUserError): ScaffoldError {
  const mapped = USER_ERROR_CODES[err.name]
  if (!mapped) {
    throw new Error(
      `Unmapped ScaffoldUserError subclass "${err.name}". `
      + 'Add it to USER_ERROR_CODES with a code and an actionable recovery string.',
    )
  }
  return {
    code: mapped.code,
    message: err.message,
    exitCode: ExitCode.ValidationError,
    recovery: mapped.recovery,
  }
}
```

- [ ] **Step 5: Rewrite the `init.ts` catch block — this is the step that closes F4 on the `--from` path**

Task 5 deliberately left `src/cli/commands/init.ts:841-848` untouched so Release 1 would carry no Release 2 symbols. This step is where it is finally replaced. Without it the mapper is dead code: `--from` failures stay uncoded, keep exit 2, and still produce empty stdout under `--format json`, so Task 12's "never exits non-zero with empty stdout" case cannot pass.

Update the import:

```typescript
import { TTYStdinError, isScaffoldUserError, toScaffoldError } from '../../utils/user-errors.js'
```

Replace the catch:

```typescript
    } catch (err) {
      // Errors that already carry a ScaffoldError (AutoFlagRequiredError from
      // Task 4, and anything later adopting the same shape) are forwarded as
      // they are. Structural check rather than `instanceof` so this does not
      // depend on the class identity.
      const carried = (err as { scaffoldError?: ScaffoldError } | null)?.scaffoldError
      if (carried) {
        output.fail([carried])
        process.exitCode = carried.exitCode
        return
      }
      if (isScaffoldUserError(err)) {
        const scaffoldError = toScaffoldError(err)
        output.fail([scaffoldError])
        process.exitCode = scaffoldError.exitCode
        return
      }
      // Genuine internal failure: let it surface as a stack trace rather than
      // be mislabelled as bad user input.
      throw err
    }
```

Add `import type { ScaffoldError } from '../../types/errors.js'` if it is not already imported.

This follows the `fail()` call convention from Global Constraints: the array form, the exit code read from the error, and no hardcoded literal.

- [ ] **Step 6: Write the convergence test**

```typescript
// src/cli/commands/init.test.ts — append
describe('already-initialized convergence', () => {
  it('reports INIT_SCAFFOLD_EXISTS with exit 1 on both the wizard and --from paths', () => {
    const fromWizard = toScaffoldError(new ExistingScaffoldError('/tmp/p'))
    expect(fromWizard.code).toBe('INIT_SCAFFOLD_EXISTS')
    expect(fromWizard.exitCode).toBe(ExitCode.ValidationError)
    // wizard.ts:293-299 already emits the same code and exit code
  })
})
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/utils/ src/cli/commands/init.test.ts && npm run build`
Expected: PASS

- [ ] **Step 8: Verify both paths converge**

Run:
```bash
D="$(mktemp -d)"; cd "$D" && git init -q
node "$OLDPWD/dist/index.js" init --auto --project-type cli --cli-interactivity args-only >/dev/null 2>&1
node "$OLDPWD/dist/index.js" init --auto --project-type cli --cli-interactivity args-only 2>&1 | grep -o 'INIT_SCAFFOLD_EXISTS'; echo "wizard exit=$?"
printf 'version: 2\nmethodology: mvp\n' | node "$OLDPWD/dist/index.js" init --from=- 2>&1 | grep -o 'INIT_SCAFFOLD_EXISTS'; echo "from exit=$?"
```
Expected: both print `INIT_SCAFFOLD_EXISTS`. Before this task the second printed an uncoded message and exited 2.

- [ ] **Step 9: Commit**

```bash
git add src/utils/user-errors.ts src/utils/user-errors.test.ts src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "fix(init)!: one coded error and one exit code per condition (F7, gap 05)"
```

**Breaking: yes.** The `--from` path's error conditions move from exit 2 to exit 1. Exit 2 means `MissingDependency`, so the old value was wrong. CHANGELOG entry under "Behavior change".

---

## Task 9: Fix `--from`

Closes **F6**, gap **07**.

**Files:**
- Modify: `src/cli/commands/init.ts:177-180` (option declaration), `:828-838` (result emission)
- Test: `src/cli/commands/init.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/init.test.ts — append
describe('--from input handling', () => {
  it('declares requiresArg so a bare "-" is consumed as the value', async () => {
    const captured: Record<string, { requiresArg?: boolean }> = {}
    const fake = {
      option(name: string, cfg: { requiresArg?: boolean }) { captured[name] = cfg; return this },
      group() { return this }, check() { return this }, middleware() { return this },
    }
    const initCommand = (await import('./init.js')).default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initCommand.builder(fake as any)
    expect(captured['from']?.requiresArg).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/init.test.ts -t 'from input handling'`
Expected: FAIL, `expected undefined to be true`

- [ ] **Step 3: Add `requiresArg`**

```typescript
// src/cli/commands/init.ts — replace the from option at 177-180
      .option('from', {
        type: 'string',
        requiresArg: true,
        describe: 'Path to a ScaffoldConfig YAML file, or "-" for stdin. Exclusive with config-setting flags.',
      })
```

- [ ] **Step 4: Emit a result on the `--from` path**

```typescript
// src/cli/commands/init.ts — replace the branch at 828-838
          const emitted = result ?? {
            success: true as const,
            projectRoot,
            configPath: path.join(projectRoot, '.scaffold', 'config.yml'),
            methodology: loadedConfig?.methodology ?? 'unknown',
            errors: [],
          }
          if (outputMode === 'json') {
            output.result({ ...emitted, buildResult: buildResult.data ?? null })
          } else {
            output.success(`Scaffold initialized at ${emitted.configPath}`)
          }
```

`loadedConfig` is the parsed `ScaffoldConfig` already in scope on the `--from` path. If it is not in scope at this point, hoist it to the outer handler scope alongside `result`.

- [ ] **Step 5: Run tests and verify end to end**

Run: `npx vitest run src/cli/commands/init.test.ts && npm run build`

Then:
```bash
D="$(mktemp -d)"; cd "$D" && git init -q
printf 'version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\n' > cfg.yml
cat cfg.yml | node "$OLDPWD/dist/index.js" init --from - --format json; echo "exit=$?"
```
Expected: `exit=0`, and stdout is a non-empty JSON object with `success:true` and a `data.configPath`. Before this task the space form exited 1 with `Unknown argument: -`, and the equals form exited 0 with zero bytes on stdout.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "fix(init): accept --from - and emit its result envelope (F6, gap 07)"
```

**Breaking:** No. Both are bug fixes to documented behavior.

---

## Task 13: Route adopt's failures through the envelope

Closes the **F4** gap on the adopt path, and is a prerequisite for Task 12's brownfield assertions. Numbered 13 because it was added after the first review; it executes here, between Tasks 9 and 10.

Without this task, `scaffold adopt --format json --apply` and the plan-drift refusal still exit 1 with empty stdout, and Task 12's brownfield cases (`ADOPT_APPLY_NON_INTERACTIVE`, `ADOPT_PLAN_DRIFT`) cannot pass. Task 1 adds the capability; no task was routing adopt into it.

**Files:**
- Modify: `src/cli/commands/adopt.ts` (the `ADOPT_APPLY_NON_INTERACTIVE` path near line 600, the `ADOPT_PLAN_DRIFT` path, and the command's terminal error handling)
- Test: `src/cli/commands/adopt.result-shape.test.ts` (append)

**Interfaces:**
- Consumes: `OutputContext.fail` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/adopt.result-shape.test.ts — append
describe('adopt failure envelope', () => {
  it('emits success:false with a coded error for a bare --apply', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c)); return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await runAdopt({ auto: true, format: 'json', apply: true, root: fixtureRoot } as never)
      .catch(() => undefined)
    spy.mockRestore()
    vi.restoreAllMocks()
    const parsed = JSON.parse(out.join(''))
    expect(parsed.success).toBe(false)
    expect(parsed.errors[0].code).toBe('ADOPT_APPLY_NON_INTERACTIVE')
    expect(parsed.errors[0].recovery).toContain('--plan-key')
    expect(parsed.exit_code).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/adopt.result-shape.test.ts -t 'failure envelope'`
Expected: FAIL with `Unexpected end of JSON input` (stdout is currently empty on this path)

- [ ] **Step 3: Route adopt's terminal errors through `fail()`**

The sites are enumerated rather than described, so "every site" is checkable. `src/cli/commands/adopt.ts` has **10** `output.error(` calls; each is followed by a non-zero `process.exitCode`. Convert all ten:

| Line | Site | Exit code today | Note |
|---|---|---|---|
| 535 | `asScaffoldError(err, 'ADOPT_INTERNAL', …)` | 1 | already ScaffoldError-shaped |
| 548 | `adoptResult.errors` loop | `errors[0].exitCode` | pass the whole array to one `fail()` call |
| 558 | `planErrors` loop | `planErrors[0].exitCode` | same |
| 571 | inline error literal | 1 | needs a `recovery` string added |
| 581 | inline error literal | 1 | needs a `recovery` string added |
| 597 | `ADOPT_APPLY_NON_INTERACTIVE` | 1 | recovery names `--plan` / `--plan-key` |
| 612 | `lockResult.error` | **3** (`StateCorruption`) | preserve 3; do not normalize to 1 |
| 633 | `asScaffoldError(err, 'ADOPT_INTERNAL', …)` | 1 | |
| 641 | `liveErrors` loop | `liveErrors[0].exitCode` | pass the array |
| 659 | inline error literal (plan drift) | 1 | recovery names the re-render command |

Two things this survey settles. The file already builds `ScaffoldError` values via its own `asScaffoldError` helper, so most conversions are mechanical: `output.error(X); process.exitCode = Y` becomes `output.fail([X], Y)`. And line 612 carries `ExitCode.StateCorruption` (3), which must be preserved rather than flattened to `ValidationError` — the loop sites likewise pass their arrays so per-error exit codes survive.

Apply this shape at each site:

```typescript
// Pattern to apply at each adopt failure site.
output.fail([{
  code: 'ADOPT_APPLY_NON_INTERACTIVE',
  message: 'Bare --apply is interactive-only. In automation, pass the approved plan.',
  exitCode: ExitCode.ValidationError,
  recovery: 'Pass --plan <path> or --plan-key <sha256> from a rendered plan',
}])
process.exitCode = ExitCode.ValidationError
return
```

```typescript
output.fail([{
  code: 'ADOPT_PLAN_DRIFT',
  message: driftMessage,   // the existing message, unchanged
  exitCode: ExitCode.ValidationError,
  recovery: 'Re-render with `scaffold adopt --write`, then re-run --apply against the new plan key',
}])
process.exitCode = ExitCode.ValidationError
return
```

Apply the same treatment to every remaining site in the table. Do not stop at the two named above: the acceptance criterion is that no adopt failure exits non-zero with empty stdout, so each of the ten must be converted.

Completion check for this step, which is why the count is stated:

```bash
grep -c "output.error(" src/cli/commands/adopt.ts   # expected: 0
grep -c "output.fail(" src/cli/commands/adopt.ts    # expected: 10
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/commands/ && npm run build`
Expected: PASS

- [ ] **Step 5: Verify end to end**

Run:
```bash
D="$(mktemp -d)"; cd "$D" && git init -q
printf '{"name":"x","dependencies":{"express":"^4.19.0"}}\n' > package.json
git add -A && git -c user.email=t@t.co -c user.name=t commit -qm i
node "$OLDPWD/dist/index.js" adopt --auto --format json --apply > out.json 2>/dev/null; echo "exit=$?"
jq -r '.errors[0].code' out.json
```
Expected: `exit=1` and `ADOPT_APPLY_NON_INTERACTIVE`

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/adopt.ts src/cli/commands/adopt.result-shape.test.ts
git commit -m "feat(adopt): emit the failure envelope on terminal errors (F4)"
```

**Agent-visible behavior:** `scaffold adopt --format json` failures now carry a parseable envelope on stdout instead of exiting with nothing to read.

**Breaking:** No. Stdout goes from empty to populated on failure; exit codes are unchanged.

---

## Task 10: Publish the exit-code and envelope contracts

Closes **F8**, gap **05**, and the documentation half of gaps **02** and **08**. Also carries the **F9** note.

**Files:**
- Modify: `content/guides/cli/index.md`
- Create: `tests/guides-agent-contract.bats`
- Regenerate: `content/guides/cli/index.html` via `scaffold guides --build`

- [ ] **Step 1: Write the failing test**

```bash
# tests/guides-agent-contract.bats
#!/usr/bin/env bats

CLI_GUIDE="content/guides/cli/index.md"
ENUM="src/types/enums.ts"

@test "cli guide documents every ExitCode name paired with its numeric value" {
  # Name alone is not enough: a value could change in the enum while the guide
  # kept the old number and a name-only grep stayed green. Assert the pair.
  run bash -c "grep -oE '^  [A-Za-z]+ = [0-9]+' '$ENUM' | tr -d ' '"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  for pair in $output; do
    name="${pair%%=*}"
    value="${pair##*=}"
    # The guide's table row must carry both the number and the name.
    grep -qE "^\|[[:space:]]*${value}[[:space:]]*\|[^|]*\`?${name}\`?" "$CLI_GUIDE" || {
      echo "ExitCode.${name} = ${value} is not documented as a matching pair in $CLI_GUIDE"
      return 1
    }
  done
}

@test "cli guide exit-code table has no rows for values absent from the enum" {
  run bash -c "grep -oE '^\|[[:space:]]*[0-9]+[[:space:]]*\|' '$CLI_GUIDE' | tr -dc '0-9\n'"
  [ "$status" -eq 0 ]
  for value in $output; do
    grep -qE "^  [A-Za-z]+ = ${value}\$" "$ENUM" || {
      echo "Guide documents exit code ${value}, which no longer exists in $ENUM"
      return 1
    }
  done
}

@test "cli guide documents the failure envelope shape" {
  grep -q '"success": false' "$CLI_GUIDE"
  grep -q 'exit_code' "$CLI_GUIDE"
}

@test "cli guide documents the auto-required discriminator flags" {
  grep -q 'required with --auto' "$CLI_GUIDE"
  grep -q 'cli-interactivity' "$CLI_GUIDE"
  grep -q 'web-rendering' "$CLI_GUIDE"
}

@test "cli guide states plan_key is content-addressed, not repo-scoped" {
  grep -qi 'plan_key' "$CLI_GUIDE"
  grep -qi 'content-addressed' "$CLI_GUIDE"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/guides-agent-contract.bats`
Expected: FAIL on all four, the guide has no exit-code table

- [ ] **Step 3: Add the agent section to the CLI guide**

Append to `content/guides/cli/index.md`:

````markdown
## Driving scaffold from an agent

Every command below is safe to run with no TTY. Pass `--format json` and read
stdout; human-readable progress goes to stderr and can be discarded.

### Exit codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | `Success` | The command did what was asked. |
| 1 | `ValidationError` | Bad or missing input. `errors[0].recovery` names the fix. |
| 2 | `MissingDependency` | A required external tool is absent. |
| 3 | `StateCorruption` | `.scaffold/state.json` could not be read or migrated. |
| 4 | `UserCancellation` | An interactive prompt was cancelled. |
| 5 | `BuildError` | Adapter generation failed. |
| 6 | `Ambiguous` | Operator action required, such as detection finding two equally plausible project types. Re-run with `--project-type`. |

Source of truth: `src/types/enums.ts`.

### The output envelope

Success:

```json
{"success": true, "data": { }, "errors": [], "warnings": [], "exit_code": 0}
```

Failure:

```json
{"success": false, "data": null, "errors": [{"code": "INIT_AUTO_FLAG_REQUIRED", "message": "--cli-interactivity is required in auto mode for cli projects", "exitCode": 1, "recovery": "Pass --cli-interactivity <args-only|interactive|hybrid>"}], "warnings": [], "exit_code": 1}
```

Branch on `success`. Every failure carries at least one entry in `errors`, and
every entry carries a `recovery` string naming the flag or command that fixes it.

### Choosing `init` or `adopt`

Run `scaffold adopt` when the directory already contains source code or docs.
It initializes `.scaffold/` itself, so no separate `scaffold init` is needed,
and it selects the `brownfield` methodology. Run `scaffold init` for an empty
or brand-new directory.

### Flags `--auto` cannot default

Nine project types need one flag chosen explicitly, because there is no
defensible default. They are annotated `[required with --auto]` in
`scaffold init --help`.

| `--project-type` | Required flag |
|---|---|
| `web-app` | `--web-rendering` |
| `backend` | `--backend-api-style` |
| `cli` | `--cli-interactivity` |
| `library` | `--lib-visibility` |
| `mobile-app` | `--mobile-platform` |
| `data-pipeline` | `--pipeline-processing` |
| `ml` | `--ml-phase` |
| `research` | `--research-driver` |
| `mcp-server` | `--mcp-language` |

`game`, `browser-extension`, `macos-native`, `data-science` and `web3` need none.
Passing a type-specific flag implies its project type, so
`scaffold init --auto --cli-interactivity args-only` is sufficient on its own.

### The driving loop

```bash
scaffold next --format json          # .data.eligible[].command is runnable as-is
scaffold run <slug>                  # prints the assembled meta-prompt on stdout
scaffold complete <slug> --format json
```

Repeat until `.data.pipeline_complete` is `true`.

### Adoption plan keys

`plan_key` is content-addressed: it hashes the plan's dispositions and
initialize payload, and deliberately excludes `project_root` and `generated_at`
(`src/project/adoption-plan.ts:85-90`). Two repos whose plans are identical
therefore share a key. Do not cache a key across repositories, and always read
the key from the plan you just rendered.
````

- [ ] **Step 4: Regenerate and verify**

Run: `scaffold guides --build && bats tests/guides-agent-contract.bats && make guides-check`
Expected: PASS on all four bats tests, and no drift

- [ ] **Step 5: Commit**

```bash
git add content/guides/cli/index.md content/guides/cli/index.html tests/guides-agent-contract.bats
git commit -m "docs(guides): publish exit-code, envelope and auto-flag contracts (F8, F9, gaps 02/05/08)"
```

**Breaking:** No.

---

## Task 11: Repair the stale install guide and the runner skill

Closes **F5**, gap **06**, and the skill half of gap **08**.

**Files:**
- Modify: `content/guides/install/index.md:120-153`, `content/skills/scaffold-runner/SKILL.md`
- Test: `tests/guides-agent-contract.bats` (append)
- Regenerate: `content/guides/install/index.html`

- [ ] **Step 1: Write the failing test**

```bash
# tests/guides-agent-contract.bats — append

INSTALL_GUIDE="content/guides/install/index.md"

@test "install guide no longer presents --dry-run as the adopt preview" {
  ! grep -q 'Preview the changes first with `--dry-run`' "$INSTALL_GUIDE"
}

@test "install guide documents the plan-then-apply contract" {
  grep -q -- '--apply' "$INSTALL_GUIDE"
  grep -q -- '--plan-key' "$INSTALL_GUIDE"
}

@test "install guide does not tell users to run init before adopt" {
  ! grep -q 'scaffold init, then' "$INSTALL_GUIDE"
  ! grep -q 'The usual sequence for an existing codebase: `scaffold init`' "$INSTALL_GUIDE"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/guides-agent-contract.bats`
Expected: FAIL on all three

- [ ] **Step 3: Replace the mermaid diagram at line 120-128**

````markdown
```mermaid
flowchart TD
  A[New or existing project] --> B{Directory already has<br/>code or docs?}
  B -->|No, brand new| C["scaffold init<br/>wizard + config + skills"]
  B -->|Yes| D["scaffold adopt<br/>renders a plan, then --apply"]
  C --> E[Run the pipeline]
  D --> E
```
````

- [ ] **Step 4: Replace the `scaffold adopt` section at lines 140-153**

````markdown
### `scaffold adopt`

`scaffold adopt` adopts an existing project into Scaffold
(:cite[src/cli/commands/adopt.ts:168]). It classifies the project as
`greenfield`, `brownfield`, or `v1-migration` (:cite[src/project/adopt.ts:72]),
discovers which pipeline outputs you already have on disk, and proposes marking
the corresponding steps complete.

**It writes nothing by default.** Since v3.48.0 `adopt` renders an Adoption Plan
and stops. To execute it, pass `--apply` together with the approved plan:

```bash
scaffold adopt                                # render the plan, write nothing
scaffold adopt --write                        # also write docs/adoption-plan.md
scaffold adopt --format json                  # machine-readable plan, includes plan_key
scaffold adopt --apply --plan-key <sha256>    # execute the approved plan
```

`--dry-run` is deprecated and does nothing: plan mode is already the default
(:cite[src/cli/commands/adopt.ts:117]).

**`adopt` initializes for you.** It writes `.scaffold/` config and state itself
and selects the `brownfield` methodology. Do not run `scaffold init` first on an
existing codebase: `init` would select `deep` and adopt would then have to
replace it.
````

- [ ] **Step 5: Update the runner skill activation**

In `content/skills/scaffold-runner/SKILL.md`, replace the `description` frontmatter value and the "Activates when" paragraph so the skill also covers the pre-init state:

```markdown
**Activates when** the user says "run scaffold &lt;step&gt;", "scaffold
&lt;step&gt;", "what's next?", "scaffold status", "start building", is working
in a project with a `.scaffold/` directory, or asks to set scaffold up in a
project that has none yet.

**Before `.scaffold/` exists,** pick the bootstrap command from the directory:
an empty or brand-new directory takes `scaffold init`; a directory that already
has source code or docs takes `scaffold adopt`, which initializes state itself
and selects the `brownfield` methodology. Never run `init` before `adopt` on an
existing codebase.
```

- [ ] **Step 6: Regenerate and verify**

Run: `scaffold guides --build && bats tests/guides-agent-contract.bats && make guides-check && make check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add content/guides/install/index.md content/guides/install/index.html content/skills/scaffold-runner/SKILL.md tests/guides-agent-contract.bats
git commit -m "docs(guides): correct adopt guidance and skill bootstrap rule (F5, gaps 06/08)"
```

**Breaking:** No.

---

## Task 12: The acceptance test

Defines and enforces "fully agent-drivable" for both paths.

**Files:**
- Create: `src/e2e/agent-drivability.test.ts`

**Interfaces:**
- Consumes: every behavior established by Tasks 1 through 11.

- [ ] **Step 1: Write the failing test**

```typescript
// src/e2e/agent-drivability.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CLI = path.resolve('dist/index.js')

/**
 * Run the CLI exactly as an agent would: no TTY, stdin closed, JSON out.
 *
 * The timeout is load-bearing, not defensive. This suite's headline property is
 * "no invocation hangs". Without a bound, a regression that waits on input
 * would hang CI forever instead of failing a test, so the very thing being
 * asserted would be the thing that stops the assertion from running.
 */
const RUN_TIMEOUT_MS = 60_000

function run(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: RUN_TIMEOUT_MS,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as {
      status: number | null; stdout: string; stderr: string
      killed?: boolean; signal?: string; code?: string
    }
    if (err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      throw new Error(
        `scaffold ${args.join(' ')} did not exit within ${RUN_TIMEOUT_MS}ms. `
        + 'A command waited for input that an agent cannot supply, which is the '
        + 'exact failure this suite exists to catch.',
      )
    }
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-agent-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

beforeAll(() => {
  expect(fs.existsSync(CLI), 'run `npm run build` first').toBe(true)
})

describe('agent-drivability: every failure is parseable', () => {
  it('emits a failure envelope on stdout when the discriminator flag is missing', () => {
    const dir = tmpRepo()
    const r = run(['init', '--auto', '--format', 'json', '--project-type', 'cli'], dir)
    expect(r.code).toBe(1)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.exit_code).toBe(1)
    expect(parsed.errors[0].code).toBe('INIT_AUTO_FLAG_REQUIRED')
    expect(parsed.errors[0].recovery).toContain('--cli-interactivity')
    expect(r.stderr).not.toContain('Web-App Configuration:')
  })

  it('emits a failure envelope when no project type resolves', () => {
    const dir = tmpRepo()
    const r = run(['init', '--auto', '--format', 'json'], dir)
    expect(r.code).toBe(1)
    expect(JSON.parse(r.stdout).errors[0].code).toBe('INIT_PROJECT_TYPE_REQUIRED')
  })

  it('never exits non-zero with empty stdout under --format json', () => {
    const dir = tmpRepo()
    for (const args of [
      ['init', '--auto', '--format', 'json'],
      ['init', '--auto', '--format', 'json', '--project-type', 'web-app'],
      ['status', '--format', 'json'],
    ]) {
      const r = run(args, dir)
      if (r.code !== 0) {
        expect(r.stdout.trim(), `${args.join(' ')} produced empty stdout`).not.toBe('')
        expect(() => JSON.parse(r.stdout)).not.toThrow()
      }
    }
  })
})

describe('agent-drivability: path (a) new project', () => {
  it('drives init through the pipeline loop with no human input', () => {
    const dir = tmpRepo()

    const init = run(
      ['init', '--auto', '--format', 'json', '--project-type', 'cli', '--cli-interactivity', 'args-only'],
      dir,
    )
    expect(init.code).toBe(0)
    const initData = JSON.parse(init.stdout)
    expect(initData.success).toBe(true)
    expect(initData.data.configPath).toContain('.scaffold/config.yml')

    // No silently-chosen project type: the config records what the flags asked for.
    const config = fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf-8')
    expect(config).toContain('projectType: cli')

    const next = run(['next', '--format', 'json'], dir)
    expect(next.code).toBe(0)
    const nextData = JSON.parse(next.stdout)
    expect(nextData.data.eligible.length).toBeGreaterThan(0)
    expect(nextData.data.eligible[0].command).toMatch(/^scaffold run /)
    expect(nextData.data.pipeline_complete).toBe(false)

    const slug = nextData.data.eligible[0].slug
    const step = run(['run', slug], dir)
    expect(step.code).toBe(0)
    expect(step.stdout.length).toBeGreaterThan(100)

    const complete = run(['complete', slug, '--format', 'json'], dir)
    expect(complete.code).toBe(0)
    expect(JSON.parse(complete.stdout).success).toBe(true)
  })

  it('refuses to guess when a piped invocation omits --auto', () => {
    const dir = tmpRepo()
    const r = run(['init', '--project-type', 'web-app'], dir)
    expect(r.code).toBe(1)
    // The config assertion is the load-bearing one. An implementation that
    // changes only the output context fails here while passing on exit code.
    expect(fs.existsSync(path.join(dir, '.scaffold', 'config.yml'))).toBe(false)
  })

  it('infers the project type from a type-specific flag alone', () => {
    const dir = tmpRepo()
    const r = run(['init', '--auto', '--format', 'json', '--cli-interactivity', 'args-only'], dir)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout).success).toBe(true)
    const config = fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf-8')
    expect(config).toContain('projectType: cli')
  })

  it('emits a parseable envelope for an argument error', () => {
    const dir = tmpRepo()
    const r = run(['init', '--format', 'json', '--nonexistent-flag'], dir)
    expect(r.code).not.toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.errors[0].code).toBe('CLI_ARGUMENT_ERROR')
  })

  it('requires a discriminator under --format json', () => {
    // NOT a TTY test. This helper always runs with stdin closed and stdout
    // piped, so a pass here could equally be explained by non-TTY
    // normalization. It is kept as a regression guard on the observable
    // command behavior; the claim that *json mode alone* normalizes argv.auto
    // is proved in Task 6's middleware test, where TTY state is injectable.
    const dir = tmpRepo()
    const r = run(['init', '--format', 'json', '--project-type', 'web-app'], dir)
    expect(r.code).toBe(1)
    expect(JSON.parse(r.stdout).errors[0].code).toBe('INIT_AUTO_FLAG_REQUIRED')
    expect(fs.existsSync(path.join(dir, '.scaffold', 'config.yml'))).toBe(false)
  })
})

describe('agent-drivability: path (b) brownfield', () => {
  function brownfieldRepo(): string {
    const dir = tmpRepo()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'acme-api', type: 'module',
      dependencies: { express: '^4.19.0', pg: '^8.11.0' },
    }))
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'server.js'), 'export default {}\n')
    fs.writeFileSync(path.join(dir, 'README.md'), '# Acme API\n')
    execFileSync('git', ['add', '-A'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t.co', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir })
    return dir
  }

  it('plans without writing, then applies by key, with no prior init', () => {
    const dir = brownfieldRepo()

    const plan = run(['adopt', '--auto', '--format', 'json'], dir)
    expect(plan.code).toBe(0)
    const planData = JSON.parse(plan.stdout)
    expect(planData.data.plan_key).toMatch(/^[0-9a-f]{64}$/)
    expect(planData.data.mode).toBe('brownfield')

    // Plan mode writes nothing.
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' })
    expect(dirty.trim()).toBe('')

    const apply = run(
      ['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', planData.data.plan_key],
      dir,
    )
    expect(apply.code).toBe(0)
    const applyData = JSON.parse(apply.stdout)
    expect(applyData.data.applied).toBe(true)
    expect(applyData.data.initialized).toBe(true)
    expect(applyData.data.doctor.verdict).toBe('healthy')

    const next = run(['next', '--format', 'json'], dir)
    expect(next.code).toBe(0)
    expect(JSON.parse(next.stdout).data.eligible[0].command).toMatch(/^scaffold run /)
  })

  it('reports drift and bare-apply refusals as parseable failures', () => {
    const dir = brownfieldRepo()

    const bare = run(['adopt', '--auto', '--format', 'json', '--apply'], dir)
    expect(bare.code).toBe(1)
    expect(JSON.parse(bare.stdout).errors[0].code).toBe('ADOPT_APPLY_NON_INTERACTIVE')

    const wrong = run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', 'deadbeef'], dir)
    expect(wrong.code).toBe(1)
    expect(JSON.parse(wrong.stdout).errors[0].code).toBe('ADOPT_PLAN_DRIFT')
  })

  it('is idempotent on re-apply', () => {
    const dir = brownfieldRepo()
    const k1 = JSON.parse(run(['adopt', '--auto', '--format', 'json'], dir).stdout).data.plan_key
    run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', k1], dir)
    const k2 = JSON.parse(run(['adopt', '--auto', '--format', 'json'], dir).stdout).data.plan_key
    const again = run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', k2], dir)
    expect(again.code).toBe(0)
    expect(JSON.parse(again.stdout).data.initialized).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run --config vitest.e2e.config.ts src/e2e/agent-drivability.test.ts`
Expected: FAIL until Tasks 1 through 9 have landed. Before Task 1, the first failure is `Unexpected end of JSON input` on the empty stdout of a failing command.

- [ ] **Step 3: Confirm it passes once the code tasks land**

Run: `npm run build && npx vitest run --config vitest.e2e.config.ts src/e2e/agent-drivability.test.ts`
Expected: PASS, all nine tests

- [ ] **Step 4: Run the full gate**

Run: `make check-all`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/e2e/agent-drivability.test.ts
git commit -m "test(e2e): acceptance test for full agent-drivability on both paths"
```

---

## Acceptance Criteria: what "fully agent-drivable" means

Both paths are fully agent-drivable when all five hold, each enforced by a named test in `src/e2e/agent-drivability.test.ts`:

1. **No hang.** Every command completes with stdin closed and no TTY. (Already true today; guarded by the whole suite running with `stdio: ['ignore', 'pipe', 'pipe']`.)
2. **No unparseable failure.** No invocation exits non-zero with empty stdout under `--format json`. Test: *"never exits non-zero with empty stdout under --format json"*.
3. **No silent misconfiguration.** Every field in the written config traces to a flag the caller passed or a detector match the envelope reported. `init --auto` either fails or records a `projectType`. Tests: *"emits a failure envelope when no project type resolves"*, *"refuses to guess when a piped invocation omits --auto"*.
4. **Every failure names its own fix.** Each `errors[]` entry carries a `recovery` string naming a flag or command. Tests: the two failure-envelope tests assert `recovery` content.
5. **The next action is always readable from stdout.** After either bootstrap, `scaffold next --format json` returns a runnable `command`. Tests: *"drives init through the pipeline loop"*, *"plans without writing, then applies by key"*.

### The two command sequences, start to finish

Path (a), new project:

```bash
scaffold init --auto --format json --project-type cli --cli-interactivity args-only
#   -> exit 0, {"success":true,"data":{"configPath":"...","methodology":"mvp",...}}
scaffold next --format json
#   -> exit 0, .data.eligible[0].command == "scaffold run create-vision"
#              .data.pipeline_complete == false
scaffold run create-vision
#   -> exit 0, assembled meta-prompt on stdout
scaffold complete create-vision --format json
#   -> exit 0, {"success":true,...}
# repeat next/run/complete until .data.pipeline_complete == true
```

Path (b), brownfield:

```bash
scaffold adopt --auto --format json
#   -> exit 0, .data.plan_key == <sha256>, .data.mode == "brownfield"
#              working tree unchanged
scaffold adopt --auto --format json --apply --plan-key <sha256>
#   -> exit 0, .data.applied == true, .data.initialized == true
#              .data.doctor.verdict == "healthy"
scaffold next --format json
#   -> exit 0, .data.eligible[0].command runnable as-is
# then the same next/run/complete loop as path (a)
```

No `scaffold init` appears in path (b). That is the correction Task 11 makes to the install guide.

---

## Work Units, Sequencing and Shippability

| Unit | Tasks | Depends on | Independently shippable | Release |
|---|---|---|---|---|
| **A. Output foundation** | 1, 5, 13 | none | Yes | 1 (patch) |
| **D1. Adopt docs and bootstrap** | 11 | none | Yes | 1 (patch) |
| **E. `--from` repair** | 9 | A (needs `fail()` and the result-emission branch) | Yes | 1 (patch) |
| **B. Contract and discoverability** | 2, 3, 4, 8 | A | Yes | 2 (minor) |
| **C. Close the silent traps** | 6, 7 | B (the failures must already be coded and annotated, or the breaking change lands without an actionable message) | Yes | 2 (minor, **breaking**) |
| **D2. Contract docs** | 10 | B (documents the auto-flag table B delivers) | Yes | 2 (minor) |
| **F. Acceptance** | 12 | A, B, C, E, D2 | No, it is the gate | 2 (minor) |

Critical path: **A → B → C → F**. Units D1 and E run in parallel with B and C. Task 9 and Task 5 both edit `src/cli/commands/init.ts`, so Task 9 rebases after Task 5 lands.

### Why this cut, and what the first review changed

The original cut put Unit D (Tasks 10 and 11) and a broader Task 5 in Release 1. Review found two ways that could not work, both corrected above:

- **Task 10 documented behavior Release 1 does not ship.** It publishes the auto-required-flag table, which Unit B delivers in Release 2. Release 1 would have shipped a documented contract the binary did not implement. Task 10 moved to Release 2 as unit **D2**; Task 11 stayed in Release 1 as **D1**, because it only corrects adopt guidance that is already wrong about today's binary.
- **Task 5 referenced Release 2 symbols.** Its `catch` rewrite needed `AutoFlagRequiredError` (Task 4) and `toScaffoldError` (Task 8). Task 5 is now scoped to the yargs `.fail()` handler and the wizard-path routing only; the `catch` block is left untouched until Task 8 rewrites it in Release 2. This also keeps Task 8's exit-2-to-exit-1 correction out of the patch release.

A third gap the review caught: nothing routed **adopt** into the envelope, so Task 12's brownfield assertions could not pass. That is now Task 13, in Release 1.

### Shipping order

- **Release 1 (patch, `v3.51.1`, no breaking change):** Units A, D1, E — Tasks 1, 5, 9, 11, 13. Closes F5, F6, F9, gaps 06, 07, and **part of** F4/gap 01.

  Release 1 must not be described as closing F4. What it actually delivers: all ten `adopt` failure paths, the `init` wizard path, and yargs argument errors become parseable. What it does **not** deliver, and which must appear in the release notes rather than being discovered by an agent:

  | Still unparseable after Release 1 | Why | Fixed by |
  |---|---|---|
  | `init --from` error paths (bad YAML, unreadable path, already-initialized) | Task 5 leaves the `init.ts` catch untouched | Task 8, Release 2 |
  | Those same paths' exit code (2, meaning `MissingDependency`) | same | Task 8, Release 2 |

  Release-note wording must say "parseable failures on `adopt` and the `init` wizard path" and not "parseable failures", because the difference is exactly what an agent would trip over.
- **Release 2 (minor, `v3.52.0`, one breaking behavior change):** Units B, C, D2, F — Tasks 2, 3, 4, 6, 7, 8, 10, 12. Closes F1, F2, F3, F7, F8, gaps 02, 03, 04, 05, 08, and completes F4/gap 01 on the `--from` path. One CHANGELOG entry under "Behavior change" covers Tasks 6, 7 and 8, following the v3.48.0 `scaffold adopt` precedent.

Acceptance criterion 2 ("never exits non-zero with empty stdout under `--format json`") is only fully true at Release 2, because the `--from` path's `catch` is rewritten by Task 8. This is why Task 12 ships in Release 2 rather than gating Release 1.

---

## Self-Review

**Coverage.** F1 → Tasks 2, 3, 4, 5. F2 → Task 6. F3 → Task 7. F4 → Tasks 1, 5, 13. F5 → Task 11. F6 → Task 9. F7 → Task 8. F8 → Task 10. F9 → no code change, documented in Task 10. Gaps 01 → 1, 5, 13; 02 → 2, 3, 10; 03 → 6; 04 → 7; 05 → 8, 10; 06 → 11; 07 → 9; 08 → 10, 11. Nothing unassigned.

**Placeholders.** None. Every code step carries the code. After the first review there are no forward references either: Task 5 no longer reaches for Release 2 symbols, so the temporary `toScaffoldError` shim that earlier drafts required is gone.

**Type consistency.** `OutputContext.fail(errors: ScaffoldError[], exitCode?: ExitCode)` is declared in Task 1 and called with that signature in Tasks 5, 8 and 13. `AutoFlagRequiredError.scaffoldError` is declared in Task 4 and read in Tasks 7 and 8. `AUTO_REQUIRED_FLAG` and `autoRequiredSuffix` are declared in Task 2 and consumed in Tasks 3, 4 and 10. `toScaffoldError` is declared in Task 8 and consumed only within Task 8's own rewrite of the `init.ts` catch.

**Known risks.**

1. ~~Task 9's `requiresArg` assumption.~~ **Resolved by experiment before implementation.** Against this repo's own yargs 17, with a `.strict()` command identical in shape to `init`:

   | Option config | `init --from - ` | Result |
   |---|---|---|
   | `{type:'string'}` | space form | `FAIL  Unknown argument: -` (reproduces today's bug exactly) |
   | `{type:'string', requiresArg:true}` | space form | `OK  from="-"` |
   | `{type:'string', requiresArg:true}` | `--from=-` | `OK  from="-"` |
   | `{type:'string', requiresArg:true}` | `--from cfg.yml` | `OK  from="cfg.yml"` |

   `requiresArg: true` is sufficient and does not regress the ordinary path. The `runCli` argv-normalization fallback is not needed.
2. Task 6 Step 3b normalizes `argv.auto` for **all** non-interactive modes, which means `scaffold init --format json` in a TTY now also requires a discriminator. That is intended and consistent (JsonOutput never prompts, so it was already silently defaulting), but it widens the breaking surface slightly beyond the non-TTY case. It belongs in the same CHANGELOG entry.
3. ~~Task 13's "convert every site" was unbounded.~~ **Resolved by surveying the file before implementation.** The ten call sites are enumerated in Task 13 Step 3 with their current exit codes, and the step carries a mechanical completion check (`output.error(` count must reach 0, `output.fail(` must reach 10). The survey also caught two things a bulk edit would have broken: line 612 carries `ExitCode.StateCorruption` (3) rather than 1, and three sites are loops whose per-error exit codes must survive, so those pass their whole array to a single `fail()` call.
