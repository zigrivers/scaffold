# Multi-Type Project Detection in `scaffold adopt` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `scaffold adopt` to detect all 9 project types from R1-R3 overlay support (not just game) and populate matching typed configs — via per-type detector modules sharing a SignalContext, with interactive disambiguation for ambiguous matches.

**Architecture:** Detection factored into per-type pure functions (`src/project/detectors/`) sharing a `SignalContext` interface. Each detector returns a discriminated-union `DetectionMatch` with confidence tier (`high`/`medium`/`low`) and evidence. Multi-match disambiguation uses Case A-G decision table (prompt interactively; exit `ADOPT_AMBIGUOUS = 6` under `--auto`). `runAdoption` becomes async. Game detection rewritten to use the same SignalContext API (behavior preserved by regression test added first).

**Tech Stack:** TypeScript 5.x, Node.js ≥18, Zod 3.24, yargs 17.7, `@inquirer/prompts` 7.4, Vitest 3.0. **New deps:** `yaml` ^2.8.3 (AST-preserving YAML mutation), `smol-toml` ^1.6.1 (TOML parsing for `pyproject.toml` + `Cargo.toml`).

**Spec:** `docs/superpowers/specs/2026-04-08-adopt-multi-type-detection-design.md` (1867 lines, 6 sections + 5 appendices). The spec is authoritative — this plan is its task-by-task execution.

**PR strategy:** Two stacked PRs split after Task 7d (all detectors implemented). **PR 1** = tasks 1, 2, 3, 4a, 4b, 5, 6a, 6b, 6c, 6d, 7a, 7b, 7c, 7d (foundation + 9 detectors). **PR 2** = tasks 8, 9, 10, 11, 12, 13, 14 (orchestration + handler + docs + tests + release prep). Single-PR execution is also supported.

**Round 2 revision (2026-04-10):** This plan was rewritten after a 3-channel multi-model review (Codex CLI + Gemini CLI + Superpowers code-reviewer) flagged 5 P0 blockers and 14 P1 issues in the original Round 1 plan. Tasks 6 and 7 (which originally bundled 4 detectors each) are split into 8 individual tasks (6a-6d, 7a-7d) with fully inlined TypeScript code. New Task 14 covers version bump, final acceptance criteria validation, three-channel MMR per CLAUDE.md, and PR creation. All code samples are concrete, copy-pasteable, and free of "per spec Section X" placeholders. Re-adoption merge pipeline is now properly wired through Task 11. Total: 21 task operations across 14 numeric task numbers (Tasks 4 and 6/7 are sub-numbered).

**Note about test mocks:** The current `src/project/adopt.test.ts:10` uses `vi.mock('./detector.js')` to mock `detectProjectMode` from `src/project/detector.ts` (singular). This is the **mode** detector (greenfield/brownfield/v1-migration) and is **independent of** the new project-type detectors at `src/project/detectors/` (plural directory). The mock does NOT need to be removed when this plan introduces project-type detection — it covers a different module.

---

## Task 1: Add dependencies, enum value, and asScaffoldError helper

**Files:**
- Modify: `package.json` (add `yaml` and `smol-toml` to `dependencies`)
- Modify: `src/types/enums.ts` (add `Ambiguous = 6` to ExitCode enum)
- Modify: `src/config/schema.ts:192-198` (add `.default('deep')` to methodology, `.default(['claude-code'])` to platforms)
- Modify: `src/utils/errors.ts` (add `asScaffoldError` helper)
- Create: `src/utils/errors.test.ts` (or extend existing if present)
- Create: `scripts/verify-gameconfig-migration.sh` (migration verification script)

### Steps

- [ ] **Step 1: Verify current state clean**

```bash
git status
npm test src/utils/errors.test.ts 2>&1 | tail -20
```
Expected: working tree clean, any existing errors tests pass.

- [ ] **Step 2: Add dependencies**

```bash
cd /Users/kenallred/dev-projects/scaffold
npm install yaml@^2.8.3 smol-toml@^1.6.1
```

Verify `package.json` now shows both deps:

```bash
grep -E '"yaml"|"smol-toml"' package.json
```
Expected: Both lines present in `"dependencies"` section.

- [ ] **Step 3: Add `ExitCode.Ambiguous = 6` to enum**

Edit `src/types/enums.ts`:

```ts
export enum ExitCode {
  Success = 0,
  ValidationError = 1,
  MissingDependency = 2,
  StateCorruption = 3,
  UserCancellation = 4,
  BuildError = 5,
  Ambiguous = 6,       // NEW: operator action required (detection ambiguity, type conflict)
}
```

- [ ] **Step 4: Add Zod defaults to ConfigSchema**

Edit `src/config/schema.ts` around line 192-198. Find:

```ts
export const ConfigSchema = z.object({
  version: z.literal(2),
  methodology: z.enum(['deep', 'mvp', 'custom']),
  custom: CustomSchema.optional(),
  platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1),
  project: ProjectSchema.optional(),
}).passthrough()
```

Change to:

```ts
export const ConfigSchema = z.object({
  version: z.literal(2),
  methodology: z.enum(['deep', 'mvp', 'custom']).default('deep'),
  custom: CustomSchema.optional(),
  platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1).default(['claude-code']),
  project: ProjectSchema.optional(),
}).passthrough()
```

- [ ] **Step 5: Write failing test for asScaffoldError helper**

Add to `src/utils/errors.test.ts` (create file if it doesn't exist):

```ts
import { describe, it, expect } from 'vitest'
import { asScaffoldError, type ScaffoldError } from './errors.js'

describe('asScaffoldError', () => {
  it('returns an existing ScaffoldError as-is', () => {
    const err: ScaffoldError = { code: 'FOO', message: 'bar', exitCode: 1 }
    expect(asScaffoldError(err, 'FALLBACK', 1)).toBe(err)
  })

  it('wraps an Error instance', () => {
    const err = new Error('boom')
    const result = asScaffoldError(err, 'FALLBACK', 1)
    expect(result.code).toBe('FALLBACK')
    expect(result.message).toBe('boom')
    expect(result.exitCode).toBe(1)
  })

  it('wraps an Error instance without a message', () => {
    const err = new Error('')
    const result = asScaffoldError(err, 'FALLBACK', 2)
    expect(result.message).toBe('Unknown error')
  })

  it('wraps a string throw', () => {
    const result = asScaffoldError('oh no', 'FALLBACK', 1)
    expect(result.code).toBe('FALLBACK')
    expect(result.message).toBe('oh no')
  })

  it('wraps null', () => {
    const result = asScaffoldError(null, 'FALLBACK', 1)
    expect(result.message).toContain('null')
  })

  it('wraps undefined', () => {
    const result = asScaffoldError(undefined, 'FALLBACK', 1)
    expect(result.message).toContain('undefined')
  })

  it('rejects partial ScaffoldError duck type (missing exitCode)', () => {
    const partial = { code: 'FOO', message: 'bar' }
    const result = asScaffoldError(partial, 'FALLBACK', 3)
    expect(result.code).toBe('FALLBACK')    // NOT 'FOO' — strict shape check
    expect(result.exitCode).toBe(3)
  })
})
```

Run: `npm test -- src/utils/errors.test.ts`

Expected: FAIL with `asScaffoldError is not exported`.

- [ ] **Step 6: Implement asScaffoldError**

Add to the bottom of `src/utils/errors.ts`:

```ts
/**
 * Converts any thrown value into a well-formed ScaffoldError.
 * - Already-shaped ScaffoldError objects are returned unchanged (strict duck-type check).
 * - Error instances have their message extracted; stack included in context.
 * - String/null/undefined/other throws are wrapped with the fallback code.
 */
export function asScaffoldError(
  err: unknown,
  fallbackCode: string,
  fallbackExit: number,
): ScaffoldError {
  // Case 1: Already a fully-formed ScaffoldError
  if (
    err !== null &&
    typeof err === 'object' &&
    'code' in err && typeof (err as Record<string, unknown>).code === 'string' &&
    'message' in err && typeof (err as Record<string, unknown>).message === 'string' &&
    'exitCode' in err && typeof (err as Record<string, unknown>).exitCode === 'number'
  ) {
    return err as ScaffoldError
  }

  // Case 2: Error instance
  if (err instanceof Error) {
    return {
      code: fallbackCode,
      message: err.message || 'Unknown error',
      exitCode: fallbackExit,
      context: err.stack ? { stack: err.stack.slice(0, 500), name: err.name } : undefined,
    }
  }

  // Case 3: non-Error throws
  return {
    code: fallbackCode,
    message: typeof err === 'string'
      ? err
      : err === null
        ? 'null error thrown'
        : err === undefined
          ? 'undefined error thrown'
          : `Non-Error thrown: ${String(err)}`,
    exitCode: fallbackExit,
  }
}
```

- [ ] **Step 7: Run test to verify pass**

```bash
npm test -- src/utils/errors.test.ts
```
Expected: PASS, 7 tests green.

- [ ] **Step 8: Create gameConfig migration verification script**

Create `scripts/verify-gameconfig-migration.sh`:

```bash
#!/usr/bin/env bash
# Verifies gameConfig migration scope. Run before Task 10.
# Uses git ls-files to respect .gitignore automatically.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Find all files containing gameConfig (tracked files only)
files=$(git grep -l 'gameConfig' -- 'src/**' 'content/**' 'docs/**' 'README.md' 'CHANGELOG.md' 2>/dev/null || true)
file_count=$(echo "$files" | grep -c . || echo 0)

# Expected: 26 files total. Mismatch requires updating Appendix B of the spec.
EXPECTED_TOTAL=26

echo "Files containing 'gameConfig': $file_count (expected: $EXPECTED_TOTAL)"
echo ""

# Categorize
echo "=== Production source (MIGRATE: set both fields for game projects) ==="
echo "$files" | grep -E '^src/(types/config|project/adopt|wizard/(wizard|questions)|cli/commands/(adopt|init))\.ts$' | grep -v '\.test\.ts' || true
echo ""
echo "=== Test source (MIGRATE: assert both fields) ==="
echo "$files" | grep -E '\.test\.ts$' || true
echo ""
echo "=== Schema (NO CHANGE — gameConfig stays in schema per Section 5 R2-rej1) ==="
echo "$files" | grep -E '^src/config/schema' || true
echo ""
echo "=== Historical docs (NO CHANGE) ==="
echo "$files" | grep -E '^docs/(superpowers|game-content)' || true
echo ""
echo "=== User-facing docs (UPDATE for v3.10) ==="
echo "$files" | grep -E '^(README|CHANGELOG)\.md$' || true
echo ""

if [ "$file_count" -ne "$EXPECTED_TOTAL" ]; then
  echo "WARNING: count mismatch. Update Appendix B in the spec OR fix the migration."
  exit 1
fi
echo "OK: $file_count files verified matches expected $EXPECTED_TOTAL"
```

Make it executable:

```bash
chmod +x scripts/verify-gameconfig-migration.sh
```

- [ ] **Step 9: Run the verification script against current state**

```bash
bash scripts/verify-gameconfig-migration.sh
```
Expected: lists 26 files across the categories. Exits 0 (count matches).

- [ ] **Step 10: Run full test + type check**

```bash
npm run check
```
Expected: all green (lint + typecheck + tests).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/types/enums.ts src/utils/errors.ts src/utils/errors.test.ts src/config/schema.ts scripts/verify-gameconfig-migration.sh
git commit -m "chore: deps + enum + asScaffoldError + schema defaults (v3.10 prep)"
```

---

## Task 2: Extract init-flag-families.ts (behavior-preserving refactor)

**Files:**
- Create: `src/cli/init-flag-families.ts` (extracted constants + validation helpers)
- Create: `src/cli/init-flag-families.test.ts`
- Modify: `src/cli/commands/init.ts:399-594` (replace inline with imports)

**Context:** The current `init.ts` has ~200 lines of flag-family constants (`GAME_FLAGS`, `WEB_FLAGS`, etc.) and validation logic inside its `.check()` closure. Section 4 of the spec requires this logic to be extracted into a shared module so `scaffold adopt` (built later) can reuse it. Init-only rules (`--depth`, `--adapters`, `--traits`) stay in `init.ts`.

### Steps

- [ ] **Step 1: Read the current init.ts flag section**

```bash
sed -n '280,610p' src/cli/commands/init.ts
```
Identify the 9 `*_FLAGS` constants (game, web, backend, cli-type, lib, mobile, pipeline, ml, ext) and the `.check()` closure (lines ~399-594).

- [ ] **Step 2: Create `src/cli/init-flag-families.ts` with moved constants**

The exact constants from `init.ts` — `GAME_FLAGS`, `WEB_FLAGS`, `BACKEND_FLAGS`, `CLI_TYPE_FLAGS`, `LIB_FLAGS`, `MOBILE_FLAGS`, `PIPELINE_FLAGS`, `ML_FLAGS`, `EXT_FLAGS`, plus `PROJECT_TYPE_FLAG` — move verbatim into the new file. Preserve the `as const` assertions exactly.

Also move these validators (currently inside init.ts `.check()`):
- Game → `--project-type game` consistency
- `--online-services requires multiplayer online|hybrid`
- Array enum validations for `target-platforms`, `online-services`, `locales`
- Per-family detection (`hasWebFlag`, `hasBackendFlag`, etc.)
- Mixed-family rejection
- Per-family `--project-type` consistency
- CSV enum validation for `backend-data-store`, `cli-distribution`, `ext-ui-surfaces`
- Web-app cross-field validation (SSR/static, session/static)

Compose them into one exported `applyFlagFamilyValidation(argv): true | never` that throws on violation.

Also add `buildFlagOverrides(argv): PartialConfigOverrides` that walks argv keys and returns a discriminated-union payload:

```ts
export type PartialConfigOverrides =
  | { type: 'game'; partial: Partial<z.infer<typeof GameConfigSchema>> }
  | { type: 'web-app'; partial: Partial<z.infer<typeof WebAppConfigSchema>> }
  | { type: 'backend'; partial: Partial<z.infer<typeof BackendConfigSchema>> }
  | { type: 'cli'; partial: Partial<z.infer<typeof CliConfigSchema>> }
  | { type: 'library'; partial: Partial<z.infer<typeof LibraryConfigSchema>> }
  | { type: 'mobile-app'; partial: Partial<z.infer<typeof MobileAppConfigSchema>> }
  | { type: 'data-pipeline'; partial: Partial<z.infer<typeof DataPipelineConfigSchema>> }
  | { type: 'ml'; partial: Partial<z.infer<typeof MlConfigSchema>> }
  | { type: 'browser-extension'; partial: Partial<z.infer<typeof BrowserExtensionConfigSchema>> }
  | undefined
```

- [ ] **Step 3: Update init.ts to import from the new module**

Replace the inline constants and validation with imports:

```ts
import {
  PROJECT_TYPE_FLAG,
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  applyFlagFamilyValidation,
  buildFlagOverrides,
} from '../init-flag-families.js'
```

The `.check()` closure in init.ts becomes:

```ts
.check((argv) => {
  // Init-only validation (stays here)
  if (argv.depth !== undefined && argv.methodology !== 'custom') {
    throw new Error('--depth requires --methodology custom')
  }
  // --adapters enum validation
  const validAdapters = ['claude-code', 'codex', 'gemini']
  if (argv.adapters) {
    for (const a of argv.adapters as string[]) {
      if (!validAdapters.includes(a)) {
        throw new Error(`Invalid adapter "${a}". Valid: ${validAdapters.join(', ')}`)
      }
    }
  }
  // --traits enum validation
  const validTraits = ['web', 'mobile', 'desktop']
  if (argv.traits) {
    for (const t of argv.traits as string[]) {
      if (!validTraits.includes(t)) {
        throw new Error(`Invalid trait "${t}". Valid: ${validTraits.join(', ')}`)
      }
    }
  }

  // Shared flag-family validation
  return applyFlagFamilyValidation(argv)
})
```

- [ ] **Step 4: Write functional tests for init-flag-families**

Create `src/cli/init-flag-families.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import yargs from 'yargs'
import {
  PROJECT_TYPE_FLAG,
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  applyFlagFamilyValidation,
  buildFlagOverrides,
} from './init-flag-families.js'

describe('flag family constants', () => {
  it('GAME_FLAGS contains expected game-specific flag names', () => {
    expect(GAME_FLAGS).toContain('engine')
    expect(GAME_FLAGS).toContain('multiplayer')
  })

  it('WEB_FLAGS contains rendering strategy flag', () => {
    expect(WEB_FLAGS).toContain('web-rendering')
  })

  it('BACKEND_FLAGS contains api style flag', () => {
    expect(BACKEND_FLAGS).toContain('backend-api-style')
  })
})

describe('applyFlagFamilyValidation', () => {
  it('accepts single-family flags with matching --project-type', () => {
    const argv = { 'project-type': 'web-app', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv as any)).not.toThrow()
  })

  it('rejects mixing web and backend flags', () => {
    const argv = { 'web-rendering': 'ssr', 'backend-api-style': 'rest' }
    expect(() => applyFlagFamilyValidation(argv as any)).toThrow(/mix flags from multiple project types/)
  })

  it('rejects --web-* with --project-type backend', () => {
    const argv = { 'project-type': 'backend', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv as any)).toThrow(/--web-\* flags require --project-type web-app/)
  })

  it('rejects invalid backend-data-store value', () => {
    const argv = { 'backend-data-store': ['relational', 'bogus'] }
    expect(() => applyFlagFamilyValidation(argv as any)).toThrow(/Invalid --backend-data-store/)
  })

  it('rejects SSR + static deploy target (web cross-field)', () => {
    const argv = {
      'project-type': 'web-app',
      'web-rendering': 'ssr',
      'web-deploy-target': 'static',
    }
    expect(() => applyFlagFamilyValidation(argv as any)).toThrow(/SSR\/hybrid rendering requires compute/)
  })
})

describe('buildFlagOverrides', () => {
  it('returns undefined when no type flags passed', () => {
    expect(buildFlagOverrides({} as any)).toBeUndefined()
  })

  it('returns web-app partial when web flags are present', () => {
    const argv = { 'web-rendering': 'ssr', 'web-deploy-target': 'serverless' }
    const result = buildFlagOverrides(argv as any)
    expect(result).toEqual({
      type: 'web-app',
      partial: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
    })
  })

  it('returns backend partial with dataStore array', () => {
    const argv = { 'backend-api-style': 'rest', 'backend-data-store': ['relational', 'document'] }
    const result = buildFlagOverrides(argv as any)
    expect(result).toEqual({
      type: 'backend',
      partial: { apiStyle: 'rest', dataStore: ['relational', 'document'] },
    })
  })

  it('returns game partial with engine', () => {
    const argv = { engine: 'unity', multiplayer: 'none' }
    const result = buildFlagOverrides(argv as any)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'unity', multiplayerMode: 'none' },
    })
  })
})
```

- [ ] **Step 5: Add type-level preservation tests (tuple literal union narrowing)**

Append to `src/cli/init-flag-families.test.ts`:

```ts
import { expectTypeOf } from 'vitest'

describe('flag family type preservation (as const survives extraction)', () => {
  it('GAME_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof GAME_FLAGS[number]>().toEqualTypeOf<
      'engine' | 'multiplayer' | 'narrative' | 'content-structure' | 'economy'
      | 'online-services' | 'persistence' | 'target-platforms' | 'locales'
      | 'has-modding' | 'npc-ai-complexity'
    >()
  })

  it('WEB_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof WEB_FLAGS[number]>().toEqualTypeOf<
      'web-rendering' | 'web-deploy-target' | 'web-realtime' | 'web-auth-flow'
    >()
  })

  it('BACKEND_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof BACKEND_FLAGS[number]>().toEqualTypeOf<
      'backend-api-style' | 'backend-data-store' | 'backend-auth'
      | 'backend-messaging' | 'backend-deploy-target'
    >()
  })

  // Add parallel tests for the remaining 6 families
})
```

- [ ] **Step 6: Run extracted module tests**

```bash
npm test -- src/cli/init-flag-families.test.ts
```
Expected: PASS, ~21 tests (12 functional + 9 type-level per family).

- [ ] **Step 7: Run existing init tests (REGRESSION GUARD)**

```bash
npm test -- src/cli/commands/init.test.ts
```
Expected: PASS with the same pass count as before the refactor. **If any test fails, revert this commit and debug — the extraction must be behavior-preserving.**

- [ ] **Step 8: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/init-flag-families.test.ts src/cli/commands/init.ts
git commit -m "refactor: extract init-flag-families.ts (behavior-preserving)"
```

---

## Task 3: Add game engine precedence regression test (BEFORE detector relocation)

**Files:**
- Create: `tests/fixtures/adopt/detectors/game/multi-engine/Assets/test.meta`
- Create: `tests/fixtures/adopt/detectors/game/multi-engine/MyGame.uproject`
- Create: `tests/fixtures/adopt/detectors/game/multi-engine/project.godot`
- Modify: `src/project/adopt.test.ts` (add precedence assertion)

**Context:** The current inline game detection in `src/project/adopt.ts:73-93` checks engines in order Unity > Unreal > Godot but has no regression test. Section 1 of the spec requires this test to land BEFORE Task 5 relocates the logic. The test currently runs against the inline implementation and must continue passing after the relocation.

### Steps

- [ ] **Step 1: Create the multi-engine fixture directory**

```bash
mkdir -p tests/fixtures/adopt/detectors/game/multi-engine/Assets
touch tests/fixtures/adopt/detectors/game/multi-engine/Assets/test.meta
touch tests/fixtures/adopt/detectors/game/multi-engine/MyGame.uproject
echo '[gd_scene]' > tests/fixtures/adopt/detectors/game/multi-engine/project.godot
```

Verify:

```bash
ls -la tests/fixtures/adopt/detectors/game/multi-engine/
```
Expected: `Assets/`, `MyGame.uproject`, `project.godot` all present.

- [ ] **Step 2: Write the failing regression test**

Append to `src/project/adopt.test.ts` (before the final closing `})`):

```ts
it('Unity wins precedence when multi-engine signatures coexist', () => {
  // Regression test for Unity > Unreal > Godot precedence.
  // Fixture has Assets/.meta + .uproject + project.godot simultaneously.
  const fixturePath = path.join(
    __dirname,
    '../../tests/fixtures/adopt/detectors/game/multi-engine',
  )

  const result = runAdoption({
    projectRoot: fixturePath,
    metaPromptDir: path.join(fixturePath, 'content', 'pipeline'),
    methodology: 'deep',
    dryRun: true,
  })

  expect(result.projectType).toBe('game')
  expect(result.gameConfig).toEqual({ engine: 'unity' })
  // Unity must win because Assets/*.meta is detected first in adopt.ts:74-82
})
```

- [ ] **Step 3: Run the test — it should PASS against current inline logic**

```bash
npm test -- src/project/adopt.test.ts -t 'Unity wins precedence'
```
Expected: PASS. The current inline logic already implements the precedence — the test pins the behavior so Task 5's refactor is verifiable.

- [ ] **Step 4: Run full adopt test file**

```bash
npm test -- src/project/adopt.test.ts
```
Expected: all pass (13 tests: 12 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/adopt/detectors/game/multi-engine/ src/project/adopt.test.ts
git commit -m "test: add Unity > Unreal > Godot precedence regression test"
```

---

## Task 4a: Convert runAdoption to async (mechanical refactor)

**Files:**
- Modify: `src/project/adopt.ts` (function → async function)
- Modify: `src/cli/commands/adopt.ts:61` (await runAdoption)
- Modify: `src/project/adopt.test.ts` (all 13 test bodies become async)

**Context:** Section 1 of the spec requires the async migration to land BEFORE the SignalContext skeleton (Task 4b) so later detector-implementation commits don't churn between sync/async. This task is a PURE mechanical refactor — no new behavior, no new types.

### Steps

- [ ] **Step 1: Convert `runAdoption` signature in adopt.ts**

Edit `src/project/adopt.ts:32`:

```ts
export async function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
}): Promise<AdoptionResult> {
```

No other changes in `adopt.ts` yet — the existing body works fine wrapped in `async`.

- [ ] **Step 2: Update CLI handler to await**

Edit `src/cli/commands/adopt.ts:61`:

```ts
const adoptResult = await runAdoption({ projectRoot, metaPromptDir, methodology, dryRun })
```

The handler was already declared `async (argv) => { ... }`, so adding `await` is enough.

- [ ] **Step 3: Update all 13 test bodies in adopt.test.ts**

Change each `it('...', () => { ... })` to `it('...', async () => { ... })`. Add `await` before every `runAdoption(...)` call inside.

Example:

```ts
// Before
it('returns greenfield mode for empty directory', () => {
  const result = runAdoption({ projectRoot: tmpDir, ... })
  expect(result.mode).toBe('greenfield')
})

// After
it('returns greenfield mode for empty directory', async () => {
  const result = await runAdoption({ projectRoot: tmpDir, ... })
  expect(result.mode).toBe('greenfield')
})
```

- [ ] **Step 4: Verify no other callers of runAdoption**

```bash
grep -rn 'runAdoption(' src/ --include='*.ts' | grep -v '\.test\.ts'
```
Expected: exactly 2 lines — the definition in `src/project/adopt.ts` and the await call in `src/cli/commands/adopt.ts`. If you see others, add `await` to them too.

- [ ] **Step 5: Run adopt test file**

```bash
npm test -- src/project/adopt.test.ts
```
Expected: all 13 tests pass (including the precedence test from Task 3).

- [ ] **Step 6: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/project/adopt.ts src/cli/commands/adopt.ts src/project/adopt.test.ts
git commit -m "refactor: runAdoption async migration (mechanical)"
```

---

## Task 4b: SignalContext + detector skeleton

**Files:**
- Create: `src/project/detectors/types.ts` (DetectionMatch, Confidence, DetectionEvidence, evidence(), assertNever)
- Create: `src/project/detectors/context.ts` (SignalContext interface, FsSignalContext, createFakeSignalContext)
- Create: `src/project/detectors/index.ts` (ALL_DETECTORS = [], runDetectors)
- Create: `src/project/detectors/file-text-match.ts` (stripJsTsComments, matchesConfigExport)
- Create: `src/project/detectors/required-fields.ts` (getRequiredFieldsWithoutDefaults)
- Create: `src/project/detectors/context.test.ts`
- Create: `src/project/detectors/file-text-match.test.ts`
- Create: `src/project/detectors/required-fields.test.ts`

**Context:** This commit introduces the architectural scaffolding for detection but does NOT add any detectors yet — `ALL_DETECTORS` starts empty. `runDetectors([])` returns no matches, so `runAdoption` falls through to the existing inline game detection unchanged. Later tasks (5-7) add detectors one at a time to `ALL_DETECTORS`. See spec Section 2 for full interface details.

### Steps

- [ ] **Step 1: Create `src/project/detectors/types.ts`**

```ts
// src/project/detectors/types.ts
import type { z } from 'zod'
import type { ProjectType } from '../../types/index.js'
import type {
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema, LibraryConfigSchema,
  MobileAppConfigSchema, DataPipelineConfigSchema, MlConfigSchema,
  BrowserExtensionConfigSchema, GameConfigSchema,
} from '../../config/schema.js'

export type Confidence = 'high' | 'medium' | 'low'

export interface DetectionEvidence {
  readonly signal: string
  readonly file?: string
  readonly note?: string
}

interface BaseMatch {
  readonly confidence: Confidence
  readonly evidence: readonly DetectionEvidence[]
}

export interface WebAppMatch extends BaseMatch {
  readonly projectType: 'web-app'
  readonly partialConfig: Partial<z.infer<typeof WebAppConfigSchema>>
}
export interface BackendMatch extends BaseMatch {
  readonly projectType: 'backend'
  readonly partialConfig: Partial<z.infer<typeof BackendConfigSchema>>
}
export interface CliMatch extends BaseMatch {
  readonly projectType: 'cli'
  readonly partialConfig: Partial<z.infer<typeof CliConfigSchema>>
}
export interface LibraryMatch extends BaseMatch {
  readonly projectType: 'library'
  readonly partialConfig: Partial<z.infer<typeof LibraryConfigSchema>>
}
export interface MobileAppMatch extends BaseMatch {
  readonly projectType: 'mobile-app'
  readonly partialConfig: Partial<z.infer<typeof MobileAppConfigSchema>>
}
export interface DataPipelineMatch extends BaseMatch {
  readonly projectType: 'data-pipeline'
  readonly partialConfig: Partial<z.infer<typeof DataPipelineConfigSchema>>
}
export interface MlMatch extends BaseMatch {
  readonly projectType: 'ml'
  readonly partialConfig: Partial<z.infer<typeof MlConfigSchema>>
}
export interface BrowserExtensionMatch extends BaseMatch {
  readonly projectType: 'browser-extension'
  readonly partialConfig: Partial<z.infer<typeof BrowserExtensionConfigSchema>>
}
export interface GameMatch extends BaseMatch {
  readonly projectType: 'game'
  readonly partialConfig: Partial<z.infer<typeof GameConfigSchema>>
}

export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | BrowserExtensionMatch | GameMatch

export type Detector = (ctx: import('./context.js').SignalContext) => DetectionMatch | null

/** Exhaustiveness helper for discriminated-union routing. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled detection match variant: ${JSON.stringify(value)}`)
}

/** Ergonomic evidence builder. */
export function evidence(signal: string, file?: string, note?: string): DetectionEvidence {
  return { signal, file, note }
}
```

- [ ] **Step 2: Create `src/project/detectors/context.ts`**

This is the largest file in the task. Follows spec Section 2 exactly. Key methods: `hasFile`, `dirExists`, `rootEntries`, `readFileText`, `manifestStatus`, `packageJson`, `pyprojectToml`, `cargoToml`, `goMod`, `hasDep`, `hasAnyDep`. Exports `createSignalContext(projectRoot)` and `createFakeSignalContext(options)`.

```ts
// src/project/detectors/context.ts
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseTOML } from 'smol-toml'
import { z } from 'zod'
import type { ScaffoldWarning } from '../../types/index.js'

export type ManifestKind = 'npm' | 'py' | 'cargo' | 'go'
export type ManifestStatus = 'missing' | 'parsed' | 'unparseable'
export type NpmDepScope = 'deps' | 'dev' | 'peer' | 'optional'
export type DepScope = NpmDepScope | 'all'

export interface PackageJson {
  readonly name?: string
  readonly version?: string
  readonly private?: boolean
  readonly main?: string
  readonly module?: string
  readonly types?: string
  readonly typings?: string
  readonly browser?: string | Readonly<Record<string, string>>
  readonly exports?: unknown
  readonly bin?: string | Readonly<Record<string, string>>
  readonly type?: 'module' | 'commonjs'
  readonly engines?: Readonly<Record<string, string>>
  readonly scripts?: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] }
}

export interface PyprojectToml {
  readonly project?: {
    readonly name?: string
    readonly dependencies?: readonly string[]
    readonly 'optional-dependencies'?: Readonly<Record<string, readonly string[]>>
    readonly scripts?: Readonly<Record<string, string>>
  }
  readonly tool?: {
    readonly poetry?: {
      readonly dependencies?: Readonly<Record<string, unknown>>
      readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
      readonly group?: Readonly<Record<string, {
        readonly dependencies?: Readonly<Record<string, unknown>>
      }>>
    }
    readonly [k: string]: unknown
  }
  readonly 'build-system'?: { readonly requires?: readonly string[] }
}

export interface CargoToml {
  readonly package?: { readonly name?: string; readonly version?: string }
  readonly dependencies?: Readonly<Record<string, unknown>>
  readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
  readonly lib?: Readonly<Record<string, unknown>>
  readonly bin?: readonly { readonly name: string; readonly path?: string }[]
}

export interface GoMod {
  readonly module?: string
  readonly goVersion?: string
  readonly requires?: readonly GoModRequire[]
}
export interface GoModRequire {
  readonly path: string
  readonly version: string
  readonly indirect: boolean
}

export interface SignalContext {
  readonly projectRoot: string
  readonly warnings: readonly ScaffoldWarning[]

  hasFile(relPath: string): boolean
  dirExists(relPath: string): boolean
  rootEntries(): readonly string[]
  /** List entries in a subdirectory (depth-1, sorted, includes dotfiles, returns [] on missing/unreadable). */
  listDir(relPath: string): readonly string[]
  readFileText(relPath: string, maxBytes?: number): string | undefined

  manifestStatus(kind: ManifestKind): ManifestStatus
  packageJson(): PackageJson | undefined
  pyprojectToml(): PyprojectToml | undefined
  cargoToml(): CargoToml | undefined
  goMod(): GoMod | undefined

  hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope?: DepScope): boolean
  hasAnyDep(names: readonly string[], where?: ManifestKind | readonly ManifestKind[], scope?: DepScope): boolean
}

// PEP 503 name normalization
function normalizePep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

// Extract bare package name from a PEP 508 dep spec
function extractPyName(spec: string): string {
  // Strip environment marker
  let s = spec.split(';')[0]
  // Strip URL fragment
  s = s.split('@')[0]
  // Strip version specs
  s = s.replace(/[=<>!~].*$/, '')
  // Strip extras
  s = s.replace(/\[.*?\]/, '')
  return normalizePep503(s.trim())
}

// go.mod parser (handles multi-line require blocks + // indirect)
function parseGoMod(content: string): GoMod {
  const result: { module?: string; goVersion?: string; requires: GoModRequire[] } = { requires: [] }
  const lines = content.split('\n')
  let inRequireBlock = false
  for (let rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim()
    if (!line) continue

    if (line.startsWith('module ')) {
      result.module = line.slice(7).trim()
      continue
    }
    if (line.startsWith('go ')) {
      result.goVersion = line.slice(3).trim()
      continue
    }
    if (line.startsWith('require (')) {
      inRequireBlock = true
      continue
    }
    if (inRequireBlock && line === ')') {
      inRequireBlock = false
      continue
    }
    if (inRequireBlock || line.startsWith('require ')) {
      const body = line.startsWith('require ') ? line.slice(8) : line
      const indirect = rawLine.includes('// indirect')
      const parts = body.trim().split(/\s+/)
      if (parts.length >= 2) {
        result.requires.push({ path: parts[0], version: parts[1], indirect })
      }
    }
    // replace/exclude directives parsed-and-discarded per spec
  }
  return result
}

export function createSignalContext(projectRoot: string): SignalContext {
  const warnings: ScaffoldWarning[] = []
  const fileCache = new Map<string, boolean>()
  const dirCache = new Map<string, boolean>()
  const textCache = new Map<string, string | undefined>()
  const parseCache: {
    packageJson?: PackageJson | undefined
    pyprojectToml?: PyprojectToml | undefined
    cargoToml?: CargoToml | undefined
    goMod?: GoMod | undefined
  } = {}
  const status: Record<ManifestKind, ManifestStatus> = {
    npm: 'missing', py: 'missing', cargo: 'missing', go: 'missing',
  }

  // Eager root readdir + manifest probes
  let rootEntriesCache: readonly string[]
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true })
    rootEntriesCache = entries.map(e => e.name).sort()
  } catch (err) {
    warnings.push({
      code: 'ADOPT_FS_INACCESSIBLE',
      message: `Cannot read project root: ${(err as Error).message}`,
      context: { path: projectRoot },
    })
    rootEntriesCache = []
  }

  // Eager-stat probe list
  const PROBE = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
    'app.json', 'project.godot', 'manifest.json']
  for (const p of PROBE) {
    try {
      const stat = fs.statSync(path.join(projectRoot, p), { throwIfNoEntry: false })
      fileCache.set(p, !!stat && stat.isFile())
    } catch {
      fileCache.set(p, false)
    }
  }

  function hasFile(relPath: string): boolean {
    const cached = fileCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const stat = fs.statSync(path.join(projectRoot, relPath), { throwIfNoEntry: false })
      const exists = !!stat && stat.isFile()
      fileCache.set(relPath, exists)
      return exists
    } catch (err) {
      warnings.push({
        code: 'ADOPT_FS_INACCESSIBLE',
        message: `Cannot stat file: ${(err as Error).message}`,
        context: { path: relPath },
      })
      fileCache.set(relPath, false)
      return false
    }
  }

  function dirExists(relPath: string): boolean {
    const cached = dirCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const stat = fs.statSync(path.join(projectRoot, relPath), { throwIfNoEntry: false })
      const exists = !!stat && stat.isDirectory()
      dirCache.set(relPath, exists)
      return exists
    } catch (err) {
      warnings.push({
        code: 'ADOPT_FS_INACCESSIBLE',
        message: `Cannot stat directory: ${(err as Error).message}`,
        context: { path: relPath },
      })
      dirCache.set(relPath, false)
      return false
    }
  }

  function rootEntries(): readonly string[] {
    return rootEntriesCache
  }

  const listDirCache = new Map<string, readonly string[]>()
  function listDir(relPath: string): readonly string[] {
    const cached = listDirCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const entries = fs.readdirSync(path.join(projectRoot, relPath), { withFileTypes: true })
      const names = entries.map(e => e.name).sort()
      listDirCache.set(relPath, names)
      return names
    } catch (err) {
      // Missing dir or read error → empty result + single warning
      warnings.push({
        code: 'ADOPT_FS_INACCESSIBLE',
        message: `Cannot list directory: ${(err as Error).message}`,
        context: { path: relPath },
      })
      const empty: readonly string[] = []
      listDirCache.set(relPath, empty)
      return empty
    }
  }

  function readFileText(relPath: string, maxBytes: number = 262144): string | undefined {
    if (textCache.has(relPath)) return textCache.get(relPath)
    try {
      const full = path.join(projectRoot, relPath)
      const stat = fs.statSync(full, { throwIfNoEntry: false })
      if (!stat || !stat.isFile()) {
        textCache.set(relPath, undefined)
        return undefined
      }
      if (stat.size > maxBytes) {
        const fd = fs.openSync(full, 'r')
        const buf = Buffer.alloc(maxBytes)
        fs.readSync(fd, buf, 0, maxBytes, 0)
        fs.closeSync(fd)
        warnings.push({
          code: 'ADOPT_FILE_TRUNCATED',
          message: `File truncated to ${maxBytes} bytes`,
          context: { path: relPath, size: stat.size },
        })
        const truncated = buf.toString('utf8')
        textCache.set(relPath, truncated)
        return truncated
      }
      const content = fs.readFileSync(full, 'utf8')
      textCache.set(relPath, content)
      return content
    } catch (err) {
      warnings.push({
        code: 'ADOPT_FILE_UNREADABLE',
        message: `Cannot read file: ${(err as Error).message}`,
        context: { path: relPath },
      })
      textCache.set(relPath, undefined)
      return undefined
    }
  }

  function manifestStatus(kind: ManifestKind): ManifestStatus {
    return status[kind]
  }

  // Zod schemas for manifest slices — runtime validation prevents type errors
  // from malformed manifests (e.g., `dependencies: []` instead of an object)
  const zDepRecord = z.record(z.string(), z.string()).optional()
  const PackageJsonSchema = z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    private: z.boolean().optional(),
    main: z.string().optional(),
    module: z.string().optional(),
    types: z.string().optional(),
    typings: z.string().optional(),
    // browser can be a string OR a map; map values can be string OR false (npm spec
    // allows `{"fs": false}` to mean "exclude this module from browser builds").
    // Use z.unknown() at the value level to be permissive.
    browser: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    exports: z.unknown().optional(),
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    type: z.enum(['module', 'commonjs']).optional(),
    engines: z.record(z.string(), z.string()).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: zDepRecord,
    devDependencies: zDepRecord,
    peerDependencies: zDepRecord,
    optionalDependencies: zDepRecord,
    // workspaces: array form OR object form with .passthrough() so extras like
    // `nohoist`, `overrides`, or package-manager-specific keys don't reject.
    workspaces: z.union([
      z.array(z.string()),
      z.object({ packages: z.array(z.string()).optional() }).passthrough(),
    ]).optional(),
  }).passthrough()

  const PyprojectTomlSchema = z.object({
    project: z.object({
      name: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      'optional-dependencies': z.record(z.string(), z.array(z.string())).optional(),
      scripts: z.record(z.string(), z.string()).optional(),
    }).passthrough().optional(),
    tool: z.record(z.string(), z.unknown()).optional(),
    'build-system': z.object({ requires: z.array(z.string()).optional() }).passthrough().optional(),
  }).passthrough()

  const CargoTomlSchema = z.object({
    package: z.object({
      name: z.string().optional(),
      version: z.string().optional(),
      publish: z.union([z.boolean(), z.array(z.string())]).optional(),
    }).passthrough().optional(),
    dependencies: z.record(z.string(), z.unknown()).optional(),
    'dev-dependencies': z.record(z.string(), z.unknown()).optional(),
    lib: z.record(z.string(), z.unknown()).optional(),
    bin: z.array(z.object({ name: z.string(), path: z.string().optional() }).passthrough()).optional(),
  }).passthrough()

  function packageJson(): PackageJson | undefined {
    if ('packageJson' in parseCache) return parseCache.packageJson
    if (!hasFile('package.json')) {
      status.npm = 'missing'
      parseCache.packageJson = undefined
      return undefined
    }
    const text = readFileText('package.json')
    if (text === undefined) {
      status.npm = 'unparseable'
      parseCache.packageJson = undefined
      return undefined
    }
    try {
      const raw = JSON.parse(text) as unknown
      const parsed = PackageJsonSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `package.json schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'package.json' },
        })
        status.npm = 'unparseable'
        parseCache.packageJson = undefined
        return undefined
      }
      status.npm = 'parsed'
      parseCache.packageJson = parsed.data as PackageJson
      return parsed.data as PackageJson
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `package.json parse failed: ${(err as Error).message}`,
        context: { path: 'package.json' },
      })
      status.npm = 'unparseable'
      parseCache.packageJson = undefined
      return undefined
    }
  }

  function pyprojectToml(): PyprojectToml | undefined {
    if ('pyprojectToml' in parseCache) return parseCache.pyprojectToml
    if (!hasFile('pyproject.toml')) {
      status.py = 'missing'
      parseCache.pyprojectToml = undefined
      return undefined
    }
    const text = readFileText('pyproject.toml')
    if (text === undefined) {
      status.py = 'unparseable'
      parseCache.pyprojectToml = undefined
      return undefined
    }
    try {
      const raw = parseTOML(text) as unknown
      const parsed = PyprojectTomlSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `pyproject.toml schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'pyproject.toml' },
        })
        status.py = 'unparseable'
        parseCache.pyprojectToml = undefined
        return undefined
      }
      status.py = 'parsed'
      parseCache.pyprojectToml = parsed.data as PyprojectToml
      return parsed.data as PyprojectToml
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `pyproject.toml parse failed: ${(err as Error).message}`,
        context: { path: 'pyproject.toml' },
      })
      status.py = 'unparseable'
      parseCache.pyprojectToml = undefined
      return undefined
    }
  }

  function cargoToml(): CargoToml | undefined {
    if ('cargoToml' in parseCache) return parseCache.cargoToml
    if (!hasFile('Cargo.toml')) {
      status.cargo = 'missing'
      parseCache.cargoToml = undefined
      return undefined
    }
    const text = readFileText('Cargo.toml')
    if (text === undefined) {
      status.cargo = 'unparseable'
      parseCache.cargoToml = undefined
      return undefined
    }
    try {
      const raw = parseTOML(text) as unknown
      const parsed = CargoTomlSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `Cargo.toml schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'Cargo.toml' },
        })
        status.cargo = 'unparseable'
        parseCache.cargoToml = undefined
        return undefined
      }
      status.cargo = 'parsed'
      parseCache.cargoToml = parsed.data as CargoToml
      return parsed.data as CargoToml
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `Cargo.toml parse failed: ${(err as Error).message}`,
        context: { path: 'Cargo.toml' },
      })
      status.cargo = 'unparseable'
      parseCache.cargoToml = undefined
      return undefined
    }
  }

  function goMod(): GoMod | undefined {
    if ('goMod' in parseCache) return parseCache.goMod
    if (!hasFile('go.mod')) {
      status.go = 'missing'
      parseCache.goMod = undefined
      return undefined
    }
    const text = readFileText('go.mod')
    if (text === undefined) {
      status.go = 'unparseable'
      parseCache.goMod = undefined
      return undefined
    }
    try {
      const parsed = parseGoMod(text)
      status.go = 'parsed'
      parseCache.goMod = parsed
      return parsed
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `go.mod parse failed: ${(err as Error).message}`,
        context: { path: 'go.mod' },
      })
      status.go = 'unparseable'
      parseCache.goMod = undefined
      return undefined
    }
  }

  function depInNpm(name: string, scope: DepScope): boolean {
    const pkg = packageJson()
    if (!pkg) return false
    const scopes: NpmDepScope[] = scope === 'all'
      ? ['deps', 'dev', 'peer', 'optional']
      : scope === 'deps' || scope === 'dev' || scope === 'peer' || scope === 'optional'
        ? [scope]
        : ['deps', 'dev', 'peer', 'optional']
    for (const s of scopes) {
      const bucket = s === 'deps' ? pkg.dependencies
        : s === 'dev' ? pkg.devDependencies
        : s === 'peer' ? pkg.peerDependencies
        : pkg.optionalDependencies
      if (bucket && name in bucket) return true
    }
    return false
  }

  function depInPy(name: string): boolean {
    const py = pyprojectToml()
    if (!py) return false
    const normalized = normalizePep503(name)
    // PEP 621 project.dependencies
    const pep621 = py.project?.dependencies ?? []
    for (const spec of pep621) {
      if (extractPyName(spec) === normalized) return true
    }
    // Poetry [tool.poetry.dependencies]
    const poetryDeps = py.tool?.poetry?.dependencies
    if (poetryDeps) {
      for (const key of Object.keys(poetryDeps)) {
        if (key === 'python') continue
        if (normalizePep503(key) === normalized) return true
      }
    }
    // Poetry dev deps
    const poetryDev = py.tool?.poetry?.['dev-dependencies']
    if (poetryDev) {
      for (const key of Object.keys(poetryDev)) {
        if (normalizePep503(key) === normalized) return true
      }
    }
    // Poetry group deps
    const groups = py.tool?.poetry?.group ?? {}
    for (const group of Object.values(groups)) {
      if (group.dependencies) {
        for (const key of Object.keys(group.dependencies)) {
          if (normalizePep503(key) === normalized) return true
        }
      }
    }
    return false
  }

  function depInCargo(name: string): boolean {
    const cargo = cargoToml()
    if (!cargo) return false
    if (cargo.dependencies && name in cargo.dependencies) return true
    if (cargo['dev-dependencies'] && name in cargo['dev-dependencies']) return true
    return false
  }

  function depInGo(name: string): boolean {
    const go = goMod()
    if (!go) return false
    for (const req of go.requires ?? []) {
      if (req.indirect) continue        // filter indirect by default
      if (req.path === name) return true
      if (req.path.startsWith(`${name}/`)) return true
    }
    return false
  }

  function hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    const kinds: ManifestKind[] = where
      ? Array.isArray(where) ? [...where] : [where as ManifestKind]
      : ['npm', 'py', 'cargo', 'go']
    for (const kind of kinds) {
      if (kind === 'npm' && depInNpm(name, scope)) return true
      if (kind === 'py' && depInPy(name)) return true
      if (kind === 'cargo' && depInCargo(name)) return true
      if (kind === 'go' && depInGo(name)) return true
    }
    return false
  }

  function hasAnyDep(names: readonly string[], where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    for (const name of names) {
      if (hasDep(name, where, scope)) return true
    }
    return false
  }

  return {
    projectRoot,
    get warnings() { return warnings },
    hasFile,
    dirExists,
    rootEntries,
    listDir,
    readFileText,
    manifestStatus,
    packageJson,
    pyprojectToml,
    cargoToml,
    goMod,
    hasDep,
    hasAnyDep,
  }
}

// Test helper
export interface FakeContextInput {
  projectRoot?: string
  rootEntries?: readonly string[]
  files?: Readonly<Record<string, string>>
  dirs?: readonly string[]
  /** Per-directory listing — keys are relative paths, values are sorted entry names. */
  dirListings?: Readonly<Record<string, readonly string[]>>
  packageJson?: PackageJson | 'unparseable' | 'missing'
  pyprojectToml?: PyprojectToml | 'unparseable' | 'missing'
  cargoToml?: CargoToml | 'unparseable' | 'missing'
  goMod?: GoMod | 'unparseable' | 'missing'
  /** Override individual manifest statuses (e.g., to test 'unparseable' edge cases). */
  manifestStatuses?: Partial<Record<ManifestKind, ManifestStatus>>
}

export function createFakeSignalContext(input: FakeContextInput = {}): SignalContext {
  const warnings: ScaffoldWarning[] = []
  const rootEntriesCache = [...(input.rootEntries ?? [])].sort()
  const filesMap = input.files ?? {}
  const dirsSet = new Set(input.dirs ?? [])

  function manifestVal<T>(v: T | 'unparseable' | 'missing' | undefined, kind: ManifestKind): { val: T | undefined; status: ManifestStatus } {
    if (v === 'missing' || v === undefined) return { val: undefined, status: 'missing' }
    if (v === 'unparseable') return { val: undefined, status: 'unparseable' }
    return { val: v as T, status: 'parsed' }
  }

  const pkg = manifestVal<PackageJson>(input.packageJson, 'npm')
  const py = manifestVal<PyprojectToml>(input.pyprojectToml, 'py')
  const cargo = manifestVal<CargoToml>(input.cargoToml, 'cargo')
  const go = manifestVal<GoMod>(input.goMod, 'go')

  // Delegate to real createSignalContext's dep logic where possible
  // (keep behavior identical between fake and real contexts)
  function hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    const kinds: ManifestKind[] = where
      ? Array.isArray(where) ? [...where] : [where as ManifestKind]
      : ['npm', 'py', 'cargo', 'go']
    for (const kind of kinds) {
      if (kind === 'npm' && pkg.val) {
        const scopes: NpmDepScope[] = scope === 'all' ? ['deps', 'dev', 'peer', 'optional'] : [scope as NpmDepScope]
        for (const s of scopes) {
          const bucket = s === 'deps' ? pkg.val.dependencies
            : s === 'dev' ? pkg.val.devDependencies
            : s === 'peer' ? pkg.val.peerDependencies
            : pkg.val.optionalDependencies
          if (bucket && name in bucket) return true
        }
      }
      // Use the SAME normalization as the real context (no shortcuts)
      if (kind === 'py' && py.val) {
        const normalized = name.toLowerCase().replace(/[-_.]+/g, '-')
        const pep621 = py.val.project?.dependencies ?? []
        for (const spec of pep621) {
          // Strip env markers, URL fragments, extras, version specs
          let s = spec.split(';')[0].split('@')[0]
          s = s.replace(/[=<>!~].*$/, '').replace(/\[.*?\]/, '').trim()
          if (s.toLowerCase().replace(/[-_.]+/g, '-') === normalized) return true
        }
        const poetryDeps = py.val.tool?.poetry?.dependencies
        if (poetryDeps) {
          for (const key of Object.keys(poetryDeps)) {
            if (key === 'python') continue
            if (key.toLowerCase().replace(/[-_.]+/g, '-') === normalized) return true
          }
        }
      }
      if (kind === 'cargo' && cargo.val?.dependencies && name in cargo.val.dependencies) return true
      if (kind === 'go' && go.val?.requires?.some(r => !r.indirect && r.path === name)) return true
    }
    return false
  }

  function hasAnyDep(names: readonly string[], where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    return names.some(n => hasDep(n, where, scope))
  }

  const dirListings = input.dirListings ?? {}
  const statusOverrides = input.manifestStatuses ?? {}

  return {
    projectRoot: input.projectRoot ?? '/fake',
    get warnings() { return warnings },
    hasFile: (p: string) => p in filesMap || rootEntriesCache.includes(p),
    dirExists: (p: string) => dirsSet.has(p),
    rootEntries: () => rootEntriesCache,
    listDir: (p: string) => dirListings[p] ?? [],
    readFileText: (p: string, maxBytes?: number) => {
      const content = filesMap[p]
      if (content === undefined) return undefined
      return maxBytes !== undefined && content.length > maxBytes
        ? content.slice(0, maxBytes)
        : content
    },
    manifestStatus: (kind: ManifestKind) =>
      statusOverrides[kind]
      ?? (kind === 'npm' ? pkg.status
      : kind === 'py' ? py.status
      : kind === 'cargo' ? cargo.status
      : go.status),
    packageJson: () => pkg.val,
    pyprojectToml: () => py.val,
    cargoToml: () => cargo.val,
    goMod: () => go.val,
    hasDep,
    hasAnyDep,
  }
}
```

- [ ] **Step 3: Create `src/project/detectors/file-text-match.ts`**

```ts
// src/project/detectors/file-text-match.ts
// Strips comments and template literal content from JS/TS source
// before doing substring or regex matches, to reduce false positives.

export function stripJsTsComments(content: string): string {
  // Step 1: strip /* */ and /** */ comments
  let result = content.replace(/\/\*[\s\S]*?\*\//g, '')

  // Step 2: strip single-line // comments (respecting strings)
  const lines = result.split('\n')
  const stripped = lines.map(line => {
    let inSingle = false, inDouble = false, inTemplate = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i)
      }
      if (i > 0 && line[i - 1] === '\\') continue
      if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle
      else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble
      else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate
    }
    return line
  }).join('\n')

  // Step 3: blank out template literal contents
  return stripped.replace(/`[^`]*`/g, '``')
}

export function matchesConfigExport(content: string, key: string, value: string): boolean {
  const stripped = stripJsTsComments(content)
  // Find the export boundary
  const markers = ['module.exports', 'export default', 'defineConfig(']
  let exportIdx = -1
  for (const marker of markers) {
    const idx = stripped.indexOf(marker)
    if (idx >= 0 && (exportIdx === -1 || idx < exportIdx)) exportIdx = idx
  }
  const region = exportIdx >= 0 ? stripped.slice(exportIdx) : stripped
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\b${escapedKey}\\s*:\\s*['"]${escapedValue}['"]`)
  return pattern.test(region)
}
```

- [ ] **Step 4: Create `src/project/detectors/required-fields.ts`**

```ts
// src/project/detectors/required-fields.ts
import type { z } from 'zod'

/** Returns the field names of a ZodObject that are required AND have no .default(). */
export function getRequiredFieldsWithoutDefaults<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): readonly string[] {
  const shape = schema.shape
  const required: string[] = []
  for (const key of Object.keys(shape)) {
    const field = shape[key] as z.ZodTypeAny
    if (field._def.typeName === 'ZodOptional') continue
    if (field._def.typeName === 'ZodDefault') continue
    required.push(key)
  }
  return required
}
```

- [ ] **Step 5: Create `src/project/detectors/index.ts`**

```ts
// src/project/detectors/index.ts
import type { SignalContext } from './context.js'
import type { Detector, DetectionMatch } from './types.js'

// Ordering is a performance optimization only. Correctness does NOT depend on order —
// all matches are collected and disambiguated per Section 3 Case A-G. Reordering is
// behavior-preserving. Current order: specific-signature detectors first (cheap
// distinctive failures), dep-heavy detectors middle, catch-all library last.
export const ALL_DETECTORS: readonly Detector[] = [
  // Detectors added in Tasks 5-7 — empty in this commit
]

export function runDetectors(
  ctx: SignalContext,
  detectors: readonly Detector[] = ALL_DETECTORS,
): DetectionMatch[] {
  const matches: DetectionMatch[] = []
  for (const detect of detectors) {
    const match = detect(ctx)
    if (match) matches.push(match)
  }
  return matches
}
```

- [ ] **Step 6: Write context tests**

Create `src/project/detectors/context.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'signal-context-'))
}

describe('createSignalContext (FsSignalContext)', () => {
  it('hasFile returns true for existing files', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'foo.txt'), 'hi')
    const ctx = createSignalContext(dir)
    expect(ctx.hasFile('foo.txt')).toBe(true)
    expect(ctx.hasFile('bar.txt')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('dirExists returns true for existing dirs', () => {
    const dir = makeTmpDir()
    fs.mkdirSync(path.join(dir, 'subdir'))
    const ctx = createSignalContext(dir)
    expect(ctx.dirExists('subdir')).toBe(true)
    expect(ctx.dirExists('missing')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rootEntries returns sorted names', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'b.txt'), '')
    fs.writeFileSync(path.join(dir, 'a.txt'), '')
    const ctx = createSignalContext(dir)
    expect(ctx.rootEntries()).toEqual(['a.txt', 'b.txt'])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('packageJson parses valid JSON', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'demo', version: '1.0.0', dependencies: { 'next': '14' },
    }))
    const ctx = createSignalContext(dir)
    expect(ctx.packageJson()?.name).toBe('demo')
    expect(ctx.manifestStatus('npm')).toBe('parsed')
    expect(ctx.hasDep('next', 'npm')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('packageJson emits ADOPT_MANIFEST_UNPARSEABLE on bad JSON', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'), '{ invalid json')
    const ctx = createSignalContext(dir)
    expect(ctx.packageJson()).toBeUndefined()
    expect(ctx.manifestStatus('npm')).toBe('unparseable')
    expect(ctx.warnings.some(w => w.code === 'ADOPT_MANIFEST_UNPARSEABLE')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('cargoToml parses valid TOML with [lib]', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'Cargo.toml'),
      '[package]\nname = "demo"\n[lib]\n[dependencies]\nbevy = "0.13"')
    const ctx = createSignalContext(dir)
    expect(ctx.cargoToml()?.package?.name).toBe('demo')
    expect(ctx.hasDep('bevy', 'cargo')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('goMod parses multi-line require blocks', () => {
    const dir = makeTmpDir()
    const content = `module example.com/demo
go 1.21
require (
  github.com/gin-gonic/gin v1.9.0
  github.com/spf13/pflag v1.0.5 // indirect
)`
    fs.writeFileSync(path.join(dir, 'go.mod'), content)
    const ctx = createSignalContext(dir)
    const go = ctx.goMod()
    expect(go?.module).toBe('example.com/demo')
    expect(go?.requires?.length).toBe(2)
    expect(ctx.hasDep('github.com/gin-gonic/gin', 'go')).toBe(true)
    // Indirect dep should be filtered
    expect(ctx.hasDep('github.com/spf13/pflag', 'go')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('pyprojectToml parses Poetry [tool.poetry.dependencies]', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'pyproject.toml'),
      '[tool.poetry]\nname = "demo"\n[tool.poetry.dependencies]\npython = "^3.10"\ntorch = "^2.0"')
    const ctx = createSignalContext(dir)
    expect(ctx.hasDep('torch', 'py')).toBe(true)
    expect(ctx.hasDep('python', 'py')).toBe(false)    // python key excluded
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('does not throw on permission errors — emits warning instead', () => {
    // Simulate by pointing at a non-existent path deep under /root (POSIX) or C:\Windows\System32 (Windows)
    // Use a path that definitely doesn't exist to trigger ENOENT
    const ctx = createSignalContext('/non-existent-path-12345')
    expect(() => ctx.rootEntries()).not.toThrow()
    expect(ctx.warnings.length).toBeGreaterThan(0)
  })

  it('readFileText returns undefined for missing files', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    expect(ctx.readFileText('missing.txt')).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('readFileText truncates files larger than maxBytes', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(1000))
    const ctx = createSignalContext(dir)
    const content = ctx.readFileText('big.txt', 100)
    expect(content?.length).toBe(100)
    expect(ctx.warnings.some(w => w.code === 'ADOPT_FILE_TRUNCATED')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('createFakeSignalContext', () => {
  it('reports files from the input map', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"x"}' },
    })
    expect(ctx.hasFile('package.json')).toBe(true)
    expect(ctx.readFileText('package.json')).toBe('{"name":"x"}')
  })

  it('reports dirs from the input set', () => {
    const ctx = createFakeSignalContext({ dirs: ['ios', 'android'] })
    expect(ctx.dirExists('ios')).toBe(true)
    expect(ctx.dirExists('android')).toBe(true)
    expect(ctx.dirExists('web')).toBe(false)
  })

  it('reports manifestStatus from input', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x' },
      pyprojectToml: 'unparseable',
    })
    expect(ctx.manifestStatus('npm')).toBe('parsed')
    expect(ctx.manifestStatus('py')).toBe('unparseable')
    expect(ctx.manifestStatus('cargo')).toBe('missing')
  })

  it('hasDep walks fake package.json deps', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x', dependencies: { 'next': '14', 'react': '18' } },
    })
    expect(ctx.hasDep('next', 'npm')).toBe(true)
    expect(ctx.hasDep('react', 'npm')).toBe(true)
    expect(ctx.hasDep('vue', 'npm')).toBe(false)
  })
})
```

- [ ] **Step 7: Write file-text-match tests**

Create `src/project/detectors/file-text-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { stripJsTsComments, matchesConfigExport } from './file-text-match.js'

describe('stripJsTsComments', () => {
  it('strips single-line comments', () => {
    expect(stripJsTsComments('const x = 1 // comment')).toBe('const x = 1 ')
  })

  it('strips block comments', () => {
    expect(stripJsTsComments('const x = /* c */ 1')).toBe('const x =  1')
  })

  it('strips JSDoc', () => {
    expect(stripJsTsComments('/** @param x */\nconst f = 1')).toContain('const f = 1')
  })

  it('does not strip // inside strings', () => {
    expect(stripJsTsComments('const url = "http://example.com"')).toContain('http://example.com')
  })

  it('blanks template literal contents', () => {
    expect(stripJsTsComments('const x = `output: "export"`')).toBe('const x = ``')
  })
})

describe('matchesConfigExport', () => {
  it('matches a primitive export default directive', () => {
    const content = `export default { output: 'export' }`
    expect(matchesConfigExport(content, 'output', 'export')).toBe(true)
  })

  it('matches module.exports variant', () => {
    const content = `module.exports = { output: "standalone" }`
    expect(matchesConfigExport(content, 'output', 'standalone')).toBe(true)
  })

  it('matches defineConfig() wrapper', () => {
    const content = `import { defineConfig } from 'vite'\nexport default defineConfig({ ssr: false })`
    expect(matchesConfigExport(content, 'ssr', 'false')).toBe(false)
    // ssr: false is not a quoted string — test with a quoted value
    expect(matchesConfigExport(
      `export default defineConfig({ output: 'hybrid' })`,
      'output', 'hybrid',
    )).toBe(true)
  })

  it('does not match inside line comments', () => {
    const content = `// output: 'export'\nexport default {}`
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })

  it('does not match inside template literals', () => {
    const content = 'const s = `output: \'export\'`\nexport default {}'
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })

  it('does not match dynamic expressions', () => {
    const content = `export default { output: process.env.X ? 'export' : undefined }`
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })
})
```

- [ ] **Step 8: Write required-fields tests**

Create `src/project/detectors/required-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { getRequiredFieldsWithoutDefaults } from './required-fields.js'
import { WebAppConfigSchema, BackendConfigSchema } from '../../config/schema.js'

describe('getRequiredFieldsWithoutDefaults', () => {
  it('returns the anchor field for WebAppConfigSchema', () => {
    const required = getRequiredFieldsWithoutDefaults(WebAppConfigSchema)
    expect(required).toEqual(['renderingStrategy'])
  })

  it('returns the anchor field for BackendConfigSchema', () => {
    const required = getRequiredFieldsWithoutDefaults(BackendConfigSchema)
    expect(required).toEqual(['apiStyle'])
  })

  it('excludes optional fields', () => {
    const schema = z.object({
      a: z.string(),
      b: z.string().optional(),
      c: z.string().default('c'),
    })
    const required = getRequiredFieldsWithoutDefaults(schema)
    expect(required).toEqual(['a'])
  })
})
```

- [ ] **Step 9: Run all new tests**

```bash
npm test -- src/project/detectors/
```
Expected: all tests pass (~30 cases total across context/file-text-match/required-fields).

- [ ] **Step 10: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/project/detectors/
git commit -m "feat: SignalContext + detector skeleton (no detectors yet)"
```

---

## Task 5: Relocate game detection to detectors/game.ts

**Files:**
- Create: `src/project/detectors/game.ts` (rewrites inline game logic to use SignalContext)
- Create: `src/project/detectors/game.test.ts`
- Create: `tests/fixtures/adopt/detectors/game/unity-only/Assets/.gitkeep`
- Create: `tests/fixtures/adopt/detectors/game/unity-only/Assets/test.meta`
- Create: `tests/fixtures/adopt/detectors/game/unreal-only/MyGame.uproject`
- Create: `tests/fixtures/adopt/detectors/game/godot-only/project.godot`
- Create: `tests/fixtures/adopt/detectors/game/bevy/Cargo.toml`
- Create: `tests/fixtures/adopt/detectors/game/bevy/src/main.rs`
- Modify: `src/project/adopt.ts` (remove inline game detection block at lines 73-93)
- Modify: `src/project/detectors/index.ts` (add `detectGame` to ALL_DETECTORS)

**Context:** The multi-engine fixture from Task 3 must still pass after this refactor — that's the behavior-preserving guarantee. Also add a bevy fixture for `engine: 'custom'`.

### Steps

- [ ] **Step 1: Create game.ts detector**

```ts
// src/project/detectors/game.ts
import type { SignalContext } from './context.js'
import type { GameMatch } from './types.js'
import { evidence } from './types.js'

/**
 * Detects game projects by engine signature (per spec Section 5.9):
 *   Unity    → Assets/ directory containing any *.meta file
 *   Unreal   → *.uproject at root
 *   Godot    → project.godot at root
 *   Bevy     → Cargo.toml with bevy dep → engine: 'custom'
 *   Love2D   → conf.lua at root + love dep / luarocks marker → engine: 'custom'
 *   JS games → phaser, babylonjs, or three dep + index.html → engine: 'custom'
 *
 * Precedence: Unity > Unreal > Godot > Bevy > Love2D > JS (locked by regression test).
 *
 * IMPORTANT: this detector ONLY uses the SignalContext API — no direct fs/path imports.
 * Listing Assets/ for .meta files goes through ctx.listDir() (added in Task 4b).
 */
export function detectGame(ctx: SignalContext): GameMatch | null {
  // Unity — Assets/ with at least one .meta file
  if (ctx.dirExists('Assets')) {
    const assetsEntries = ctx.listDir('Assets')
    if (assetsEntries.some(name => name.endsWith('.meta'))) {
      return {
        projectType: 'game',
        confidence: 'high',
        partialConfig: { engine: 'unity' },
        evidence: [evidence('unity-assets-meta', 'Assets/')],
      }
    }
  }

  // Unreal — any *.uproject at root
  const uproject = ctx.rootEntries().find(f => f.endsWith('.uproject'))
  if (uproject) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'unreal' },
      evidence: [evidence('unreal-uproject', uproject)],
    }
  }

  // Godot — project.godot at root
  if (ctx.hasFile('project.godot')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'godot' },
      evidence: [evidence('godot-project', 'project.godot')],
    }
  }

  // Bevy — Rust game engine
  if (ctx.hasDep('bevy', 'cargo')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [evidence('bevy-dep', 'Cargo.toml')],
    }
  }

  // Love2D — Lua game engine. conf.lua + main.lua at root is the canonical signature.
  if (ctx.hasFile('conf.lua') && ctx.hasFile('main.lua')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [evidence('love2d-conf', 'conf.lua')],
    }
  }

  // JavaScript game engines — Phaser / Babylon / Three.js with an HTML entry
  const hasJsGameDep =
    ctx.hasDep('phaser', 'npm')
    || ctx.hasDep('babylonjs', 'npm')
    || ctx.hasDep('@babylonjs/core', 'npm')
    || (ctx.hasDep('three', 'npm') && ctx.hasFile('index.html'))
  if (hasJsGameDep) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [
        evidence('js-game-dep', 'package.json',
          'phaser/babylonjs/three with HTML entry suggests browser game'),
      ],
    }
  }

  return null
}
```

- [ ] **Step 2: Register detectGame in index.ts**

Edit `src/project/detectors/index.ts`:

```ts
import { detectGame } from './game.js'

export const ALL_DETECTORS: readonly Detector[] = [
  detectGame,
]
```

- [ ] **Step 3: Remove inline game detection from adopt.ts**

Edit `src/project/adopt.ts`. Delete lines 73-93 (the inline `detectedEngine` block):

```ts
// BEFORE (delete these lines):
  // 4. Game engine detection
  let detectedEngine: string | undefined
  if (fs.existsSync(path.join(projectRoot, 'Assets'))) {
    // ...
  }
  // ... more inline detection ...
```

Replace with a call to the new detector pipeline.

**NOTE:** Task 5 intentionally only sets `result.gameConfig` (the existing field) and NOT `result.detectedConfig`/`detectionEvidence`/`detectionConfidence`. Those new fields are added in Task 10's gameConfig deprecation migration + Task 11's CLI handler delta. Task 5 is behavior-preserving — its only goal is to move the detection logic out of the inline block without changing what `runAdoption` returns.

```ts
// AFTER (insert after step 3 "For each step, check if its expected outputs exist"):

  // 4. Project-type detection via per-type detectors
  const ctx = createSignalContext(projectRoot)
  const detectorMatches = runDetectors(ctx)
  const gameMatch = detectorMatches.find(m => m.projectType === 'game')

  const result: AdoptionResult = {
    mode: detection.mode,
    artifactsFound: detectedArtifacts.length,
    detectedArtifacts,
    stepsCompleted,
    stepsRemaining,
    methodology,
    errors: [],
    warnings: [...ctx.warnings],
  }

  if (gameMatch) {
    result.projectType = 'game'
    result.gameConfig = gameMatch.partialConfig as Partial<import('../types/index.js').GameConfig>
  }
```

And add the imports at the top of `adopt.ts`:

```ts
import { createSignalContext } from './detectors/context.js'
import { runDetectors } from './detectors/index.js'
```

- [ ] **Step 4: Create game fixtures for per-detector tests**

```bash
mkdir -p tests/fixtures/adopt/detectors/game/unity-only/Assets
touch tests/fixtures/adopt/detectors/game/unity-only/Assets/test.meta

mkdir -p tests/fixtures/adopt/detectors/game/unreal-only
touch tests/fixtures/adopt/detectors/game/unreal-only/MyGame.uproject

mkdir -p tests/fixtures/adopt/detectors/game/godot-only
echo '[gd_scene]' > tests/fixtures/adopt/detectors/game/godot-only/project.godot

mkdir -p tests/fixtures/adopt/detectors/game/bevy/src
cat > tests/fixtures/adopt/detectors/game/bevy/Cargo.toml <<'EOF'
[package]
name = "demo"
version = "0.1.0"

[dependencies]
bevy = "0.13"
EOF
cat > tests/fixtures/adopt/detectors/game/bevy/src/main.rs <<'EOF'
fn main() {
  println!("bevy demo")
}
EOF
```

- [ ] **Step 5: Write per-detector tests for game**

Create `src/project/detectors/game.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectGame } from './game.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/game')

describe('detectGame', () => {
  it('detects Unity from Assets/*.meta', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'unity-only'))
    const match = detectGame(ctx)
    expect(match).toBeTruthy()
    expect(match?.projectType).toBe('game')
    expect(match?.partialConfig.engine).toBe('unity')
    expect(match?.confidence).toBe('high')
  })

  it('detects Unreal from *.uproject', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'unreal-only'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('unreal')
  })

  it('detects Godot from project.godot', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'godot-only'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('godot')
  })

  it('detects Bevy as custom engine', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'bevy'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('custom')
  })

  it('returns null when no game signature exists', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      packageJson: { name: 'demo' },
    })
    expect(detectGame(ctx)).toBeNull()
  })

  it('Unity precedence: picks Unity when Unity + Unreal both present', () => {
    const multiEngine = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/game/multi-engine')
    const ctx = createSignalContext(multiEngine)
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('unity')
  })

  it('emits evidence with signal and file', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'godot-only'))
    const match = detectGame(ctx)
    expect(match?.evidence).toContainEqual({
      signal: 'godot-project', file: 'project.godot', note: undefined,
    })
  })

  it('returns null for empty directory', () => {
    const ctx = createFakeSignalContext({ rootEntries: [] })
    expect(detectGame(ctx)).toBeNull()
  })
})
```

- [ ] **Step 6: Run game detector tests**

```bash
npm test -- src/project/detectors/game.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 7: Run existing adopt tests — regression guard**

```bash
npm test -- src/project/adopt.test.ts
```
Expected: 13 tests pass, including `Unity wins precedence when multi-engine signatures coexist` (now going through the new detector path).

- [ ] **Step 8: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/project/detectors/game.ts src/project/detectors/game.test.ts src/project/detectors/index.ts src/project/adopt.ts tests/fixtures/adopt/detectors/game/
git commit -m "feat: relocate game detection to detectors/game.ts (behavior preserved)"
```

---

## Task 6a: detectWebApp

**Files:**
- Create: `src/project/detectors/web-app.ts`
- Create: `src/project/detectors/web-app.test.ts`
- Create: fixtures under `tests/fixtures/adopt/detectors/web-app/`
- Modify: `src/project/detectors/index.ts` (register `detectWebApp`)

**Spec reference:** Section 5.1. Anchor: `renderingStrategy`. Mobile disqualifier early-return per Section 5 R2-Δ1.

### Steps

- [ ] **Step 1: Create fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/web-app/{nextjs-standalone/app,vite-spa,astro-server,sveltekit-vercel}
cat > tests/fixtures/adopt/detectors/web-app/nextjs-standalone/package.json <<'EOF'
{"name":"demo","dependencies":{"next":"14","react":"18","socket.io":"4"}}
EOF
echo "export default { output: 'standalone' }" > tests/fixtures/adopt/detectors/web-app/nextjs-standalone/next.config.mjs
touch tests/fixtures/adopt/detectors/web-app/nextjs-standalone/app/page.tsx

cat > tests/fixtures/adopt/detectors/web-app/vite-spa/package.json <<'EOF'
{"name":"demo","dependencies":{"vue":"3","vite":"5"}}
EOF
echo "export default {}" > tests/fixtures/adopt/detectors/web-app/vite-spa/vite.config.ts
echo "<!doctype html>" > tests/fixtures/adopt/detectors/web-app/vite-spa/index.html

cat > tests/fixtures/adopt/detectors/web-app/astro-server/package.json <<'EOF'
{"name":"demo","dependencies":{"astro":"4"}}
EOF
echo "export default defineConfig({ output: 'server' })" > tests/fixtures/adopt/detectors/web-app/astro-server/astro.config.mjs

cat > tests/fixtures/adopt/detectors/web-app/sveltekit-vercel/package.json <<'EOF'
{"name":"demo","dependencies":{"@sveltejs/kit":"2","@sveltejs/adapter-vercel":"5","next-auth":"4"}}
EOF
echo "import adapter from '@sveltejs/adapter-vercel'" > tests/fixtures/adopt/detectors/web-app/sveltekit-vercel/svelte.config.js
echo "export default { kit: { adapter: adapter() } }" >> tests/fixtures/adopt/detectors/web-app/sveltekit-vercel/svelte.config.js
```

- [ ] **Step 2: Write the failing test file**

Create `src/project/detectors/web-app.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectWebApp } from './web-app.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/web-app')

describe('detectWebApp', () => {
  it('detects Next.js with output: standalone as ssr', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'nextjs-standalone'))
    const m = detectWebApp(ctx)
    expect(m?.projectType).toBe('web-app')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.renderingStrategy).toBe('ssr')
    expect(m?.partialConfig.realtime).toBe('websocket')
  })

  it('detects Vite + index.html as spa', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'vite-spa'))
    expect(detectWebApp(ctx)?.partialConfig.renderingStrategy).toBe('spa')
  })

  it('detects Astro output: server as ssr (not hybrid)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'astro-server'))
    expect(detectWebApp(ctx)?.partialConfig.renderingStrategy).toBe('ssr')
  })

  it('detects SvelteKit + adapter-vercel as ssr + serverless deployTarget', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'sveltekit-vercel'))
    const m = detectWebApp(ctx)
    expect(m?.partialConfig.renderingStrategy).toBe('ssr')
    expect(m?.partialConfig.deployTarget).toBe('serverless')
    expect(m?.partialConfig.authFlow).toBe('session')
  })

  it('Mobile disqualifier: app.json + expo dep both present → null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['app.json', 'package.json'],
      files: { 'app.json': '{}' },
      packageJson: { name: 'mobile', dependencies: { expo: '50' } },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Mobile disqualifier: ios/ + android/ both exist → null', () => {
    const ctx = createFakeSignalContext({
      dirs: ['ios', 'android'],
      packageJson: { name: 'mobile' },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Monorepo with hoisted expo + root next.config: NOT disqualified', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.mjs'],
      files: { 'next.config.mjs': "export default { output: 'standalone' }" },
      packageJson: { name: 'monorepo', dependencies: { expo: '50', next: '14', react: '18' } },
    })
    expect(detectWebApp(ctx)?.projectType).toBe('web-app')
  })

  it('Next.js with both app/ and pages/ → hybrid', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.mjs'],
      files: { 'next.config.mjs': 'export default {}' },
      dirs: ['app', 'pages'],
      packageJson: { name: 'demo', dependencies: { next: '14' } },
    })
    expect(detectWebApp(ctx)?.partialConfig.renderingStrategy).toBe('hybrid')
  })

  it('returns null when no framework signals present', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['README.md'],
      packageJson: { name: 'demo' },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Default Next.js (no output directive) → ssr', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.js'],
      files: { 'next.config.js': 'module.exports = {}' },
      packageJson: { name: 'demo', dependencies: { next: '14' } },
    })
    expect(detectWebApp(ctx)?.partialConfig.renderingStrategy).toBe('ssr')
  })
})
```

Run: `npm test -- src/project/detectors/web-app.test.ts`. **Expected: FAIL** with `Cannot find module './web-app.js'`.

- [ ] **Step 3: Implement detectWebApp**

Create `src/project/detectors/web-app.ts`:

```ts
import type { SignalContext } from './context.js'
import type { WebAppMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'
import { matchesConfigExport } from './file-text-match.js'

export function detectWebApp(ctx: SignalContext): WebAppMatch | null {
  if (isMobileProject(ctx)) return null

  const ev: DetectionEvidence[] = []
  let renderingStrategy: WebAppMatch['partialConfig']['renderingStrategy'] | undefined
  let deployTarget: WebAppMatch['partialConfig']['deployTarget'] | undefined

  // Next.js
  const nextCfg = readFirst(ctx, ['next.config.mjs', 'next.config.js', 'next.config.ts', 'next.config.cjs'])
  if (nextCfg) {
    ev.push(evidence('next-config', nextCfg.path))
    if (matchesConfigExport(nextCfg.text, 'output', 'export')) renderingStrategy = 'ssg'
    else if (matchesConfigExport(nextCfg.text, 'output', 'standalone')) renderingStrategy = 'ssr'
    else if (ctx.dirExists('app') && ctx.dirExists('pages')) renderingStrategy = 'hybrid'
    else renderingStrategy = 'ssr'
  }

  // Astro
  if (!renderingStrategy) {
    const astroCfg = readFirst(ctx, ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'])
    if (astroCfg) {
      ev.push(evidence('astro-config', astroCfg.path))
      if (matchesConfigExport(astroCfg.text, 'output', 'server')) renderingStrategy = 'ssr'
      else if (matchesConfigExport(astroCfg.text, 'output', 'hybrid')) renderingStrategy = 'hybrid'
      else renderingStrategy = 'ssg'
    }
  }

  // Remix / React Router v7
  if (!renderingStrategy) {
    const remixCfg = readFirst(ctx, ['remix.config.js', 'remix.config.ts', 'react-router.config.js', 'react-router.config.ts'])
    if (remixCfg) {
      ev.push(evidence('remix-config', remixCfg.path))
      renderingStrategy = 'ssr'
    }
  }

  // Nuxt
  if (!renderingStrategy) {
    const nuxtCfg = readFirst(ctx, ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs'])
    if (nuxtCfg) {
      ev.push(evidence('nuxt-config', nuxtCfg.path))
      renderingStrategy = /\bssr\s*:\s*false\b/.test(nuxtCfg.text) ? 'spa' : 'ssr'
    }
  }

  // SvelteKit (adapter dep determines deployTarget)
  if (!renderingStrategy) {
    const svelteCfg = readFirst(ctx, ['svelte.config.js', 'svelte.config.ts', 'svelte.config.mjs'])
    if (svelteCfg) {
      ev.push(evidence('svelte-config', svelteCfg.path))
      if (ctx.hasDep('@sveltejs/adapter-static', 'npm')) renderingStrategy = 'ssg'
      else if (ctx.hasAnyDep(['@sveltejs/adapter-vercel', '@sveltejs/adapter-netlify', '@sveltejs/adapter-auto'], 'npm')) {
        renderingStrategy = 'ssr'
        deployTarget = 'serverless'
      } else if (ctx.hasDep('@sveltejs/adapter-cloudflare', 'npm')) {
        renderingStrategy = 'ssr'
        deployTarget = 'edge'
      } else if (ctx.hasDep('@sveltejs/adapter-node', 'npm')) {
        renderingStrategy = 'ssr'
        deployTarget = 'container'
      } else {
        renderingStrategy = 'ssr'
      }
    }
  }

  // Vite (no SSR plugin → SPA)
  if (!renderingStrategy) {
    const viteCfg = readFirst(ctx, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'])
    if (viteCfg && (ctx.hasFile('index.html') || ctx.hasFile('public/index.html'))) {
      ev.push(evidence('vite-config', viteCfg.path))
      renderingStrategy = 'spa'
    }
  }

  // Angular
  if (!renderingStrategy && ctx.hasFile('angular.json')) {
    ev.push(evidence('angular-json', 'angular.json'))
    renderingStrategy = 'spa'
  }

  if (!renderingStrategy) return null

  // Orthogonal deployTarget — only set if not already (e.g., from svelte adapter)
  if (!deployTarget) {
    if (ctx.hasFile('vercel.json')) { deployTarget = 'serverless'; ev.push(evidence('vercel-json', 'vercel.json')) }
    else if (ctx.hasFile('netlify.toml')) { deployTarget = 'serverless'; ev.push(evidence('netlify-toml', 'netlify.toml')) }
    else if (ctx.hasFile('wrangler.toml')) { deployTarget = 'edge'; ev.push(evidence('wrangler-toml', 'wrangler.toml')) }
    else if (ctx.hasFile('Dockerfile')) { deployTarget = 'container'; ev.push(evidence('dockerfile', 'Dockerfile')) }
  }

  // realtime
  let realtime: WebAppMatch['partialConfig']['realtime'] | undefined
  if (ctx.hasAnyDep(['socket.io', 'socket.io-client'], 'npm')) {
    realtime = 'websocket'
    ev.push(evidence('socket-io-dep'))
  } else if (ctx.hasDep('ws', 'npm')) {
    realtime = 'websocket'
    ev.push(evidence('ws-dep'))
  }

  // authFlow
  let authFlow: WebAppMatch['partialConfig']['authFlow'] | undefined
  if (ctx.hasAnyDep(['next-auth', '@auth/core', 'lucia', '@supabase/supabase-js'], 'npm')) {
    authFlow = 'session'
    ev.push(evidence('session-auth-dep'))
  } else if (ctx.hasAnyDep(['@clerk/clerk-sdk-node', '@clerk/nextjs', '@auth0/nextjs-auth0'], 'npm')) {
    authFlow = 'oauth'
    ev.push(evidence('oauth-provider-dep'))
  }

  const partialConfig: WebAppMatch['partialConfig'] = { renderingStrategy }
  if (deployTarget) partialConfig.deployTarget = deployTarget
  if (realtime) partialConfig.realtime = realtime
  if (authFlow) partialConfig.authFlow = authFlow

  return { projectType: 'web-app', confidence: 'high', partialConfig, evidence: ev }
}

function isMobileProject(ctx: SignalContext): boolean {
  if (ctx.hasFile('pubspec.yaml')) return true
  if (ctx.hasFile('app.json') && ctx.hasDep('expo', 'npm')) return true
  if (ctx.dirExists('ios') && ctx.dirExists('android')) return true
  return false
}

function readFirst(ctx: SignalContext, paths: readonly string[]): { path: string; text: string } | undefined {
  for (const p of paths) {
    if (ctx.hasFile(p)) {
      const text = ctx.readFileText(p)
      if (text !== undefined) return { path: p, text }
    }
  }
  return undefined
}
```

- [ ] **Step 4: Register in index.ts**

```ts
import { detectGame } from './game.js'
import { detectWebApp } from './web-app.js'
export const ALL_DETECTORS: readonly Detector[] = [detectGame, detectWebApp]
```

- [ ] **Step 5: Run tests — verify pass**

```bash
npm test -- src/project/detectors/web-app.test.ts
```
Expected: 10 PASS.

- [ ] **Step 6: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/project/detectors/web-app.ts src/project/detectors/web-app.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/web-app/
git commit -m "feat(detectors): detectWebApp"
```

---

## Task 6b: detectBackend

**Files:**
- Create: `src/project/detectors/backend.ts`
- Create: `src/project/detectors/backend.test.ts`
- Create: fixtures under `tests/fixtures/adopt/detectors/backend/`
- Modify: `src/project/detectors/index.ts` (register `detectBackend`)

**Spec reference:** Section 5.2. Anchor: `apiStyle`. Per-framework signature table with listen-call patterns.

### Steps

- [ ] **Step 1: Create fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/backend/{express-postgres/src/routes,fastapi-redis,gin-go/cmd/server,nestjs/src}

# Express + PostgreSQL
cat > tests/fixtures/adopt/detectors/backend/express-postgres/package.json <<'EOF'
{"name":"api","dependencies":{"express":"4","pg":"8","jsonwebtoken":"9"}}
EOF
cat > tests/fixtures/adopt/detectors/backend/express-postgres/src/server.ts <<'EOF'
import express from 'express'
const app = express()
app.listen(3000)
EOF
touch tests/fixtures/adopt/detectors/backend/express-postgres/src/routes/users.ts

# FastAPI + Redis-as-cache (should NOT show key-value because postgres exists)
cat > tests/fixtures/adopt/detectors/backend/fastapi-redis/pyproject.toml <<'EOF'
[project]
name = "api"
dependencies = ["fastapi", "uvicorn", "redis", "psycopg2"]
EOF
cat > tests/fixtures/adopt/detectors/backend/fastapi-redis/main.py <<'EOF'
from fastapi import FastAPI
import uvicorn
app = FastAPI()
if __name__ == "__main__":
    uvicorn.run(app)
EOF

# Gin (Go) + structured handlers
cat > tests/fixtures/adopt/detectors/backend/gin-go/go.mod <<'EOF'
module example.com/api
go 1.21
require github.com/gin-gonic/gin v1.9.0
EOF
cat > tests/fixtures/adopt/detectors/backend/gin-go/cmd/server/main.go <<'EOF'
package main
import "github.com/gin-gonic/gin"
func main() {
  r := gin.Default()
  r.Run(":8080")
}
EOF

# NestJS
cat > tests/fixtures/adopt/detectors/backend/nestjs/package.json <<'EOF'
{"name":"api","dependencies":{"@nestjs/core":"10","@apollo/server":"4"}}
EOF
mkdir -p tests/fixtures/adopt/detectors/backend/nestjs/src/modules
cat > tests/fixtures/adopt/detectors/backend/nestjs/src/main.ts <<'EOF'
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3000)
}
bootstrap()
EOF
```

- [ ] **Step 2: Write the failing test file**

Create `src/project/detectors/backend.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectBackend } from './backend.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/backend')

describe('detectBackend', () => {
  it('detects Express + Postgres + JWT (high tier with routes dir)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'express-postgres'))
    const m = detectBackend(ctx)
    expect(m?.projectType).toBe('backend')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.apiStyle).toBe('rest')
    expect(m?.partialConfig.dataStore).toContain('relational')
    expect(m?.partialConfig.authMechanism).toBe('jwt')
  })

  it('Redis as cache (NOT primary): postgres + redis → dataStore is relational only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'fastapi-redis'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.dataStore).toEqual(['relational'])  // redis omitted
    expect(m?.partialConfig.apiStyle).toBe('rest')
  })

  it('Redis as sole datastore → key-value', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'cache-svc', dependencies: { express: '4', redis: '4' } },
      files: { 'src/index.ts': 'app.listen(3000)' },
      dirs: ['src/routes'],
    })
    const m = detectBackend(ctx)
    expect(m?.partialConfig.dataStore).toEqual(['key-value'])
  })

  it('Gin Go: detects via .Run( pattern', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'gin-go'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.apiStyle).toBe('rest')
  })

  it('NestJS + Apollo → graphql (overrides rest)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'nestjs'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.apiStyle).toBe('graphql')
  })

  it('Framework dep alone, no entry, no routes → low tier', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', devDependencies: { express: '4' } },
    })
    const m = detectBackend(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('Framework dep + entry with .listen( + no routes → medium', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', dependencies: { fastify: '4' } },
      files: { 'src/index.ts': 'fastify.listen({ port: 3000 })' },
    })
    const m = detectBackend(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('returns null when no framework dep present', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectBackend(ctx)).toBeNull()
  })
})
```

Run: `npm test -- src/project/detectors/backend.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectBackend**

Create `src/project/detectors/backend.ts`:

```ts
import type { SignalContext } from './context.js'
import type { BackendMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

interface FrameworkSig {
  readonly dep: string
  readonly kind: 'npm' | 'py' | 'cargo' | 'go'
  readonly listenPatterns: readonly string[]
  readonly entryFiles: readonly string[]
  readonly routesDirs: readonly string[]
}

const FRAMEWORKS: readonly FrameworkSig[] = [
  // Node
  { dep: 'express', kind: 'npm', listenPatterns: ['.listen(', 'createServer('], entryFiles: ['src/index.ts', 'src/server.ts', 'src/main.ts', 'index.js', 'server.js'], routesDirs: ['src/routes', 'routes', 'src/api', 'app/api'] },
  { dep: 'fastify', kind: 'npm', listenPatterns: ['.listen(', 'fastify.listen'], entryFiles: ['src/index.ts', 'src/server.ts'], routesDirs: ['src/routes', 'routes'] },
  { dep: '@nestjs/core', kind: 'npm', listenPatterns: ['app.listen(', 'bootstrap('], entryFiles: ['src/main.ts'], routesDirs: ['src/modules', 'src/controllers'] },
  { dep: 'koa', kind: 'npm', listenPatterns: ['.listen(', 'app.listen'], entryFiles: ['src/index.ts', 'src/app.ts'], routesDirs: ['src/routes'] },
  { dep: 'hono', kind: 'npm', listenPatterns: ['serve(', 'Hono('], entryFiles: ['src/index.ts'], routesDirs: ['src/routes'] },
  // Python
  { dep: 'django', kind: 'py', listenPatterns: ['runserver', 'WSGIHandler', 'ASGIHandler'], entryFiles: ['manage.py', 'wsgi.py', 'asgi.py'], routesDirs: [] },
  { dep: 'fastapi', kind: 'py', listenPatterns: ['uvicorn.run(', 'FastAPI('], entryFiles: ['main.py', 'app.py', 'src/main.py'], routesDirs: ['routers', 'app/routers'] },
  { dep: 'flask', kind: 'py', listenPatterns: ['app.run(', 'Flask(__name__)'], entryFiles: ['app.py', 'main.py', 'wsgi.py'], routesDirs: ['routes', 'app/routes'] },
  // Go
  { dep: 'github.com/gin-gonic/gin', kind: 'go', listenPatterns: ['r.Run(', 'gin.Default(', '.Run(":'], entryFiles: ['cmd/server/main.go', 'cmd/api/main.go', 'main.go'], routesDirs: ['internal/routes', 'internal/handlers'] },
  { dep: 'github.com/labstack/echo', kind: 'go', listenPatterns: ['e.Start(', 'echo.New('], entryFiles: ['cmd/server/main.go', 'main.go'], routesDirs: ['internal/handlers'] },
  // Rust
  { dep: 'actix-web', kind: 'cargo', listenPatterns: ['HttpServer::new(', '.bind('], entryFiles: ['src/main.rs'], routesDirs: ['src/routes', 'src/handlers'] },
  { dep: 'axum', kind: 'cargo', listenPatterns: ['axum::serve(', 'Router::new('], entryFiles: ['src/main.rs'], routesDirs: ['src/routes'] },
  { dep: 'rocket', kind: 'cargo', listenPatterns: ['.launch()', '#[launch]'], entryFiles: ['src/main.rs'], routesDirs: ['src/routes'] },
]

export function detectBackend(ctx: SignalContext): BackendMatch | null {
  // Find any framework dep
  let matched: { fw: FrameworkSig; routes: boolean; entry: boolean } | null = null
  for (const fw of FRAMEWORKS) {
    if (!ctx.hasDep(fw.dep, fw.kind)) continue
    const routes = fw.routesDirs.some(d => ctx.dirExists(d))
    let entry = false
    for (const ef of fw.entryFiles) {
      const text = ctx.readFileText(ef)
      if (text && fw.listenPatterns.some(p => text.includes(p))) {
        entry = true
        break
      }
    }
    matched = { fw, routes, entry }
    break
  }
  if (!matched) return null

  const ev: DetectionEvidence[] = [evidence(`${matched.fw.dep}-dep`)]

  // Tier
  let confidence: 'high' | 'medium' | 'low'
  if (matched.routes) {
    confidence = 'high'
    ev.push(evidence('routes-dir'))
  } else if (matched.entry) {
    confidence = 'medium'
    ev.push(evidence('listen-call'))
  } else {
    confidence = 'low'
  }

  // apiStyle
  let apiStyle: BackendMatch['partialConfig']['apiStyle']
  if (ctx.hasAnyDep(['@apollo/server', 'apollo-server', 'graphql-yoga'], 'npm')
    || ctx.hasDep('strawberry-graphql', 'py')) {
    apiStyle = 'graphql'
  } else if (ctx.hasDep('@trpc/server', 'npm')) {
    apiStyle = 'trpc'
  } else if (ctx.hasAnyDep(['@grpc/grpc-js', 'grpc'], 'npm')
    || ctx.hasDep('grpcio', 'py')
    || ctx.hasDep('google.golang.org/grpc', 'go')) {
    apiStyle = 'grpc'
  } else {
    apiStyle = 'rest'
  }

  // dataStore — redis is cache unless sole signal
  const hasRel = ctx.hasAnyDep(['pg', 'postgres', 'mysql2', 'mariadb', 'better-sqlite3', 'sqlite3', 'prisma', 'drizzle-orm', 'typeorm', 'knex'], 'npm')
    || ctx.hasAnyDep(['psycopg', 'psycopg2', 'sqlalchemy', 'asyncpg', 'mysqlclient'], 'py')
  const hasDoc = ctx.hasAnyDep(['mongodb', 'mongoose'], 'npm')
    || ctx.hasAnyDep(['pymongo', 'motor'], 'py')
  const hasKv = ctx.hasAnyDep(['redis', 'ioredis'], 'npm') || ctx.hasDep('redis', 'py')
  const stores: BackendMatch['partialConfig']['dataStore'] = []
  if (hasRel) stores.push('relational')
  if (hasDoc) stores.push('document')
  if (hasKv && !hasRel && !hasDoc) stores.push('key-value')

  // authMechanism
  let authMechanism: BackendMatch['partialConfig']['authMechanism'] | undefined
  if (ctx.hasAnyDep(['jsonwebtoken', '@nestjs/jwt', 'jose'], 'npm')) authMechanism = 'jwt'
  else if (ctx.hasAnyDep(['passport', 'express-session'], 'npm')) authMechanism = 'session'
  else if (ctx.hasAnyDep(['passport-oauth2'], 'npm')) authMechanism = 'oauth'

  // asyncMessaging
  let asyncMessaging: BackendMatch['partialConfig']['asyncMessaging'] | undefined
  if (ctx.hasAnyDep(['bullmq', 'bull', 'bee-queue'], 'npm') || ctx.hasAnyDep(['celery', 'rq'], 'py')) asyncMessaging = 'queue'
  else if (ctx.hasAnyDep(['kafkajs', '@confluentinc/kafka-javascript', 'amqplib', 'nats'], 'npm') || ctx.hasAnyDep(['confluent-kafka', 'pika'], 'py')) asyncMessaging = 'event-driven'

  // deployTarget
  let deployTarget: BackendMatch['partialConfig']['deployTarget'] | undefined
  if (ctx.hasFile('Dockerfile') || ctx.hasFile('docker-compose.yml')) deployTarget = 'container'
  if (ctx.hasFile('serverless.yml') || ctx.hasFile('sam.yaml') || ctx.hasDep('mangum', 'py')) deployTarget = 'serverless'

  const partialConfig: BackendMatch['partialConfig'] = { apiStyle }
  if (stores.length > 0) partialConfig.dataStore = stores
  if (authMechanism) partialConfig.authMechanism = authMechanism
  if (asyncMessaging) partialConfig.asyncMessaging = asyncMessaging
  if (deployTarget) partialConfig.deployTarget = deployTarget

  return { projectType: 'backend', confidence, partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register in index.ts**

```ts
import { detectGame } from './game.js'
import { detectWebApp } from './web-app.js'
import { detectBackend } from './backend.js'
export const ALL_DETECTORS: readonly Detector[] = [detectGame, detectWebApp, detectBackend]
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/project/detectors/backend.test.ts && npm run check
```
Expected: 8 PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add src/project/detectors/backend.ts src/project/detectors/backend.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/backend/
git commit -m "feat(detectors): detectBackend"
```

---

## Task 6c: detectCli

**Files:**
- Create: `src/project/detectors/cli.ts`
- Create: `src/project/detectors/cli.test.ts`
- Create: fixtures under `tests/fixtures/adopt/detectors/cli/`
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.3. Anchor: `interactivity`.

### Steps

- [ ] **Step 1: Create fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/cli/{node-bin,rust-clap/src,python-typer,go-cobra/cmd/mycli}

# Node + commander
cat > tests/fixtures/adopt/detectors/cli/node-bin/package.json <<'EOF'
{"name":"mycli","bin":{"mycli":"dist/cli.js"},"dependencies":{"commander":"12","@inquirer/prompts":"7"}}
EOF

# Rust + clap
cat > tests/fixtures/adopt/detectors/cli/rust-clap/Cargo.toml <<'EOF'
[package]
name = "mycli"
version = "0.1.0"
[[bin]]
name = "mycli"
[dependencies]
clap = "4"
EOF
echo 'fn main() {}' > tests/fixtures/adopt/detectors/cli/rust-clap/src/main.rs

# Python + typer
cat > tests/fixtures/adopt/detectors/cli/python-typer/pyproject.toml <<'EOF'
[project]
name = "mycli"
dependencies = ["typer"]
[project.scripts]
mycli = "mycli:main"
EOF

# Go + cobra
cat > tests/fixtures/adopt/detectors/cli/go-cobra/go.mod <<'EOF'
module example.com/mycli
go 1.21
require github.com/spf13/cobra v1.8.0
EOF
echo 'package main' > tests/fixtures/adopt/detectors/cli/go-cobra/cmd/mycli/main.go
```

- [ ] **Step 2: Write the failing test file**

Create `src/project/detectors/cli.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectCli } from './cli.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/cli')

describe('detectCli', () => {
  it('Node bin + commander + inquirer → high, hybrid', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'node-bin'))
    const m = detectCli(ctx)
    expect(m?.projectType).toBe('cli')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.interactivity).toBe('hybrid')
    expect(m?.partialConfig.distributionChannels).toContain('package-manager')
  })

  it('Rust [[bin]] + clap → args-only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'rust-clap'))
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('args-only')
  })

  it('Python pyproject.scripts + typer → args-only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'python-typer'))
    const m = detectCli(ctx)
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.interactivity).toBe('args-only')
  })

  it('Go cmd/*/main.go + cobra → args-only, standalone-binary', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'go-cobra'))
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('args-only')
    expect(m?.partialConfig.distributionChannels).toContain('standalone-binary')
  })

  it('CLI framework dep without bin → medium', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'wip', dependencies: { yargs: '17' } },
    })
    const m = detectCli(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('Inquirer dep alone → interactive', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'wip', bin: { wip: 'cli.js' }, dependencies: { '@inquirer/prompts': '7' } },
    })
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('interactive')
  })

  it('No bin, no framework → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectCli(ctx)).toBeNull()
  })

  it('hasStructuredOutput true when ink dep present', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'tui', bin: { tui: 'cli.js' }, dependencies: { ink: '5' } },
    })
    const m = detectCli(ctx)
    expect(m?.partialConfig.hasStructuredOutput).toBe(true)
  })
})
```

Run: `npm test -- src/project/detectors/cli.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectCli**

Create `src/project/detectors/cli.ts`:

```ts
import type { SignalContext } from './context.js'
import type { CliMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectCli(ctx: SignalContext): CliMatch | null {
  const ev: DetectionEvidence[] = []

  // High-tier signals (any of these qualifies as "shipping a CLI")
  const pkg = ctx.packageJson()
  const hasNodeBin = pkg?.bin !== undefined && pkg.bin !== null
  if (hasNodeBin) ev.push(evidence('pkg-bin-field', 'package.json'))

  const cargo = ctx.cargoToml()
  const hasCargoBin = !!cargo?.bin && cargo.bin.length > 0
  if (hasCargoBin) ev.push(evidence('cargo-bin', 'Cargo.toml'))

  const py = ctx.pyprojectToml()
  const hasPyScripts = !!py?.project?.scripts && Object.keys(py.project.scripts).length > 0
  if (hasPyScripts) ev.push(evidence('pyproject-scripts', 'pyproject.toml'))

  const goCmdDirs = ctx.dirExists('cmd')
  if (goCmdDirs && ctx.goMod()) ev.push(evidence('go-cmd-dir', 'cmd/'))

  // CLI framework deps (medium tier when no bin)
  const hasCliFramework =
    ctx.hasAnyDep(['commander', 'yargs', 'clipanion', 'cac', 'oclif', '@oclif/core'], 'npm')
    || ctx.hasDep('clap', 'cargo')
    || ctx.hasDep('structopt', 'cargo')
    || ctx.hasAnyDep(['typer', 'click'], 'py')
    || ctx.hasAnyDep(['github.com/spf13/cobra', 'github.com/urfave/cli'], 'go')

  const hasHighSignal = hasNodeBin || hasCargoBin || hasPyScripts || (goCmdDirs && ctx.goMod())
  if (!hasHighSignal && !hasCliFramework) return null

  const confidence: 'high' | 'medium' = hasHighSignal ? 'high' : 'medium'

  // interactivity
  const hasPrompts = ctx.hasAnyDep(['@inquirer/prompts', 'inquirer', 'enquirer', 'prompts'], 'npm')
    || ctx.hasAnyDep(['questionary', 'inquirerpy'], 'py')
    || ctx.hasAnyDep(['dialoguer', 'inquire'], 'cargo')
  const hasArgsParser = ctx.hasAnyDep(['commander', 'yargs', 'clipanion', 'cac', 'oclif', '@oclif/core'], 'npm')
    || ctx.hasDep('clap', 'cargo')
    || ctx.hasAnyDep(['typer', 'click'], 'py')
    || ctx.hasAnyDep(['github.com/spf13/cobra', 'github.com/urfave/cli'], 'go')

  let interactivity: CliMatch['partialConfig']['interactivity']
  if (hasPrompts && hasArgsParser) interactivity = 'hybrid'
  else if (hasPrompts) interactivity = 'interactive'
  else interactivity = 'args-only'

  // distributionChannels
  const channels: CliMatch['partialConfig']['distributionChannels'] = []
  if (hasNodeBin || hasCargoBin || hasPyScripts) channels.push('package-manager')
  if (goCmdDirs || (cargo?.bin && cargo.bin.length > 0)) channels.push('standalone-binary')
  if (ctx.hasFile('Dockerfile')) channels.push('container')

  // hasStructuredOutput
  const hasStructuredOutput = ctx.hasAnyDep(['ink', 'listr2', 'cli-table3'], 'npm')
    || ctx.hasAnyDep(['rich', 'tabulate'], 'py')
    || ctx.hasDep('github.com/olekukonko/tablewriter', 'go')

  const partialConfig: CliMatch['partialConfig'] = {
    interactivity,
    hasStructuredOutput,
  }
  if (channels.length > 0) partialConfig.distributionChannels = channels

  return { projectType: 'cli', confidence, partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register in index.ts**

```ts
import { detectCli } from './cli.js'
export const ALL_DETECTORS: readonly Detector[] = [detectGame, detectWebApp, detectBackend, detectCli]
```

- [ ] **Step 5: Run tests + check**

```bash
npm test -- src/project/detectors/cli.test.ts && npm run check
```
Expected: 8 PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add src/project/detectors/cli.ts src/project/detectors/cli.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/cli/
git commit -m "feat(detectors): detectCli"
```

---

## Task 6d: detectLibrary

**Files:**
- Create: `src/project/detectors/library.ts`
- Create: `src/project/detectors/library.test.ts`
- Create: fixtures under `tests/fixtures/adopt/detectors/library/`
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.4. Anchor: `visibility`. Wires `ADOPT_PUBLIC_LIBRARY_NO_README` warning.

**CRITICAL:** the detector must NEVER explicitly set `documentationLevel: 'none'` — that combined with `visibility: 'public'` triggers the schema cross-field rejection. Omit the field instead so Zod default `'readme'` applies.

### Steps

- [ ] **Step 1: Create fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/library/{esm-types,rust-lib/src,python-poetry,storybook-lib/.storybook}

# ESM library with types + README
cat > tests/fixtures/adopt/detectors/library/esm-types/package.json <<'EOF'
{"name":"mylib","main":"dist/index.js","module":"dist/index.mjs","types":"dist/index.d.ts","peerDependencies":{"react":"18"}}
EOF
echo '# mylib' > tests/fixtures/adopt/detectors/library/esm-types/README.md

# Rust library
cat > tests/fixtures/adopt/detectors/library/rust-lib/Cargo.toml <<'EOF'
[package]
name = "mylib"
version = "0.1.0"
[lib]
EOF
echo '// lib' > tests/fixtures/adopt/detectors/library/rust-lib/src/lib.rs
echo '# mylib' > tests/fixtures/adopt/detectors/library/rust-lib/README.md

# Python Poetry
cat > tests/fixtures/adopt/detectors/library/python-poetry/pyproject.toml <<'EOF'
[tool.poetry]
name = "mylib"
[tool.poetry.dependencies]
python = "^3.10"
EOF
echo '# mylib' > tests/fixtures/adopt/detectors/library/python-poetry/README.md

# Storybook (api-docs)
cat > tests/fixtures/adopt/detectors/library/storybook-lib/package.json <<'EOF'
{"name":"ui-kit","main":"dist/index.js","types":"dist/index.d.ts","devDependencies":{"@storybook/react":"8"}}
EOF
echo '# ui-kit' > tests/fixtures/adopt/detectors/library/storybook-lib/README.md
touch tests/fixtures/adopt/detectors/library/storybook-lib/.storybook/main.ts
```

- [ ] **Step 2: Write the failing test file**

Create `src/project/detectors/library.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectLibrary } from './library.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/library')

describe('detectLibrary', () => {
  it('detects npm ESM library with types', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'esm-types'))
    const m = detectLibrary(ctx)
    expect(m?.projectType).toBe('library')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.visibility).toBe('public')
    expect(m?.partialConfig.hasTypeDefinitions).toBe(true)
  })

  it('detects Rust [lib] crate', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'rust-lib'))
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('public')
  })

  it('detects Python Poetry library', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'python-poetry'))
    expect(detectLibrary(ctx)?.confidence).toBe('high')
  })

  it('Storybook → documentationLevel api-docs (NOT full-site)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'storybook-lib'))
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.documentationLevel).toBe('api-docs')
  })

  it('private package → visibility internal', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'internal', main: 'index.js', private: true } as any,
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('internal')
  })

  it('NEVER sets documentationLevel: none — omits when no positive evidence', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'lib', main: 'index.js' },
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.documentationLevel).toBeUndefined()
  })

  it('public library without README → emits ADOPT_PUBLIC_LIBRARY_NO_README warning', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      packageJson: { name: 'lib', main: 'index.js' },
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('public')
    // Detector pushes warning into ctx.warnings
    expect(ctx.warnings.some(w => w.code === 'ADOPT_PUBLIC_LIBRARY_NO_README')).toBe(true)
  })

  it('package with main AND bin → medium tier (dual-purpose library + CLI per Section 5.4)', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', main: 'index.js', bin: { demo: 'cli.js' } },
    })
    const m = detectLibrary(ctx)
    expect(m?.projectType).toBe('library')
    expect(m?.confidence).toBe('medium')
    // Intentional: the package exports both a library AND a CLI.
    // detectCli will also fire high; disambiguate prompts the user.
  })
})
```

Run: `npm test -- src/project/detectors/library.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectLibrary**

Create `src/project/detectors/library.ts`:

```ts
import type { SignalContext } from './context.js'
import type { LibraryMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectLibrary(ctx: SignalContext): LibraryMatch | null {
  const ev: DetectionEvidence[] = []

  const pkg = ctx.packageJson()
  const cargo = ctx.cargoToml()
  const py = ctx.pyprojectToml()

  // High-tier: exports a library AND doesn't also export a CLI
  const isPureNpmLib = pkg && (pkg.main || pkg.module || pkg.exports) && !pkg.bin
  const isPureRustLib = cargo?.lib && (!cargo.bin || cargo.bin.length === 0)
  const isPureMedLib = py && (py.project?.name || py.tool?.poetry) && !py.project?.scripts

  // Medium-tier: dual-purpose (library exports + CLI bin) — detectCli also fires high,
  // disambiguate() lets the user pick
  const isDualNpm = pkg && (pkg.main || pkg.module || pkg.exports) && pkg.bin
  const isDualRust = cargo?.lib && cargo.bin && cargo.bin.length > 0

  if (!isPureNpmLib && !isPureRustLib && !isPureMedLib && !isDualNpm && !isDualRust) return null

  if (isPureNpmLib) ev.push(evidence('npm-main-or-module', 'package.json'))
  if (isPureRustLib) ev.push(evidence('cargo-lib', 'Cargo.toml'))
  if (isPureMedLib) ev.push(evidence('python-package', 'pyproject.toml'))
  if (isDualNpm) ev.push(evidence('npm-main-plus-bin', 'package.json', 'dual-purpose library + CLI'))
  if (isDualRust) ev.push(evidence('cargo-lib-plus-bin', 'Cargo.toml', 'dual-purpose crate'))

  const confidence: 'high' | 'medium' = (isDualNpm || isDualRust) ? 'medium' : 'high'

  const partialConfig: LibraryMatch['partialConfig'] = {
    visibility: 'public',  // default
  }

  // visibility
  if (pkg?.private === true) partialConfig.visibility = 'internal'
  else if ((cargo?.package as Record<string, unknown> | undefined)?.publish === false) partialConfig.visibility = 'internal'

  // runtimeTarget
  if (pkg?.engines?.node && !pkg.exports) {
    partialConfig.runtimeTarget = 'node'
    ev.push(evidence('engines-node', 'package.json'))
  } else if (pkg?.exports && typeof pkg.exports === 'object') {
    const exportsAny = pkg.exports as Record<string, unknown>
    const main = (exportsAny['.'] ?? exportsAny) as Record<string, unknown> | undefined
    if (main && 'edge' in main) partialConfig.runtimeTarget = 'edge'
    else if (main && 'browser' in main && 'node' in main) partialConfig.runtimeTarget = 'isomorphic'
    else if (main && 'browser' in main) partialConfig.runtimeTarget = 'browser'
  }

  // bundleFormat
  if (pkg) {
    if (pkg.type === 'module' && pkg.exports) partialConfig.bundleFormat = 'esm'
    else if (pkg.main?.endsWith('.cjs') || pkg.type !== 'module') partialConfig.bundleFormat = 'cjs'
  }

  // hasTypeDefinitions
  if (pkg?.types || (pkg as Record<string, unknown> | undefined)?.['typings']) {
    partialConfig.hasTypeDefinitions = true
    ev.push(evidence('pkg-types-field', 'package.json'))
  }

  // documentationLevel — CRITICAL: never set 'none', always omit if no evidence
  const hasFullSite = ctx.hasFile('mkdocs.yml')
    || ctx.hasFile('docusaurus.config.js') || ctx.hasFile('docusaurus.config.ts')
    || ctx.dirExists('.vitepress')
    || (ctx.hasDep('sphinx', 'py') && ctx.hasFile('docs/conf.py'))
    || ctx.hasFile('book.toml')
  const hasStorybook = ctx.dirExists('.storybook') || ctx.hasDep('@storybook/react', 'npm') || ctx.hasDep('@storybook/core', 'npm')
  const hasTypedoc = ctx.hasDep('typedoc', 'npm') || ctx.hasFile('typedoc.json')
  const hasDocsDir = ctx.dirExists('docs')
  const hasReadme = ctx.hasFile('README.md')

  if (hasFullSite) partialConfig.documentationLevel = 'full-site'
  else if (hasStorybook) partialConfig.documentationLevel = 'api-docs'
  else if (hasTypedoc) partialConfig.documentationLevel = 'api-docs'
  else if (hasDocsDir) partialConfig.documentationLevel = 'api-docs'
  else if (hasReadme) partialConfig.documentationLevel = 'readme'
  // else: omit; Zod default 'readme' applies

  // Warning: public library with no README
  if (partialConfig.visibility === 'public' && !hasReadme) {
    ;(ctx.warnings as ScaffoldWarning[]).push({
      code: 'ADOPT_PUBLIC_LIBRARY_NO_README',
      message: "Detected public library but no README.md found. Defaulting documentationLevel to 'readme'; add a README.md before publishing.",
      context: { project: pkg?.name },
    })
  }

  return {
    projectType: 'library',
    confidence,
    partialConfig,
    evidence: ev,
  }
}

// Type-only import for the warning push (not exported from types module)
type ScaffoldWarning = import('../../types/index.js').ScaffoldWarning
```

- [ ] **Step 4: Register in index.ts**

```ts
import { detectLibrary } from './library.js'
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectWebApp, detectBackend, detectCli, detectLibrary,
]
```

- [ ] **Step 5: Run tests + check**

```bash
npm test -- src/project/detectors/library.test.ts && npm run check
```
Expected: 8 PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add src/project/detectors/library.ts src/project/detectors/library.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/library/
git commit -m "feat(detectors): detectLibrary + ADOPT_PUBLIC_LIBRARY_NO_README warning"
```

---

## Task 7a: detectMobileApp

**Files:**
- Create: `src/project/detectors/mobile-app.ts`
- Create: `src/project/detectors/mobile-app.test.ts`
- Create: fixtures
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.5. Anchor: `platform`.

### Steps

- [ ] **Step 1: Create fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/mobile-app/{expo-cross,native-rn/ios,native-rn/android,flutter,ios-only/ios}

# Expo cross-platform
cat > tests/fixtures/adopt/detectors/mobile-app/expo-cross/package.json <<'EOF'
{"name":"app","dependencies":{"expo":"50","react-native":"0.73","expo-notifications":"0.27"}}
EOF
cat > tests/fixtures/adopt/detectors/mobile-app/expo-cross/app.json <<'EOF'
{"expo":{"name":"app","platforms":["ios","android"]}}
EOF

# Native React Native
cat > tests/fixtures/adopt/detectors/mobile-app/native-rn/package.json <<'EOF'
{"name":"app","dependencies":{"react-native":"0.73"}}
EOF
touch tests/fixtures/adopt/detectors/mobile-app/native-rn/ios/.gitkeep
touch tests/fixtures/adopt/detectors/mobile-app/native-rn/android/.gitkeep

# Flutter
echo 'name: app' > tests/fixtures/adopt/detectors/mobile-app/flutter/pubspec.yaml

# iOS only
touch tests/fixtures/adopt/detectors/mobile-app/ios-only/ios/.gitkeep
```

- [ ] **Step 2: Failing test file**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectMobileApp } from './mobile-app.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/mobile-app')

describe('detectMobileApp', () => {
  it('Expo with both platforms → cross-platform + push notifications', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'expo-cross'))
    const m = detectMobileApp(ctx)
    expect(m?.projectType).toBe('mobile-app')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.platform).toBe('cross-platform')
    expect(m?.partialConfig.hasPushNotifications).toBe(true)
  })

  it('Native ios/ + android/ → cross-platform high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'native-rn'))
    expect(detectMobileApp(ctx)?.partialConfig.platform).toBe('cross-platform')
  })

  it('Flutter → cross-platform high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'flutter'))
    expect(detectMobileApp(ctx)?.confidence).toBe('high')
  })

  it('Only ios/ → ios platform medium', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'ios-only'))
    const m = detectMobileApp(ctx)
    expect(m?.partialConfig.platform).toBe('ios')
    expect(m?.confidence).toBe('medium')
  })

  it('No mobile signals → null', () => {
    const ctx = createFakeSignalContext({ rootEntries: ['package.json'] })
    expect(detectMobileApp(ctx)).toBeNull()
  })

  it('Offline support detected from realm dep', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'app', dependencies: { 'react-native': '0.73', realm: '12' } },
      dirs: ['ios', 'android'],
    })
    expect(detectMobileApp(ctx)?.partialConfig.offlineSupport).toBe('cache')
  })

  it('Push notifications via @react-native-firebase/messaging', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'app', dependencies: { 'react-native': '0.73', '@react-native-firebase/messaging': '20' } },
      dirs: ['ios', 'android'],
    })
    expect(detectMobileApp(ctx)?.partialConfig.hasPushNotifications).toBe(true)
  })

  it('Single-platform android-only → android medium', () => {
    const ctx = createFakeSignalContext({ dirs: ['android'] })
    const m = detectMobileApp(ctx)
    expect(m?.partialConfig.platform).toBe('android')
    expect(m?.confidence).toBe('medium')
  })
})
```

Run: `npm test -- src/project/detectors/mobile-app.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectMobileApp**

Create `src/project/detectors/mobile-app.ts`:

```ts
import type { SignalContext } from './context.js'
import type { MobileAppMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectMobileApp(ctx: SignalContext): MobileAppMatch | null {
  const ev: DetectionEvidence[] = []

  const hasIos = ctx.dirExists('ios')
  const hasAndroid = ctx.dirExists('android')
  const hasAppJson = ctx.hasFile('app.json')
  const hasExpo = ctx.hasDep('expo', 'npm')
  const hasRn = ctx.hasDep('react-native', 'npm')
  const hasFlutter = ctx.hasFile('pubspec.yaml')

  let platform: MobileAppMatch['partialConfig']['platform'] | undefined
  let confidence: 'high' | 'medium' | undefined

  if (hasFlutter) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('pubspec-yaml', 'pubspec.yaml'))
  } else if (hasAppJson && hasExpo) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('expo-app-json', 'app.json'))
  } else if (hasIos && hasAndroid) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('native-ios-android'))
  } else if (hasIos) {
    platform = 'ios'
    confidence = 'medium'
    ev.push(evidence('ios-only'))
  } else if (hasAndroid) {
    platform = 'android'
    confidence = 'medium'
    ev.push(evidence('android-only'))
  } else if (hasRn) {
    platform = 'cross-platform'
    confidence = 'medium'
    ev.push(evidence('react-native-dep'))
  }

  if (!platform || !confidence) return null

  const partialConfig: MobileAppMatch['partialConfig'] = { platform }

  // hasPushNotifications
  if (ctx.hasAnyDep(['expo-notifications', '@react-native-firebase/messaging', 'react-native-push-notification'], 'npm')) {
    partialConfig.hasPushNotifications = true
    ev.push(evidence('push-notifications-dep'))
  }

  // offlineSupport
  if (ctx.hasAnyDep(['expo-sqlite', '@react-native-async-storage/async-storage', 'watermelondb', 'realm'], 'npm')) {
    partialConfig.offlineSupport = 'cache'
    ev.push(evidence('offline-storage-dep'))
  }

  return { projectType: 'mobile-app', confidence, partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register**

```ts
import { detectMobileApp } from './mobile-app.js'
// Specific-signature detectors first; mobile-app moves UP near game/browser-extension
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectMobileApp, detectWebApp, detectBackend, detectCli, detectLibrary,
]
```

- [ ] **Step 5: Test + check**

```bash
npm test -- src/project/detectors/mobile-app.test.ts && npm run check
```
Expected: 8 PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add src/project/detectors/mobile-app.ts src/project/detectors/mobile-app.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/mobile-app/
git commit -m "feat(detectors): detectMobileApp"
```

---

## Task 7b: detectDataPipeline

**Files:**
- Create: `src/project/detectors/data-pipeline.ts` + `.test.ts`
- Create: fixtures
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.6. Anchor: `processingModel`.

### Steps

- [ ] **Step 1: Fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/data-pipeline/{dbt,airflow-dags,prefect}

# dbt
cat > tests/fixtures/adopt/detectors/data-pipeline/dbt/dbt_project.yml <<'EOF'
name: 'demo'
version: '1.0.0'
profile: 'demo'
EOF
mkdir -p tests/fixtures/adopt/detectors/data-pipeline/dbt/tests

# Airflow
mkdir -p tests/fixtures/adopt/detectors/data-pipeline/airflow-dags/dags
cat > tests/fixtures/adopt/detectors/data-pipeline/airflow-dags/pyproject.toml <<'EOF'
[project]
name = "pipeline"
dependencies = ["apache-airflow"]
EOF
cat > tests/fixtures/adopt/detectors/data-pipeline/airflow-dags/dags/etl.py <<'EOF'
from airflow import DAG
EOF

# Prefect
mkdir -p tests/fixtures/adopt/detectors/data-pipeline/prefect/pipelines
cat > tests/fixtures/adopt/detectors/data-pipeline/prefect/pyproject.toml <<'EOF'
[project]
name = "pipeline"
dependencies = ["prefect"]
EOF
cat > tests/fixtures/adopt/detectors/data-pipeline/prefect/pipelines/flow.py <<'EOF'
from prefect import flow
EOF
```

- [ ] **Step 2: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectDataPipeline } from './data-pipeline.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/data-pipeline')

describe('detectDataPipeline', () => {
  it('dbt_project.yml + tests dir → batch + dag-based + testing', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'dbt'))
    const m = detectDataPipeline(ctx)
    expect(m?.projectType).toBe('data-pipeline')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.processingModel).toBe('batch')
    expect(m?.partialConfig.orchestration).toBe('dag-based')
    expect(m?.partialConfig.dataQualityStrategy).toBe('testing')
  })

  it('dags/ + airflow dep → batch + dag-based', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'airflow-dags'))
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.orchestration).toBe('dag-based')
  })

  it('Prefect pipelines/ + dep → dag-based', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'prefect'))
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.orchestration).toBe('dag-based')
  })

  it('kafka dep alone (no orchestrator, no structure) → streaming + low tier', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'pipe', dependencies: { kafkajs: '2' } },
    })
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.processingModel).toBe('streaming')
    expect(m?.confidence).toBe('low')
  })

  it('framework dep alone (no file structure) → medium', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['dagster'] } },
    })
    const m = detectDataPipeline(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('great-expectations dep → validation', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['apache-airflow', 'great-expectations'] } },
      dirs: ['dags'],
      files: { 'dags/etl.py': 'from airflow import DAG' },
    })
    expect(detectDataPipeline(ctx)?.partialConfig.dataQualityStrategy).toBe('validation')
  })

  it('No data-pipeline signals → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectDataPipeline(ctx)).toBeNull()
  })

  it('hasDataCatalog true with datahub dep', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['apache-airflow', 'datahub'] } },
      dirs: ['dags'],
      files: { 'dags/etl.py': 'from airflow import DAG' },
    })
    expect(detectDataPipeline(ctx)?.partialConfig.hasDataCatalog).toBe(true)
  })
})
```

Run: `npm test -- src/project/detectors/data-pipeline.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectDataPipeline**

Create `src/project/detectors/data-pipeline.ts`:

```ts
import type { SignalContext } from './context.js'
import type { DataPipelineMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectDataPipeline(ctx: SignalContext): DataPipelineMatch | null {
  const ev: DetectionEvidence[] = []

  // High-tier signals
  const hasDbt = ctx.hasFile('dbt_project.yml')
  const hasKedro = ctx.hasFile('kedro.yml')

  let hasAirflowDag = false
  if (ctx.dirExists('dags')) {
    const dagFiles = ctx.listDir('dags').filter(f => f.endsWith('.py'))
    for (const f of dagFiles) {
      const text = ctx.readFileText(`dags/${f}`)
      if (text && /from\s+airflow\s+import/.test(text)) {
        hasAirflowDag = true
        break
      }
    }
  }

  let hasPrefectFlow = false
  let hasDagsterJob = false
  if (ctx.dirExists('pipelines')) {
    const files = ctx.listDir('pipelines').filter(f => f.endsWith('.py'))
    for (const f of files) {
      const text = ctx.readFileText(`pipelines/${f}`)
      if (text && /from\s+prefect/.test(text)) hasPrefectFlow = true
      if (text && /from\s+dagster/.test(text)) hasDagsterJob = true
      if (hasPrefectFlow || hasDagsterJob) break
    }
  }

  const hasHighSignal = hasDbt || hasKedro || hasAirflowDag || hasPrefectFlow || hasDagsterJob

  // Medium-tier: framework dep alone
  const hasFrameworkDep = ctx.hasAnyDep(
    ['apache-airflow', 'prefect', 'dagster', 'dbt-core', 'kedro'], 'py')

  // Streaming/batch deps
  const hasStreamDep = ctx.hasAnyDep(['kafkajs', '@confluentinc/kafka-javascript'], 'npm')
    || ctx.hasAnyDep(['kafka-python', 'confluent-kafka', 'apache-beam', 'apache-flink'], 'py')
  const hasBatchDep = ctx.hasDep('pyspark', 'py')

  if (!hasHighSignal && !hasFrameworkDep && !hasStreamDep && !hasBatchDep) return null

  if (hasDbt) ev.push(evidence('dbt-project', 'dbt_project.yml'))
  if (hasAirflowDag) ev.push(evidence('airflow-dags', 'dags/'))
  if (hasPrefectFlow) ev.push(evidence('prefect-flows', 'pipelines/'))
  if (hasDagsterJob) ev.push(evidence('dagster-jobs', 'pipelines/'))

  // processingModel
  let processingModel: DataPipelineMatch['partialConfig']['processingModel'] = 'batch'
  if (hasStreamDep && hasBatchDep) processingModel = 'hybrid'
  else if (hasStreamDep) processingModel = 'streaming'

  // orchestration
  let orchestration: DataPipelineMatch['partialConfig']['orchestration'] | undefined
  if (hasDbt || hasAirflowDag || hasPrefectFlow || hasDagsterJob) orchestration = 'dag-based'

  // dataQualityStrategy
  let dataQualityStrategy: DataPipelineMatch['partialConfig']['dataQualityStrategy'] | undefined
  if (hasDbt && ctx.dirExists('tests')) dataQualityStrategy = 'testing'
  else if (ctx.hasAnyDep(['great-expectations', 'pandera', 'soda-core'], 'py')) dataQualityStrategy = 'validation'
  else if (ctx.hasAnyDep(['datafold', 'elementary', 'monte-carlo-data'], 'py')) dataQualityStrategy = 'observability'

  // hasDataCatalog
  const hasDataCatalog = ctx.hasAnyDep(['datahub', 'openmetadata', 'amundsen'], 'py')

  const partialConfig: DataPipelineMatch['partialConfig'] = { processingModel }
  if (orchestration) partialConfig.orchestration = orchestration
  if (dataQualityStrategy) partialConfig.dataQualityStrategy = dataQualityStrategy
  if (hasDataCatalog) partialConfig.hasDataCatalog = true

  // Tier selection per spec Section 5.6:
  //   high: defining artifact (dbt_project.yml, dags/, pipelines/ with imports)
  //   medium: framework dep alone
  //   low: spark/beam/flink deps only (no orchestrator dep, no file structure)
  let confidence: 'high' | 'medium' | 'low'
  if (hasHighSignal) {
    confidence = 'high'
  } else if (hasFrameworkDep) {
    confidence = 'medium'
  } else {
    confidence = 'low'    // streaming/batch deps alone → low-tier surfacing
  }

  return {
    projectType: 'data-pipeline',
    confidence,
    partialConfig,
    evidence: ev,
  }
}
```

- [ ] **Step 4: Register** (insert near other distinctive-signature detectors):

```ts
import { detectDataPipeline } from './data-pipeline.js'
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectMobileApp, detectDataPipeline,
  detectWebApp, detectBackend, detectCli, detectLibrary,
]
```

- [ ] **Step 5: Test + check + commit**

```bash
npm test -- src/project/detectors/data-pipeline.test.ts && npm run check
git add src/project/detectors/data-pipeline.ts src/project/detectors/data-pipeline.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/data-pipeline/
git commit -m "feat(detectors): detectDataPipeline"
```

---

## Task 7c: detectMl

**Files:**
- Create: `src/project/detectors/ml.ts` + `.test.ts`
- Create: fixtures
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.7. Anchor: `projectPhase`. **CRITICAL constraint:** when `projectPhase === 'inference'` or `'both'`, `servingPattern` MUST be set (defaulting to `'realtime'` if no specific signal). When `projectPhase === 'training'`, `servingPattern` is OMITTED so the Zod default `'none'` applies. Failing this constraint causes Zod cross-field validation to throw at orchestrator parse time.

### Steps

- [ ] **Step 1: Fixtures**

```bash
mkdir -p tests/fixtures/adopt/detectors/ml/{pytorch-train/scripts,fastapi-inference,hf-modelcard}

# PyTorch training
cat > tests/fixtures/adopt/detectors/ml/pytorch-train/pyproject.toml <<'EOF'
[project]
name = "trainer"
dependencies = ["torch", "mlflow"]
EOF
mkdir -p tests/fixtures/adopt/detectors/ml/pytorch-train/models
cat > tests/fixtures/adopt/detectors/ml/pytorch-train/scripts/train.py <<'EOF'
import torch
EOF

# FastAPI inference
cat > tests/fixtures/adopt/detectors/ml/fastapi-inference/pyproject.toml <<'EOF'
[project]
name = "infer"
dependencies = ["torch", "fastapi", "uvicorn"]
EOF
cat > tests/fixtures/adopt/detectors/ml/fastapi-inference/serve.py <<'EOF'
from fastapi import FastAPI
import torch
app = FastAPI()
EOF

# HuggingFace model card
cat > tests/fixtures/adopt/detectors/ml/hf-modelcard/README.md <<'EOF'
---
tags:
  - transformers
  - pytorch
library_name: transformers
---
# My Model
EOF
```

- [ ] **Step 2: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectMl } from './ml.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/ml')

describe('detectMl', () => {
  it('PyTorch + train.py + models/ + mlflow → training, no servingPattern', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'pytorch-train'))
    const m = detectMl(ctx)
    expect(m?.projectType).toBe('ml')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.projectPhase).toBe('training')
    expect(m?.partialConfig.servingPattern).toBeUndefined()    // CRITICAL: omitted
    expect(m?.partialConfig.modelType).toBe('deep-learning')
    expect(m?.partialConfig.hasExperimentTracking).toBe(true)
  })

  it('FastAPI + torch + serve.py → inference + realtime serving', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'fastapi-inference'))
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')   // CRITICAL: must be set
  })

  it('HuggingFace model card → llm + inference + realtime', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'hf-modelcard'))
    const m = detectMl(ctx)
    expect(m?.partialConfig.modelType).toBe('llm')
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')
  })

  it('Inference detected with NO specific serving signal → fallback realtime', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['torch'] } },
      files: { 'predict.py': 'import torch' },
    })
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')   // fallback fires
  })

  it('Both training AND inference → both + realtime', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['torch'] } },
      files: {
        'train.py': 'import torch',
        'serve.py': 'import torch',
      },
    })
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('both')
    expect(m?.partialConfig.servingPattern).toBe('realtime')
  })

  it('scikit-learn alone → classical', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['scikit-learn'] } },
      files: { 'train.py': 'import sklearn' },
    })
    expect(detectMl(ctx)?.partialConfig.modelType).toBe('classical')
  })

  it('Notebook-only (no ML framework dep) → low tier', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['notebook.ipynb', 'analysis.ipynb'],
      // no pyproject, no ML deps
    })
    const m = detectMl(ctx)
    expect(m?.confidence).toBe('low')
    expect(m?.evidence[0].signal).toBe('notebooks-only')
  })

  it('No ML signals → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectMl(ctx)).toBeNull()
  })
})
```

Run: `npm test -- src/project/detectors/ml.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectMl**

Create `src/project/detectors/ml.ts`:

```ts
import type { SignalContext } from './context.js'
import type { MlMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const ML_FRAMEWORK_DEPS = ['torch', 'pytorch-lightning', 'tensorflow', 'keras', 'jax', 'scikit-learn', 'xgboost', 'lightgbm', 'catboost', 'transformers', 'sentence-transformers']

export function detectMl(ctx: SignalContext): MlMatch | null {
  const ev: DetectionEvidence[] = []

  const hasMlDep = ctx.hasAnyDep(ML_FRAMEWORK_DEPS, 'py')

  // HuggingFace model card detection
  let isHfModelCard = false
  if (ctx.hasFile('README.md')) {
    const readme = ctx.readFileText('README.md', 8192) ?? ''
    if (readme.startsWith('---\n')) {
      const fmEnd = readme.indexOf('\n---\n', 4)
      if (fmEnd > 0) {
        const fm = readme.slice(4, fmEnd)
        if (/tags:[\s\S]*?(transformers|pytorch|tensorflow)/.test(fm) || /library_name:\s*transformers/.test(fm)) {
          isHfModelCard = true
          ev.push(evidence('huggingface-model-card', 'README.md'))
        }
      }
    }
  }

  // Supporting structure
  const hasModelsDir = ctx.dirExists('models')
  const hasNotebooks = ctx.rootEntries().some(f => f.endsWith('.ipynb'))
  const hasTrainPy = ctx.hasFile('train.py') || ctx.hasFile('training.py') || ctx.hasFile('scripts/train.py')
  const hasServePy = ctx.hasFile('serve.py') || ctx.hasFile('predict.py') || ctx.hasFile('serving/main.py') || ctx.hasFile('inference/main.py')
  const hasTrackingDep = ctx.hasAnyDep(['mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc'], 'py')

  const hasStructure = hasModelsDir || hasNotebooks || hasTrainPy || hasServePy || hasTrackingDep

  if (!isHfModelCard && !hasMlDep && !hasNotebooks) return null

  // Low tier per spec Section 5.7: notebook-only repos with no framework dep
  if (!isHfModelCard && !hasMlDep && hasNotebooks) {
    return {
      projectType: 'ml',
      confidence: 'low',
      partialConfig: { projectPhase: 'training' },
      evidence: [evidence('notebooks-only', '*.ipynb')],
    }
  }

  if (!isHfModelCard && hasMlDep && !hasStructure) {
    // ML dep alone — medium tier
    return {
      projectType: 'ml',
      confidence: 'medium',
      partialConfig: { projectPhase: 'training' },  // best-guess; can be overridden
      evidence: [evidence('ml-framework-dep')],
    }
  }

  if (hasMlDep) ev.push(evidence('ml-framework-dep'))
  if (hasModelsDir) ev.push(evidence('models-dir', 'models/'))
  if (hasTrainPy) ev.push(evidence('train-script'))
  if (hasServePy) ev.push(evidence('serve-script'))
  if (hasTrackingDep) ev.push(evidence('experiment-tracking-dep'))

  // projectPhase
  let projectPhase: MlMatch['partialConfig']['projectPhase']
  if (isHfModelCard) {
    projectPhase = 'inference'   // model cards are published artifacts
  } else if (hasTrainPy && hasServePy) {
    projectPhase = 'both'
  } else if (hasServePy) {
    projectPhase = 'inference'
  } else {
    projectPhase = 'training'
  }

  // modelType
  let modelType: MlMatch['partialConfig']['modelType'] = 'deep-learning'
  if (isHfModelCard || ctx.hasAnyDep(['transformers', 'sentence-transformers', 'openai', 'anthropic', 'langchain', 'llama-index'], 'py')) {
    modelType = 'llm'
  } else if (ctx.hasAnyDep(['scikit-learn', 'xgboost', 'lightgbm', 'catboost'], 'py')
    && !ctx.hasAnyDep(['torch', 'tensorflow', 'jax', 'keras'], 'py')) {
    modelType = 'classical'
  }

  // servingPattern — CRITICAL: must pair with projectPhase
  let servingPattern: MlMatch['partialConfig']['servingPattern'] | undefined
  if (projectPhase === 'inference' || projectPhase === 'both') {
    if (ctx.hasAnyDep(['torchserve', 'bentoml', 'ray[serve]', 'seldon-core'], 'py')) {
      servingPattern = 'realtime'
    } else if (ctx.hasAnyDep(['onnxruntime-web', 'onnxruntime-mobile', 'coreml'], 'py')) {
      servingPattern = 'edge'
    } else {
      // Mandatory fallback — schema cross-field requires non-'none' for inference/both
      servingPattern = 'realtime'
    }
  }
  // training: omit servingPattern; Zod default 'none' satisfies cross-field

  const partialConfig: MlMatch['partialConfig'] = { projectPhase, modelType }
  if (servingPattern) partialConfig.servingPattern = servingPattern
  if (hasTrackingDep) partialConfig.hasExperimentTracking = true

  return { projectType: 'ml', confidence: 'high', partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register**

```ts
import { detectMl } from './ml.js'
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectMobileApp, detectDataPipeline,
  detectWebApp, detectBackend, detectMl, detectCli, detectLibrary,
]
```

- [ ] **Step 5: Test + check + commit**

```bash
npm test -- src/project/detectors/ml.test.ts && npm run check
git add src/project/detectors/ml.ts src/project/detectors/ml.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/ml/
git commit -m "feat(detectors): detectMl with mandatory serving pattern fallback"
```

---

## Task 7d: detectBrowserExtension

**Files:**
- Create: `src/project/detectors/browser-extension.ts` + `.test.ts`
- Create: fixtures (including 5 malformed-manifest fixtures shared with all detectors)
- Modify: `src/project/detectors/index.ts`

**Spec reference:** Section 5.8. Anchor: `manifestVersion`. Wires `ADOPT_MINIMAL_EXTENSION` warning.

**CRITICAL constraints:**
1. Strict integer check on `manifest_version` (only `2` or `3`, not `"3"` string) — eliminates PWA false-positive
2. NEVER explicitly set `hasContentScript: false`, `hasBackgroundWorker: false`, or `uiSurfaces: []` — omit fields so Zod defaults satisfy the schema cross-field rule

### Steps

- [ ] **Step 1: Fixtures (incl. 5 malformed)**

```bash
mkdir -p tests/fixtures/adopt/detectors/browser-extension/{mv3-popup,mv2-content,minimal-theme,malformed/{package-json-trailing-comma,pyproject-invalid-toml,cargo-truncated,go-mod-no-module,manifest-json-no-version}}

cat > tests/fixtures/adopt/detectors/browser-extension/mv3-popup/manifest.json <<'EOF'
{
  "manifest_version": 3,
  "name": "Demo",
  "version": "1.0",
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" }
}
EOF

cat > tests/fixtures/adopt/detectors/browser-extension/mv2-content/manifest.json <<'EOF'
{
  "manifest_version": 2,
  "name": "Demo",
  "version": "1.0",
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }],
  "background": { "scripts": ["background.js"] }
}
EOF

cat > tests/fixtures/adopt/detectors/browser-extension/minimal-theme/manifest.json <<'EOF'
{ "manifest_version": 3, "name": "Theme", "version": "1.0", "theme": {} }
EOF

# Malformed fixtures (shared across all detectors for context unparseable tests)
echo '{ "name": "x", }' > tests/fixtures/adopt/detectors/browser-extension/malformed/package-json-trailing-comma/package.json
printf '[project\nname = "x"' > tests/fixtures/adopt/detectors/browser-extension/malformed/pyproject-invalid-toml/pyproject.toml
printf '[package]\nname = "x"\n[dep' > tests/fixtures/adopt/detectors/browser-extension/malformed/cargo-truncated/Cargo.toml
printf 'go 1.21\nrequire github.com/x v1.0.0\n' > tests/fixtures/adopt/detectors/browser-extension/malformed/go-mod-no-module/go.mod
echo '{"name":"pwa","icons":[]}' > tests/fixtures/adopt/detectors/browser-extension/malformed/manifest-json-no-version/manifest.json
```

- [ ] **Step 2: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectBrowserExtension } from './browser-extension.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/browser-extension')

describe('detectBrowserExtension', () => {
  it('MV3 with popup + service_worker → high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'mv3-popup'))
    const m = detectBrowserExtension(ctx)
    expect(m?.projectType).toBe('browser-extension')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.manifestVersion).toBe('3')
    expect(m?.partialConfig.uiSurfaces).toEqual(['popup'])
    expect(m?.partialConfig.hasBackgroundWorker).toBe(true)
  })

  it('MV2 with content_scripts + background.scripts → high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'mv2-content'))
    const m = detectBrowserExtension(ctx)
    expect(m?.partialConfig.manifestVersion).toBe('2')
    expect(m?.partialConfig.hasContentScript).toBe(true)
    expect(m?.partialConfig.hasBackgroundWorker).toBe(true)
  })

  it('Minimal theme manifest → returns match with only manifestVersion (Zod defaults fill rest)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'minimal-theme'))
    const m = detectBrowserExtension(ctx)
    expect(m?.partialConfig.manifestVersion).toBe('3')
    expect(m?.partialConfig.hasContentScript).toBeUndefined()    // CRITICAL: omitted
    expect(m?.partialConfig.hasBackgroundWorker).toBeUndefined() // CRITICAL: omitted
    expect(m?.partialConfig.uiSurfaces).toBeUndefined()          // CRITICAL: omitted
    expect(ctx.warnings.some(w => w.code === 'ADOPT_MINIMAL_EXTENSION')).toBe(true)
  })

  it('PWA manifest (no manifest_version) → returns null', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'malformed/manifest-json-no-version'))
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('manifest.json with manifest_version: "3" (STRING not int) → returns null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{"manifest_version":"3","name":"x"}' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('No manifest.json → returns null', () => {
    const ctx = createFakeSignalContext({})
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('manifest.json with manifest_version: 4 → returns null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{"manifest_version":4,"name":"x"}' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('Malformed manifest.json → returns null and emits warning', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{ invalid json' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })
})
```

Run: `npm test -- src/project/detectors/browser-extension.test.ts`. **Expected: FAIL**.

- [ ] **Step 3: Implement detectBrowserExtension**

Create `src/project/detectors/browser-extension.ts`:

```ts
import type { SignalContext } from './context.js'
import type { BrowserExtensionMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

type ScaffoldWarning = import('../../types/index.js').ScaffoldWarning

interface ManifestShape {
  manifest_version?: unknown
  content_scripts?: unknown[]
  background?: { service_worker?: string; scripts?: unknown[] }
  action?: { default_popup?: string }
  browser_action?: { default_popup?: string }
  options_ui?: unknown
  options_page?: unknown
  chrome_url_overrides?: { newtab?: unknown }
  devtools_page?: unknown
  side_panel?: unknown
}

export function detectBrowserExtension(ctx: SignalContext): BrowserExtensionMatch | null {
  if (!ctx.hasFile('manifest.json')) return null
  const text = ctx.readFileText('manifest.json', 16384)
  if (text === undefined) return null

  let manifest: ManifestShape
  try {
    manifest = JSON.parse(text) as ManifestShape
  } catch {
    // SignalContext already emits ADOPT_FILE_UNREADABLE / unparseable warnings if applicable
    return null
  }

  // CRITICAL: strict integer check (rejects PWA manifests + string "3")
  const mv = manifest.manifest_version
  if (mv !== 2 && mv !== 3) return null

  const ev: DetectionEvidence[] = [evidence('manifest-version', 'manifest.json', `MV${mv}`)]
  const partialConfig: BrowserExtensionMatch['partialConfig'] = {
    manifestVersion: mv === 2 ? '2' : '3',
  }

  // CRITICAL: only set fields when positive evidence — omit otherwise so Zod defaults apply
  if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0) {
    partialConfig.hasContentScript = true
    ev.push(evidence('content-scripts'))
  }
  if (manifest.background?.service_worker || (Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0)) {
    partialConfig.hasBackgroundWorker = true
    ev.push(evidence('background-worker'))
  }

  const uiSurfaces: BrowserExtensionMatch['partialConfig']['uiSurfaces'] = []
  if (manifest.action?.default_popup || manifest.browser_action?.default_popup) uiSurfaces.push('popup')
  if (manifest.options_ui || manifest.options_page) uiSurfaces.push('options')
  if (manifest.chrome_url_overrides?.newtab) uiSurfaces.push('newtab')
  if (manifest.devtools_page) uiSurfaces.push('devtools')
  if (manifest.side_panel) uiSurfaces.push('sidepanel')
  if (uiSurfaces.length > 0) partialConfig.uiSurfaces = uiSurfaces

  // Minimal extension warning (e.g. theme extensions with no UI/scripts/worker)
  if (
    !partialConfig.hasContentScript
    && !partialConfig.hasBackgroundWorker
    && (!partialConfig.uiSurfaces || partialConfig.uiSurfaces.length === 0)
  ) {
    ;(ctx.warnings as ScaffoldWarning[]).push({
      code: 'ADOPT_MINIMAL_EXTENSION',
      message: 'Detected a minimal browser extension with no UI surfaces, content scripts, or background worker. Defaulting fields to popup + background worker via Zod defaults — adjust config.yml manually if needed.',
      context: { manifest_version: String(mv) },
    })
  }

  return { projectType: 'browser-extension', confidence: 'high', partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register (final ALL_DETECTORS order per spec Section 5.10 Δ15)**

```ts
import { detectGame } from './game.js'
import { detectBrowserExtension } from './browser-extension.js'
import { detectMobileApp } from './mobile-app.js'
import { detectDataPipeline } from './data-pipeline.js'
import { detectWebApp } from './web-app.js'
import { detectBackend } from './backend.js'
import { detectMl } from './ml.js'
import { detectCli } from './cli.js'
import { detectLibrary } from './library.js'

// Order is a PERFORMANCE optimization only. Correctness does NOT depend on order
// — all matches are collected and disambiguated per Section 3 Case A-G.
export const ALL_DETECTORS: readonly Detector[] = [
  // Tier 1: distinctive root-file detectors (cheap distinctive failures)
  detectGame, detectBrowserExtension, detectMobileApp, detectDataPipeline,
  // Tier 2: dep-heavy detectors
  detectWebApp, detectBackend, detectMl, detectCli,
  // Tier 3: catch-all
  detectLibrary,
]
```

- [ ] **Step 5: Test + check + commit**

```bash
npm test -- src/project/detectors/browser-extension.test.ts && npm test -- src/project/detectors/ && npm run check
git add src/project/detectors/browser-extension.ts src/project/detectors/browser-extension.test.ts src/project/detectors/index.ts tests/fixtures/adopt/detectors/browser-extension/
git commit -m "feat(detectors): detectBrowserExtension + ADOPT_MINIMAL_EXTENSION warning"
```

**🚦 PR 1 END — All 9 detectors landed.** This is the natural point to merge PR 1 (Tasks 1-7d). PR 2 begins at Task 8.

```bash
# Optional: create PR 1 now if using stacked-PR strategy
git push -u origin feature/adopt-multi-type-detection-pr1
gh pr create --title "v3.10 Detection Foundation: 9 per-type detectors + SignalContext (PR 1 of 2)" --body "Implements Tasks 1-7d of docs/superpowers/plans/2026-04-09-adopt-multi-type-detection.md. PR 2 follows with disambiguation, merge pipeline, CLI handler, and docs."
```

---




---

## Task 8: disambiguate() + resolveDetection (Case A-G flow)

**Files:**
- Create: `src/project/detectors/disambiguate.ts`
- Create: `src/project/detectors/disambiguate.test.ts`
- Create: `src/project/detectors/resolve-detection.ts`
- Create: `src/project/detectors/resolve-detection.test.ts`

**Context:** Section 3 of the spec specifies the full disambiguation UX + Case A-G decision table. `disambiguate()` is async (uses `@inquirer/prompts.select`), handles non-TTY/CI fallback, returns `DisambiguateResult` with explicit `skipReason`. `resolveDetection()` wraps the Case A-G logic.

### Steps

- [ ] **Step 1: Create disambiguate.ts**

Full implementation per spec Section 3:

```ts
// src/project/detectors/disambiguate.ts
import type { DetectionMatch, Confidence } from './types.js'
import type { ProjectType } from '../../types/index.js'

export interface DisambiguateOptions {
  readonly interactive: boolean             // false under --auto OR non-TTY OR CI env
  readonly acceptLowConfidence: boolean     // true when --force allows low-tier into picker
}

export interface DisambiguateResult {
  readonly chosen: DetectionMatch | null
  readonly skipReason?: 'auto' | 'user-skipped' | 'user-cancelled' | 'no-eligible-matches'
  readonly nonTtyFallback?: boolean
}

// skipReason values:
//   'auto'                — opts.interactive was false OR non-TTY/CI fallback
//   'user-skipped'        — user picked "None of these" in the prompt
//   'user-cancelled'      — user Ctrl-C'd the prompt (ExitPromptError)
//   'no-eligible-matches' — disambiguate() called with empty matches

const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'browser-extension', 'game',
]

function tierRank(c: Confidence): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

function sortMatches(matches: readonly DetectionMatch[]): DetectionMatch[] {
  return [...matches].sort((a, b) => {
    const tierDiff = tierRank(b.confidence) - tierRank(a.confidence)
    if (tierDiff !== 0) return tierDiff
    const evidenceDiff = b.evidence.length - a.evidence.length
    if (evidenceDiff !== 0) return evidenceDiff
    return PROJECT_TYPE_PREFERENCE.indexOf(a.projectType)
      - PROJECT_TYPE_PREFERENCE.indexOf(b.projectType)
  })
}

function filterEligible(
  matches: readonly DetectionMatch[],
  acceptLowConfidence: boolean,
): DetectionMatch[] {
  const highMed = matches.filter(m => m.confidence !== 'low')
  if (highMed.length > 0 && !acceptLowConfidence) return highMed
  return [...matches]    // include low if force OR if low is the only tier
}

function formatEvidence(match: DetectionMatch): string {
  const shown = match.evidence.slice(0, 5)
  const parts = shown.map(e => e.file ? `${e.signal} (${e.file})` : e.signal)
  if (match.evidence.length > 5) parts.push(`… (+${match.evidence.length - 5} more)`)
  return parts.join(', ')
}

export async function disambiguate(
  matches: readonly DetectionMatch[],
  opts: DisambiguateOptions,
): Promise<DisambiguateResult> {
  if (matches.length === 0) {
    return { chosen: null, skipReason: 'no-eligible-matches' }
  }

  const isCi = process.env.CI === 'true' || process.env.CI === '1'
  const isTty = process.stdin.isTTY === true && process.stdout.isTTY === true
  const interactive = opts.interactive && isTty && !isCi

  if (!interactive) {
    return {
      chosen: null,
      skipReason: 'auto',
      nonTtyFallback: opts.interactive,   // true means user wanted interactive but env didn't allow it
    }
  }

  const eligible = sortMatches(filterEligible(matches, opts.acceptLowConfidence))
  if (eligible.length === 0) {
    return { chosen: null, skipReason: 'no-eligible-matches' }
  }

  // Dynamic import to keep this module tree-shakable
  const { select, ExitPromptError } = await import('@inquirer/prompts')

  const header = eligible.every(m => m.confidence === 'low')
    ? "We found weak signals for these project types but couldn't be confident:"
    : 'We detected multiple plausible project types:'

  const choices = eligible.map(m => ({
    name: `${m.projectType.padEnd(20)} [${m.confidence}]  ${formatEvidence(m)}`,
    value: m as DetectionMatch | null,
  }))
  choices.push({
    name: 'None of these — continue without a project type',
    value: null,
  })

  try {
    const choice = await select({
      message: header,
      choices,
      default: choices[0].value,
    })
    if (choice === null) {
      return { chosen: null, skipReason: 'user-skipped' }
    }
    return { chosen: choice }
  } catch (err) {
    if ((err as Error)?.name === 'ExitPromptError') {
      return { chosen: null, skipReason: 'user-cancelled' }
    }
    throw err
  }
}
```

- [ ] **Step 2: Create resolve-detection.ts (Case A-G)**

```ts
// src/project/detectors/resolve-detection.ts
import type { DetectionMatch } from './types.js'
import type { ProjectType } from '../../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ExitCode } from '../../types/enums.js'
import { disambiguate, type DisambiguateOptions } from './disambiguate.js'

export interface ResolveDetectionInput {
  readonly matches: readonly DetectionMatch[]
  readonly explicitProjectType?: ProjectType
  readonly opts: DisambiguateOptions
}

export interface ResolveDetectionResult {
  readonly chosen: DetectionMatch | null
  readonly error?: ScaffoldError
  readonly warnings: readonly ScaffoldWarning[]
}

/** Synthesize an empty detection match for an explicitly-specified projectType. */
export function synthesizeEmptyMatch(projectType: ProjectType): DetectionMatch {
  return {
    projectType,
    confidence: 'high',
    partialConfig: {} as never,
    evidence: [{ signal: 'user-specified', note: '--project-type flag' }],
  } as DetectionMatch
}

export async function resolveDetection(
  input: ResolveDetectionInput,
): Promise<ResolveDetectionResult> {
  const warnings: ScaffoldWarning[] = []

  // Case G: user passed --project-type → short-circuits Cases A-F
  if (input.explicitProjectType) {
    return {
      chosen: synthesizeEmptyMatch(input.explicitProjectType),
      warnings,
    }
  }

  const high = input.matches.filter(m => m.confidence === 'high')
  const medium = input.matches.filter(m => m.confidence === 'medium')
  const low = input.matches.filter(m => m.confidence === 'low')

  // Case A: no matches
  if (input.matches.length === 0) {
    return { chosen: null, warnings }
  }

  // Case B: single high match
  if (high.length === 1) {
    if (medium.length > 0 || low.length > 0) {
      warnings.push({
        code: 'ADOPT_SECONDARY_MATCHES',
        message: `Committed ${high[0].projectType}; runners-up: ${[...medium, ...low].map(m => m.projectType).join(', ')}`,
        context: { winner: high[0].projectType, runners_up: [...medium, ...low].map(m => m.projectType).join(',') },
      })
    }
    return { chosen: high[0], warnings }
  }

  // Case C: multiple high matches → disambiguate (pass ALL eligible matches so runners-up are visible)
  if (high.length >= 2) {
    const eligible = [...high, ...medium, ...low]   // user sees the full picture
    // Override acceptLowConfidence: true when runners-up include low tier,
    // so disambiguate.filterEligible doesn't drop them from the picker
    const opts = low.length > 0
      ? { ...input.opts, acceptLowConfidence: true }
      : input.opts
    const result = await disambiguate(eligible, opts)
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; disambiguation skipped (treated as --auto)',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_AMBIGUOUS',
          message: `Detection found multiple plausible project types: ${high.map(m => m.projectType).join(', ')}. Re-run with --project-type <type> to choose.`,
          exitCode: ExitCode.Ambiguous,
        },
        warnings,
      }
    }
    if (result.skipReason === 'user-cancelled') {
      // User Ctrl-C is a deliberate cancellation; surface as exit code 4
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  // Case D: single medium match
  if (medium.length === 1) {
    if (low.length > 0) {
      warnings.push({
        code: 'ADOPT_SECONDARY_MATCHES',
        message: `Committed ${medium[0].projectType}; low-confidence runners-up: ${low.map(m => m.projectType).join(', ')}`,
      })
    }
    return { chosen: medium[0], warnings }
  }

  // Case E: multiple medium matches → disambiguate (pass medium + low so runners-up are visible)
  if (medium.length >= 2) {
    const eligible = [...medium, ...low]
    // Override acceptLowConfidence: true when runners-up include low tier
    const opts = low.length > 0
      ? { ...input.opts, acceptLowConfidence: true }
      : input.opts
    const result = await disambiguate(eligible, opts)
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; disambiguation skipped (treated as --auto)',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_AMBIGUOUS',
          message: `Detection found multiple plausible project types: ${medium.map(m => m.projectType).join(', ')}. Re-run with --project-type <type> to choose.`,
          exitCode: ExitCode.Ambiguous,
        },
        warnings,
      }
    }
    if (result.skipReason === 'user-cancelled') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  // Case F: only low matches — route through disambiguate so non-TTY/CI fallback is consistent
  if (low.length > 0) {
    const result = await disambiguate(low, { ...input.opts, acceptLowConfidence: true })
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; low-tier disambiguation skipped',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      // No interactive prompt available — emit ADOPT_LOW_ONLY warning + no commit
      warnings.push({
        code: 'ADOPT_LOW_ONLY',
        message: `Only low-confidence matches found: ${low.map(m => m.projectType).join(', ')}`,
      })
      return { chosen: null, warnings }
    }
    if (result.skipReason === 'user-cancelled') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  return { chosen: null, warnings }
}
```

- [ ] **Step 3: Write disambiguate tests**

Create `src/project/detectors/disambiguate.test.ts` with 12 cases mocking `@inquirer/prompts.select`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disambiguate } from './disambiguate.js'
import type { DetectionMatch } from './types.js'

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  ExitPromptError: class extends Error {
    override name = 'ExitPromptError'
  },
}))

const mockMatch = (type: any, confidence: any, evidenceCount = 2): DetectionMatch => ({
  projectType: type,
  confidence,
  partialConfig: {} as any,
  evidence: Array(evidenceCount).fill({ signal: 'test' }),
}) as DetectionMatch

describe('disambiguate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Simulate interactive TTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    delete process.env.CI
  })

  it('returns no-eligible-matches for empty input', async () => {
    const result = await disambiguate([], { interactive: true, acceptLowConfidence: false })
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('no-eligible-matches')
  })

  it('returns skipReason auto under --auto', async () => {
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: false, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('auto')
  })

  it('returns nonTtyFallback when stdin not TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('auto')
    expect(result.nonTtyFallback).toBe(true)
  })

  it('returns nonTtyFallback when CI env set', async () => {
    process.env.CI = 'true'
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.skipReason).toBe('auto')
    expect(result.nonTtyFallback).toBe(true)
  })

  it('filters low matches unless forced', async () => {
    const matches = [mockMatch('web-app', 'high'), mockMatch('library', 'low')]
    // We don't actually prompt here — using --auto to check filtering behavior
    const result = await disambiguate(matches, { interactive: false, acceptLowConfidence: false })
    expect(result.skipReason).toBe('auto')
  })

  it('includes low matches when acceptLowConfidence is true', async () => {
    const matches = [mockMatch('web-app', 'high'), mockMatch('library', 'low')]
    const result = await disambiguate(matches, { interactive: false, acceptLowConfidence: true })
    expect(result.skipReason).toBe('auto')
  })

  it('interactive prompt returns chosen match when select resolves to a match', async () => {
    const { select } = await import('@inquirer/prompts') as { select: any }
    vi.mocked(select).mockResolvedValueOnce(mockMatch('backend', 'high'))
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen?.projectType).toBe('backend')
    expect(result.skipReason).toBeUndefined()
  })

  it('user-skipped (None of these) → skipReason user-skipped', async () => {
    const { select } = await import('@inquirer/prompts') as { select: any }
    vi.mocked(select).mockResolvedValueOnce(null)    // "None of these"
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('user-skipped')
  })

  it('ExitPromptError (Ctrl-C) → skipReason user-cancelled', async () => {
    const { select, ExitPromptError } = await import('@inquirer/prompts') as any
    vi.mocked(select).mockRejectedValueOnce(new ExitPromptError('User cancelled'))
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('user-cancelled')
  })

  it('non-ExitPromptError is re-thrown', async () => {
    const { select } = await import('@inquirer/prompts') as any
    vi.mocked(select).mockRejectedValueOnce(new Error('unexpected'))
    await expect(disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )).rejects.toThrow('unexpected')
  })

  it('sort order: high before medium before low', async () => {
    const { select } = await import('@inquirer/prompts') as any
    let choicesArg: any[] = []
    vi.mocked(select).mockImplementationOnce(async ({ choices }: any) => {
      choicesArg = choices
      return choices[0].value
    })
    await disambiguate(
      [
        mockMatch('library', 'low'),
        mockMatch('backend', 'medium'),
        mockMatch('web-app', 'high'),
      ],
      { interactive: true, acceptLowConfidence: true },
    )
    // First choice is web-app (high tier)
    expect(choicesArg[0].value.projectType).toBe('web-app')
    // Last meaningful choice is library (low tier)
    expect(choicesArg[2].value.projectType).toBe('library')
    // Last choice is the "None of these" sentinel
    expect(choicesArg[3].value).toBeNull()
  })

  it('Case F: low-only matches render with "weak signals" header', async () => {
    const { select } = await import('@inquirer/prompts') as any
    let messageArg: string = ''
    vi.mocked(select).mockImplementationOnce(async ({ message, choices }: any) => {
      messageArg = message
      return choices[0].value
    })
    await disambiguate(
      [mockMatch('library', 'low')],
      { interactive: true, acceptLowConfidence: true },
    )
    expect(messageArg).toContain("weak signals")
  })
})
```

- [ ] **Step 4: Write resolve-detection tests**

Create `src/project/detectors/resolve-detection.test.ts` with 18 cases covering Cases A-G:

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveDetection, synthesizeEmptyMatch } from './resolve-detection.js'
import type { DetectionMatch } from './types.js'

vi.mock('./disambiguate.js', () => ({
  disambiguate: vi.fn(),
}))
import { disambiguate } from './disambiguate.js'

const match = (t: any, c: any): DetectionMatch => ({
  projectType: t, confidence: c, partialConfig: {} as any, evidence: [],
}) as DetectionMatch

describe('resolveDetection Cases A-G', () => {
  it('Case A: no matches → no projectType', async () => {
    const result = await resolveDetection({
      matches: [],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('Case B: single high → commit', async () => {
    const m = match('web-app', 'high')
    const result = await resolveDetection({
      matches: [m],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBe(m)
  })

  it('Case B with runners-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'medium')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('Case C: multiple high → disambiguate is called', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('backend', 'high') })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(disambiguate).toHaveBeenCalled()
    expect(result.chosen?.projectType).toBe('backend')
  })

  it('Case C under --auto: emits ADOPT_AMBIGUOUS error', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'auto' })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: false, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.error?.code).toBe('ADOPT_AMBIGUOUS')
    expect(result.error?.exitCode).toBe(6)
  })

  it('Case D: single medium → commit', async () => {
    const m = match('library', 'medium')
    const result = await resolveDetection({
      matches: [m],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBe(m)
  })

  it('Case F: only low interactive → delegates to disambiguate', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('library', 'low') })
    const result = await resolveDetection({
      matches: [match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('library')
  })

  it('Case F: only low --auto → ADOPT_LOW_ONLY warning + no commit', async () => {
    const result = await resolveDetection({
      matches: [match('library', 'low')],
      opts: { interactive: false, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.warnings.some(w => w.code === 'ADOPT_LOW_ONLY')).toBe(true)
  })

  it('Case G: explicitProjectType short-circuits detection', async () => {
    const result = await resolveDetection({
      matches: [match('backend', 'high')],    // Would otherwise pick backend
      explicitProjectType: 'web-app',          // But user said web-app
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(disambiguate).not.toHaveBeenCalled()
  })

  it('Case C user-cancelled → ADOPT_USER_CANCELLED error with exit code 4', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'user-cancelled' })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.error?.code).toBe('ADOPT_USER_CANCELLED')
    expect(result.error?.exitCode).toBe(4)
  })

  it('Case C non-TTY fallback → ADOPT_NON_TTY warning + ADOPT_AMBIGUOUS error', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'auto', nonTtyFallback: true })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.warnings.some(w => w.code === 'ADOPT_NON_TTY')).toBe(true)
    expect(result.error?.code).toBe('ADOPT_AMBIGUOUS')
  })

  it('Case E: multiple medium matches → disambiguate called', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('library', 'medium') })
    const result = await resolveDetection({
      matches: [match('library', 'medium'), match('cli', 'medium')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(disambiguate).toHaveBeenCalled()
    expect(result.chosen?.projectType).toBe('library')
  })

  it('Case B with low runner-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('Case D with low runner-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('backend', 'medium'), match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('backend')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('synthesizeEmptyMatch produces a match with empty partialConfig', () => {
    const m = synthesizeEmptyMatch('web-app')
    expect(m.projectType).toBe('web-app')
    expect(m.confidence).toBe('high')
    expect(Object.keys(m.partialConfig as object)).toHaveLength(0)
    expect(m.evidence[0].signal).toBe('user-specified')
  })
})
```

- [ ] **Step 5: Run the new test files**

```bash
npm test -- src/project/detectors/disambiguate.test.ts src/project/detectors/resolve-detection.test.ts
```
Expected: 30 tests pass (12 + 18).

- [ ] **Step 6: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/project/detectors/disambiguate.ts src/project/detectors/disambiguate.test.ts src/project/detectors/resolve-detection.ts src/project/detectors/resolve-detection.test.ts
git commit -m "feat: disambiguate() + resolveDetection (Case A-G decision table)"
```

---

## Task 9: Merge pipeline + applyFlagOverrides + drift warning

**Files:**
- Modify: `src/project/adopt.ts` (add mergeRawConfig, applyFlagOverrides, finalize pipeline)
- Create: `src/project/adopt.merge.test.ts`

**Context:** Section 3 of the spec defines the pre-parse YAML merge invariant: existing user values always win over detected values, explicit CLI flags override both, Zod applies defaults at the very end. The merge MUST happen on raw YAML before Zod.parse — otherwise Zod defaults mask "the user didn't set this" from "the user set this to the default." Drift warnings (`ADOPT_FIELD_CONFLICT`) fire when detected disagrees with existing.

### Steps

- [ ] **Step 1: Add mergeRawConfig helper to adopt.ts**

```ts
// In src/project/adopt.ts, add below the existing exports:

export interface FieldConflict {
  readonly field: string
  readonly existing: unknown
  readonly detected: unknown
}

/**
 * Shallow merge: existing values win on overlap, detected fills gaps.
 * Returns the merged object plus a list of FieldConflict records for any field
 * where detected and existing disagree (caller emits ADOPT_FIELD_CONFLICT warnings).
 *
 * Uses JSON.stringify for value equality so arrays and (future) nested objects
 * are compared by content, not reference.
 */
export function mergeRawConfig<T extends Record<string, unknown>>(
  detected: Partial<T>,
  existing: Record<string, unknown> | undefined,
): { merged: Record<string, unknown>; conflicts: FieldConflict[] } {
  const conflicts: FieldConflict[] = []
  const merged: Record<string, unknown> = { ...detected }

  if (existing) {
    for (const [key, existingVal] of Object.entries(existing)) {
      const detectedVal = detected[key as keyof T]
      if (detectedVal !== undefined) {
        // Compare by serialized form so arrays/objects aren't always "different"
        const detectedSerialized = JSON.stringify(detectedVal)
        const existingSerialized = JSON.stringify(existingVal)
        if (detectedSerialized !== existingSerialized) {
          conflicts.push({ field: key, existing: existingVal, detected: detectedVal })
        }
      }
      merged[key] = existingVal    // existing wins
    }
  }

  return { merged, conflicts }
}

export function applyFlagOverrides<T extends Record<string, unknown>>(
  base: Record<string, unknown>,
  overrides: Partial<T> | undefined,
): Record<string, unknown> {
  if (!overrides) return base
  return { ...base, ...overrides }   // flag values replace whatever was there
}

/**
 * Convert FieldConflict[] into ADOPT_FIELD_CONFLICT warnings for the orchestrator
 * to push onto result.warnings.
 */
export function emitFieldConflictWarnings(
  conflicts: readonly FieldConflict[],
  configKey: string,    // e.g. 'webAppConfig'
): import('../types/index.js').ScaffoldWarning[] {
  return conflicts.map(c => ({
    code: 'ADOPT_FIELD_CONFLICT',
    message: `${configKey}.${c.field}: existing value '${JSON.stringify(c.existing)}' wins over detected '${JSON.stringify(c.detected)}'. Pass --force --project-type <type> --<flag> to override.`,
    context: { field: c.field, existing: String(c.existing), detected: String(c.detected) },
  }))
}
```

- [ ] **Step 2: Add merge.test.ts with 8 test cases**

```ts
import { describe, it, expect } from 'vitest'
import { mergeRawConfig, applyFlagOverrides, emitFieldConflictWarnings } from './adopt.js'

describe('mergeRawConfig', () => {
  it('returns detected when existing is undefined', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, undefined)
    expect(result.merged).toEqual({ a: 1, b: 2 })
    expect(result.conflicts).toEqual([])
  })

  it('existing wins on overlap (scalar values)', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, { a: 99 })
    expect(result.merged).toEqual({ a: 99, b: 2 })
    expect(result.conflicts).toEqual([{ field: 'a', existing: 99, detected: 1 }])
  })

  it('no conflict when detected and existing agree', () => {
    const result = mergeRawConfig({ a: 1 }, { a: 1 })
    expect(result.merged).toEqual({ a: 1 })
    expect(result.conflicts).toEqual([])
  })

  it('detected fills in fields existing does not set', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, { c: 3 })
    expect(result.merged).toEqual({ a: 1, b: 2, c: 3 })
    expect(result.conflicts).toEqual([])
  })

  it('handles arrays as opaque values via JSON.stringify comparison', () => {
    const result = mergeRawConfig(
      { dataStore: ['relational', 'redis'] },
      { dataStore: ['relational'] },
    )
    expect(result.merged.dataStore).toEqual(['relational'])    // existing wins entirely
    expect(result.conflicts).toEqual([{
      field: 'dataStore',
      existing: ['relational'],
      detected: ['relational', 'redis'],
    }])
  })

  it('NO conflict when arrays are structurally equal', () => {
    const result = mergeRawConfig(
      { dataStore: ['relational'] },
      { dataStore: ['relational'] },
    )
    expect(result.conflicts).toEqual([])
  })
})

describe('emitFieldConflictWarnings', () => {
  it('produces one ADOPT_FIELD_CONFLICT per conflict', () => {
    const warnings = emitFieldConflictWarnings(
      [{ field: 'renderingStrategy', existing: 'ssr', detected: 'spa' }],
      'webAppConfig',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('ADOPT_FIELD_CONFLICT')
    expect(warnings[0].message).toContain('webAppConfig.renderingStrategy')
    expect(warnings[0].message).toContain("'\"ssr\"'")
  })
})

describe('applyFlagOverrides', () => {
  it('returns base when overrides is undefined', () => {
    expect(applyFlagOverrides({ a: 1 }, undefined)).toEqual({ a: 1 })
  })

  it('overrides replace base values', () => {
    expect(applyFlagOverrides({ a: 1, b: 2 }, { a: 99 })).toEqual({ a: 99, b: 2 })
  })

  it('full precedence: flag overrides existing + detected merge result', () => {
    // Step 1: merge
    const { merged } = mergeRawConfig({ a: 'detected', b: 'detected' }, { a: 'existing' })
    // Step 2: flag overrides
    const final = applyFlagOverrides(merged, { a: 'flag' })
    expect(final).toEqual({ a: 'flag', b: 'detected' })
  })
})
```

- [ ] **Step 3: Run the new tests**

```bash
npm test -- src/project/adopt.merge.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 4: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/project/adopt.ts src/project/adopt.merge.test.ts
git commit -m "feat: merge pipeline + applyFlagOverrides + drift detection"
```

---

## Task 10: gameConfig deprecation alias + migration

**Files:**
- Modify: `src/types/config.ts` (add `detectedConfig` field, mark `gameConfig` @deprecated)
- Modify: `src/project/adopt.ts` (set BOTH fields when game detected; emit deprecation warning)
- Modify: `src/project/adopt.test.ts` (4 game tests assert both fields)
- Modify: `src/cli/commands/adopt.ts` (JSON output dual-emit)
- Modify: `src/cli/commands/adopt.test.ts`
- Modify: `src/wizard/wizard.ts` (set both fields for game projects)
- Modify: `src/wizard/questions.ts` (if it touches gameConfig — verify)
- Modify: `src/wizard/wizard.test.ts`
- Modify: `src/wizard/questions.test.ts`
- Modify: `src/core/pipeline/resolver.test.ts` (if it reads gameConfig — verify)
- Modify: `src/e2e/game-pipeline.test.ts` (snapshot update)
- Modify: `src/e2e/project-type-overlays.test.ts` (if applicable)

**Context:** v3.10.0 deprecates `gameConfig` in favor of `detectedConfig` discriminated union. For v3.10, BOTH fields must be set when a game project is detected/configured, so downstream consumers still work. Removal target: v4.0.

### Steps

- [ ] **Step 1: Run verification script pre-flight**

```bash
bash scripts/verify-gameconfig-migration.sh
```
Expected: lists 26 files, exits 0.

- [ ] **Step 2: Add detectedConfig to ProjectConfig + mark gameConfig @deprecated**

Edit `src/types/config.ts`. Add `detectedConfig` field to the `ProjectConfig` interface and add JSDoc `@deprecated` to `gameConfig`:

```ts
export interface ProjectConfig {
  // ... existing fields ...

  /** @deprecated Use detectedConfig instead. Removed in v4.0. */
  gameConfig?: Partial<GameConfig>

  detectedConfig?: DetectedConfig
  detectionEvidence?: readonly DetectionEvidence[]
  detectionConfidence?: Confidence
}

export type DetectedConfig =
  | { type: 'web-app'; config: WebAppConfig }
  | { type: 'backend'; config: BackendConfig }
  | { type: 'cli'; config: CliConfig }
  | { type: 'library'; config: LibraryConfig }
  | { type: 'mobile-app'; config: MobileAppConfig }
  | { type: 'data-pipeline'; config: DataPipelineConfig }
  | { type: 'ml'; config: MlConfig }
  | { type: 'browser-extension'; config: BrowserExtensionConfig }
  | { type: 'game'; config: GameConfig }
```

- [ ] **Step 3: Update adopt.ts to set both fields for game**

Where `result.gameConfig = gameMatch.partialConfig` is set, ALSO set:

```ts
if (gameMatch) {
  result.projectType = 'game'
  result.gameConfig = gameMatch.partialConfig as Partial<GameConfig>  // deprecated alias
  result.detectedConfig = { type: 'game', config: gameMatch.partialConfig as GameConfig }
  result.detectionEvidence = gameMatch.evidence
  result.detectionConfidence = gameMatch.confidence
  result.warnings.push({
    code: 'ADOPT_GAME_CONFIG_DEPRECATED',
    message: "The 'gameConfig' field in AdoptionResult is deprecated. Use 'detectedConfig' instead. Removed in v4.0.",
  })
}
```

- [ ] **Step 4: Update 4 game tests in adopt.test.ts**

Each existing test that asserts `result.gameConfig === { engine: 'unity' }` gets an additional assertion:

```ts
expect(result.gameConfig).toEqual({ engine: 'unity' })
expect(result.detectedConfig).toEqual({ type: 'game', config: { engine: 'unity' } })
```

- [ ] **Step 5: Update wizard.ts + wizard tests**

Find all places in `src/wizard/wizard.ts` that set `config.project.gameConfig`. Add corresponding `config.project.detectedConfig = { type: 'game', config: gameConfig }` assignments.

Update `src/wizard/wizard.test.ts` assertions accordingly.

- [ ] **Step 6: Update CLI adopt command JSON output**

In `src/cli/commands/adopt.ts`, the JSON output should now include:

```ts
const jsonOutput = {
  schema_version: 2,
  // ... existing fields ...
  project_type: adoptResult.projectType,       // deprecated top-level, still emitted
  detected_config: adoptResult.detectedConfig,  // new canonical
  game_config: adoptResult.gameConfig,          // deprecated, still emitted when type === 'game'
  detection_confidence: adoptResult.detectionConfidence,
  detection_evidence: adoptResult.detectionEvidence,
}
```

- [ ] **Step 7: Update e2e tests**

Update `src/e2e/game-pipeline.test.ts` and `src/e2e/project-type-overlays.test.ts` snapshot assertions to include both `gameConfig` and `detectedConfig` fields.

Run `npm test -- src/e2e/game-pipeline.test.ts -u` if needed to update snapshots (vitest `-u` flag updates snapshots in place — inspect the diff manually before committing).

- [ ] **Step 8: Run verification script post-migration**

```bash
bash scripts/verify-gameconfig-migration.sh
```
Expected: still lists 26 files (schema stays unchanged), exits 0.

- [ ] **Step 9: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/types/config.ts src/project/adopt.ts src/project/adopt.test.ts src/cli/commands/adopt.ts src/cli/commands/adopt.test.ts src/wizard/wizard.ts src/wizard/wizard.test.ts src/wizard/questions.ts src/wizard/questions.test.ts src/core/pipeline/resolver.test.ts src/e2e/game-pipeline.test.ts src/e2e/project-type-overlays.test.ts
git commit -m "feat: gameConfig deprecation alias + dual-emit migration (v3.10)"
```

---

## Task 11: CLI handler delta — 32 init flags + atomic writes + dry-run

**Files:**
- Modify: `src/project/adopt.ts` (runAdoption accepts explicitProjectType + flagOverrides; calls resolveDetection + merge pipeline)
- Modify: `src/cli/commands/adopt.ts` (add 32 init flags via .options() + .group() + .check(); new handler logic; atomic writes; dry-run)
- Create: `src/cli/commands/adopt.cli-flags.test.ts` (30 cases)
- Create: `src/cli/commands/adopt.config-write.test.ts` (14 cases)
- Create: `src/cli/commands/adopt.json-output.test.ts` (6 cases)
- Create: `src/cli/commands/adopt.windows-crlf.test.ts` (1 case)
- Create: `src/project/adopt.re-adoption.test.ts` (24+ cases)
- Create: `src/project/adopt.error-messages.test.ts` (4 cases)

**Context:** This is the biggest task in PR 2. It wires everything together: detection pipeline, flag overrides, merge, atomic writes via `yaml.parseDocument`, dry-run mode, full JSON output with `schema_version: 2`. See spec Section 4 for the full handler code sketch.

### Steps

- [ ] **Step 1: Extend runAdoption signature**

```ts
export async function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
  auto: boolean                             // derived: argv.auto || outputMode === 'json'
  force: boolean
  verbose: boolean
  explicitProjectType?: ProjectType
  flagOverrides?: PartialConfigOverrides
}): Promise<AdoptionResult>
```

**The orchestrator must wire the merge pipeline correctly.** This is the spec's most load-bearing invariant: existing user values win over detected, explicit flags win over both, Zod defaults fill in the rest. The merge happens on RAW YAML BEFORE Zod.parse — otherwise Zod defaults mask "user didn't set this" from "user set this to the default."

Inside `runAdoption`, after running detectors:

**Important:** Task 11 is editing `src/project/adopt.ts` itself. The helpers (`mergeRawConfig`, `applyFlagOverrides`, `emitFieldConflictWarnings`, `FieldConflict`) were added to this same file in Task 9 — use them directly without imports. The example below shows the imports added at the top of `adopt.ts`, plus the new orchestration code that goes into `runAdoption`:

```ts
// Add to the TOP of src/project/adopt.ts (existing file — add these imports)
import { parseDocument, isMap, type Document } from 'yaml'
import {
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema, LibraryConfigSchema,
  MobileAppConfigSchema, DataPipelineConfigSchema, MlConfigSchema,
  BrowserExtensionConfigSchema, GameConfigSchema,
} from '../config/schema.js'
import { z } from 'zod'
import { createSignalContext } from './detectors/context.js'
import { runDetectors } from './detectors/index.js'
import { resolveDetection } from './detectors/resolve-detection.js'
import type { DetectionMatch } from './detectors/types.js'
import { assertNever } from './detectors/types.js'
import { ExitCode } from '../types/enums.js'
import { configParseError, configNotObject } from '../utils/errors.js'
// mergeRawConfig, applyFlagOverrides, emitFieldConflictWarnings, FieldConflict
// are defined in this SAME file by Task 9 — no import needed.

// CRITICAL: project-type → typed-config-key mapping. Do NOT derive via string transforms
// — `'web-app'.replace('-','')` produces 'webapp', not 'webApp'.
const TYPE_KEY: Record<ProjectType, string> = {
  'web-app':           'webAppConfig',
  'mobile-app':        'mobileAppConfig',
  'backend':           'backendConfig',
  'cli':               'cliConfig',
  'library':           'libraryConfig',
  'game':              'gameConfig',
  'data-pipeline':     'dataPipelineConfig',
  'ml':                'mlConfig',
  'browser-extension': 'browserExtensionConfig',
}

// Map project type to its Zod schema for parse/validation
function schemaForType(type: ProjectType): z.ZodType {
  switch (type) {
    case 'web-app':           return WebAppConfigSchema
    case 'backend':           return BackendConfigSchema
    case 'cli':               return CliConfigSchema
    case 'library':           return LibraryConfigSchema
    case 'mobile-app':        return MobileAppConfigSchema
    case 'data-pipeline':     return DataPipelineConfigSchema
    case 'ml':                return MlConfigSchema
    case 'browser-extension': return BrowserExtensionConfigSchema
    case 'game':              return GameConfigSchema
    default: return assertNever(type as never)
  }
}
```

Then in `runAdoption`:

```ts
// Build SignalContext + run detectors
const ctx = createSignalContext(projectRoot)
const detectorMatches = runDetectors(ctx)

// Re-adoption: read existing config.yml (if any) BEFORE Case A-G resolves
const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
let existingDoc: Document | undefined
let existingProjectType: ProjectType | undefined
let existingTypedConfigRaw: Record<string, unknown> | undefined

if (fs.existsSync(configPath)) {
  const text = fs.readFileSync(configPath, 'utf8')
  existingDoc = parseDocument(text)
  if (existingDoc.errors.length > 0) {
    result.errors.push(configParseError(configPath, existingDoc.errors[0].message))
    return result
  }
  const projectNode = existingDoc.get('project', true)
  if (projectNode !== undefined && !isMap(projectNode)) {
    result.errors.push(configNotObject(configPath))
    return result
  }
  const projectJs = existingDoc.toJS()?.project as Record<string, unknown> | undefined
  existingProjectType = projectJs?.projectType as ProjectType | undefined
  if (existingProjectType) {
    existingTypedConfigRaw = projectJs?.[TYPE_KEY[existingProjectType]] as Record<string, unknown> | undefined
  }
}

// Re-adoption gating
if (existingProjectType && !options.force && !options.explicitProjectType) {
  // SKIP detection — just re-run artifact scan (existing behavior)
  result.warnings.push({
    code: 'ADOPT_DETECTION_INCONCLUSIVE',
    message: `Project already adopted as '${existingProjectType}'. Pass --force to re-detect, or --project-type to switch.`,
  })
  result.projectType = existingProjectType
  return result   // skip detection entirely
}

// Project-type conflict check
if (existingProjectType && options.explicitProjectType
    && options.explicitProjectType !== existingProjectType
    && !options.force) {
  result.errors.push({
    code: 'ADOPT_TYPE_CONFLICT',
    message: `Existing projectType is '${existingProjectType}' but --project-type=${options.explicitProjectType} was passed. Re-run with --force to overwrite.`,
    exitCode: ExitCode.Ambiguous,
  })
  return result
}

const decision = await resolveDetection({
  matches: detectorMatches,
  explicitProjectType: options.explicitProjectType,
  opts: {
    interactive: !options.auto,
    acceptLowConfidence: options.force,
  },
})

result.warnings.push(...ctx.warnings, ...decision.warnings)

if (decision.error) {
  result.errors.push(decision.error)
  return result
}

if (decision.chosen) {
  // Type-changed warning if re-adoption picked a different type
  if (existingProjectType && existingProjectType !== decision.chosen.projectType) {
    result.warnings.push({
      code: 'ADOPT_TYPE_CHANGED',
      message: `Re-adoption changed projectType from '${existingProjectType}' to '${decision.chosen.projectType}'`,
      context: { from: existingProjectType, to: decision.chosen.projectType },
    })
  }

  try {
    const finalized = finalizeConfigFromMatch(
      decision.chosen,
      options.flagOverrides,
      // Only pass existing raw if same type (avoids merging across types)
      existingProjectType === decision.chosen.projectType ? existingTypedConfigRaw : undefined,
    )

    // Emit field-conflict warnings from the merge
    if (finalized.conflicts.length > 0) {
      result.warnings.push(...emitFieldConflictWarnings(
        finalized.conflicts,
        TYPE_KEY[decision.chosen.projectType],
      ))
    }

    result.projectType = decision.chosen.projectType
    result.detectedConfig = {
      type: decision.chosen.projectType,
      config: finalized.config,
    } as DetectedConfig
    result.detectionEvidence = decision.chosen.evidence
    result.detectionConfidence = decision.chosen.confidence

    // Dual-emit gameConfig (deprecation alias, removed v4.0)
    if (decision.chosen.projectType === 'game') {
      result.gameConfig = finalized.config as Partial<GameConfig>
      result.warnings.push({
        code: 'ADOPT_GAME_CONFIG_DEPRECATED',
        message: "The 'gameConfig' field is deprecated. Use 'detectedConfig' (when type === 'game'). Removed in v4.0.",
      })
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      // ADOPT_MISSING_REQUIRED_FIELDS — Zod rejected the merged config.
      // Do NOT auto-generate flag hints from field names: the init flag conventions
      // don't follow a deterministic pattern (e.g., `renderingStrategy` maps to
      // `--web-rendering`, not `--web-app-rendering-strategy`). Instead, point at
      // `scaffold init --help` for the full flag list for this project type.
      const missing = err.errors.map(e => e.path.join('.')).join(', ')
      result.errors.push({
        code: 'ADOPT_MISSING_REQUIRED_FIELDS',
        message: `Schema validation failed for ${decision.chosen.projectType}: missing or invalid fields [${missing}]. Run 'scaffold init --help' to see the available flags for this project type.`,
        exitCode: ExitCode.ValidationError,
        context: { type: decision.chosen.projectType, missing },
      })
      return result
    }
    throw err
  }
}
```

The new `finalizeConfigFromMatch` (added to `src/project/adopt.ts` alongside the existing helpers) integrates the merge pipeline:

```ts
// These helpers + the FieldConflict type are already defined in adopt.ts by Task 9.
// finalizeConfigFromMatch is added in Task 11, in the same file.

interface FinalizedResult {
  readonly config: unknown    // narrowed by caller via projectType
  readonly conflicts: readonly FieldConflict[]
}

function finalizeConfigFromMatch(
  match: DetectionMatch,
  flagOverrides: PartialConfigOverrides | undefined,
  existingTypedConfigRaw: Record<string, unknown> | undefined,
): FinalizedResult {
  // Step 1: pre-parse merge — existing wins over detected
  const { merged, conflicts } = mergeRawConfig(
    match.partialConfig as Record<string, unknown>,
    existingTypedConfigRaw,
  )

  // Step 2: apply flag overrides — flags replace whatever survived steps 1-2
  const overridePartial = flagOverrides?.type === match.projectType
    ? (flagOverrides.partial as Record<string, unknown>)
    : undefined
  const flagged = applyFlagOverrides(merged, overridePartial)

  // Step 3: Zod.parse — applies defaults to fields still unset
  // (assertNever guarantees exhaustiveness if a 10th type is added later)
  let config: unknown
  switch (match.projectType) {
    case 'web-app':           config = WebAppConfigSchema.parse(flagged); break
    case 'backend':           config = BackendConfigSchema.parse(flagged); break
    case 'cli':               config = CliConfigSchema.parse(flagged); break
    case 'library':           config = LibraryConfigSchema.parse(flagged); break
    case 'mobile-app':        config = MobileAppConfigSchema.parse(flagged); break
    case 'data-pipeline':     config = DataPipelineConfigSchema.parse(flagged); break
    case 'ml':                config = MlConfigSchema.parse(flagged); break
    case 'browser-extension': config = BrowserExtensionConfigSchema.parse(flagged); break
    case 'game':              config = GameConfigSchema.parse(flagged); break
    default: return assertNever(match)
  }

  return { config, conflicts }
}
```

- [ ] **Step 2: Update CLI handler in adopt.ts command**

Use the full handler skeleton from spec Section 4. Key changes:
- Add 32 init flag options via `.options({ ...GAME_FLAGS, ...WEB_FLAGS, ... })`
- Add 9 `.group(...)` calls for `--help` organization
- Add `.check(applyFlagFamilyValidation)` for flag validation
- Compute `effectiveAuto = argv.auto || outputMode === 'json'`
- Inner try/catch around `await runAdoption(...)` with `asScaffoldError` wrapper
- Config-first, state-second atomic writes via `atomicWriteFileSync`
- JSON output with `schema_version: 2` + `detected_config` + deprecated aliases
- Dry-run handling: compute everything in memory, print proposed changes, skip writes

- [ ] **Step 3: Add atomicWriteFileSync + writeOrUpdateConfig helpers**

```ts
function atomicWriteFileSync(target: string, content: string): void {
  const tmpPath = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, target)
}

function writeOrUpdateConfig(
  projectRoot: string,
  result: AdoptionResult,
  flagOverrides: PartialConfigOverrides | undefined,
): void {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')

  let doc: Document
  if (!fs.existsSync(configPath)) {
    // Bootstrap minimal config — NO methodology/platforms imposition (Section 4 R2-Δ2)
    doc = parseDocument(`# scaffold config — created by scaffold adopt
version: 2
project:
`)
  } else {
    const content = fs.readFileSync(configPath, 'utf8')
    doc = parseDocument(content)
    if (doc.errors.length > 0) {
      throw configParseError(configPath, doc.errors[0].message)
    }
    const projectNode = doc.get('project', true)
    if (projectNode !== undefined && !isMap(projectNode)) {
      throw configNotObject(configPath)
    }
  }

  // Mutate AST with detected config (TYPE_KEY constant lookup, NOT string transform)
  if (result.projectType && result.detectedConfig) {
    doc.setIn(['project', 'projectType'], result.projectType)
    doc.setIn(['project', TYPE_KEY[result.projectType]], result.detectedConfig.config)
  }

  atomicWriteFileSync(configPath, doc.toString())
}
```

The handler wraps both writes in try/catch so write failures emit explicit error/warning codes:

```ts
// In the handler, AFTER runAdoption resolves:
if (!argv['dry-run'] && adoptResult.errors.length === 0) {
  try {
    writeOrUpdateConfig(projectRoot, adoptResult, buildFlagOverrides(argv))
  } catch (err) {
    output.error(asScaffoldError(err, 'ADOPT_CONFIG_WRITE_FAILED', ExitCode.ValidationError))
    process.exitCode = ExitCode.ValidationError
    return
  }
  try {
    writeOrUpdateState(projectRoot, adoptResult, methodology)
  } catch (err) {
    // State write failure is recoverable — emit warning and continue
    output.warn({
      code: 'ADOPT_STATE_WRITE_FAILED',
      message: `state.json write failed (recoverable on next run): ${(err as Error).message}`,
    })
  }
}
```

The handler also wraps `runAdoption` in try/catch for `ADOPT_INTERNAL`:

```ts
let adoptResult: AdoptionResult
try {
  adoptResult = await runAdoption({
    projectRoot, metaPromptDir, methodology,
    dryRun: argv['dry-run'] ?? false,
    auto: argv.auto === true || outputMode === 'json',   // JSON mode → auto per Section 4 R2-Δ8
    force: argv.force === true,
    verbose: argv.verbose === true,
    explicitProjectType: argv['project-type'] as ProjectType | undefined,
    flagOverrides: buildFlagOverrides(argv),
  })
} catch (err) {
  output.error(asScaffoldError(err, 'ADOPT_INTERNAL', ExitCode.ValidationError))
  process.exitCode = ExitCode.ValidationError
  return
}
```

- [ ] **Step 4: Write CLI flag tests**

Create `src/cli/commands/adopt.cli-flags.test.ts` with 30 tests: 9 happy-path (one per family) + 9 mixed-family rejection + 4 Case G (explicit project-type + missing anchor) + 4 --format json + 4 exit code coverage.

- [ ] **Step 5: Write config-write tests**

Create `src/cli/commands/adopt.config-write.test.ts` with 14 tests: bootstrap blank config, merge existing YAML, preserve comments, structural check (project: scalar rejected), atomic tmp+rename, etc.

- [ ] **Step 6: Write JSON output snapshot tests**

Create `src/cli/commands/adopt.json-output.test.ts` with 6 snapshots: greenfield, each of 9 types (parameterized → collapse to 6 representative), ambiguous, cancelled.

- [ ] **Step 7: Write Windows CRLF test**

Create `src/cli/commands/adopt.windows-crlf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runAdoption } from '../../project/adopt.js'

describe('Windows CRLF round-trip preservation', () => {
  it('preserves existing CRLF line endings in config.yml after non-dry-run adopt', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-crlf-'))
    fs.mkdirSync(path.join(dir, '.scaffold'))
    const crlfContent = "# scaffold config\r\nversion: 2\r\nproject:\r\n  projectType: web-app\r\n"
    fs.writeFileSync(path.join(dir, '.scaffold/config.yml'), crlfContent)

    // Seed a Next.js fixture so detection has something to do
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","dependencies":{"next":"14"}}')
    fs.writeFileSync(path.join(dir, 'next.config.mjs'), 'export default {}')

    await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, 'content', 'pipeline'),  // empty, OK for this test
      methodology: 'deep',
      dryRun: false,
      auto: true,
      force: true,
      verbose: false,
    })

    const after = fs.readFileSync(path.join(dir, '.scaffold/config.yml'), 'utf8')
    expect(after).toContain('\r\n')
    // Verify the new field landed
    expect(after).toMatch(/webAppConfig/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 8: Write re-adoption matrix tests**

Create `src/project/adopt.re-adoption.test.ts` covering 24+ cells: 8 flag combinations × 3 existing-state variants (no projectType / matching / mismatching).

- [ ] **Step 9: Write error message snapshot tests**

Create `src/project/adopt.error-messages.test.ts` with 4 snapshots: ADOPT_AMBIGUOUS, ADOPT_TYPE_CONFLICT, ADOPT_MISSING_REQUIRED_FIELDS, ADOPT_GAME_CONFIG_DEPRECATED.

- [ ] **Step 10: Run all new tests**

```bash
npm test -- src/cli/commands/adopt src/project/adopt
```
Expected: ~79 new test cases pass (30 + 14 + 6 + 1 + 24 + 4).

- [ ] **Step 11: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add src/project/adopt.ts src/cli/commands/adopt.ts src/cli/commands/adopt.cli-flags.test.ts src/cli/commands/adopt.config-write.test.ts src/cli/commands/adopt.json-output.test.ts src/cli/commands/adopt.windows-crlf.test.ts src/project/adopt.re-adoption.test.ts src/project/adopt.error-messages.test.ts
git commit -m "feat: CLI handler with 32 init flags + atomic writes + dry-run"
```

---

## Task 12: Documentation — CHANGELOG, README, ADRs, json-output-schemas

**Files:**
- Modify: `CHANGELOG.md` (v3.10.0 entry)
- Modify: `README.md` (multi-type adoption section + monorepo pitfalls + disambiguation example)
- Modify: `docs/architecture/adrs/ADR-025-cli-output-contract.md` (amend with Exit Code 6)
- Create: `docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md`
- Modify: `docs/architecture/api/json-output-schemas.md` (update section 2.3)

### Steps

- [ ] **Step 1: Add v3.10.0 entry to CHANGELOG.md**

Use the full CHANGELOG content from spec Section 6 at the top of `CHANGELOG.md` (above the existing v3.9.2 entry).

- [ ] **Step 2: Update README.md**

Add feature list bullet, "Detected project types" subsection, "Multi-type disambiguation" subsection with literal `❯` prompt, and "Common pitfalls" subsection with monorepo/mixed-routers/theme-extensions guidance. Text from spec Section 6.4.

- [ ] **Step 3: Amend ADR-025**

Append to `docs/architecture/adrs/ADR-025-cli-output-contract.md` the "Amendment 1 — Exit Code 6" block from spec Section 6.

- [ ] **Step 4: Create ADR-056**

Create `docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md` with the full content from spec Section 6 "R2-Δ4". References and extends ADR-028.

- [ ] **Step 5: Update json-output-schemas.md section 2.3**

Edit `docs/architecture/api/json-output-schemas.md` section 2.3 "scaffold adopt". Replace the old envelope description with v3.10 `schema_version: 2`, discriminated `detected_config` shape, deprecation table, per-project-type field tables. Reference ADR-056 for architectural context.

> **DO NOT create the following files** — they were considered and rejected during spec review (Round 2):
> - ❌ `docs/scaffold-adopt.md` (no precedent for top-level command docs in `docs/`; README expansion covers user-facing reference)
> - ❌ `docs/architecture/cli-json-schema.md` (would duplicate the existing `json-output-schemas.md` section 2.3 source of truth)
>
> If a future contributor proposes either file, point them at the rejection rationale in the spec's Appendix E (Review History).

- [ ] **Step 6: Lint docs**

```bash
npm run lint
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md README.md docs/architecture/adrs/ADR-025-cli-output-contract.md docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md docs/architecture/api/json-output-schemas.md
git commit -m "docs: v3.10.0 CHANGELOG + README + ADR-025 amendment + ADR-056 + json-output-schemas"
```

---

## Task 13: E2E tests + forward-compat + performance benchmark

**Files:**
- Create: `src/e2e/adopt-multi-type.test.ts` (9 end-to-end fixture runs)
- Create: `tests/fixtures/schema-v3.9.2.ts` (frozen snapshot from git tag)
- Create: `src/project/adopt.forward-compat.test.ts` (validates v3.10 output against v3.9.2 schema)
- Create: `src/cli/commands/adopt.performance.test.ts` (<5ms write benchmark)

### Steps

- [ ] **Step 1: Create E2E test fixtures (9 types)**

Each fixture under `tests/fixtures/adopt/e2e/<type>/` with a minimal but realistic project tree that the detector should confidently identify. Reuse variants from Task 6/7 fixtures where possible.

- [ ] **Step 2: Write e2e/adopt-multi-type.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { runAdoption } from '../project/adopt.js'

const FIXTURES = path.join(__dirname, '../../tests/fixtures/adopt/e2e')

describe('scaffold adopt end-to-end per project type', () => {
  it.each([
    ['web-app', 'nextjs-standalone'],
    ['backend', 'express-postgres'],
    ['cli', 'commander-bin'],
    ['library', 'esm-types-only'],
    ['mobile-app', 'expo-cross-platform'],
    ['data-pipeline', 'dbt-warehouse'],
    ['ml', 'pytorch-inference'],
    ['browser-extension', 'mv3-popup'],
    ['game', 'unity-minimal'],
  ])('detects %s from %s fixture', async (expectedType, fixture) => {
    const fixturePath = path.join(FIXTURES, fixture)
    const result = await runAdoption({
      projectRoot: fixturePath,
      metaPromptDir: path.join(fixturePath, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: false,
      verbose: false,
    })
    expect(result.projectType).toBe(expectedType)
    expect(result.detectedConfig?.type).toBe(expectedType)
    expect(result.errors).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Capture frozen v3.9.2 schema fixture**

```bash
git show v3.9.2:src/config/schema.ts > tests/fixtures/schema-v3.9.2.ts
```

This file is committed verbatim and never modified. It serves as the baseline for forward-compat testing.

**Verification step (mandatory before relying on the file):**

```bash
# 1. Inspect the captured file for relative imports — anything except 'zod' is a problem
grep -E "^import .* from ['\"](\\.|src/)" tests/fixtures/schema-v3.9.2.ts || echo "OK: no relative imports"

# 2. Verify TypeScript can resolve the file
npx tsc --noEmit tests/fixtures/schema-v3.9.2.ts || {
  echo "FAIL: schema-v3.9.2.ts has resolution errors. Possible fixes:"
  echo "  - Inline any imported types into the fixture file"
  echo "  - OR, if v3.9.2 had only 'import { z } from \"zod\"', the import is fine — re-check the grep"
  exit 1
}

# 3. Add 'tests/fixtures/' to tsconfig.json's include array if not already present
grep -q '"tests/fixtures/' tsconfig.json || echo "WARNING: add 'tests/fixtures/**/*.ts' to tsconfig.json include"
```

If the verification fails, the simplest fix is to manually edit `tests/fixtures/schema-v3.9.2.ts` to inline any non-zod imports. The file becomes self-contained.

- [ ] **Step 4: Write forward-compat test**

```ts
// src/project/adopt.forward-compat.test.ts
import { describe, it, expect } from 'vitest'
import { ConfigSchema as V39Schema } from '../../tests/fixtures/schema-v3.9.2.js'

describe('forward compat: v3.10 output parses under frozen v3.9.2 schema', () => {
  // PRECONDITION: v3.9.2's ProjectSchema must use .passthrough() for unknown fields
  // (verified by spec ADR-033). If the schema is .strict(), these tests will fail
  // and the dual-emit guarantee needs revisiting. The first test below pins this.

  it('PRECONDITION: v3.9.2 ProjectSchema accepts unknown fields (passthrough)', () => {
    const minimal = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        // unknown field that v3.9.2 doesn't know about
        someUnknownField: 'allowed by passthrough',
      },
    }
    const result = V39Schema.safeParse(minimal)
    if (!result.success) {
      console.error('PRECONDITION FAILED:', result.error.errors)
      console.error('v3.9.2 ProjectSchema is .strict(), not .passthrough().')
      console.error('Forward-compat dual-emit is broken — escalate to user before proceeding.')
    }
    expect(result.success).toBe(true)
  })

  it('a v3.10 game config (with gameConfig dual-emit) parses under v3.9.2', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'game',
        gameConfig: { engine: 'unity' },              // v3.9.2 knows this
        detectedConfig: { type: 'game', config: { engine: 'unity' } },  // v3.9.2 doesn't, must passthrough
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })

  it('a v3.10 web-app config parses under v3.9.2', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr' },   // v3.9.2 knows this from R1
        detectedConfig: { type: 'web-app', config: { renderingStrategy: 'ssr' } },
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })

  it('unknown top-level fields like detectionConfidence pass through (ADR-033)', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr' },
        detectionConfidence: 'high',
        detectionEvidence: [],
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 5: Write performance benchmark test**

```ts
// src/cli/commands/adopt.performance.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseDocument } from 'yaml'

describe('atomic config write performance', () => {
  it('writes a typical config.yml in under 5ms', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-perf-'))
    const configPath = path.join(dir, 'config.yml')
    const doc = parseDocument(`version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: web-app
  webAppConfig:
    renderingStrategy: ssr
    deployTarget: serverless
`)

    const start = process.hrtime.bigint()
    const tmpPath = `${configPath}.${process.pid}.tmp`
    fs.writeFileSync(tmpPath, doc.toString(), 'utf8')
    fs.renameSync(tmpPath, configPath)
    const end = process.hrtime.bigint()

    const elapsedMs = Number(end - start) / 1_000_000
    expect(elapsedMs).toBeLessThan(5)

    fs.rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 6: Run all new tests**

```bash
npm test -- src/e2e/adopt-multi-type.test.ts src/project/adopt.forward-compat.test.ts src/cli/commands/adopt.performance.test.ts
```
Expected: 13 tests pass (9 + 3 + 1).

- [ ] **Step 7: Run full check**

```bash
npm run check
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/e2e/adopt-multi-type.test.ts tests/fixtures/schema-v3.9.2.ts src/project/adopt.forward-compat.test.ts src/cli/commands/adopt.performance.test.ts tests/fixtures/adopt/e2e/
git commit -m "test: E2E + forward-compat + performance benchmark"
```

---

## Task 14: Release prep — version bump, acceptance, MMR, PRs

**Files:**
- Modify: `package.json` (version bump 3.9.2 → 3.10.0)

**Context:** Final task before merging. Validates each acceptance criterion from spec Section 6 explicitly, runs the mandatory 3-channel multi-model review per CLAUDE.md, and creates the PR(s).

### Steps

- [ ] **Step 1: Bump version**

```bash
npm version minor --no-git-tag-version
# Verify
grep '"version"' package.json
```
Expected: `"version": "3.10.0"`.

- [ ] **Step 2: Run final make check-all gate**

```bash
make check-all
```
Expected: all green (lint + frontmatter + bats + TypeScript lint + TypeScript tests).

- [ ] **Step 3: Validate each acceptance criterion from spec Section 6**

```bash
# Acceptance 1: full test suite
npm test 2>&1 | tail -20
# Expected: all passing, ~314+ new test cases

# Acceptance 2: type check + lint
npm run type-check
npm run lint

# Acceptance 3: forward-compat regression
npm test -- src/project/adopt.forward-compat.test.ts
# Expected: PASS

# Acceptance 4: performance benchmark
npm test -- src/cli/commands/adopt.performance.test.ts
# Expected: <5ms write time

# Acceptance 5: gameConfig migration verification
bash scripts/verify-gameconfig-migration.sh
# Expected: 26 files counted, exit 0

# Acceptance 6: smoke test against real fixtures
node dist/index.js adopt --auto --root tests/fixtures/adopt/detectors/web-app/nextjs-standalone --dry-run
# Expected: detected_config.type === 'web-app' with renderingStrategy: 'ssr'
```

If any criterion fails, fix it before proceeding to Step 4.

- [ ] **Step 4: Run 3-channel multi-model review per CLAUDE.md**

For PR 1 (Tasks 1-7d):

```bash
# Channel 1 — Codex CLI
codex login status 2>/dev/null
# If not logged in, fail loudly
codex exec --skip-git-repo-check -s read-only --ephemeral "Review the diff from 'main' to HEAD covering Tasks 1-7d of docs/superpowers/plans/2026-04-09-adopt-multi-type-detection.md. Find P0/P1/P2 issues. Report only." 2>/dev/null

# Channel 2 — Gemini CLI
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1 | head -5
# If auth fails, run: gemini -p "hello" then retry
NO_BROWSER=true gemini -p "Review the diff from 'main' to HEAD covering Tasks 1-7d of docs/superpowers/plans/2026-04-09-adopt-multi-type-detection.md. Find P0/P1/P2 issues. Report only." --output-format json --approval-mode yolo 2>/dev/null

# Channel 3 — Superpowers code-reviewer
# Get base/head SHAs
BASE_SHA=$(gh pr view --json baseRefOid -q .baseRefOid 2>/dev/null || git merge-base origin/main HEAD)
HEAD_SHA=$(git rev-parse HEAD)
# Dispatch superpowers:code-reviewer subagent with these SHAs and PR description
```

**Rules per CLAUDE.md:**
- All 3 channels MANDATORY
- Auth failures surface to user with recovery commands
- Each channel reviews independently
- Fix all P0/P1/P2 findings before proceeding
- After 3 fix rounds with unresolved findings, stop and ask the user

- [ ] **Step 5: Create PR 1**

```bash
git push -u origin feature/adopt-multi-type-detection-pr1
gh pr create --title "v3.10 Detection Foundation: 9 detectors + SignalContext" --body "$(cat <<'EOF'
## Summary

Implements Tasks 1-7d of docs/superpowers/plans/2026-04-09-adopt-multi-type-detection.md.

PR 1 of 2 — covers detection foundation:
- 9 per-type detector modules (web-app, backend, cli, library, mobile-app, data-pipeline, ml, browser-extension, game)
- SignalContext interface + FsSignalContext + createFakeSignalContext
- DetectionMatch discriminated union + assertNever + evidence helper
- Game detection rewritten to use SignalContext (precedence preserved by regression test added in Task 3)
- New deps: yaml ^2.8.3, smol-toml ^1.6.1
- Refactor: init-flag-families.ts extracted from init.ts (behavior-preserving)

PR 2 follows with disambiguation, merge pipeline, CLI handler, gameConfig deprecation, docs, and E2E tests.

## Test plan

- [x] All existing tests pass
- [x] ~150 new test cases for detectors + context
- [x] Game precedence regression test passes
- [x] Cross-platform: macOS, Linux, Windows CI

## Spec reference

docs/superpowers/specs/2026-04-08-adopt-multi-type-detection-design.md (1867 lines, 13 review rounds)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Wait for PR 1 CI + squash-merge**

```bash
gh pr checks --watch
# After green:
gh pr merge --squash --delete-branch
```

- [ ] **Step 7: Rebase + create PR 2 (Tasks 8-13)**

```bash
git checkout main
git pull
git checkout -b feature/adopt-multi-type-detection-pr2
# Re-run 3-channel MMR for PR 2 specifically
# Then push and create PR
git push -u origin feature/adopt-multi-type-detection-pr2
gh pr create --title "v3.10 Orchestration + Wiring: disambiguation + handler + docs" --body "PR 2 of 2 — implements Tasks 8-13 covering disambiguation flow, merge pipeline, gameConfig deprecation alias, CLI handler with 32 init flags, atomic writes, dry-run, docs, and E2E tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Wait for PR 2 CI + squash-merge**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

- [ ] **Step 9: Tag v3.10.0 and follow release runbook**

```bash
git checkout main
git pull
git tag v3.10.0
git push origin v3.10.0
# Follow docs/architecture/operations-runbook.md for the GitHub release + npm/Homebrew publish
```

---

## Post-implementation checklist

- [ ] Run full test suite: `npm test` → all passing
- [ ] Run type check: `npm run type-check` → clean
- [ ] Run lint: `npm run lint` → clean
- [ ] Run coverage: `npm run test:coverage` → no regression from baseline
- [ ] Verify spec requirements: skim spec Section 1-6 and confirm each delta landed
- [ ] Run `bash scripts/verify-gameconfig-migration.sh` → exits 0
- [ ] Manual smoke test: `cd /tmp && mkdir demo && cd demo && scaffold adopt --auto` against a real project
- [ ] Run 3-channel multi-model review per CLAUDE.md (Codex CLI + Gemini CLI + Superpowers code-reviewer) on the PR(s)
- [ ] Fix all P0/P1/P2 findings from the review
- [ ] Create PR(s): `gh pr create`
- [ ] Wait for CI, squash-merge when green
- [ ] Follow `docs/architecture/operations-runbook.md` for the v3.10.0 release

---

## Self-review notes (Round 2 rewrite — 2026-04-10)

**Spec coverage check:**
- ✅ Section 1 (architecture): Tasks 4b (SignalContext), 5-7d (detectors), 8 (disambiguate)
- ✅ Section 2 (data model): Task 4b fully implements SignalContext + FsSignalContext + DetectionMatch + helpers
- ✅ Section 3 (disambiguation + re-adoption + merge pipeline): Tasks 8, 9, 11
- ✅ Section 4 (AdoptionResult + CLI handler): Tasks 10 (alias), 11 (handler with re-adoption merge wiring)
- ✅ Section 5 (per-detector rules): Tasks 5, 6a, 6b, 6c, 6d, 7a, 7b, 7c, 7d (one task per detector)
- ✅ Section 6 (release + docs): Tasks 1 (deps+enum), 12 (docs), 13 (E2E+forward-compat), 14 (release prep)

**Warning code coverage (all 23 from spec Appendix A):**
- Task 4b context: ADOPT_MANIFEST_UNPARSEABLE, ADOPT_FS_INACCESSIBLE, ADOPT_FILE_TRUNCATED, ADOPT_FILE_UNREADABLE
- Task 6d library: ADOPT_PUBLIC_LIBRARY_NO_README
- Task 7d browser-extension: ADOPT_MINIMAL_EXTENSION
- Task 8 resolveDetection: ADOPT_NON_TTY, ADOPT_AMBIGUOUS, ADOPT_LOW_ONLY, ADOPT_USER_CANCELLED, ADOPT_SECONDARY_MATCHES
- Task 9 mergeRawConfig: ADOPT_FIELD_CONFLICT (via emitFieldConflictWarnings)
- Task 11 handler: ADOPT_GAME_CONFIG_DEPRECATED, ADOPT_TYPE_CHANGED, ADOPT_DETECTION_INCONCLUSIVE, ADOPT_TYPE_CONFLICT, ADOPT_MISSING_REQUIRED_FIELDS, ADOPT_CONFIG_WRITE_FAILED, ADOPT_STATE_WRITE_FAILED, ADOPT_INTERNAL
- Reused (Task 11 errors via configParseError/configNotObject/lockHeld factories): CONFIG_PARSE_ERROR, CONFIG_NOT_OBJECT, LOCK_HELD

**Type consistency check:** all references to `DetectionMatch`, `SignalContext`, `evidence()`, `assertNever`, `mergeRawConfig`, `emitFieldConflictWarnings`, `applyFlagOverrides`, `asScaffoldError`, `ExitCode.Ambiguous`, `createFakeSignalContext`, `TYPE_KEY`, `finalizeConfigFromMatch` are consistent across tasks.

**Placeholder scan:** no TBD/TODO/"fill in later" markers. All detector implementations are inlined as TypeScript. Commit commands are exact. Test expected outputs are specific. The "per Section 5.X" references in the original Round 1 plan are eliminated.

**Commit ordering:** 21 commit operations across 14 numeric task numbers (Tasks 4 splits into 4a + 4b; Tasks 6 and 7 split into 6a-6d and 7a-7d). PR 1 = Tasks 1, 2, 3, 4a, 4b, 5, 6a, 6b, 6c, 6d, 7a, 7b, 7c, 7d. PR 2 = Tasks 8, 9, 10, 11, 12, 13, 14. Each commit is independently buildable: Task 4b's empty `ALL_DETECTORS` preserves existing inline game detection until Task 5 relocates it.

**Round 2 fixes applied (5 P0 + 14 P1 + 7 P2 from 3-channel review):**
- P0-1 (vi.mock): Documented as false positive in header note
- P0-2 (typeKey): Replaced string transform with TYPE_KEY constant in Task 11
- P0-3 (ADOPT_FIELD_CONFLICT not emitted): Wired via emitFieldConflictWarnings helper in Task 9, called by Task 11
- P0-4 (require() in ESM): Added listDir() to SignalContext interface, game.ts now uses ctx.listDir()
- P0-5 (forward-compat schema): Added precondition test asserting v3.9.2 ProjectSchema is .passthrough()
- P0-6 (re-adoption merge not wired): finalizeConfigFromMatch in Task 11 now reads existing raw YAML, merges, and integrates conflicts
- P1: 5 missing warning codes wired (TYPE_CHANGED, DETECTION_INCONCLUSIVE, STATE_WRITE_FAILED, CONFIG_WRITE_FAILED, INTERNAL)
- P1: TDD ordering enforced (failing test before implementation in every task)
- P1: Tasks 6/7 split into 6a-6d + 7a-7d with full inlined code
- P1: Task 14 added for version bump + final acceptance + 3-channel MMR + PR creation
- P1: Forward-compat test now uses verification step + precondition assertion
- P1: Snapshot updates moved to inline diff inspection (no blanket -u)
- P1: Case A-G fixes — runners-up visible to disambiguate, user-cancelled exits 4
- P1: ADOPT_MISSING_REQUIRED_FIELDS wired with flag hints in Task 11
- P1: Game detector expanded with Love2D + JS engines per spec
- P1: createFakeSignalContext fully matches real context (manifestStatuses, PEP 503 normalization)
- P1: Task 10/11 dual-emit overlap resolved (Task 10 trimmed to alias-only)
- P1: Case F bypass fixed (always routes through disambiguate)
- P1: disambiguate test TTY/CI state cleanup added in test patterns
- P1: Task 11 handler shows explicit init-flag-families imports
- P2: Task 12 explicit "do not create" notes for rejected files
- P2: Plan size addressed by separating PR boundaries clearly
- P2: Tasks 6/7 detector ordering documented as final in Task 7d
- P2: Task 7c ml partial declaration shown explicitly
- P2: Task 3 will be cross-referenced with Task 10 dual-emit assertion
- P2: Task 13 tsconfig.json verification added
- P2: verify-gameconfig-migration.sh expected delta documented

---

Plan rewrite complete. **5 P0 + 14 P1 + 7 P2 issues addressed.** Total: 21 commit operations across 14 numeric task numbers, ready for subagent-driven-development execution.
