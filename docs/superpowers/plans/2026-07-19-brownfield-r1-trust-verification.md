# Brownfield R1 — Trust & Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scaffold adopt` honest — propose-then-apply with a drift-proof plan key, completion claims verified against live checks, a `scaffold doctor` that executes checks, and a `brownfield` preset replacing the hardcoded `deep`.

**Architecture:** The unused verifier `src/state/completion.ts` becomes the single verification path (all-outputs + a new machine-readable `detect:` frontmatter contract). A new plan pipeline (`src/project/adoption-plan*.ts`) renders dispositions and a canonical-JSON `plan_key`; `--apply` (`src/project/adoption-apply.ts`) executes only what the approved key covers, appending audit records to `.scaffold/decisions.jsonl`. A new `src/doctor/` check registry backs `scaffold doctor`. The state schema migrates `artifacts_verified` (boolean) to a `verification` enum with a schema-version bump.

**Tech Stack:** TypeScript (ESM, no semicolons, `.js` import suffixes), yargs CLI, zod, vitest (colocated `*.test.ts`), bats + bash for `make validate`, YAML presets in `content/methodology/`.

## Global Constraints

- Verification enum values are exactly `verified | declared | unverified`; absent ≡ `unverified`; `verified` is set only by a real D3 check (all outputs on disk AND `detect:` passes); `markCompleted` sets at most `declared`.
- `plan_key` = sha256 hex over the canonical JSON (recursively sorted object keys, sorted step-slug array) of the complete apply-action records: initialize record, sorted includes, per-step `{step_slug, disposition, apply_action, audit_event, detect_checks, outputs_present, outputs_missing}`, sorted disabled-by-preset slugs; `generated_at`, `project_root`, and prose/markdown formatting never affect the key.
- decisions.jsonl audit record schema is exactly `{ts, actor, event: "verification-reversal" | "partial-artifacts", step_slug, from_status, from_verification, to_status, to_verification, evidence, reason, plan_key}` — append-only, pure audit, no runtime readers; the decisions reader skips any line carrying an `event` field.
- `detect:` `cmd` entries execute only fixed strings shipped in the package's pipeline files (never read from project-local files), with cwd = project root, no shell interpolation of project data, per-cmd timeout default 10s, and every failure (non-zero exit, ENOENT, timeout) = not-detected, never fatal.
- A bare `--apply` (no `--plan` / `--plan-key`) is interactive-only: it renders fresh and requires typed confirmation; in non-interactive/auto/json mode it is an error — automation must pass the key it approved; `--apply` with a key re-renders against live reality before any write and aborts on key mismatch.
- `conflict` overrides `completed` everywhere completion is consumed: a completed step with missing outputs is demoted to pending for eligibility (`next`, `status`) via an fs-only check, and apply reopens it to `pending`/`unverified` with an audit record.
- `scaffold doctor` exit codes: 0 healthy, 1 warnings, 2 errors; not-installed subsystems report `skip` ("not configured") and never affect the exit code; R1 `--fix` ships only the `bd doctor --fix` delegation — every other failure reports its remediation read-only.
- `content/methodology/brownfield.yml` is enablement-only (same step-overrides format as `deep.yml`/`mvp.yml`; no content semantics): foundation/environment/quality-first; doc-chain middle (modeling→specification), parity, and validation audits disabled by default, opt-in via `--include <step>`.
- Schema-version: the accepted set widens to `{1, 2, 3, 4}`; 4 = single-service verification-era state (successor of 1); multi-service files (2 = pre-shard, 3 = sharded) keep their version and receive only the field-level migration — the 2→3 sharding state machine is untouched; a v4 file that later gains services re-enters it via a 4→2 dispatch bump.
- R1 renderer scope: dispositions rendered are `done (verified)`, `conflict`, `run`, `undetectable`, plus the "disabled by preset (opt-in)" section; `map-candidate` (R3), mode annotations on `run` rows (R3), and the ops-actions preview (R2) are NOT rendered; `skip-proposed` exists in the type union but no R1 rule emits it.

---

### Task 1: `verification` enum, schema-version 4, and the legacy-field migration

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/types/state.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/state/state-migration.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/state/state-version-dispatch.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/state/state-manager.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/validation/state-validator.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/state/state-migration.test.ts`, `/Users/kenallred/Developer/scaffold/src/state/state-version-dispatch.test.ts`, `/Users/kenallred/Developer/scaffold/src/state/state-manager.test.ts`

**Interfaces:**
- Produces: `type VerificationLevel = 'verified' | 'declared' | 'unverified'` (exported from `src/types/state.ts`); `StepStateEntry.verification?: VerificationLevel` (replaces `artifacts_verified?: boolean`); `PipelineState['schema-version']: 1 | 2 | 3 | 4`.
- Consumes: existing `migrateState(state): boolean`, `dispatchStateMigration(raw, ctx, file)`.

**Steps:**

- [ ] Write the failing migration tests. Append to `src/state/state-migration.test.ts` (imports at top of the new `describe`; reuse the file's existing `PipelineState` import):

```ts
describe('verification migration (R1)', () => {
  function vState(steps: Record<string, unknown>, schemaVersion = 1): PipelineState {
    return {
      'schema-version': schemaVersion,
      'scaffold-version': '3.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-01-01T00:00:00.000Z',
      in_progress: null,
      steps,
      next_eligible: [],
      'extra-steps': [],
    } as unknown as PipelineState
  }

  it('migrates artifacts_verified: true to verification: declared — never verified', () => {
    const state = vState({
      beads: { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'], artifacts_verified: true },
    })
    expect(migrateState(state)).toBe(true)
    expect(state.steps['beads'].verification).toBe('declared')
    expect('artifacts_verified' in state.steps['beads']).toBe(false)
  })

  it('migrates artifacts_verified: false to verification: unverified', () => {
    const state = vState({
      tdd: { status: 'completed', source: 'pipeline', produces: [], artifacts_verified: false },
    })
    expect(migrateState(state)).toBe(true)
    expect(state.steps['tdd'].verification).toBe('unverified')
  })

  it('bumps schema-version 1 to 4 (single-service verification era)', () => {
    const state = vState({})
    expect(migrateState(state)).toBe(true)
    expect(state['schema-version']).toBe(4)
  })

  it('leaves sharded v3 state at version 3 while migrating fields', () => {
    const state = vState({
      beads: { status: 'completed', source: 'pipeline', produces: [], artifacts_verified: true },
    }, 3)
    expect(migrateState(state)).toBe(true)
    expect(state['schema-version']).toBe(3)
    expect(state.steps['beads'].verification).toBe('declared')
  })

  it('is idempotent on already-migrated state', () => {
    const state = vState({
      beads: { status: 'completed', source: 'pipeline', produces: [], verification: 'declared' },
    }, 4)
    expect(migrateState(state)).toBe(false)
  })
})
```

- [ ] Run `npx vitest run src/state/state-migration.test.ts` — expect the five new tests to FAIL (`verification` undefined, schema-version stays 1).
- [ ] Implement the type change in `src/types/state.ts`. Replace the `artifacts_verified?: boolean` line and widen the version union:

```ts
/** Verification level for a step's completion claim (D3). Absent ≡ 'unverified'. */
export type VerificationLevel = 'verified' | 'declared' | 'unverified'
```

In `StepStateEntry`, replace `artifacts_verified?: boolean` with:

```ts
  verification?: VerificationLevel
```

In `PipelineState`, change `'schema-version': 1 | 2 | 3` to `'schema-version': 1 | 2 | 3 | 4`.

- [ ] Implement the migration in `src/state/state-migration.ts`. Add `StepStateEntry` to the type import (`import type { PipelineState, StepStateEntry } from '../types/index.js'`) and insert before `return changed` in `migrateState`:

```ts
  // Phase 4 (R1): artifacts_verified → verification enum (one-way, D3).
  // true → 'declared' (the old flag only recorded "declares outputs" — it was
  // never a disk check, so it must not migrate to 'verified').
  // false → 'unverified'. Absent stays absent (readers treat absent ≡ 'unverified').
  for (const step of Object.values(state.steps)) {
    const legacy = step as StepStateEntry & { artifacts_verified?: boolean }
    if (legacy.artifacts_verified === undefined) continue
    if (step.verification === undefined) {
      step.verification = legacy.artifacts_verified ? 'declared' : 'unverified'
    }
    delete legacy.artifacts_verified
    changed = true
  }

  // Phase 5 (R1): single-service files enter the verification era (schema v4).
  // Multi-service versions 2 (pre-shard) and 3 (sharded) keep their version —
  // they encode the sharding state machine, which R1 must not disturb.
  if (state['schema-version'] === 1) {
    state['schema-version'] = 4
    changed = true
  }
```

- [ ] Widen `src/state/state-version-dispatch.ts` to accept 4 and route v4-plus-services back into the sharding machine:

```ts
): asserts raw is Record<string, unknown> & { 'schema-version': 1 | 2 | 3 | 4 } {
  if (!isPlainObject(raw) || typeof raw['schema-version'] !== 'number') {
    throw stateSchemaVersion([1, 2, 3, 4], Number(raw && (raw as Record<string, unknown>)['schema-version']), file)
  }
  const version = raw['schema-version']
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw stateSchemaVersion([1, 2, 3, 4], version, file)
  }
  if ((version === 1 || version === 4) && ctx.hasServices) {
    raw['schema-version'] = 2
  }
}
```

- [ ] Add a dispatch test to `src/state/state-version-dispatch.test.ts`:

```ts
  it('accepts schema-version 4 and bumps 4 → 2 when config has services', () => {
    const raw: Record<string, unknown> = { 'schema-version': 4 }
    dispatchStateMigration(raw, { hasServices: true }, '/tmp/state.json')
    expect(raw['schema-version']).toBe(2)
    const raw2: Record<string, unknown> = { 'schema-version': 4 }
    dispatchStateMigration(raw2, { hasServices: false }, '/tmp/state.json')
    expect(raw2['schema-version']).toBe(4)
  })
```

- [ ] Update `src/state/state-manager.ts`: in `markCompleted`, replace

```ts
    if (outputs.length > 0) {
      state.steps[step].artifacts_verified = true
    }
```

with

```ts
    state.steps[step].verification = outputs.length > 0 ? 'declared' : 'unverified'
```

In `initializeState`, replace the `schemaVersion` computation with:

```ts
    const schemaVersion: 2 | 4 =
      (options.config?.project?.services?.length ?? 0) > 0 ? 2 : 4
```

and change the local `const state: PipelineState` literal's `'schema-version': schemaVersion` (unchanged line — it now carries 2|4).

- [ ] Update `src/validation/state-validator.ts` (~line 77) to accept 4:

```ts
  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4) {
    errors.push(stateSchemaVersion([1, 2, 3, 4], schemaVersion as number, resolvedStatePath))
    return { errors, warnings }
  }
```

- [ ] Add a `markCompleted` verification test to `src/state/state-manager.test.ts`:

```ts
  it('markCompleted records verification: declared when outputs are declared', async () => {
    // reuse the file's existing tmp-project setup pattern for constructing a
    // StateManager with an initialized state containing step 'tech-stack'
    await manager.markCompleted('tech-stack', ['docs/tech-stack.md'], 'agent', 3)
    const state = manager.loadState()
    expect(state.steps['tech-stack'].verification).toBe('declared')
    expect('artifacts_verified' in state.steps['tech-stack']).toBe(false)
  })
```

(Adapt the setup lines to the file's existing `beforeEach` fixture — the file already constructs managers against a tmp dir; mirror the nearest existing `markCompleted` test.)

- [ ] Run `npx vitest run src/state/` — all state tests green. Then run `npx vitest run src` and fix any test that asserted `artifacts_verified` or `'schema-version': 1` after a save (mechanical: `grep -rn "artifacts_verified" src --include="*.test.ts"` and update each to the `verification` field; states passed through `loadState`+`saveState` now end at version 4).
- [ ] Commit: `git add -A && git commit -m "feat(state): verification enum + schema-version 4 migration (R1 D3)"`

---

### Task 2: `detect:` frontmatter contract — types, zod schema, coercion

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/types/frontmatter.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/project/frontmatter.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/project/frontmatter.test.ts`

**Interfaces:**
- Produces: `interface DetectCheck { path?: string; cmd?: string; timeout?: number }` and `interface DetectSpec { all?: DetectCheck[]; any?: DetectCheck[] }` (exported from `src/types/frontmatter.ts`); `MetaPromptFrontmatter.detect?: DetectSpec | null`.
- Consumes: existing `parseAndValidate(filePath)`, `KNOWN_YAML_KEYS`, `normalizeRawObject`, `frontmatterSchema`.

**Steps:**

- [ ] Write failing tests in `src/project/frontmatter.test.ts` (follow the file's existing tmp-file fixture pattern; if it writes fixtures with `fs.writeFileSync` to a tmp dir, reuse that helper):

```ts
describe('detect: frontmatter contract (D4)', () => {
  function writeFixture(name: string, frontmatter: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-fm-'))
    const file = path.join(dir, `${name}.md`)
    fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n## Purpose\nbody\n`)
    return file
  }

  it('parses a detect block with all: path and cmd checks', () => {
    const file = writeFixture('beads', [
      'name: beads',
      'description: d',
      'phase: "foundation"',
      'order: 210',
      'outputs: [.beads/]',
      'detect:',
      '  all:',
      '    - path: .beads/',
      '    - cmd: bd info',
      '      timeout: 5',
    ].join('\n'))
    const { frontmatter, errors } = parseAndValidate(file)
    expect(errors).toEqual([])
    expect(frontmatter.detect).toEqual({
      all: [{ path: '.beads/' }, { cmd: 'bd info', timeout: 5 }],
    })
  })

  it('rejects a detect check with both path and cmd', () => {
    const file = writeFixture('bad-both', [
      'name: bad-both',
      'description: d',
      'phase: "foundation"',
      'order: 211',
      'outputs: [x.md]',
      'detect:',
      '  all:',
      '    - path: .beads/',
      '      cmd: bd info',
    ].join('\n'))
    const { errors } = parseAndValidate(file)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a detect block with neither all nor any', () => {
    const file = writeFixture('bad-empty', [
      'name: bad-empty',
      'description: d',
      'phase: "foundation"',
      'order: 212',
      'outputs: [x.md]',
      'detect: {}',
    ].join('\n'))
    const { errors } = parseAndValidate(file)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('does not warn detect as an unknown field, and defaults to null when absent', () => {
    const file = writeFixture('no-detect', [
      'name: no-detect',
      'description: d',
      'phase: "foundation"',
      'order: 213',
      'outputs: [x.md]',
    ].join('\n'))
    const { frontmatter, warnings } = parseAndValidate(file)
    expect(frontmatter.detect).toBeNull()
    expect(warnings.filter((w) => w.message.includes('detect'))).toEqual([])
  })
})
```

- [ ] Run `npx vitest run src/project/frontmatter.test.ts` — new tests FAIL (`detect` arrives as unknown field, no schema).
- [ ] Add the types to `src/types/frontmatter.ts` (above `MetaPromptFrontmatter`):

```ts
/**
 * Machine-readable detection contract (D4) mirroring a step's Mode Detection
 * prose. `cmd` strings are fixed values shipped in the package's pipeline
 * files only — never read from project-local files (trust boundary).
 */
export interface DetectCheck {
  /** Filesystem existence check (file or directory), relative to project root. */
  path?: string
  /** Command that must exit 0 within the timeout. Executed with cwd = project root. */
  cmd?: string
  /** Per-cmd timeout in seconds. Default 10. */
  timeout?: number
}

export interface DetectSpec {
  /** Every entry must pass. */
  all?: DetectCheck[]
  /** At least one entry must pass. */
  any?: DetectCheck[]
}
```

and add to `MetaPromptFrontmatter` (before the index signature):

```ts
  /** Machine-readable detection contract (D4). Null when the step declares none. */
  detect?: DetectSpec | null
```

- [ ] Implement parsing in `src/project/frontmatter.ts`:
  1. Add `'detect'` to `KNOWN_YAML_KEYS`.
  2. Add the zod schemas above `frontmatterSchema`:

```ts
const detectCheckSchema = z.object({
  path: z.string().min(1).optional(),
  cmd: z.string().min(1).optional(),
  timeout: z.number().int().positive().max(120).optional(),
}).strict().refine(
  (c) => (c.path !== undefined) !== (c.cmd !== undefined),
  { message: 'detect check must have exactly one of path or cmd' },
)

const detectSpecSchema = z.object({
  all: z.array(detectCheckSchema).min(1).optional(),
  any: z.array(detectCheckSchema).min(1).optional(),
}).strict().refine(
  (d) => d.all !== undefined || d.any !== undefined,
  { message: 'detect must declare at least one of all/any' },
)
```

  3. Add to the `frontmatterSchema` object (after `category`):

```ts
  detect: detectSpecSchema.nullable().default(null),
```

  4. In `normalizeRawObject`, coerce FAILSAFE string scalars inside detect (before the return):

```ts
  // FAILSAFE_SCHEMA returns detect timeout values as strings — coerce to numbers
  const detectRaw = normalized['detect']
  if (typeof detectRaw === 'object' && detectRaw !== null && !Array.isArray(detectRaw)) {
    for (const listKey of ['all', 'any']) {
      const list = (detectRaw as Record<string, unknown>)[listKey]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        if (typeof entry !== 'object' || entry === null) continue
        const e = entry as Record<string, unknown>
        if (typeof e['timeout'] === 'string') {
          const n = Number(e['timeout'])
          if (!isNaN(n)) e['timeout'] = n
        }
      }
    }
  }
```

  5. In `parseAndValidate`'s `emptyFrontmatter` literal, add `detect: null,`.

- [ ] Run `npx vitest run src/project/frontmatter.test.ts` — green. Run `npx vitest run src/project src/core` to confirm no loader regressions.
- [ ] Commit: `git add -A && git commit -m "feat(frontmatter): detect: contract schema — path/cmd checks, all/any composition (R1 D4)"`

---

### Task 3: `runDetect` executor in completion.ts

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/state/completion.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/state/completion.test.ts`

**Interfaces:**
- Produces (exported from `src/state/completion.ts`):

```ts
interface DetectCheckResult { kind: 'path' | 'cmd'; target: string; passed: boolean }
interface DetectResult { evaluated: boolean; passed: boolean; checks: DetectCheckResult[] }
function runDetect(detect: DetectSpec | null | undefined, projectRoot: string): DetectResult
```

- Consumes: `DetectSpec`, `DetectCheck` from `src/types/frontmatter.ts` (Task 2); `resolveContainedArtifactPath` (already imported in the file).

**Steps:**

- [ ] Write failing tests in `src/state/completion.test.ts`:

```ts
describe('runDetect (D4)', () => {
  let root: string
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-run-')) })

  it('returns evaluated=false, passed=true when there is no detect block', () => {
    expect(runDetect(null, root)).toEqual({ evaluated: false, passed: true, checks: [] })
    expect(runDetect(undefined, root)).toEqual({ evaluated: false, passed: true, checks: [] })
  })

  it('passes an all-block when every path and cmd check passes', () => {
    fs.mkdirSync(path.join(root, '.beads'))
    const result = runDetect({ all: [{ path: '.beads/' }, { cmd: 'exit 0' }] }, root)
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(2)
  })

  it('fails an all-block when a cmd exits non-zero — failure is not fatal', () => {
    const result = runDetect({ all: [{ cmd: 'exit 3' }] }, root)
    expect(result.evaluated).toBe(true)
    expect(result.passed).toBe(false)
    expect(result.checks[0]).toEqual({ kind: 'cmd', target: 'exit 3', passed: false })
  })

  it('passes an any-block when at least one check passes', () => {
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), '')
    const result = runDetect(
      { any: [{ path: 'playwright.config.ts' }, { path: 'maestro/' }] }, root,
    )
    expect(result.passed).toBe(true)
  })

  it('treats a timed-out cmd as not-detected', () => {
    const result = runDetect({ all: [{ cmd: 'sleep 30', timeout: 1 }] }, root)
    expect(result.passed).toBe(false)
  })

  it('treats a missing binary as not-detected', () => {
    const result = runDetect({ all: [{ cmd: 'definitely-not-a-real-binary-xyz' }] }, root)
    expect(result.passed).toBe(false)
  })
})
```

Add `import os from 'node:os'`, `import fs from 'node:fs'`, `import path from 'node:path'` to the test file if absent, plus `runDetect` to the import from `./completion.js`.

- [ ] Run `npx vitest run src/state/completion.test.ts` — FAIL (`runDetect` is not exported).
- [ ] Implement in `src/state/completion.ts`. Add imports:

```ts
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { DetectSpec, DetectCheck } from '../types/frontmatter.js'
```

and the implementation:

```ts
export interface DetectCheckResult {
  kind: 'path' | 'cmd'
  target: string
  passed: boolean
}

export interface DetectResult {
  /** False when the step declares no detect block (vacuously passed). */
  evaluated: boolean
  passed: boolean
  checks: DetectCheckResult[]
}

const DEFAULT_DETECT_TIMEOUT_S = 10

function runDetectCheck(check: DetectCheck, projectRoot: string): DetectCheckResult {
  if (check.path !== undefined) {
    const full = resolveContainedArtifactPath(projectRoot, check.path)
    return { kind: 'path', target: check.path, passed: full !== null && fs.existsSync(full) }
  }
  const cmd = check.cmd ?? ''
  try {
    // Trust boundary (D4): cmd is a fixed string from the shipped pipeline
    // files — never project data. shell:true is required for compound
    // commands; cwd is the project root; all failures = not-detected.
    const res = spawnSync(cmd, {
      shell: true,
      cwd: projectRoot,
      timeout: (check.timeout ?? DEFAULT_DETECT_TIMEOUT_S) * 1000,
      stdio: 'ignore',
    })
    return { kind: 'cmd', target: cmd, passed: res.status === 0 && res.error === undefined }
  } catch {
    return { kind: 'cmd', target: cmd, passed: false }
  }
}

/** Execute a step's detect: contract (D4). Failures are never fatal. */
export function runDetect(
  detect: DetectSpec | null | undefined,
  projectRoot: string,
): DetectResult {
  if (!detect) return { evaluated: false, passed: true, checks: [] }
  const checks: DetectCheckResult[] = []
  let passed = true
  for (const check of detect.all ?? []) {
    const result = runDetectCheck(check, projectRoot)
    checks.push(result)
    if (!result.passed) passed = false
  }
  if (detect.any !== undefined) {
    const anyResults = detect.any.map((c) => runDetectCheck(c, projectRoot))
    checks.push(...anyResults)
    if (!anyResults.some((r) => r.passed)) passed = false
  }
  return { evaluated: true, passed, checks }
}
```

- [ ] Run `npx vitest run src/state/completion.test.ts` — green (the timeout test takes ~1s by design).
- [ ] Commit: `git add -A && git commit -m "feat(completion): runDetect executor — bounded cmd/path checks, failure=not-detected (R1 D4)"`

---

### Task 4: `verifyStep`, fs-only conflict override, and the audit-record writer/reader

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/state/completion.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/types/decision.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/state/decision-logger.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/state/completion.test.ts`, `/Users/kenallred/Developer/scaffold/src/state/decision-logger.test.ts`

**Interfaces:**
- Produces (exported from `src/state/completion.ts`):

```ts
type ConflictClass = 'state-claim' | 'artifact-only'
interface StepVerification {
  step: string
  verification: VerificationLevel
  status: 'confirmed_complete' | 'likely_complete' | 'conflict' | 'incomplete'
  conflictClass: ConflictClass | null
  undetectable: boolean
  outputsPresent: string[]
  outputsMissing: string[]
  detect: DetectResult
}
function verifyStep(step: string, entry: StepStateEntry | undefined, expectedOutputs: string[], detect: DetectSpec | null | undefined, projectRoot: string): StepVerification
function applyConflictOverrides(steps: Record<string, StepStateEntry>, projectRoot: string): { steps: Record<string, StepStateEntry>; conflicts: string[] }
```

- Produces (exported from `src/types/decision.ts`): `VerificationAuditRecord` — the pinned D3 audit schema.
- Produces (exported from `src/state/decision-logger.ts`): `appendAuditRecord(projectRoot, record, pathResolver?)`; `readDecisions` learns to skip audit lines.
- Consumes: `VerificationLevel`, `StepStateEntry` (Task 1), `DetectSpec` (Task 2), `runDetect`, `DetectResult`, `DetectCheckResult` (Task 3).

**Steps:**

- [ ] Write failing tests in `src/state/completion.test.ts`. Add `verifyStep`, `applyConflictOverrides` to the import from `./completion.js` and add `import type { StepStateEntry } from '../types/index.js'`:

```ts
describe('verifyStep (D3)', () => {
  it('reports verified when all outputs exist and detect passes', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/tech-stack.md'), 'x', 'utf8')
    const entry = { status: 'completed', source: 'pipeline', produces: ['docs/tech-stack.md'], verification: 'declared' } as StepStateEntry
    const v = verifyStep('tech-stack', entry, ['docs/tech-stack.md'], { all: [{ cmd: 'exit 0' }] }, dir)
    expect(v.status).toBe('confirmed_complete')
    expect(v.verification).toBe('verified')
    expect(v.conflictClass).toBeNull()
  })

  it('reports a state-claim conflict when state says completed but outputs are missing', () => {
    const dir = makeTempDir()
    const entry = { status: 'completed', source: 'pipeline', produces: ['docs/x.md'], verification: 'declared' } as StepStateEntry
    const v = verifyStep('tdd', entry, ['docs/x.md'], null, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('state-claim')
    expect(v.outputsMissing).toEqual(['docs/x.md'])
  })

  it('reports a state-claim conflict when outputs exist but detect fails', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const entry = { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'] } as StepStateEntry
    const v = verifyStep('beads', entry, ['CLAUDE.md'], { all: [{ cmd: 'exit 1' }] }, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('state-claim')
  })

  it('reports an artifact-only conflict for partial artifacts with no completion claim (the beads case)', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const v = verifyStep('beads', undefined, ['.beads/', 'CLAUDE.md'], { all: [{ cmd: 'exit 1' }] }, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('artifact-only')
    expect(v.outputsPresent).toEqual(['CLAUDE.md'])
  })

  it('never reports verified for an undetectable step (no outputs, no detect)', () => {
    const dir = makeTempDir()
    const entry = { status: 'completed', source: 'pipeline', produces: [], verification: 'verified' } as StepStateEntry
    const v = verifyStep('review-vision', entry, [], null, dir)
    expect(v.undetectable).toBe(true)
    expect(v.verification).toBe('declared')
    expect(v.status).toBe('confirmed_complete')
  })

  it('reports incomplete when nothing exists and there is no claim', () => {
    const dir = makeTempDir()
    const v = verifyStep('tech-stack', undefined, ['docs/tech-stack.md'], null, dir)
    expect(v.status).toBe('incomplete')
    expect(v.conflictClass).toBeNull()
    expect(v.verification).toBe('unverified')
  })
})

describe('applyConflictOverrides (D3 — fs-only eligibility demotion)', () => {
  it('demotes a completed step with missing outputs to pending without mutating the input', () => {
    const dir = makeTempDir()
    const steps: Record<string, StepStateEntry> = {
      beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'] },
      tdd: { status: 'completed', source: 'pipeline', produces: [] },
    }
    const result = applyConflictOverrides(steps, dir)
    expect(result.conflicts).toEqual(['beads'])
    expect(result.steps['beads'].status).toBe('pending')
    expect(steps['beads'].status).toBe('completed')
    expect(result.steps['tdd'].status).toBe('completed')
  })

  it('returns the same steps object when nothing conflicts', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const steps: Record<string, StepStateEntry> = {
      beads: { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'] },
    }
    const result = applyConflictOverrides(steps, dir)
    expect(result.conflicts).toEqual([])
    expect(result.steps).toBe(steps)
  })
})
```

- [ ] Run `npx vitest run src/state/completion.test.ts` — the new describes FAIL (not exported).
- [ ] Implement in `src/state/completion.ts`. Widen the type import to `import type { PipelineState, StepStateEntry, VerificationLevel } from '../types/index.js'` and append:

```ts
export type ConflictClass = 'state-claim' | 'artifact-only'

export interface StepVerification {
  step: string
  verification: VerificationLevel
  status: 'confirmed_complete' | 'likely_complete' | 'conflict' | 'incomplete'
  conflictClass: ConflictClass | null
  /** True when the step has no outputs AND no detect block (D3) — never 'verified'. */
  undetectable: boolean
  outputsPresent: string[]
  outputsMissing: string[]
  detect: DetectResult
}

/**
 * The single D3 verification path: a step is 'verified' only when ALL declared
 * outputs exist on disk AND its detect: contract passes. Conflict classes:
 * 'state-claim' (state says completed, checks fail) and 'artifact-only'
 * (no claim, but partial artifacts disagree with live checks — the beads case).
 */
export function verifyStep(
  step: string,
  entry: StepStateEntry | undefined,
  expectedOutputs: string[],
  detect: DetectSpec | null | undefined,
  projectRoot: string,
): StepVerification {
  const outputsPresent: string[] = []
  const outputsMissing: string[] = []
  for (const output of expectedOutputs) {
    const fullPath = resolveContainedArtifactPath(projectRoot, output)
    if (fullPath !== null && fileExists(fullPath)) {
      outputsPresent.push(output)
    } else {
      outputsMissing.push(output)
    }
  }
  const detectResult = runDetect(detect, projectRoot)
  const stateCompleted = entry?.status === 'completed'
  // 'verified' is set only by a real check — a stored 'verified' claim that we
  // cannot re-confirm right now reports as at most 'declared'.
  const priorVerification: VerificationLevel =
    (entry?.verification ?? 'unverified') === 'verified' ? 'declared' : (entry?.verification ?? 'unverified')
  const base = { step, outputsPresent, outputsMissing, detect: detectResult }

  if (expectedOutputs.length === 0 && !detectResult.evaluated) {
    return {
      ...base,
      verification: priorVerification,
      status: stateCompleted ? 'confirmed_complete' : 'incomplete',
      conflictClass: null,
      undetectable: true,
    }
  }
  if (outputsMissing.length === 0 && detectResult.passed) {
    return {
      ...base,
      verification: 'verified',
      status: stateCompleted ? 'confirmed_complete' : 'likely_complete',
      conflictClass: null,
      undetectable: false,
    }
  }
  if (stateCompleted) {
    return { ...base, verification: priorVerification, status: 'conflict', conflictClass: 'state-claim', undetectable: false }
  }
  if (outputsPresent.length > 0) {
    return { ...base, verification: 'unverified', status: 'conflict', conflictClass: 'artifact-only', undetectable: false }
  }
  return { ...base, verification: priorVerification, status: 'incomplete', conflictClass: null, undetectable: false }
}

/**
 * D3: conflict overrides completed for eligibility. FS-only by design — this
 * runs on every `status`/`next`, so detect: cmds are never executed here.
 * Returns a shallow copy with conflicted steps demoted to pending; returns the
 * input object unchanged when nothing conflicts.
 */
export function applyConflictOverrides(
  steps: Record<string, StepStateEntry>,
  projectRoot: string,
): { steps: Record<string, StepStateEntry>; conflicts: string[] } {
  const conflicts: string[] = []
  let overridden: Record<string, StepStateEntry> | null = null
  for (const [slug, entry] of Object.entries(steps)) {
    if (entry.status !== 'completed') continue
    const outputs = entry.produces ?? []
    if (outputs.length === 0) continue
    const anyMissing = outputs.some((output) => {
      const fullPath = resolveContainedArtifactPath(projectRoot, output)
      return fullPath === null || !fileExists(fullPath)
    })
    if (!anyMissing) continue
    conflicts.push(slug)
    if (overridden === null) overridden = { ...steps }
    overridden[slug] = { ...entry, status: 'pending' }
  }
  return { steps: overridden ?? steps, conflicts: conflicts.sort() }
}
```

- [ ] Add the pinned audit-record type to `src/types/decision.ts`. Add imports `import type { StepStatus } from './enums.js'` and `import type { VerificationLevel } from './state.js'`, then append:

```ts
/**
 * D3 verification audit record — appended to .scaffold/decisions.jsonl by
 * `scaffold adopt --apply`. Append-only, pure audit, no runtime readers; the
 * decisions reader skips any line carrying an `event` field. Schema is pinned
 * by the R1 design (Global Constraints).
 */
export interface VerificationAuditRecord {
  ts: string
  actor: string
  event: 'verification-reversal' | 'partial-artifacts'
  step_slug: string
  from_status: StepStatus | null
  from_verification: VerificationLevel | null
  to_status: StepStatus
  to_verification: VerificationLevel
  evidence: {
    outputs_present: string[]
    outputs_missing: string[]
    detect_checks: Array<{ kind: 'path' | 'cmd'; target: string; passed: boolean }>
  }
  reason: string
  plan_key: string
}
```

- [ ] Write failing tests in `src/state/decision-logger.test.ts`. Add `appendAuditRecord` to the existing import from `./decision-logger.js`, add `import type { VerificationAuditRecord } from '../types/index.js'`, and ensure `fs`/`os`/`path` node imports exist (add any that are missing):

```ts
describe('verification audit records (D3)', () => {
  it('appendAuditRecord appends a line that readDecisions skips and id assignment ignores', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'))
    const record: VerificationAuditRecord = {
      ts: '2026-07-19T00:00:00.000Z',
      actor: 'scaffold-adopt',
      event: 'verification-reversal',
      step_slug: 'beads',
      from_status: 'completed',
      from_verification: 'declared',
      to_status: 'pending',
      to_verification: 'unverified',
      evidence: {
        outputs_present: ['CLAUDE.md'],
        outputs_missing: ['.beads/'],
        detect_checks: [{ kind: 'cmd', target: 'bd info', passed: false }],
      },
      reason: 'state claimed completed but verification failed',
      plan_key: 'a'.repeat(64),
    }
    appendAuditRecord(root, record)
    expect(readDecisions(root)).toEqual([])
    const id = appendDecision(root, {
      prompt: 'beads', decision: 'd', at: '2026-07-19T00:00:00.000Z',
      completed_by: 'agent', step_completed: true,
    })
    expect(id).toBe('D-001')
    const lines = fs.readFileSync(path.join(root, '.scaffold', 'decisions.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect((JSON.parse(lines[0]) as { event: string }).event).toBe('verification-reversal')
  })
})
```

- [ ] Run `npx vitest run src/state/decision-logger.test.ts` — FAILS (`appendAuditRecord` not exported).
- [ ] Implement in `src/state/decision-logger.ts`. Add `import type { DecisionEntry, VerificationAuditRecord } from '../types/index.js'` (widening the existing import). In `readAllEntries`, replace the try-body line `entries.push(JSON.parse(line) as DecisionEntry)` with:

```ts
      const parsed = JSON.parse(line) as Record<string, unknown>
      // D3 audit records (verification-reversal / partial-artifacts) share the
      // file but are not decisions — the decisions reader skips any line
      // carrying an `event` field. They also never participate in D-NNN ids.
      if ('event' in parsed) continue
      entries.push(parsed as unknown as DecisionEntry)
```

Then append the writer:

```ts
/**
 * Append a D3 verification audit record to .scaffold/decisions.jsonl.
 * Audit records carry no D-NNN id and are invisible to readDecisions.
 */
export function appendAuditRecord(
  projectRoot: string,
  record: VerificationAuditRecord,
  pathResolver?: StatePathResolver,
): void {
  const scaffoldDir = pathResolver?.scaffoldDir ?? path.join(projectRoot, SCAFFOLD_DIR)
  fs.mkdirSync(scaffoldDir, { recursive: true })
  const filePath = decisionsPath(projectRoot, pathResolver)
  const existing = fileExists(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  atomicWriteFile(filePath, existing + JSON.stringify(record) + '\n')
}
```

- [ ] Run `npx vitest run src/state/` — all green. Note: `src/core/assembly/update-mode.ts:24` needs NO change — it already requires the artifact to exist in addition to the state claim, so a conflicted step never resolves to update mode.
- [ ] Commit: `git add -A && git commit -m "feat(state): verifyStep + fs-only conflict override + pinned audit records (R1 D3)"`

---

### Task 5: conflict overrides completed in the consumers — `scaffold status` and `scaffold next`

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/status.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/next.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/cli/commands/status.test.ts`
- Create: `/Users/kenallred/Developer/scaffold/src/cli/commands/next.conflict.test.ts`

**Interfaces:**
- Consumes: `applyConflictOverrides` (Task 4). No new exports.
- Behavior contract: conflicted steps render status `conflict` (icon `✗`), count as pending in all totals, are actionable in `--compact`, appear in JSON as top-level `conflicts: string[]`, and eligibility is computed live from the demoted steps record (the cached `next_eligible` cannot represent demotions).

**Steps:**

- [ ] Write the failing status tests. Append inside the top-level `describe('status command', …)` block of `src/cli/commands/status.test.ts` (it provides `writtenLines`, `MockStateManager`, `mockDiscoverMetaPrompts`, `mockResolveOutputMode`, `mockStateWith`, `mockOverlayEnabled`, `makeFrontmatter`, `defaultArgv`):

```ts
  describe('conflict overrides completed (D3)', () => {
    it('renders a completed step with missing outputs as conflict and excludes it from completed totals', async () => {
      const fm = new Map([['beads', makeFrontmatter('beads', 'foundation', 210)]])
      mockDiscoverMetaPrompts.mockReturnValue(fm as never)
      mockOverlayEnabled(['beads'])
      mockStateWith(MockStateManager, {
        beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'], verification: 'declared' },
      })
      await statusCommand.handler(defaultArgv())
      const stdout = writtenLines.join('')
      expect(stdout).toContain('[conflict] beads')
      expect(stdout).toContain('Progress: 0% (0/1)')
    })

    it('JSON output lists conflicts and reports the step status as conflict', async () => {
      mockResolveOutputMode.mockReturnValue('json')
      const fm = new Map([['beads', makeFrontmatter('beads', 'foundation', 210)]])
      mockDiscoverMetaPrompts.mockReturnValue(fm as never)
      mockOverlayEnabled(['beads'])
      mockStateWith(MockStateManager, {
        beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'], verification: 'declared' },
      })
      await statusCommand.handler(defaultArgv({ format: 'json' }))
      const envelope = JSON.parse(writtenLines.join('')) as { data?: unknown }
      const parsed = (envelope.data ?? envelope) as {
        conflicts: string[]
        phases: Array<{ steps: Array<{ slug: string; status: string; verification: string }> }>
      }
      expect(parsed.conflicts).toEqual(['beads'])
      expect(parsed.phases[0].steps[0].status).toBe('conflict')
      expect(parsed.phases[0].steps[0].verification).toBe('declared')
    })
  })
```

- [ ] Run `npx vitest run src/cli/commands/status.test.ts` — the two new tests FAIL.
- [ ] Implement in `src/cli/commands/status.ts`:
  1. Add `import { applyConflictOverrides } from '../../state/completion.js'`.
  2. Directly after `const state = stateManager.loadState()` insert:

```ts
    // D3: conflict overrides completed. FS-only check (no detect: cmds here) —
    // a completed step with missing declared outputs is demoted to pending for
    // eligibility and rendered as `conflict` on every surface below.
    const conflictCheck = applyConflictOverrides(state.steps, projectRoot)
    const conflictSlugs = new Set(conflictCheck.conflicts)
    if (conflictSlugs.size > 0) {
      output.warn(
        `${conflictSlugs.size} completed step(s) failed the artifact check and are treated as not completed: `
        + `${conflictCheck.conflicts.join(', ')}. Run \`scaffold adopt\` to review.`,
      )
    }
```

  3. Replace the `const validatedEligible = readEligible(…)` call with:

```ts
    const validatedEligible = conflictSlugs.size > 0
      ? pipeline.computeEligible(conflictCheck.steps, scopeOptionsForRead)
      : readEligible(
        state,
        pipeline,
        scopeOptionsForRead,
        service ? () => readRootSaveCounter(projectRoot) : undefined,
      )
```

  4. Replace the `statusOf` definition with:

```ts
    const statusOf = (slug: string): string =>
      conflictSlugs.has(slug) ? 'conflict' : steps[slug]?.status ?? 'pending'
```

  5. Change `const actionableStatuses = new Set(['pending', 'in_progress'])` to `new Set(['pending', 'in_progress', 'conflict'])`.
  6. In `statusIcons`, add `conflict: '✗',`.
  7. In the `phasesData` step mapper, replace `status: entry?.status ?? 'pending',` with `status: statusOf(m.frontmatter.name),` and add `verification: entry?.verification ?? 'unverified',` on the next line. Change the `phasePending` line to `const phasePending = phaseSteps.filter(s => s.status === 'pending' || s.status === 'conflict').length` so phase counts still sum.
  8. In the compact-JSON steps mapper, replace `const status = entry?.status ?? 'pending'` with `const status = statusOf(slug)` (delete the now-unused `const entry = steps[slug]` line if TS flags it).
  9. In the interactive listing, replace `const status = entry?.status ?? 'pending'` with `const status = statusOf(slug)`.
  10. In the JSON `result` object, add `conflicts: conflictCheck.conflicts,` after `nextEligible`.
- [ ] Run `npx vitest run src/cli/commands/status.test.ts` — all green (existing fixtures use empty `produces` on completed steps, so nothing else demotes; if any existing fixture used non-empty `produces` on a completed step and now fails, that fixture is asserting the pre-D3 lie — update its expectation to `conflict`).
- [ ] Create `src/cli/commands/next.conflict.test.ts` (complete file):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    config: { version: 2, methodology: 'deep', platforms: ['claude-code'], project: { projectType: 'web-app' } },
    errors: [], warnings: [],
  })),
}))
vi.mock('../../state/state-manager.js', () => ({ StateManager: vi.fn() }))
vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({ discoverMetaPrompts: vi.fn(() => new Map()) }))
vi.mock('../../core/assembly/preset-loader.js', () => ({
  loadAllPresets: vi.fn(() => ({ deep: null, mvp: null, custom: null, brownfield: null, errors: [], warnings: [] })),
}))
vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn(() => ({
    steps: { beads: { enabled: true } }, knowledge: {}, reads: {}, dependencies: {}, crossReads: {},
  })),
}))
vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(() => []),
  humanCrossReadStatus: (s: string): string => s,
}))
vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(() => ({ nodes: new Map(), edges: new Map() })),
}))
vi.mock('../../core/dependency/eligibility.js', () => ({ computeEligible: vi.fn(() => []) }))

import { findProjectRoot } from '../middleware/project-root.js'
import { StateManager } from '../../state/state-manager.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import nextCommand from './next.js'

type NextArgv = Parameters<typeof nextCommand.handler>[0]

function makeState(steps: Record<string, unknown>): Record<string, unknown> {
  return {
    'schema-version': 1, 'scaffold-version': '2.0.0',
    init_methodology: 'deep', config_methodology: 'deep', 'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z', in_progress: null,
    steps, next_eligible: [], 'extra-steps': [],
  }
}

describe('next — conflict overrides completed (D3)', () => {
  let stderrLines: string[]

  beforeEach(() => {
    stderrLines = []
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    vi.mocked(StateManager).mockImplementation(() => ({
      loadState: vi.fn(() => makeState({
        beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'], verification: 'declared' },
      }) as unknown as LoadReturn),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('warns about the demoted step and computes eligibility from the overridden record', async () => {
    await nextCommand.handler({
      count: undefined, format: undefined, auto: undefined,
      root: undefined, verbose: undefined, force: undefined,
    } as NextArgv)
    expect(stderrLines.join('')).toContain('treated as not completed')
    const lastCall = vi.mocked(computeEligible).mock.calls.at(-1)
    expect((lastCall?.[1] as Record<string, { status: string }>)['beads'].status).toBe('pending')
  })
})
```

- [ ] Run `npx vitest run src/cli/commands/next.conflict.test.ts` — FAILS (no warning, eligibility still fed the completed entry).
- [ ] Implement in `src/cli/commands/next.ts`. Add `import { applyConflictOverrides } from '../../state/completion.js'`, then replace the `const eligible = readEligible(…)` call with:

```ts
    // D3: conflict overrides completed — fs-only demotion (never runs detect: cmds).
    const conflictCheck = applyConflictOverrides(state.steps, projectRoot)
    if (conflictCheck.conflicts.length > 0) {
      output.warn(
        `${conflictCheck.conflicts.length} completed step(s) failed the artifact check and are treated as not completed: `
        + `${conflictCheck.conflicts.join(', ')}. Run \`scaffold adopt\` to review.`,
      )
    }
    const eligible = conflictCheck.conflicts.length > 0
      ? pipeline.computeEligible(conflictCheck.steps, scopeOptions)
      : readEligible(
        state,
        pipeline,
        scopeOptions,
        service ? () => readRootSaveCounter(projectRoot) : undefined,
      )
```

- [ ] Run `npx vitest run src/cli/commands/next.conflict.test.ts src/cli/commands/next.test.ts src/cli/commands/status.test.ts` — green.
- [ ] Commit: `git add -A && git commit -m "feat(cli): conflict overrides completed in status/next eligibility (R1 D3)"`

---

### Task 6: `content/methodology/brownfield.yml` preset + plumbing + init-mode read-sides (adopt, dashboard)

**Files:**
- Create: `/Users/kenallred/Developer/scaffold/content/methodology/brownfield.yml`
- Modify: `/Users/kenallred/Developer/scaffold/src/types/enums.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/config/loader.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/config/schema.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/core/assembly/preset-loader.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/core/pipeline/types.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/core/pipeline/context.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/core/pipeline/resolver.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/project/adopt.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.ts` (methodology selection at line 563 / state write at line 614)
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/dashboard.ts` (line 206 hardcode)
- Test: `/Users/kenallred/Developer/scaffold/src/core/assembly/brownfield-preset.test.ts` (new), `/Users/kenallred/Developer/scaffold/src/core/pipeline/resolver.brownfield.test.ts` (new), `/Users/kenallred/Developer/scaffold/src/project/adopt.test.ts`, `/Users/kenallred/Developer/scaffold/src/cli/commands/dashboard.init-mode.test.ts` (new)

**Interfaces:**
- Produces: `MethodologyName` widens to `'deep' | 'mvp' | 'custom' | 'brownfield'`; `loadAllPresets` returns `{ deep, mvp, custom, brownfield, errors, warnings }`; `PipelineContext.presets.brownfield: MethodologyPreset | null`; `resolvePipeline` selects `presets.brownfield` for `methodology === 'brownfield'`; `AdoptionResult.methodology` becomes `'brownfield'` for brownfield/v1-migration repos; `resolveSkeletonInitMode(projectRoot, config)` exported from `src/cli/commands/dashboard.ts`.
- Consumes: `loadPreset`, `MethodologyPreset`, `StateManager.loadStateReadOnly`, `StatePathResolver`.

**Steps:**

- [ ] Create `content/methodology/brownfield.yml` with exactly this content (same step-overrides format as `deep.yml`/`mvp.yml`; enablement only — no content semantics):

```yaml
# methodology/brownfield.yml
# Enablement-only preset for adopting an existing codebase (D11, R1).
# Foundation / environment / quality first; the doc-chain middle
# (modeling -> specification), platform parity, and the validation audits are
# disabled by default — opt in per-step via `scaffold adopt --include <step>`.
name: Brownfield
description: Adopt an existing codebase — codify what exists, interview only for intent
default_depth: 3

steps:
  # Phase 0 — Product Vision (vision)
  create-vision: { enabled: true }
  review-vision: { enabled: true }
  innovate-vision: { enabled: false }
  # Phase 1 — Product Definition (pre)
  create-prd: { enabled: true }
  review-prd: { enabled: true }
  innovate-prd: { enabled: false }
  user-stories: { enabled: true }
  review-user-stories: { enabled: true }
  innovate-user-stories: { enabled: false }
  # Phase 2 — Project Foundation (foundation)
  github-setup: { enabled: true }
  beads: { enabled: true, conditional: "if-needed" }
  tech-stack: { enabled: true }
  coding-standards: { enabled: true }
  tdd: { enabled: true }
  project-structure: { enabled: true }
  # Phase 3 — Development Environment (environment)
  dev-env-setup: { enabled: true }
  staging-environments: { enabled: true, conditional: "if-needed" }
  design-system: { enabled: true, conditional: "if-needed" }
  git-workflow: { enabled: true }
  merge-throughput: { enabled: true, conditional: "if-needed" }
  automated-pr-review: { enabled: true, conditional: "if-needed" }
  ai-memory-setup: { enabled: true }
  # Phase 4 — Testing Integration (integration)
  add-e2e-testing: { enabled: true, conditional: "if-needed" }
  # Phase 5 — Domain Modeling (modeling) — doc-chain middle, disabled by default
  domain-modeling: { enabled: false }
  review-domain-modeling: { enabled: false }
  # Phase 6 — Architecture Decisions (decisions) — doc-chain middle, disabled by default
  adrs: { enabled: false }
  review-adrs: { enabled: false }
  # Phase 7 — System Architecture (architecture) — doc-chain middle, disabled by default
  system-architecture: { enabled: false }
  review-architecture: { enabled: false }
  # Phase 8 — Specifications (specification) — doc-chain middle, disabled by default
  database-schema: { enabled: false }
  review-database: { enabled: false }
  api-contracts: { enabled: false }
  mcp-tool-resource-contract: { enabled: false }
  review-api: { enabled: false }
  ux-spec: { enabled: false }
  review-ux: { enabled: false }
  # Phase 9 — Quality Gates (quality) — quality-first: fully enabled
  review-testing: { enabled: true }
  story-tests: { enabled: true }
  create-evals: { enabled: true }
  operations: { enabled: true }
  review-operations: { enabled: true }
  security: { enabled: true }
  review-security: { enabled: true }
  # Phase 10 — Platform Parity (parity) — disabled by default
  platform-parity-review: { enabled: false }
  # Phase 11 — Consolidation (consolidation)
  claude-md-optimization: { enabled: true }
  workflow-audit: { enabled: true }
  # Phase 12 — Planning (planning)
  implementation-plan: { enabled: true }
  implementation-plan-review: { enabled: false }
  # Phase 13 — Validation (validation) — audits disabled by default
  cross-phase-consistency: { enabled: false }
  traceability-matrix: { enabled: false }
  decision-completeness: { enabled: false }
  critical-path-walkthrough: { enabled: false }
  implementability-dry-run: { enabled: false }
  dependency-graph-validation: { enabled: false }
  scope-creep-check: { enabled: false }
  # Phase 14 — Finalization (finalization)
  apply-fixes-and-freeze: { enabled: false }
  developer-onboarding-guide: { enabled: false }
  implementation-playbook: { enabled: true }
  materialize-plan-to-beads: { enabled: true, conditional: "if-needed" }
  # Phase 15 — Build (build) — stateless, on-demand execution steps
  single-agent-start: { enabled: true }
  single-agent-resume: { enabled: true }
  multi-agent-start: { enabled: true }
  multi-agent-resume: { enabled: true }
  quick-task: { enabled: true }
  new-enhancement: { enabled: true }
  # Game development steps (enabled via game overlay)
  game-design-document: { enabled: false }
  review-gdd: { enabled: false }
  performance-budgets: { enabled: false }
  narrative-bible: { enabled: false }
  netcode-spec: { enabled: false }
  review-netcode: { enabled: false }
  ai-behavior-design: { enabled: false }
  game-accessibility: { enabled: false }
  input-controls-spec: { enabled: false }
  game-ui-spec: { enabled: false }
  review-game-ui: { enabled: false }
  content-structure-design: { enabled: false }
  art-bible: { enabled: false }
  audio-design: { enabled: false }
  economy-design: { enabled: false }
  review-economy: { enabled: false }
  online-services-spec: { enabled: false }
  modding-ugc-spec: { enabled: false }
  save-system-spec: { enabled: false }
  localization-plan: { enabled: false }
  playtest-plan: { enabled: false }
  analytics-telemetry: { enabled: false }
  live-ops-plan: { enabled: false }
  platform-cert-prep: { enabled: false }
  # Multi-service steps (enabled via multi-service overlay)
  service-ownership-map: { enabled: false }
  inter-service-contracts: { enabled: false }
  cross-service-auth: { enabled: false }
  cross-service-observability: { enabled: false }
  integration-test-plan: { enabled: false }
  # macOS-native steps (enabled via macos-native overlay)
  macos-ui-spec: { enabled: false }
  review-macos-ui: { enabled: false }
  macos-distribution-spec: { enabled: false }
  macos-entitlements-privacy-spec: { enabled: false }
  review-macos-release: { enabled: false }
```

- [ ] Write the failing content test `src/core/assembly/brownfield-preset.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { loadPreset } from './preset-loader.js'
import { discoverMetaPrompts } from './meta-prompt-loader.js'

describe('content/methodology/brownfield.yml (D11 R1)', () => {
  const repoRoot = process.cwd()
  const presetPath = path.join(repoRoot, 'content', 'methodology', 'brownfield.yml')
  const stepNames = [...discoverMetaPrompts(path.join(repoRoot, 'content', 'pipeline')).keys()]

  it('loads without errors or missing-step warnings against the real pipeline', () => {
    const { preset, errors, warnings } = loadPreset(presetPath, stepNames)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(preset).not.toBeNull()
    expect(preset!.name).toBe('Brownfield')
    expect(preset!.default_depth).toBe(3)
  })

  it('enables foundation/environment/quality and disables the doc-chain middle, parity, and validation', () => {
    const { preset } = loadPreset(presetPath, stepNames)
    const steps = preset!.steps
    expect(steps['github-setup'].enabled).toBe(true)
    expect(steps['tech-stack'].enabled).toBe(true)
    expect(steps['git-workflow'].enabled).toBe(true)
    expect(steps['security'].enabled).toBe(true)
    expect(steps['domain-modeling'].enabled).toBe(false)
    expect(steps['adrs'].enabled).toBe(false)
    expect(steps['system-architecture'].enabled).toBe(false)
    expect(steps['api-contracts'].enabled).toBe(false)
    expect(steps['platform-parity-review'].enabled).toBe(false)
    expect(steps['cross-phase-consistency'].enabled).toBe(false)
  })
})
```

- [ ] Run `npx vitest run src/core/assembly/brownfield-preset.test.ts` — first test passes if the YAML is right; treat any error/warning as a defect in the YAML and fix there (every known pipeline step must be enumerated).
- [ ] Widen the types and validation:
  1. `src/types/enums.ts`: `export type MethodologyName = 'deep' | 'mvp' | 'custom' | 'brownfield'`
  2. `src/config/loader.ts`: `const VALID_METHODOLOGIES = ['deep', 'mvp', 'custom', 'brownfield']`
  3. `src/config/schema.ts` (the `ConfigSchema` literal): `methodology: z.enum(['deep', 'mvp', 'custom', 'brownfield']).default('deep'),`
- [ ] Load the preset. In `src/core/assembly/preset-loader.ts`, extend `loadAllPresets`: widen the return type with `brownfield: MethodologyPreset | null`, and before the final `return` add:

```ts
  const { preset: brownfield, errors: brownfieldErrors, warnings: brownfieldWarnings } = loadPreset(
    path.join(methodologyDir, 'brownfield.yml'),
    knownStepNames,
  )
  allErrors.push(...brownfieldErrors)
  allWarnings.push(...brownfieldWarnings)
```

and add `brownfield,` to the returned object.
- [ ] Thread it through: in `src/core/pipeline/types.ts` add `brownfield: MethodologyPreset | null` to `PipelineContext['presets']`; in `src/core/pipeline/context.ts` change the destructure to `const { deep, mvp, custom, brownfield } = loadAllPresets(methodologyDir, pipelineStepNames)` and the return to `presets: { deep, mvp, custom, brownfield },`.
- [ ] Select it in `src/core/pipeline/resolver.ts` — replace the preset-selection expression with:

```ts
  const methodology = config?.methodology ?? 'deep'
  const preset =
    (methodology === 'mvp' ? presets.mvp
      : methodology === 'custom' ? presets.custom
        : methodology === 'brownfield' ? presets.brownfield
          : presets.deep) ??
    presets.deep
```

- [ ] Add the resolver test `src/core/pipeline/resolver.brownfield.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import { resolvePipeline } from './resolver.js'
import type { PipelineContext } from './types.js'
import type { MethodologyPreset, ScaffoldConfig } from '../../types/index.js'

describe('resolvePipeline — brownfield preset selection (D11 R1)', () => {
  it('selects presets.brownfield when config.methodology is brownfield', () => {
    const brownfield: MethodologyPreset = {
      name: 'Brownfield', description: 'x', default_depth: 3,
      steps: { 'github-setup': { enabled: true } },
    }
    const context: PipelineContext = {
      projectRoot: '/tmp/does-not-matter',
      metaPrompts: new Map(),
      config: { version: 2, methodology: 'brownfield', platforms: ['claude-code'] } as ScaffoldConfig,
      configErrors: [],
      configWarnings: [],
      presets: { deep: null, mvp: null, custom: null, brownfield },
      methodologyDir: '/tmp/does-not-matter',
    }
    const pipeline = resolvePipeline(context, {})
    expect(pipeline.preset.name).toBe('Brownfield')
    expect(pipeline.overlay.steps['github-setup'].enabled).toBe(true)
  })
})
```

- [ ] Run `npx vitest run src/core/pipeline/resolver.brownfield.test.ts src/core/pipeline/resolver.test.ts src/core/assembly/preset-loader.test.ts` — green (fix the `loadAllPresets` mocks in any failing test by adding `brownfield: null` to the mocked return; `grep -rn "loadAllPresets" src --include="*.test.ts"` lists them).
- [ ] Point adopt at it. In `src/project/adopt.ts`, in the `result` literal (currently `methodology,` at line 167), change to:

```ts
    methodology: detection.mode === 'greenfield' ? methodology : 'brownfield',
```

with the comment line above it: `// D11 (R1): init-mode drives preset selection — brownfield/v1-migration repos adopt under the brownfield preset, replacing the hardcoded 'deep'.`
- [ ] In `src/cli/commands/adopt.ts`: change line 563 to `const methodology = 'deep' // greenfield fallback — runAdoption returns 'brownfield' for brownfield/v1-migration repos (D11 R1)` and change the `writeOrUpdateState(projectRoot, adoptResult, methodology, metaPromptDir)` call to pass `adoptResult.methodology` instead of `methodology`.
- [ ] Append the adopt test to `src/project/adopt.test.ts` (reuse its existing imports of `runAdoption`, `fs`, `os`, `path` — add any missing):

```ts
describe('brownfield methodology selection (D11 R1)', () => {
  it('selects brownfield for a brownfield repo instead of the passed-in default', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-bf-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export {}')
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(process.cwd(), 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
    })
    expect(result.mode).toBe('brownfield')
    expect(result.methodology).toBe('brownfield')
  })
})
```

- [ ] Fix the dashboard hardcode. In `src/cli/commands/dashboard.ts` add this exported helper (near the top, after the imports — `StateManager` and `StatePathResolver` are already imported):

```ts
/**
 * D11 (R1): init-mode read-side. The skeleton state synthesized for a service
 * with no state file mirrors the ROOT project's init-mode instead of
 * hardcoding 'greenfield'. Falls back to 'greenfield' when no root state exists.
 */
export function resolveSkeletonInitMode(
  projectRoot: string,
  config: { project?: { services?: unknown[] } } | null,
): 'greenfield' | 'brownfield' | 'v1-migration' {
  try {
    return StateManager.loadStateReadOnly(
      projectRoot, new StatePathResolver(projectRoot), () => config ?? undefined,
    )['init-mode'] ?? 'greenfield'
  } catch {
    return 'greenfield'
  }
}
```

Then, immediately before the `for (const svc of configuredServices!)` loop, add `const rootInitMode = resolveSkeletonInitMode(projectRoot, config)`, and at line 206 replace `'init-mode': 'greenfield',` with `'init-mode': rootInitMode,`.
- [ ] Add `src/cli/commands/dashboard.init-mode.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveSkeletonInitMode } from './dashboard.js'

describe('resolveSkeletonInitMode (D11 R1)', () => {
  it('mirrors the root state init-mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-im-'))
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield',
      'init-mode': 'brownfield', created: '2026-01-01T00:00:00.000Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    }))
    expect(resolveSkeletonInitMode(dir, null)).toBe('brownfield')
  })

  it('falls back to greenfield when no root state exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-im-'))
    expect(resolveSkeletonInitMode(dir, null)).toBe('greenfield')
  })
})
```

- [ ] Run `npx vitest run src/core src/project src/cli/commands/dashboard.init-mode.test.ts src/cli/commands/adopt.test.ts src/config` — green. Then `npx vitest run src` and fix any remaining `loadAllPresets` mock or `MethodologyName` narrowing fallout (mechanical).
- [ ] Commit: `git add -A && git commit -m "feat(methodology): brownfield preset + init-mode read-sides in adopt/dashboard (R1 D11)"`

---

### Task 7: `scaffold doctor` — check registry + runner + CLI (D5, R1 scope)

**Files:**
- Create: `/Users/kenallred/Developer/scaffold/src/doctor/types.ts`
- Create: `/Users/kenallred/Developer/scaffold/src/doctor/checks.ts`
- Create: `/Users/kenallred/Developer/scaffold/src/doctor/run.ts`
- Create: `/Users/kenallred/Developer/scaffold/src/cli/commands/doctor.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/index.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/doctor/run.test.ts`, `/Users/kenallred/Developer/scaffold/src/doctor/checks.test.ts`, `/Users/kenallred/Developer/scaffold/src/cli/commands/doctor.test.ts`

**Interfaces:**
- Produces (from `src/doctor/types.ts`):

```ts
type DoctorSection = 'pipeline' | 'beads' | 'hooks' | 'gate' | 'queue' | 'scheduler'
type DoctorStatus = 'ok' | 'warn' | 'error' | 'skip'
interface DoctorCheckResult { id: string; section: DoctorSection; title: string; status: DoctorStatus; detail: string; remediation?: string }
interface DoctorContext { projectRoot: string; runCmd: (cmd: string, timeoutS?: number) => { status: number | null; stdout: string; stderr: string } }
interface DoctorCheck { id: string; section: DoctorSection; title: string; run: (ctx: DoctorContext) => DoctorCheckResult; fix?: (ctx: DoctorContext) => { applied: boolean; detail: string } }
interface DoctorReport { results: DoctorCheckResult[]; verdict: 'healthy' | 'warnings' | 'errors'; exitCode: 0 | 1 | 2 }
```

- Produces (from `src/doctor/run.ts`): `makeRunCmd(projectRoot, env?)`, `runDoctor(projectRoot, options?: { fix?: boolean; checks?: DoctorCheck[]; runCmd?: DoctorContext['runCmd'] }): DoctorReport`.
- Produces (from `src/doctor/checks.ts`): `DOCTOR_CHECKS` plus the individual checks `pipelineVerificationCheck`, `beadsBinaryCheck`, `beadsLiveCheck`, `beadsBackupCheck`, `beadsGuardCheck`, `hooksRegisteredCheck`, `gateTargetsCheck`, `queueDaemonCheck`, `queuePausedCheck`, `schedulerCheck`.
- Consumes: `verifyStep` (Task 4), `loadPipelineContext`, `resolvePipeline` (brownfield-aware after Task 6), `StateManager.loadStateReadOnly`, `StatePathResolver`, `checkSync` from `proper-lockfile`.
- Contract (D5): not-installed subsystems report `skip` ("not configured …") and never affect the exit code; exit 0 healthy / 1 warnings / 2 errors; every external `bd` subcommand is capability-probed (`bd <sub> --help`) and an absent capability is a warning ("unsupported by installed bd <version>"), never an error loop; the gate section reports `make -n` as resolve-only, never as "healthy"/executed (`GATE_PROBE` execution is R2); `--fix` ships exactly one handler — the `bd doctor --fix` delegation.

**Steps:**

- [ ] Write the failing runner tests `src/doctor/run.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import { runDoctor } from './run.js'
import type { DoctorCheck, DoctorStatus } from './types.js'

function fakeCheck(id: string, status: DoctorStatus): DoctorCheck {
  return {
    id, section: 'queue', title: id,
    run: () => ({ id, section: 'queue', title: id, status, detail: id }),
  }
}

describe('runDoctor (D5)', () => {
  it('exit code 0 when all checks are ok or skipped', () => {
    const report = runDoctor('/tmp', { checks: [fakeCheck('a', 'ok'), fakeCheck('b', 'skip')] })
    expect(report.exitCode).toBe(0)
    expect(report.verdict).toBe('healthy')
  })

  it('exit code 1 on warnings, 2 on errors — skips never affect it', () => {
    expect(runDoctor('/tmp', { checks: [fakeCheck('a', 'warn'), fakeCheck('b', 'skip')] }).exitCode).toBe(1)
    expect(runDoctor('/tmp', { checks: [fakeCheck('a', 'warn'), fakeCheck('b', 'error')] }).exitCode).toBe(2)
  })

  it('a crashing check reports error instead of aborting the run', () => {
    const crashing: DoctorCheck = {
      id: 'x', section: 'gate', title: 'x',
      run: () => { throw new Error('boom') },
    }
    const report = runDoctor('/tmp', { checks: [crashing, fakeCheck('a', 'ok')] })
    expect(report.results[0].status).toBe('error')
    expect(report.results[0].detail).toContain('boom')
    expect(report.results).toHaveLength(2)
  })

  it('--fix invokes fix() on failing checks only and re-runs after an applied fix', () => {
    let fixed = false
    const check: DoctorCheck = {
      id: 'beads/live', section: 'beads', title: 'x',
      run: () => ({
        id: 'beads/live', section: 'beads', title: 'x',
        status: fixed ? 'ok' : 'error', detail: fixed ? 'answers' : 'failed',
      }),
      fix: () => { fixed = true; return { applied: true, detail: 'bd doctor --fix completed' } },
    }
    const report = runDoctor('/tmp', { checks: [check], fix: true })
    expect(report.results[0].status).toBe('ok')
    expect(report.results[0].detail).toContain('after fix')
    expect(report.exitCode).toBe(0)
  })
})
```

- [ ] Run `npx vitest run src/doctor/run.test.ts` — FAILS (module missing).
- [ ] Create `src/doctor/types.ts` (complete file):

```ts
export type DoctorSection = 'pipeline' | 'beads' | 'hooks' | 'gate' | 'queue' | 'scheduler'
export type DoctorStatus = 'ok' | 'warn' | 'error' | 'skip'

export interface DoctorCheckResult {
  id: string
  section: DoctorSection
  title: string
  status: DoctorStatus
  detail: string
  remediation?: string
}

export interface DoctorContext {
  projectRoot: string
  runCmd: (cmd: string, timeoutS?: number) => { status: number | null; stdout: string; stderr: string }
}

export interface DoctorCheck {
  id: string
  section: DoctorSection
  title: string
  run: (ctx: DoctorContext) => DoctorCheckResult
  /** R1 ships exactly one fix handler: the beads `bd doctor --fix` delegation (D5). */
  fix?: (ctx: DoctorContext) => { applied: boolean; detail: string }
}

export interface DoctorReport {
  results: DoctorCheckResult[]
  verdict: 'healthy' | 'warnings' | 'errors'
  exitCode: 0 | 1 | 2
}
```

- [ ] Create `src/doctor/run.ts` (complete file):

```ts
import { spawnSync } from 'node:child_process'
import { DOCTOR_CHECKS } from './checks.js'
import type { DoctorCheck, DoctorCheckResult, DoctorContext, DoctorReport } from './types.js'

/** Bounded shell runner. Every failure mode (non-zero, ENOENT, timeout) is status null/non-zero — never a throw. */
export function makeRunCmd(projectRoot: string, env?: NodeJS.ProcessEnv): DoctorContext['runCmd'] {
  return (cmd, timeoutS = 10) => {
    try {
      const res = spawnSync(cmd, {
        shell: true,
        cwd: projectRoot,
        timeout: timeoutS * 1000,
        encoding: 'utf8',
        env: env ?? process.env,
      })
      return { status: res.error !== undefined ? null : res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
    } catch {
      return { status: null, stdout: '', stderr: '' }
    }
  }
}

export function runDoctor(
  projectRoot: string,
  options?: { fix?: boolean; checks?: DoctorCheck[]; runCmd?: DoctorContext['runCmd'] },
): DoctorReport {
  const ctx: DoctorContext = { projectRoot, runCmd: options?.runCmd ?? makeRunCmd(projectRoot) }
  const safeRun = (check: DoctorCheck): DoctorCheckResult => {
    try {
      return check.run(ctx)
    } catch (err) {
      return {
        id: check.id, section: check.section, title: check.title,
        status: 'error', detail: `check crashed: ${(err as Error).message}`,
      }
    }
  }
  const results: DoctorCheckResult[] = []
  for (const check of options?.checks ?? DOCTOR_CHECKS) {
    let result = safeRun(check)
    if (options?.fix === true && check.fix !== undefined
        && (result.status === 'warn' || result.status === 'error')) {
      const fixOutcome = check.fix(ctx)
      if (fixOutcome.applied) {
        result = safeRun(check)
        result = { ...result, detail: `${result.detail} (after fix: ${fixOutcome.detail})` }
      } else {
        result = { ...result, detail: `${result.detail} (fix not applied: ${fixOutcome.detail})` }
      }
    }
    results.push(result)
  }
  const hasError = results.some((r) => r.status === 'error')
  const hasWarn = results.some((r) => r.status === 'warn')
  return {
    results,
    verdict: hasError ? 'errors' : hasWarn ? 'warnings' : 'healthy',
    exitCode: hasError ? 2 : hasWarn ? 1 : 0,
  }
}
```

- [ ] Write the failing check tests `src/doctor/checks.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  beadsBinaryCheck, beadsGuardCheck, hooksRegisteredCheck, gateTargetsCheck,
  queueDaemonCheck, queuePausedCheck, pipelineVerificationCheck,
} from './checks.js'
import { makeRunCmd } from './run.js'
import type { DoctorContext } from './types.js'

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'))
}

function ctxFor(root: string): DoctorContext {
  return { projectRoot: root, runCmd: makeRunCmd(root) }
}

describe('doctor checks — not configured means skipped, never failed (D5)', () => {
  it('beads, hooks, gate, and queue checks skip on an empty project', () => {
    const ctx = ctxFor(tmpRoot())
    expect(beadsBinaryCheck.run(ctx).status).toBe('skip')
    expect(hooksRegisteredCheck.run(ctx).status).toBe('skip')
    expect(gateTargetsCheck.run(ctx).status).toBe('skip')
    expect(queueDaemonCheck.run(ctx).status).toBe('skip')
    expect(queuePausedCheck.run(ctx).status).toBe('skip')
    expect(pipelineVerificationCheck.run(ctx).status).toBe('skip')
  })
})

describe('queue/paused', () => {
  it('warns with the recorded reason when .mq/PAUSED exists', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.mq'))
    fs.writeFileSync(path.join(root, '.mq', 'PAUSED'), 'gate red on batch 7\n')
    const result = queuePausedCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('gate red on batch 7')
    expect(result.remediation).toContain('rm .mq/PAUSED')
  })
})

describe('gate/targets — resolve-only in R1 (G2)', () => {
  it('reports resolve-only wording and never claims execution', () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, 'Makefile'), 'check:\n\t@true\ncheck-affected:\n\t@true\n')
    const result = gateTargetsCheck.run(ctxFor(root))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('NOT executed')
  })

  it('warns when the targets do not resolve', () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, 'Makefile'), 'lint:\n\t@true\n')
    const result = gateTargetsCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('check')
  })
})

describe('beads/binary with a PATH shim', () => {
  it('warns below the 1.1.0 floor and passes at it', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-bin-'))
    const shim = path.join(bin, 'bd')
    fs.writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.0.9"\n', { mode: 0o755 })
    const ctx: DoctorContext = {
      projectRoot: root,
      runCmd: makeRunCmd(root, { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }),
    }
    expect(beadsBinaryCheck.run(ctx).status).toBe('warn')
    fs.writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.1.0"\n', { mode: 0o755 })
    expect(beadsBinaryCheck.run(ctx).status).toBe('ok')
  })
})

describe('beads/guard', () => {
  it('warns when installed but not registered in .claude/settings.json', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
    const result = beadsGuardCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('not registered')
  })
})

describe('hooks/registered', () => {
  it('errors when a registered hook script is missing on disk', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] }] },
    }))
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('scripts/bd-guard.sh')
  })
})

describe('pipeline/verification', () => {
  it('errors when a completed step fails live verification (the beads case)', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.scaffold'))
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: deep\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'x')
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'deep', config_methodology: 'deep', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: { beads: { status: 'completed', source: 'pipeline', produces: ['.beads/', 'CLAUDE.md'], verification: 'declared' } },
      next_eligible: [], 'extra-steps': [],
    }))
    const result = pipelineVerificationCheck.run(ctxFor(root))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('beads')
  })
})
```

- [ ] Create `src/doctor/checks.ts` (complete file):

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkSync } from 'proper-lockfile'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { verifyStep } from '../state/completion.js'
import type { DoctorCheck, DoctorCheckResult, DoctorStatus } from './types.js'

const BD_VERSION_FLOOR = '1.1.0'

function res(
  check: Pick<DoctorCheck, 'id' | 'section' | 'title'>,
  status: DoctorStatus,
  detail: string,
  remediation?: string,
): DoctorCheckResult {
  return {
    id: check.id, section: check.section, title: check.title, status, detail,
    ...(remediation !== undefined ? { remediation } : {}),
  }
}

function versionAtLeast(version: string, floor: string): boolean {
  const a = version.split('.').map(Number)
  const b = floor.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return true
}

// --- pipeline -------------------------------------------------------------

export const pipelineVerificationCheck: DoctorCheck = {
  id: 'pipeline/verification',
  section: 'pipeline',
  title: 'completed steps verified (all outputs + detect)',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.scaffold', 'state.json'))) {
      return res(pipelineVerificationCheck, 'skip', 'not configured (no .scaffold/state.json)')
    }
    const context = loadPipelineContext(ctx.projectRoot)
    const pipeline = resolvePipeline(context, {})
    const state = StateManager.loadStateReadOnly(
      ctx.projectRoot, new StatePathResolver(ctx.projectRoot), () => context.config ?? undefined,
    )
    const conflicts: string[] = []
    let verified = 0
    for (const [slug, entry] of Object.entries(state.steps)) {
      if (entry.status !== 'completed') continue
      const meta = pipeline.stepMeta.get(slug)
      const verification = verifyStep(
        slug, entry, meta?.outputs ?? entry.produces ?? [], meta?.detect ?? null, ctx.projectRoot,
      )
      if (verification.status === 'conflict') conflicts.push(slug)
      else if (verification.verification === 'verified') verified++
    }
    if (conflicts.length > 0) {
      return res(pipelineVerificationCheck, 'error',
        `${conflicts.length} completed step(s) fail live verification: ${conflicts.sort().join(', ')}`,
        'scaffold adopt (review the rendered plan), then scaffold adopt --apply --plan <path>')
    }
    return res(pipelineVerificationCheck, 'ok',
      `${verified} completed step(s) verified against disk + detect contracts`)
  },
}

// --- beads ----------------------------------------------------------------

export const beadsBinaryCheck: DoctorCheck = {
  id: 'beads/binary',
  section: 'beads',
  title: 'bd installed and at least the supported floor',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsBinaryCheck, 'skip', 'not configured (no .beads/)')
    }
    const version = ctx.runCmd('bd --version')
    if (version.status !== 0) {
      return res(beadsBinaryCheck, 'error', '.beads/ exists but bd is not on PATH',
        'install beads (see docs/beads-workflow.md), then re-run scaffold doctor')
    }
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(version.stdout)
    if (match === null) {
      return res(beadsBinaryCheck, 'warn', `could not parse bd version from: ${version.stdout.trim()}`)
    }
    if (!versionAtLeast(match[0], BD_VERSION_FLOOR)) {
      return res(beadsBinaryCheck, 'warn',
        `bd ${match[0]} is below the supported floor ${BD_VERSION_FLOOR}`, 'upgrade bd')
    }
    return res(beadsBinaryCheck, 'ok', `bd ${match[0]} on PATH (floor ${BD_VERSION_FLOOR})`)
  },
}

export const beadsLiveCheck: DoctorCheck = {
  id: 'beads/live',
  section: 'beads',
  title: 'bd info answers from the project database',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsLiveCheck, 'skip', 'not configured (no .beads/)')
    }
    if (ctx.runCmd('command -v bd').status !== 0) {
      return res(beadsLiveCheck, 'skip', 'bd not on PATH (reported by beads/binary)')
    }
    const info = ctx.runCmd('bd info', 15)
    if (info.status !== 0) {
      return res(beadsLiveCheck, 'error',
        'bd info failed — .beads/ exists but the database does not answer',
        'bd doctor --fix (or scaffold doctor --fix to delegate)')
    }
    return res(beadsLiveCheck, 'ok', 'bd info answers')
  },
  fix: (ctx) => {
    // R1 --fix ships ONLY this delegation (D5). Capability-probe first —
    // never assume the installed bd supports the subcommand.
    if (ctx.runCmd('bd doctor --help').status !== 0) {
      return { applied: false, detail: 'bd doctor unsupported by installed bd — upgrade bd' }
    }
    const fixRun = ctx.runCmd('bd doctor --fix', 120)
    return {
      applied: fixRun.status === 0,
      detail: fixRun.status === 0 ? 'bd doctor --fix completed' : 'bd doctor --fix failed',
    }
  },
}

export const beadsBackupCheck: DoctorCheck = {
  id: 'beads/backup',
  section: 'beads',
  title: 'bd backup configured',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsBackupCheck, 'skip', 'not configured (no .beads/)')
    }
    if (ctx.runCmd('command -v bd').status !== 0) {
      return res(beadsBackupCheck, 'skip', 'bd not on PATH (reported by beads/binary)')
    }
    if (ctx.runCmd('bd backup --help').status !== 0) {
      const version = /(\d+\.\d+\.\d+)/.exec(ctx.runCmd('bd --version').stdout)?.[1] ?? 'unknown'
      return res(beadsBackupCheck, 'warn', `bd backup unsupported by installed bd ${version}`,
        'upgrade bd to enable backup verification')
    }
    const status = ctx.runCmd('bd backup status --json', 15)
    if (status.status !== 0) {
      return res(beadsBackupCheck, 'warn', 'bd backup status --json failed — backup may not be configured',
        'bd backup enable (see docs/beads-workflow.md)')
    }
    return res(beadsBackupCheck, 'ok', 'bd backup status answers')
  },
}

export const beadsGuardCheck: DoctorCheck = {
  id: 'beads/guard',
  section: 'beads',
  title: 'bd-guard installed, registered, and armed',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsGuardCheck, 'skip', 'not configured (no .beads/)')
    }
    const guardPath = path.join(ctx.projectRoot, 'scripts', 'bd-guard.sh')
    if (!fs.existsSync(guardPath)) {
      return res(beadsGuardCheck, 'warn', 'scripts/bd-guard.sh not installed',
        'scaffold agent-ops install --component git')
    }
    try {
      fs.accessSync(guardPath, fs.constants.X_OK)
    } catch {
      return res(beadsGuardCheck, 'warn', 'scripts/bd-guard.sh is not executable', `chmod +x ${guardPath}`)
    }
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json')
    const registered = fs.existsSync(settingsPath)
      && fs.readFileSync(settingsPath, 'utf8').includes('bd-guard.sh')
    if (!registered) {
      return res(beadsGuardCheck, 'warn',
        'bd-guard.sh installed but not registered in .claude/settings.json',
        'register the PreToolUse hook per content/pipeline/environment/git-workflow.md (automated by `scaffold hooks install` in R2)')
    }
    if (ctx.runCmd('command -v jq').status !== 0) {
      // The guard parses its hook envelope with jq and fails OPEN without it.
      return res(beadsGuardCheck, 'warn', 'jq not found — bd-guard fails open (allows every command)',
        'brew install jq')
    }
    return res(beadsGuardCheck, 'ok', 'guard installed, registered, and armed (jq present)')
  },
}

// --- hooks ----------------------------------------------------------------

export const hooksRegisteredCheck: DoctorCheck = {
  id: 'hooks/registered',
  section: 'hooks',
  title: 'registered hook scripts exist and are executable',
  run: (ctx) => {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json')
    if (!fs.existsSync(settingsPath)) {
      return res(hooksRegisteredCheck, 'skip', 'not configured (no .claude/settings.json)')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch (err) {
      return res(hooksRegisteredCheck, 'error',
        `.claude/settings.json is not valid JSON: ${(err as Error).message}`,
        'fix the JSON by hand — no hooks are loading at all')
    }
    const scriptRefs = new Set<string>()
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        const match = /(?:^|[\s"'])((?:\.\/)?scripts\/[\w./-]+\.sh)/.exec(value)
        if (match !== null) scriptRefs.add(match[1].replace(/^\.\//, ''))
        return
      }
      if (Array.isArray(value)) {
        for (const v of value) visit(v)
        return
      }
      if (typeof value === 'object' && value !== null) {
        for (const v of Object.values(value)) visit(v)
      }
    }
    visit((parsed as Record<string, unknown>)['hooks'])
    if (scriptRefs.size === 0) {
      return res(hooksRegisteredCheck, 'skip', 'not configured (no script hooks registered)')
    }
    const missing: string[] = []
    const notExecutable: string[] = []
    for (const ref of [...scriptRefs].sort()) {
      const full = path.join(ctx.projectRoot, ref)
      if (!fs.existsSync(full)) {
        missing.push(ref)
        continue
      }
      try {
        fs.accessSync(full, fs.constants.X_OK)
      } catch {
        notExecutable.push(ref)
      }
    }
    if (missing.length > 0) {
      return res(hooksRegisteredCheck, 'error', `registered hook script(s) missing: ${missing.join(', ')}`,
        'scaffold agent-ops install (reinstall the component) or remove the stale registration')
    }
    if (notExecutable.length > 0) {
      return res(hooksRegisteredCheck, 'warn', `hook script(s) not executable: ${notExecutable.join(', ')}`,
        `chmod +x ${notExecutable.join(' ')}`)
    }
    return res(hooksRegisteredCheck, 'ok', `${scriptRefs.size} registered hook script(s) present and executable`)
  },
}

// --- gate -----------------------------------------------------------------

export const gateTargetsCheck: DoctorCheck = {
  id: 'gate/targets',
  section: 'gate',
  title: 'check / check-affected make targets resolve',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, 'Makefile'))) {
      return res(gateTargetsCheck, 'skip', 'not configured (no Makefile)')
    }
    const missing = ['check', 'check-affected']
      .filter((target) => ctx.runCmd(`make -n ${target}`, 30).status !== 0)
    if (missing.length > 0) {
      return res(gateTargetsCheck, 'warn',
        `gate target(s) do not resolve: ${missing.join(', ')} — the mq daemon default gate commands assume them`,
        'add the targets to the Makefile (generated by `scaffold agent-ops install --component gate` in R2)')
    }
    // G2: `make -n` proves only that the targets RESOLVE. Report exactly that —
    // never "healthy". The bounded GATE_PROBE execution ships in R2 (D7).
    return res(gateTargetsCheck, 'ok',
      'check and check-affected resolve — NOT executed (bounded GATE_PROBE execution ships in R2)')
  },
}

// --- queue ----------------------------------------------------------------

export const queueDaemonCheck: DoctorCheck = {
  id: 'queue/daemon',
  section: 'queue',
  title: 'merge-queue daemon lock',
  run: (ctx) => {
    const mqDir = path.join(ctx.projectRoot, '.mq')
    if (!fs.existsSync(mqDir)) {
      return res(queueDaemonCheck, 'skip', 'not configured (no .mq/)')
    }
    let alive = false
    try {
      alive = checkSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 15_000 })
    } catch {
      alive = false
    }
    return res(queueDaemonCheck, 'ok',
      alive ? 'daemon running (lock held)' : 'daemon idle (no live lock — auto-starts on next enqueue)')
  },
}

export const queuePausedCheck: DoctorCheck = {
  id: 'queue/paused',
  section: 'queue',
  title: 'queue not paused',
  run: (ctx) => {
    const mqDir = path.join(ctx.projectRoot, '.mq')
    if (!fs.existsSync(mqDir)) {
      return res(queuePausedCheck, 'skip', 'not configured (no .mq/)')
    }
    const pausedPath = path.join(mqDir, 'PAUSED')
    if (fs.existsSync(pausedPath)) {
      const reason = fs.readFileSync(pausedPath, 'utf8').split('\n')[0].trim()
      return res(queuePausedCheck, 'warn', `queue is paused: ${reason || '(no reason recorded)'}`,
        'investigate the pause reason, then rm .mq/PAUSED')
    }
    return res(queuePausedCheck, 'ok', 'not paused')
  },
}

// --- scheduler ------------------------------------------------------------

export const schedulerCheck: DoctorCheck = {
  id: 'scheduler/loaded',
  section: 'scheduler',
  title: 'post-merge poller schedule loaded',
  run: (ctx) => {
    if (process.platform === 'darwin') {
      const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
      const plists = fs.existsSync(agentsDir)
        ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.plist') && f.includes('post-merge-poller'))
        : []
      if (plists.length === 0) {
        return res(schedulerCheck, 'skip', 'not configured (no post-merge-poller LaunchAgent; `scaffold sched` ships in R2)')
      }
      const label = plists[0].replace(/\.plist$/, '')
      // File presence proves nothing — verify the job is actually LOADED.
      const printed = ctx.runCmd(`launchctl print gui/$(id -u)/${label}`, 15)
      if (printed.status !== 0) {
        return res(schedulerCheck, 'error',
          `${plists[0]} exists but the job is not loaded (file presence proves nothing)`,
          `launchctl bootstrap gui/$(id -u) ${path.join(agentsDir, plists[0])}`)
      }
      return res(schedulerCheck, 'ok', `launchd job ${label} loaded`)
    }
    if (process.platform === 'linux') {
      const status = ctx.runCmd('systemctl --user status post-merge-poller.timer', 15)
      if (status.status === 0) return res(schedulerCheck, 'ok', 'systemd user timer post-merge-poller.timer active')
      if (status.status === 4) {
        return res(schedulerCheck, 'skip', 'not configured (no post-merge-poller.timer; `scaffold sched` ships in R2)')
      }
      return res(schedulerCheck, 'warn', 'post-merge-poller.timer present but not active',
        'systemctl --user start post-merge-poller.timer')
    }
    return res(schedulerCheck, 'skip', `not configured (unsupported platform ${process.platform})`)
  },
}

export const DOCTOR_CHECKS: DoctorCheck[] = [
  pipelineVerificationCheck,
  beadsBinaryCheck,
  beadsLiveCheck,
  beadsBackupCheck,
  beadsGuardCheck,
  hooksRegisteredCheck,
  gateTargetsCheck,
  queueDaemonCheck,
  queuePausedCheck,
  schedulerCheck,
]
```

- [ ] Run `npx vitest run src/doctor/` — green. (The scheduler check is deliberately untested against a live launchd — its skip path is covered implicitly on Linux CI and it is exercised via `runDoctor` injection tests.)
- [ ] Write the failing CLI test `src/cli/commands/doctor.test.ts` (complete file):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../doctor/run.js', () => ({ runDoctor: vi.fn() }))

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { runDoctor } from '../../doctor/run.js'
import doctorCommand from './doctor.js'

type DoctorArgv = Parameters<typeof doctorCommand.handler>[0]

function argvWith(overrides: Partial<DoctorArgv> = {}): DoctorArgv {
  return { fix: false, json: false, format: undefined, auto: undefined, root: undefined, verbose: undefined, force: undefined, ...overrides } as DoctorArgv
}

describe('doctor command', () => {
  let writtenLines: string[]
  const savedExitCode = process.exitCode

  beforeEach(() => {
    writtenLines = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    vi.mocked(resolveOutputMode).mockReturnValue('interactive')
  })

  afterEach(() => {
    process.exitCode = savedExitCode
    vi.restoreAllMocks()
  })

  it('sets process.exitCode from the report and prints the verdict + remediation', async () => {
    vi.mocked(runDoctor).mockReturnValue({
      results: [{
        id: 'queue/paused', section: 'queue', title: 'queue not paused',
        status: 'warn', detail: 'queue is paused: gate red', remediation: 'rm .mq/PAUSED',
      }],
      verdict: 'warnings', exitCode: 1,
    })
    await doctorCommand.handler(argvWith())
    expect(process.exitCode).toBe(1)
    const stdout = writtenLines.join('')
    expect(stdout).toContain('doctor: warnings')
    expect(stdout).toContain('rm .mq/PAUSED')
  })

  it('--json emits the structured report', async () => {
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    vi.mocked(runDoctor).mockReturnValue({ results: [], verdict: 'healthy', exitCode: 0 })
    await doctorCommand.handler(argvWith({ json: true }))
    const envelope = JSON.parse(writtenLines.join('')) as { data?: unknown }
    const parsed = (envelope.data ?? envelope) as { verdict: string; exit_code: number }
    expect(parsed.verdict).toBe('healthy')
    expect(parsed.exit_code).toBe(0)
  })

  it('passes --fix through to runDoctor', async () => {
    vi.mocked(runDoctor).mockReturnValue({ results: [], verdict: 'healthy', exitCode: 0 })
    await doctorCommand.handler(argvWith({ fix: true }))
    expect(vi.mocked(runDoctor)).toHaveBeenCalledWith('/fake/project', { fix: true })
  })
})
```

- [ ] Create `src/cli/commands/doctor.ts` (complete file):

```ts
import type { CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runDoctor } from '../../doctor/run.js'
import type { DoctorStatus } from '../../doctor/types.js'

interface DoctorArgs {
  fix?: boolean
  json?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const STATUS_ICONS: Record<DoctorStatus, string> = {
  ok: '✓', warn: '⚠', error: '✗', skip: '-',
}

const doctorCommand: CommandModule<Record<string, unknown>, DoctorArgs> = {
  command: 'doctor',
  describe: 'Execute health checks across the installed scaffold surface (pipeline, beads, hooks, gate, queue, scheduler)',
  builder: (yargs) => {
    return yargs
      .option('fix', {
        type: 'boolean', default: false,
        describe: 'Apply safe fixes (R1: delegates bd doctor --fix only; everything else reports its remediation)',
      })
      .option('json', { type: 'boolean', default: false, describe: 'Machine-readable report' })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` (or `scaffold adopt` for an existing repo)\n',
      )
      process.exitCode = 2
      return
    }
    const outputMode = resolveOutputMode(argv)
    const useJson = argv.json === true || outputMode === 'json'
    const output = createOutputContext(useJson ? 'json' : outputMode)
    const report = runDoctor(projectRoot, { fix: argv.fix === true })
    if (useJson) {
      output.result({
        schema_version: 1,
        verdict: report.verdict,
        exit_code: report.exitCode,
        checks: report.results,
      })
    } else {
      let currentSection = ''
      for (const result of report.results) {
        if (result.section !== currentSection) {
          output.info(result.section)
          currentSection = result.section
        }
        const name = result.id.includes('/') ? result.id.slice(result.id.indexOf('/') + 1) : result.id
        const skipPrefix = result.status === 'skip' ? 'skipped — ' : ''
        output.info(`  ${STATUS_ICONS[result.status]} ${name}: ${skipPrefix}${result.detail}`)
        if (result.remediation !== undefined && (result.status === 'warn' || result.status === 'error')) {
          output.info(`      fix: ${result.remediation}`)
        }
      }
      const errors = report.results.filter((r) => r.status === 'error').length
      const warnings = report.results.filter((r) => r.status === 'warn').length
      const skipped = report.results.filter((r) => r.status === 'skip').length
      output.info(`doctor: ${report.verdict} (${errors} error(s), ${warnings} warning(s), ${skipped} skipped)`)
    }
    process.exitCode = report.exitCode
  },
}

export default doctorCommand
```

- [ ] Register the command in `src/cli/index.ts`: add `import doctorCommand from './commands/doctor.js'` after the `dashboardCommand` import, and `.command(doctorCommand)` after `.command(dashboardCommand)`.
- [ ] Run `npx vitest run src/doctor src/cli/commands/doctor.test.ts src/cli/index.test.ts` — green.
- [ ] Commit: `git add -A && git commit -m "feat(doctor): scaffold doctor — execute-don't-inspect check registry, skip-not-configured, bd-fix delegation (R1 D5)"`

---

### Task 8: Adoption Plan module — dispositions, initialize record, canonical `plan_key`, markdown renderer

**Files:**
- Create: `/Users/kenallred/Developer/scaffold/src/project/adoption-plan.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/project/adoption-plan.test.ts`

**Interfaces:**
- Produces (all exported from `src/project/adoption-plan.ts`):

```ts
type AdoptionDisposition = 'done-verified' | 'conflict' | 'run' | 'skip-proposed' | 'undetectable'
type ApplyAction = 'mark-completed' | 'reopen-pending' | 'record-pending' | 'none'
interface StepPlanRecord {
  step_slug: string
  disposition: AdoptionDisposition
  apply_action: ApplyAction
  audit_event: 'verification-reversal' | 'partial-artifacts' | null
  detect_checks: DetectCheckResult[]
  outputs_present: string[]
  outputs_missing: string[]
}
interface InitializeRecord {
  config: { version: 2; methodology: MethodologyName; platforms: string[]; project: Record<string, unknown> | null }
  state: { 'init-mode': 'greenfield' | 'brownfield' | 'v1-migration'; methodology: MethodologyName; steps: Record<string, 'pending' | 'completed'> }
}
interface AdoptionPlan {
  generated_at: string
  project_root: string
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  methodology: MethodologyName
  includes: string[]
  initialize: InitializeRecord | null
  steps: StepPlanRecord[]
  disabled_by_preset: string[]
  plan_key: string
}
function canonicalJson(value: unknown): string
function computePlanKey(input: { initialize: InitializeRecord | null; includes: string[]; steps: StepPlanRecord[]; disabled_by_preset: string[] }): string
function buildAdoptionPlan(options: { projectRoot: string; adoptResult: AdoptionResult; includes?: string[] }): { plan: AdoptionPlan; errors: ScaffoldError[] }
function renderPlanMarkdown(plan: AdoptionPlan): string
function extractPlanKey(content: string): string | null
```

- Consumes: `verifyStep`, `StepVerification`, `DetectCheckResult` (Task 4), `MetaPromptFrontmatter.detect` (Task 2), the `brownfield` preset resolution (Task 6), `AdoptionResult`/`TYPE_KEY` from `src/project/adopt.ts`, `loadPipelineContext`, `resolvePipeline`, `StateManager.loadStateReadOnly`.
- R1 scope pins: this pipeline scans the **resolved** pipeline (brownfield preset + project-type overlays, the way `complete`/`reset` resolve), replacing the unresolved 99-step superset scan in `src/project/adopt.ts:139-159`; `map-candidate` does not exist; no rule emits `skip-proposed` (the value exists only in the type union); `run` rows carry no mode annotation; stateless (build-phase) steps carry no completion state and are excluded from the plan; `--include` steps are applied BEFORE resolution (as `custom.steps` enablement overrides) so an accepted include changes the `plan_key`.

**Steps:**

- [ ] Write the failing tests `src/project/adoption-plan.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAdoptionPlan, canonicalJson, computePlanKey, extractPlanKey, renderPlanMarkdown } from './adoption-plan.js'
import type { AdoptionResult } from './adopt.js'

function brownfieldResult(): AdoptionResult {
  return {
    mode: 'brownfield',
    artifactsFound: 0,
    detectedArtifacts: [],
    stepsCompleted: [],
    stepsRemaining: [],
    methodology: 'brownfield',
    errors: [],
    warnings: [],
  }
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-plan-'))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# rules\n')
  return dir
}

describe('canonicalJson', () => {
  it('is invariant to object key order, recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } }))
      .toBe(canonicalJson({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }))
  })
})

describe('buildAdoptionPlan (D1/D2/§6.1)', () => {
  it('scans only the resolved brownfield pipeline and reports the beads artifact-only conflict', () => {
    const dir = makeRepo()
    const { plan, errors } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(errors).toEqual([])
    const beads = plan.steps.find((s) => s.step_slug === 'beads')
    expect(beads).toBeDefined()
    expect(beads!.disposition).toBe('conflict')
    expect(beads!.apply_action).toBe('record-pending')
    expect(beads!.audit_event).toBe('partial-artifacts')
    expect(beads!.outputs_present).toContain('CLAUDE.md')
    // resolved pipeline, not the 99-step superset: preset-disabled steps are
    // rendered in the opt-in section, not as step records
    expect(plan.steps.some((s) => s.step_slug === 'domain-modeling')).toBe(false)
    expect(plan.disabled_by_preset).toContain('domain-modeling')
    // R1 never emits skip-proposed or map-candidate
    expect(plan.steps.some((s) => s.disposition === 'skip-proposed')).toBe(false)
  })

  it('renders the initialize apply-action record on first touch with the exact config payload', () => {
    const dir = makeRepo()
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(plan.initialize).not.toBeNull()
    expect(plan.initialize!.config).toEqual({
      version: 2, methodology: 'brownfield', platforms: ['claude-code'], project: null,
    })
    expect(plan.initialize!.state['init-mode']).toBe('brownfield')
    expect(plan.initialize!.state.steps['beads']).toBe('pending')
  })

  it('omits the initialize record when .scaffold/state.json already exists', () => {
    const dir = makeRepo()
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: brownfield\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: { tdd: { status: 'completed', source: 'pipeline', produces: ['docs/tdd-standards.md'], verification: 'declared' } },
      next_eligible: [], 'extra-steps': [],
    }))
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(plan.initialize).toBeNull()
    const tdd = plan.steps.find((s) => s.step_slug === 'tdd')
    expect(tdd!.disposition).toBe('conflict')
    expect(tdd!.apply_action).toBe('reopen-pending')
    expect(tdd!.audit_event).toBe('verification-reversal')
  })

  it('plan_key is stable across renders and prose, and changes when an include is accepted', () => {
    const dir = makeRepo()
    const first = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    const second = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    expect(second.plan_key).toBe(first.plan_key)
    expect(second.generated_at >= first.generated_at).toBe(true)  // timestamps may differ; key must not
    const included = buildAdoptionPlan({
      projectRoot: dir, adoptResult: brownfieldResult(), includes: ['domain-modeling'],
    }).plan
    expect(included.plan_key).not.toBe(first.plan_key)
    expect(included.steps.some((s) => s.step_slug === 'domain-modeling')).toBe(true)
    expect(included.disabled_by_preset).not.toContain('domain-modeling')
  })

  it('plan_key changes when reality changes a disposition', () => {
    const dir = makeRepo()
    const before = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs', 'tech-stack.md'), 'x')
    const after = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    expect(after.plan_key).not.toBe(before.plan_key)
    expect(after.steps.find((s) => s.step_slug === 'tech-stack')!.disposition).toBe('done-verified')
    expect(after.steps.find((s) => s.step_slug === 'tech-stack')!.apply_action).toBe('mark-completed')
  })
})

describe('renderPlanMarkdown + extractPlanKey', () => {
  it('embeds the plan key, the disabled-by-preset opt-in section, and the follow-up commands', () => {
    const dir = makeRepo()
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const markdown = renderPlanMarkdown(plan)
    expect(markdown).toContain(`Plan key: ${plan.plan_key}`)
    expect(markdown).toContain('## Disabled by preset (opt-in)')
    expect(markdown).toContain('--include domain-modeling')
    expect(markdown).toContain('scaffold adopt --apply')
    expect(markdown).toContain('scaffold doctor')
    expect(extractPlanKey(markdown)).toBe(plan.plan_key)
    expect(extractPlanKey(JSON.stringify(plan))).toBe(plan.plan_key)
    expect(extractPlanKey('no key here')).toBeNull()
  })
})

describe('computePlanKey canonicalization', () => {
  it('ignores ordering of includes, steps, and disabled slugs', () => {
    const record = (slug: string) => ({
      step_slug: slug, disposition: 'run' as const, apply_action: 'none' as const,
      audit_event: null, detect_checks: [], outputs_present: [], outputs_missing: [],
    })
    const a = computePlanKey({ initialize: null, includes: ['b', 'a'], steps: [record('y'), record('x')], disabled_by_preset: ['d', 'c'] })
    const b = computePlanKey({ initialize: null, includes: ['a', 'b'], steps: [record('x'), record('y')], disabled_by_preset: ['c', 'd'] })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] Run `npx vitest run src/project/adoption-plan.test.ts` — FAILS (module missing).
- [ ] Create `src/project/adoption-plan.ts` (complete file):

```ts
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { verifyStep } from '../state/completion.js'
import type { DetectCheckResult, StepVerification } from '../state/completion.js'
import { TYPE_KEY } from './adopt.js'
import type { AdoptionResult } from './adopt.js'
import type { MethodologyName, PipelineState, ScaffoldError } from '../types/index.js'
import type { ScaffoldConfig, StepEnablementEntry } from '../types/config.js'

export type AdoptionDisposition = 'done-verified' | 'conflict' | 'run' | 'skip-proposed' | 'undetectable'
export type ApplyAction = 'mark-completed' | 'reopen-pending' | 'record-pending' | 'none'

export interface StepPlanRecord {
  step_slug: string
  disposition: AdoptionDisposition
  apply_action: ApplyAction
  audit_event: 'verification-reversal' | 'partial-artifacts' | null
  detect_checks: DetectCheckResult[]
  outputs_present: string[]
  outputs_missing: string[]
}

export interface InitializeRecord {
  /** The EXACT config.yml payload apply will write (D2) — never more. */
  config: {
    version: 2
    methodology: MethodologyName
    platforms: string[]
    project: Record<string, unknown> | null
  }
  /** The initial state summary: init-mode + per-step statuses (D2). */
  state: {
    'init-mode': 'greenfield' | 'brownfield' | 'v1-migration'
    methodology: MethodologyName
    steps: Record<string, 'pending' | 'completed'>
  }
}

export interface AdoptionPlan {
  generated_at: string
  project_root: string
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  methodology: MethodologyName
  includes: string[]
  initialize: InitializeRecord | null
  steps: StepPlanRecord[]
  disabled_by_preset: string[]
  plan_key: string
}

/** JSON with recursively sorted object keys — the canonical form under plan_key. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',') + '}'
  }
  return JSON.stringify(value)
}

/**
 * plan_key (D1): sha256 hex over the canonical JSON of the COMPLETE apply-action
 * records — initialize record, sorted includes, per-step records sorted by slug,
 * sorted disabled-by-preset slugs. generated_at / project_root / markdown prose
 * never participate.
 */
export function computePlanKey(input: {
  initialize: InitializeRecord | null
  includes: string[]
  steps: StepPlanRecord[]
  disabled_by_preset: string[]
}): string {
  const canonical = canonicalJson({
    initialize: input.initialize,
    includes: [...input.includes].sort(),
    steps: [...input.steps].sort((a, b) => a.step_slug.localeCompare(b.step_slug)),
    disabled_by_preset: [...input.disabled_by_preset].sort(),
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

function dispositionFor(verification: StepVerification): {
  disposition: AdoptionDisposition
  apply_action: ApplyAction
  audit_event: StepPlanRecord['audit_event']
} {
  if (verification.undetectable) {
    return { disposition: 'undetectable', apply_action: 'none', audit_event: null }
  }
  if (verification.status === 'conflict') {
    return verification.conflictClass === 'state-claim'
      ? { disposition: 'conflict', apply_action: 'reopen-pending', audit_event: 'verification-reversal' }
      : { disposition: 'conflict', apply_action: 'record-pending', audit_event: 'partial-artifacts' }
  }
  if (verification.verification === 'verified') {
    // mark-completed is idempotent — it also upgrades a surviving 'declared'
    // claim to 'verified' on apply.
    return { disposition: 'done-verified', apply_action: 'mark-completed', audit_event: null }
  }
  // R1 emits no skip-proposed rows and no mode annotations (D11's content
  // half is R3) — everything else is a plain `run`.
  return { disposition: 'run', apply_action: 'none', audit_event: null }
}

export function buildAdoptionPlan(options: {
  projectRoot: string
  adoptResult: AdoptionResult
  includes?: string[]
}): { plan: AdoptionPlan; errors: ScaffoldError[] } {
  const { projectRoot, adoptResult } = options
  const includes = [...(options.includes ?? [])].sort()
  const methodology = adoptResult.methodology as MethodologyName
  const context = loadPipelineContext(projectRoot)

  // First-touch detection (D2): plan mode is read-only either way; a missing
  // config.yml is expected, so its CONFIG_MISSING error is not a plan error.
  const configExists = fs.existsSync(path.join(projectRoot, '.scaffold', 'config.yml'))
  const stateExists = fs.existsSync(path.join(projectRoot, '.scaffold', 'state.json'))
  const errors: ScaffoldError[] = configExists ? [...context.configErrors] : []

  const baseProject: Record<string, unknown> | null =
    adoptResult.projectType !== undefined && adoptResult.detectedConfig !== undefined
      ? { projectType: adoptResult.projectType, [TYPE_KEY[adoptResult.projectType]]: adoptResult.detectedConfig.config }
      : ((context.config?.project as Record<string, unknown> | undefined) ?? null)

  // --include is applied BEFORE resolution and keying (§6.1): includes become
  // custom.steps enablement overrides, so an accepted include re-resolves the
  // pipeline and changes the plan_key, forcing re-approval.
  const includeOverrides: Record<string, StepEnablementEntry> = Object.fromEntries(
    includes.map((slug) => [slug, { enabled: true }]),
  )
  const platforms: string[] = (context.config?.platforms as string[] | undefined) ?? ['claude-code']
  const planConfig = {
    ...(context.config ?? {}),
    version: 2,
    methodology,
    platforms,
    ...(baseProject !== null ? { project: baseProject } : {}),
    custom: { steps: { ...(context.config?.custom?.steps ?? {}), ...includeOverrides } },
  } as unknown as ScaffoldConfig

  // Resolve via preset + overlays like complete/reset do — this replaces the
  // unresolved 99-step superset scan (src/project/adopt.ts:139-159).
  const pipeline = resolvePipeline({ ...context, config: planConfig }, {})

  let state: PipelineState | null = null
  if (stateExists) {
    state = StateManager.loadStateReadOnly(
      projectRoot, new StatePathResolver(projectRoot), () => context.config ?? undefined,
    )
  }

  const records: StepPlanRecord[] = []
  const disabled: string[] = []
  for (const [slug, mp] of context.metaPrompts.entries()) {
    if (mp.frontmatter.stateless) continue  // no completion state — nothing to adopt
    if (pipeline.overlay.steps[slug]?.enabled !== true) {
      if (!includes.includes(slug)) disabled.push(slug)
      continue
    }
    const entry = state?.steps[slug]
    const verification = verifyStep(
      slug, entry, mp.frontmatter.outputs ?? [], mp.frontmatter.detect ?? null, projectRoot,
    )
    const mapped = dispositionFor(verification)
    records.push({
      step_slug: slug,
      disposition: mapped.disposition,
      apply_action: mapped.apply_action,
      audit_event: mapped.audit_event,
      detect_checks: verification.detect.checks,
      outputs_present: verification.outputsPresent,
      outputs_missing: verification.outputsMissing,
    })
  }
  records.sort((a, b) => a.step_slug.localeCompare(b.step_slug))
  disabled.sort()

  const initialize: InitializeRecord | null = stateExists ? null : {
    config: { version: 2, methodology, platforms, project: baseProject },
    state: {
      'init-mode': adoptResult.mode,
      methodology,
      steps: Object.fromEntries(records.map((r) => [
        r.step_slug, r.apply_action === 'mark-completed' ? 'completed' as const : 'pending' as const,
      ])),
    },
  }

  const plan_key = computePlanKey({ initialize, includes, steps: records, disabled_by_preset: disabled })
  return {
    plan: {
      generated_at: new Date().toISOString(),
      project_root: projectRoot,
      mode: adoptResult.mode,
      methodology,
      includes,
      initialize,
      steps: records,
      disabled_by_preset: disabled,
      plan_key,
    },
    errors,
  }
}

export function renderPlanMarkdown(plan: AdoptionPlan): string {
  const lines: string[] = []
  lines.push('# Adoption Plan')
  lines.push('')
  lines.push(`- Mode: ${plan.mode}`)
  lines.push(`- Methodology preset: ${plan.methodology}`)
  lines.push(`- Generated: ${plan.generated_at}`)
  if (plan.includes.length > 0) lines.push(`- Includes: ${plan.includes.join(', ')}`)
  lines.push('')
  if (plan.initialize !== null) {
    lines.push('## Initialize (apply action)')
    lines.push('')
    lines.push('`--apply` will write exactly this configuration — apply can never write config the plan did not show (D2):')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(plan.initialize, null, 2))
    lines.push('```')
    lines.push('')
  }
  lines.push('## Step dispositions')
  lines.push('')
  lines.push('| Step | Disposition | Apply action | Evidence |')
  lines.push('|---|---|---|---|')
  for (const record of plan.steps) {
    const evidence: string[] = []
    if (record.outputs_present.length > 0) evidence.push(`present: ${record.outputs_present.join(', ')}`)
    if (record.outputs_missing.length > 0) evidence.push(`missing: ${record.outputs_missing.join(', ')}`)
    for (const check of record.detect_checks) {
      evidence.push(`${check.kind} \`${check.target}\`: ${check.passed ? 'pass' : 'fail'}`)
    }
    lines.push(`| ${record.step_slug} | ${record.disposition} | ${record.apply_action} | ${evidence.join('; ') || '—'} |`)
  }
  lines.push('')
  lines.push('## Disabled by preset (opt-in)')
  lines.push('')
  if (plan.disabled_by_preset.length === 0) {
    lines.push('(none)')
  } else {
    for (const slug of plan.disabled_by_preset) {
      lines.push(`- ${slug} — opt in with \`scaffold adopt --include ${slug}\``)
    }
  }
  lines.push('')
  lines.push(`Plan key: ${plan.plan_key}`)
  lines.push('')
  lines.push('## Next steps')
  lines.push('')
  lines.push('- Apply: `scaffold adopt --apply --plan docs/adoption-plan.md` (or `--plan-key <sha256>`)')
  lines.push('- Verify: `scaffold doctor`')
  lines.push('')
  return lines.join('\n')
}

/** Pull the approved plan_key out of a written plan document (markdown or JSON). */
export function extractPlanKey(content: string): string | null {
  const match = /(?:Plan key:|"plan_key":)\s*"?([0-9a-f]{64})\b/.exec(content)
  return match !== null ? match[1] : null
}
```

- [ ] Run `npx vitest run src/project/adoption-plan.test.ts` — green.
- [ ] Commit: `git add -A && git commit -m "feat(adopt): adoption-plan module — resolved-pipeline dispositions, initialize record, canonical plan_key (R1 D1/D2)"`

---

### Task 9: `scaffold adopt` plan mode — render by default, write nothing

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.test.ts`, plus mechanical updates to `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.result-shape.test.ts`, `adopt.serialization.test.ts`, `adopt.cli-flags.test.ts`, `adopt.config-resolution.test.ts`, `adopt.config-write-integration.test.ts`, `adopt.performance.test.ts`, `adopt.windows-crlf.test.ts`

**Interfaces:**
- Consumes: `buildAdoptionPlan`, `renderPlanMarkdown` (Task 8).
- CLI contract (D1): `scaffold adopt` renders the plan to stdout (human, or the plan object under `--format json` with `schema_version: 3`) and writes NOTHING — no state, no config, no lock; `--write [path]` persists the markdown plan (default `docs/adoption-plan.md`); `--include <step>` (CSV/repeatable) opts preset-disabled steps in before resolution; `--dry-run` becomes a deprecated no-op (plan mode is always dry).

**Steps:**

- [ ] Write the failing CLI tests. In `src/cli/commands/adopt.test.ts`, add this hoisted mock alongside the existing ones (before the imports section):

```ts
vi.mock('../../project/adoption-plan.js', () => ({
  buildAdoptionPlan: vi.fn(() => ({
    plan: {
      generated_at: '2026-07-19T00:00:00.000Z', project_root: '/mock', mode: 'brownfield',
      methodology: 'brownfield', includes: [], initialize: null, steps: [], disabled_by_preset: [],
      plan_key: 'f'.repeat(64),
    },
    errors: [],
  })),
  renderPlanMarkdown: vi.fn(() => `Plan key: ${'f'.repeat(64)}`),
  extractPlanKey: vi.fn((content: string) => (content.includes('f'.repeat(64)) ? 'f'.repeat(64) : null)),
}))
```

then append these tests inside the file's top-level describe, reusing its existing helpers for argv construction and its mocked `StateManager` / `findProjectRoot` (`adoptCommand` is its default-import subject; adapt local helper names to the file's own):

```ts
  it('plan mode writes nothing: no state initialization, no config write, no lock', async () => {
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    await adoptCommand.handler(defaultArgv())
    expect(vi.mocked(StateManager)).not.toHaveBeenCalled()
    const written = writtenLines.join('')
    expect(written).toContain('Plan key:')
  })

  it('JSON output is the plan object with schema_version 3', async () => {
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    await adoptCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join('')) as { data?: unknown }
    const parsed = (envelope.data ?? envelope) as { schema_version: number; plan_key: string; steps: unknown[] }
    expect(parsed.schema_version).toBe(3)
    expect(parsed.plan_key).toBe('f'.repeat(64))
    expect(Array.isArray(parsed.steps)).toBe(true)
  })
```

(If the file has no shared `writtenLines` stdout capture, add the same `vi.spyOn(process.stdout, 'write')` capture used by `status.test.ts` to these two tests locally.)
- [ ] Run `npx vitest run src/cli/commands/adopt.test.ts` — the new tests FAIL (handler still writes state and prints "Adoption complete").
- [ ] Rewrite the handler tail in `src/cli/commands/adopt.ts`:
  1. Add imports: `import { buildAdoptionPlan, renderPlanMarkdown } from '../../project/adoption-plan.js'`. Remove the now-unneeded imports as the steps below make them unused: `StateManager`, `discoverMetaPrompts`, `acquireLock`, `getLockPath`, `releaseLock`, `shutdown` (Task 10 re-adds the lock/shutdown imports for `--apply`).
  2. Add builder options (in the General group):

```ts
      .option('write', {
        type: 'string',
        describe: 'Write the rendered plan document (default path docs/adoption-plan.md)',
      })
      .option('include', {
        type: 'string',
        array: true,
        describe: 'Opt a preset-disabled step into the plan (CSV or repeatable); applied before resolution',
        coerce: coerceCSV,
      })
```

and change the `dry-run` describe to `'Deprecated: plan mode is the default and writes nothing'`. Add `'write', 'include'` to the `.group([...], 'General:')` list.
  3. Delete the whole lock-acquisition block (`// Acquire lock` through `shutdown.registerLockOwnership(...)`) and the `await shutdown.withResource('lock', …)` wrapper — plan mode is read-only. Keep the wrapped body, de-indented.
  4. Delete `writeOrUpdateState` (the whole function) and the entire `// Writes (config first, state second)` block. Above `export function writeOrUpdateConfig` add the comment line: `// Retained for the config-write integration tests; the apply path writes config via writeInitializeConfig (adoption-apply.ts). Slated for removal in R2.`
  5. Replace the `resultData` construction and the trailing `if (outputMode === 'json') … else … process.exitCode = 0` with:

```ts
      // D1: plan mode — render, never write.
      const includes = (argv.include as string[] | undefined) ?? []
      const { plan, errors: planErrors } = buildAdoptionPlan({ projectRoot, adoptResult, includes })
      if (planErrors.length > 0) {
        for (const e of planErrors) output.error(e)
        process.exitCode = planErrors[0].exitCode
        return
      }
      const writeTarget = argv.write === undefined
        ? null
        : (argv.write === '' ? 'docs/adoption-plan.md' : String(argv.write))
      if (writeTarget !== null) {
        const target = path.isAbsolute(writeTarget) ? writeTarget : path.join(projectRoot, writeTarget)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        atomicWriteFileSync(target, renderPlanMarkdown(plan))
        output.info(`Plan written: ${target}`)
      }
      if (outputMode === 'json') {
        output.result({
          schema_version: 3,
          ...plan,
          ...(adoptResult.projectType && { project_type: adoptResult.projectType }),
          ...(adoptResult.detectedConfig && { detected_config: adoptResult.detectedConfig }),
          ...(adoptResult.detectionConfidence !== undefined && { detection_confidence: adoptResult.detectionConfidence }),
          ...(adoptResult.detectionEvidence !== undefined && { detection_evidence: adoptResult.detectionEvidence }),
        })
      } else {
        for (const line of renderPlanMarkdown(plan).split('\n')) output.info(line)
        output.success(
          `Adoption plan rendered (${plan.steps.length} steps). Nothing was written. `
          + 'Apply with: scaffold adopt --apply',
        )
      }
      process.exitCode = 0
```

- [ ] Run `npx vitest run src/cli/commands/adopt.test.ts` — new tests green. Then run `npx vitest run src/cli/commands/ src/project/` and update the remaining adopt CLI tests mechanically (`grep -rn "steps_completed\|Adoption complete\|initializeState\|schema_version: 2" src/cli/commands/adopt*.test.ts` finds the assertions). Rules: (a) any test asserting state/config writes in default mode now asserts they do NOT happen (writes return in Task 10 under `--apply`); (b) any test asserting the old `schema_version: 2` result shape (`steps_completed`, `steps_remaining`, `artifacts_found`) now asserts the `schema_version: 3` plan shape (`plan_key`, `steps`, `disabled_by_preset`, `initialize`) — add the Task 9 `adoption-plan.js` mock to each file that invokes the handler; (c) `adopt.config-write-integration.test.ts` targets the exported `writeOrUpdateConfig` directly and keeps passing unchanged; (d) pure-`runAdoption` suites (`src/project/adopt.*.test.ts`) are unaffected.
- [ ] Commit: `git add -A && git commit -m "feat(adopt): propose-then-apply plan mode — render by default, write nothing (R1 D1) [breaking]"`

---

### Task 10: `scaffold adopt --apply` — drift contract, first-touch init, audit transitions, closing doctor

**Files:**
- Create: `/Users/kenallred/Developer/scaffold/src/project/adoption-apply.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.ts`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/middleware/project-root.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/project/adoption-apply.test.ts` (new), `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.apply.test.ts` (new), `/Users/kenallred/Developer/scaffold/src/cli/middleware/project-root.test.ts`

**Interfaces:**
- Produces (exported from `src/project/adoption-apply.ts`):

```ts
interface ApplyResult {
  initialized: boolean
  marked_completed: string[]
  reopened: string[]
  recorded_pending: string[]
  audit_records: number
  doctor: DoctorReport
}
function writeInitializeConfig(projectRoot: string, initialize: InitializeRecord): void
function applyAdoptionPlan(options: { projectRoot: string; plan: AdoptionPlan; scaffoldVersion: string }): Promise<ApplyResult>
```

- Consumes: `AdoptionPlan`, `InitializeRecord`, `extractPlanKey` (Task 8), `appendAuditRecord`, `VerificationAuditRecord` (Task 4), `runDoctor`, `DoctorReport` (Task 7), `StateManager.initializeState`/`loadState`/`saveState`, `TYPE_KEY`, `readPackageVersion` from `src/cli/commands/version.ts`.
- CLI contract (D1/D2): `--apply --plan <path>` / `--apply --plan-key <sha256>` re-render against live reality BEFORE any write and abort with `ADOPT_PLAN_DRIFT` on key mismatch; a bare `--apply` is interactive-only (typed confirmation `apply`) and errors with `ADOPT_APPLY_NON_INTERACTIVE` in auto/json/non-TTY mode; `adopt` joins `ROOT_OPTIONAL_COMMANDS` (first-touch); apply ends by running `scaffold doctor` and printing its verdict.

**Steps:**

- [ ] Make adopt first-touch. In `src/cli/middleware/project-root.ts` change the constant to:

```ts
export const ROOT_OPTIONAL_COMMANDS = ['init', 'version', 'update', 'adopt'] as const
```

and append to `src/cli/middleware/project-root.test.ts`:

```ts
  it('adopt is root-optional — first-touch adoption needs no .scaffold/ (D2)', () => {
    expect(ROOT_OPTIONAL_COMMANDS).toContain('adopt')
  })
```

(add `ROOT_OPTIONAL_COMMANDS` to that file's import from `./project-root.js` if absent). In `src/cli/commands/adopt.ts`, replace the root resolution + `PROJECT_NOT_INITIALIZED` early-return block with:

```ts
    // D2: adopt is first-touch — with no .scaffold/ anywhere, the current
    // directory is the project root (plan mode is read-only; --apply performs init).
    const projectRoot = (argv.root as string | undefined) ?? findProjectRoot(process.cwd()) ?? process.cwd()
```

- [ ] Write the failing apply-module tests `src/project/adoption-apply.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAdoptionPlan } from './adoption-plan.js'
import { applyAdoptionPlan } from './adoption-apply.js'
import type { AdoptionResult } from './adopt.js'

function brownfieldResult(): AdoptionResult {
  return {
    mode: 'brownfield', artifactsFound: 0, detectedArtifacts: [],
    stepsCompleted: [], stepsRemaining: [], methodology: 'brownfield',
    errors: [], warnings: [],
  }
}

describe('applyAdoptionPlan (D1/D2/D3)', () => {
  it('first touch: initializes config + state, records the beads partial-artifacts audit, marks verified steps completed, and runs doctor', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-apply-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# rules\n')
    fs.mkdirSync(path.join(dir, 'docs'))
    fs.writeFileSync(path.join(dir, 'docs', 'tech-stack.md'), 'stack\n')
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const result = await applyAdoptionPlan({ projectRoot: dir, plan, scaffoldVersion: '3.48.0' })

    expect(result.initialized).toBe(true)
    const configText = fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf8')
    expect(configText).toContain('methodology: brownfield')
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.scaffold', 'state.json'), 'utf8')) as {
      'init-mode': string
      steps: Record<string, { status: string; verification?: string }>
    }
    expect(state['init-mode']).toBe('brownfield')
    expect(state.steps['tech-stack'].status).toBe('completed')
    expect(state.steps['tech-stack'].verification).toBe('verified')
    expect(state.steps['beads'].status).toBe('pending')
    expect(state.steps['beads'].verification).toBe('unverified')
    expect(result.recorded_pending).toContain('beads')
    expect(result.marked_completed).toContain('tech-stack')

    const auditLines = fs.readFileSync(path.join(dir, '.scaffold', 'decisions.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const beadsAudit = auditLines.find((l) => l['step_slug'] === 'beads')
    expect(beadsAudit?.['event']).toBe('partial-artifacts')
    expect(beadsAudit?.['plan_key']).toBe(plan.plan_key)
    expect(result.doctor.verdict).toBeDefined()
  })

  it('reopens a false completion with a verification-reversal audit record preserving the prior claim', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-apply-rev-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: brownfield\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: { tdd: { status: 'completed', source: 'pipeline', produces: ['docs/tdd-standards.md'], completed_by: 'old-agent', verification: 'declared' } },
      next_eligible: [], 'extra-steps': [],
    }))
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const result = await applyAdoptionPlan({ projectRoot: dir, plan, scaffoldVersion: '3.48.0' })

    expect(result.initialized).toBe(false)
    expect(result.reopened).toContain('tdd')
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.scaffold', 'state.json'), 'utf8')) as {
      steps: Record<string, { status: string; verification?: string }>
    }
    expect(state.steps['tdd'].status).toBe('pending')
    expect(state.steps['tdd'].verification).toBe('unverified')
    const auditLines = fs.readFileSync(path.join(dir, '.scaffold', 'decisions.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const reversal = auditLines.find((l) => l['event'] === 'verification-reversal')
    expect(reversal?.['step_slug']).toBe('tdd')
    expect(reversal?.['from_status']).toBe('completed')
    expect(reversal?.['from_verification']).toBe('declared')
    expect(String(reversal?.['reason'])).toContain('old-agent')
  })
})
```

- [ ] Run `npx vitest run src/project/adoption-apply.test.ts` — FAILS (module missing).
- [ ] Create `src/project/adoption-apply.ts` (complete file):

```ts
import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, type Document } from 'yaml'
import { StateManager } from '../state/state-manager.js'
import { appendAuditRecord } from '../state/decision-logger.js'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { runDoctor } from '../doctor/run.js'
import { TYPE_KEY } from './adopt.js'
import type { AdoptionPlan, InitializeRecord } from './adoption-plan.js'
import type { DoctorReport } from '../doctor/types.js'
import type { StepStateEntry, VerificationAuditRecord } from '../types/index.js'

export interface ApplyResult {
  initialized: boolean
  marked_completed: string[]
  reopened: string[]
  recorded_pending: string[]
  audit_records: number
  doctor: DoctorReport
}

const ACTOR = 'scaffold-adopt'

/**
 * Write exactly the config.yml payload the approved plan rendered (D2).
 * Preserves unrelated keys of an existing config.yml; clears stale typed-config
 * blocks when the project type changed.
 */
export function writeInitializeConfig(projectRoot: string, initialize: InitializeRecord): void {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
  let doc: Document
  if (fs.existsSync(configPath)) {
    doc = parseDocument(fs.readFileSync(configPath, 'utf8'))
  } else {
    doc = parseDocument('# scaffold config — created by scaffold adopt --apply\n')
  }
  doc.set('version', 2)
  doc.set('methodology', initialize.config.methodology)
  doc.set('platforms', doc.createNode(initialize.config.platforms))
  const project = initialize.config.project
  if (project !== null) {
    doc.set('project', doc.createNode(project))
    const projectType = (project as { projectType?: string }).projectType
    for (const [type, key] of Object.entries(TYPE_KEY)) {
      if (type !== projectType && doc.hasIn(['project', key])) {
        doc.deleteIn(['project', key])
      }
    }
  }
  fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
  const tmpPath = `${configPath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, doc.toString(), 'utf8')
  fs.renameSync(tmpPath, configPath)
}

/**
 * Execute an approved Adoption Plan (D1/D2/D3). The caller has already
 * re-rendered against live reality and verified the plan_key — this function
 * only performs the writes the plan's apply-action records describe, then
 * closes with a doctor pass (Terraform's "done = clean plan" criterion).
 */
export async function applyAdoptionPlan(options: {
  projectRoot: string
  plan: AdoptionPlan
  scaffoldVersion: string
}): Promise<ApplyResult> {
  const { projectRoot, plan } = options
  const context = loadPipelineContext(projectRoot)
  const producesFor = (slug: string): string[] =>
    [...(context.metaPrompts.get(slug)?.frontmatter.outputs ?? [])]

  const stateManager = new StateManager(projectRoot, () => [], () => undefined)
  let initialized = false
  if (plan.initialize !== null) {
    writeInitializeConfig(projectRoot, plan.initialize)
    stateManager.initializeState({
      enabledSteps: plan.steps.map((record) => ({
        slug: record.step_slug,
        produces: producesFor(record.step_slug),
      })),
      scaffoldVersion: options.scaffoldVersion,
      methodology: plan.methodology,
      initMode: plan.mode,
    })
    initialized = true
  }

  const state = stateManager.loadState()
  const now = new Date().toISOString()
  const marked: string[] = []
  const reopened: string[] = []
  const recorded: string[] = []
  let auditCount = 0

  const auditFor = (
    record: AdoptionPlan['steps'][number],
    entry: StepStateEntry | undefined,
    event: 'verification-reversal' | 'partial-artifacts',
    reason: string,
  ): VerificationAuditRecord => ({
    ts: now,
    actor: ACTOR,
    event,
    step_slug: record.step_slug,
    from_status: entry?.status ?? null,
    from_verification: entry?.verification ?? null,
    to_status: 'pending',
    to_verification: 'unverified',
    evidence: {
      outputs_present: record.outputs_present,
      outputs_missing: record.outputs_missing,
      detect_checks: record.detect_checks,
    },
    reason,
    plan_key: plan.plan_key,
  })

  for (const record of plan.steps) {
    const entry = state.steps[record.step_slug]
    if (record.apply_action === 'mark-completed') {
      const next: StepStateEntry = {
        ...(entry ?? { status: 'pending', source: 'pipeline' }),
        status: 'completed',
        at: now,
        completed_by: ACTOR,
        produces: producesFor(record.step_slug),
        verification: 'verified',
      }
      if (next.completed_at === undefined) next.completed_at = now
      state.steps[record.step_slug] = next
      marked.push(record.step_slug)
    } else if (record.apply_action === 'reopen-pending') {
      appendAuditRecord(projectRoot, auditFor(record, entry, 'verification-reversal',
        `state claimed completed (completed_by=${entry?.completed_by ?? 'unknown'}, at=${entry?.at ?? 'unknown'}) but D3 verification failed`))
      auditCount++
      state.steps[record.step_slug] = {
        ...(entry ?? { source: 'pipeline', produces: producesFor(record.step_slug) }),
        status: 'pending',
        verification: 'unverified',
      } as StepStateEntry
      reopened.push(record.step_slug)
    } else if (record.apply_action === 'record-pending') {
      appendAuditRecord(projectRoot, auditFor(record, entry, 'partial-artifacts',
        `partial artifacts found on disk with no completion claim: ${record.outputs_present.join(', ')}`))
      auditCount++
      state.steps[record.step_slug] = {
        ...(entry ?? { source: 'pipeline' }),
        status: 'pending',
        produces: producesFor(record.step_slug),
        verification: 'unverified',
      } as StepStateEntry
      recorded.push(record.step_slug)
    }
    // apply_action 'none': nothing to write
  }

  stateManager.saveState(state)
  const doctor = runDoctor(projectRoot)
  return {
    initialized,
    marked_completed: marked,
    reopened,
    recorded_pending: recorded,
    audit_records: auditCount,
    doctor,
  }
}
```

- [ ] Run `npx vitest run src/project/adoption-apply.test.ts` — green.
- [ ] Wire the CLI. In `src/cli/commands/adopt.ts`:
  1. Re-add the lock/shutdown imports removed in Task 9 (`acquireLock`, `getLockPath`, `releaseLock` from `'../../state/lock-manager.js'`; `shutdown` from `'../shutdown.js'`) plus `import { applyAdoptionPlan } from '../../project/adoption-apply.js'`, `import { extractPlanKey } from '../../project/adoption-plan.js'` (widen the Task 9 import), and `import { readPackageVersion } from './version.js'`.
  2. Add builder options (General group; also add `'apply', 'plan', 'plan-key'` to the `.group` list):

```ts
      .option('apply', { type: 'boolean', default: false, describe: 'Execute the approved plan (writes config/state; pass --plan or --plan-key)' })
      .option('plan', { type: 'string', describe: 'Path to the approved plan document (drift-checked via its embedded plan key)' })
      .option('plan-key', { type: 'string', describe: 'Approved plan key (sha256) to drift-check against' })
```

  3. In the handler, directly after the Task 9 `planErrors` early-return and BEFORE the plan-mode rendering code, insert the apply branch below. Every path inside it ends in `return`, so the Task 9 plan-mode rendering code that follows it stays unchanged and needs no guard:

```ts
      if (argv.apply === true) {
        let approvedKey: string | null = (argv['plan-key'] as string | undefined) ?? null
        if (approvedKey === null && typeof argv.plan === 'string') {
          const planPath = path.isAbsolute(argv.plan) ? argv.plan : path.join(projectRoot, argv.plan)
          if (!fs.existsSync(planPath)) {
            output.error({ code: 'ADOPT_PLAN_NOT_FOUND', message: `Plan file not found: ${planPath}`, exitCode: ExitCode.ValidationError })
            process.exitCode = ExitCode.ValidationError
            return
          }
          approvedKey = extractPlanKey(fs.readFileSync(planPath, 'utf8'))
          if (approvedKey === null) {
            output.error({ code: 'ADOPT_PLAN_KEY_MISSING', message: `No plan key found in ${planPath} — re-render with \`scaffold adopt --write\``, exitCode: ExitCode.ValidationError })
            process.exitCode = ExitCode.ValidationError
            return
          }
        }
        if (approvedKey === null) {
          // D1: a bare --apply is interactive-only — automation must pass the key it approved.
          if (effectiveAuto || outputMode === 'json' || !output.supportsInteractivePrompts()) {
            output.error({
              code: 'ADOPT_APPLY_NON_INTERACTIVE',
              message: 'Bare --apply is interactive-only. In automation, pass the approved plan: --plan <path> or --plan-key <sha256>.',
              exitCode: ExitCode.ValidationError,
            })
            process.exitCode = ExitCode.ValidationError
            return
          }
          for (const line of renderPlanMarkdown(plan).split('\n')) output.info(line)
          const typed = await output.prompt<string>(
            `Type "apply" to execute plan ${plan.plan_key.slice(0, 12)}… (anything else aborts)`, '',
          )
          if (typed !== 'apply') {
            output.info('Aborted — nothing was written.')
            process.exitCode = 0
            return
          }
        } else if (approvedKey !== plan.plan_key) {
          // D1 drift contract: the live re-render above IS the pre-write check.
          output.error({
            code: 'ADOPT_PLAN_DRIFT',
            message: `Plan key mismatch: approved ${approvedKey.slice(0, 12)}… but the live re-render produced ${plan.plan_key.slice(0, 12)}… — `
              + 'reality changed since approval (a disposition, detect result, include, or the initialize payload). '
              + 'Re-review: `scaffold adopt --write`, then re-run --apply against the new plan.',
            exitCode: ExitCode.ValidationError,
          })
          process.exitCode = ExitCode.ValidationError
          return
        }

        // Writes begin here — take the lock (plan mode never does).
        const lockResult = acquireLock(projectRoot, 'adopt')
        if (!lockResult.acquired) {
          if (lockResult.error) output.error(lockResult.error)
          process.exitCode = 3
          return
        }
        shutdown.registerLockOwnership(getLockPath(projectRoot))
        await shutdown.withResource('lock', () => {
          releaseLock(projectRoot)
          shutdown.releaseLockOwnership()
        }, async () => {
          const applyResult = await applyAdoptionPlan({
            projectRoot, plan, scaffoldVersion: readPackageVersion(),
          })
          if (outputMode === 'json') {
            output.result({
              schema_version: 3,
              applied: true,
              plan_key: plan.plan_key,
              initialized: applyResult.initialized,
              marked_completed: applyResult.marked_completed,
              reopened: applyResult.reopened,
              recorded_pending: applyResult.recorded_pending,
              audit_records: applyResult.audit_records,
              doctor: { verdict: applyResult.doctor.verdict, exit_code: applyResult.doctor.exitCode },
            })
          } else {
            output.success(
              `Applied plan ${plan.plan_key.slice(0, 12)}…: `
              + `${applyResult.marked_completed.length} completed, ${applyResult.reopened.length} reopened, `
              + `${applyResult.recorded_pending.length} recorded pending`
              + (applyResult.initialized ? ' (project initialized)' : ''),
            )
            output.info(`doctor: ${applyResult.doctor.verdict} (exit ${applyResult.doctor.exitCode}) — run \`scaffold doctor\` for details`)
          }
          process.exitCode = 0
        })
        return
      }
```

- [ ] Write the failing CLI apply tests `src/cli/commands/adopt.apply.test.ts` (complete file):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
  releaseLock: vi.fn(),
}))
vi.mock('../shutdown.js', () => ({
  shutdown: {
    registerLockOwnership: vi.fn(),
    releaseLockOwnership: vi.fn(),
    withResource: vi.fn(async (_name: string, _cleanup: () => void, fn: () => Promise<unknown>) => fn()),
  },
}))
vi.mock('../../project/adopt.js', () => ({
  runAdoption: vi.fn().mockResolvedValue({
    mode: 'brownfield', artifactsFound: 0, detectedArtifacts: [],
    stepsCompleted: [], stepsRemaining: [], methodology: 'brownfield',
    errors: [], warnings: [],
  }),
  TYPE_KEY: { 'web-app': 'webAppConfig' },
}))
vi.mock('../../project/adoption-plan.js', () => ({
  buildAdoptionPlan: vi.fn(() => ({
    plan: {
      generated_at: '2026-07-19T00:00:00.000Z', project_root: '/mock', mode: 'brownfield',
      methodology: 'brownfield', includes: [], initialize: null, steps: [], disabled_by_preset: [],
      plan_key: 'f'.repeat(64),
    },
    errors: [],
  })),
  renderPlanMarkdown: vi.fn(() => `Plan key: ${'f'.repeat(64)}`),
  extractPlanKey: vi.fn((content: string) => (content.includes('f'.repeat(64)) ? 'f'.repeat(64) : null)),
}))
vi.mock('../../project/adoption-apply.js', () => ({
  applyAdoptionPlan: vi.fn().mockResolvedValue({
    initialized: true, marked_completed: ['tech-stack'], reopened: [], recorded_pending: ['beads'],
    audit_records: 1, doctor: { results: [], verdict: 'healthy', exitCode: 0 },
  }),
}))

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { applyAdoptionPlan } from '../../project/adoption-apply.js'
import adoptCommand from './adopt.js'

type AdoptArgv = Parameters<typeof adoptCommand.handler>[0]

function argvWith(overrides: Partial<AdoptArgv> = {}): AdoptArgv {
  return { 'dry-run': false, force: false, auto: false, verbose: false, ...overrides } as AdoptArgv
}

describe('adopt --apply (D1/D2)', () => {
  let stderrLines: string[]
  const savedExitCode = process.exitCode

  beforeEach(() => {
    stderrLines = []
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    vi.mocked(resolveOutputMode).mockReturnValue('interactive')
    vi.mocked(applyAdoptionPlan).mockClear()
  })

  afterEach(() => {
    process.exitCode = savedExitCode
    vi.restoreAllMocks()
  })

  it('bare --apply errors in non-interactive mode and applies nothing', async () => {
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    await adoptCommand.handler(argvWith({ apply: true, format: 'json' }))
    expect(process.exitCode).not.toBe(0)
    expect(vi.mocked(applyAdoptionPlan)).not.toHaveBeenCalled()
    expect(stderrLines.join('') + process.exitCode).toBeTruthy()
  })

  it('aborts with ADOPT_PLAN_DRIFT when the approved key does not match the live re-render', async () => {
    await adoptCommand.handler(argvWith({ apply: true, 'plan-key': 'a'.repeat(64) }))
    expect(process.exitCode).not.toBe(0)
    expect(vi.mocked(applyAdoptionPlan)).not.toHaveBeenCalled()
  })

  it('applies when the approved key matches the live re-render', async () => {
    await adoptCommand.handler(argvWith({ apply: true, 'plan-key': 'f'.repeat(64) }))
    expect(vi.mocked(applyAdoptionPlan)).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(0)
  })
})
```

- [ ] Run `npx vitest run src/cli/commands/adopt.apply.test.ts src/project/adoption-apply.test.ts src/cli/middleware/project-root.test.ts src/cli/commands/adopt.test.ts` — green.
- [ ] Commit: `git add -A && git commit -m "feat(adopt): --apply — plan-key drift contract, first-touch init, audit reversals, closing doctor (R1 D1/D2)"`

---

### Task 11: `detect:` blocks for the eight rollout steps + `make validate` coverage

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/foundation/beads.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/foundation/github-setup.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/foundation/tdd.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/environment/git-workflow.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/environment/merge-throughput.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/environment/ai-memory-setup.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/environment/dev-env-setup.md`
- Modify: `/Users/kenallred/Developer/scaffold/content/pipeline/integration/add-e2e-testing.md`
- Modify: `/Users/kenallred/Developer/scaffold/scripts/validate-frontmatter.sh`
- Test: `/Users/kenallred/Developer/scaffold/src/project/frontmatter.content.test.ts` (new), `/Users/kenallred/Developer/scaffold/tests/validate-frontmatter.bats`

**Interfaces:**
- Consumes: the `detect:` zod schema (Task 2). Each block mirrors the step's existing `## Mode Detection` prose; `cmd` strings are fixed values shipped in these package files only (trust boundary, D4).

**Steps:**

- [ ] Write the failing content test `src/project/frontmatter.content.test.ts` (complete file):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseAndValidate } from './frontmatter.js'

const PIPELINE_DIR = path.join(process.cwd(), 'content', 'pipeline')

function allPipelineFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...allPipelineFiles(full))
    else if (entry.name.endsWith('.md')) files.push(full)
  }
  return files
}

describe('shipped pipeline frontmatter (detect: rollout, D4)', () => {
  it('every pipeline file parses with zero errors', () => {
    for (const file of allPipelineFiles(PIPELINE_DIR)) {
      const { errors } = parseAndValidate(file)
      expect(errors, `frontmatter errors in ${file}`).toEqual([])
    }
  })

  it('the eight rollout steps carry their exact detect contracts', () => {
    const expectations: Record<string, unknown> = {
      'foundation/beads.md': { all: [{ path: '.beads/' }, { cmd: 'bd info' }] },
      'foundation/github-setup.md': { all: [{ cmd: 'git remote get-url origin' }] },
      'foundation/tdd.md': { all: [{ path: 'docs/tdd-standards.md' }] },
      'environment/git-workflow.md': { all: [{ path: 'docs/git-workflow.md' }, { path: 'scripts/setup-agent-worktree.sh' }] },
      'environment/merge-throughput.md': { all: [{ path: 'docs/merge-queue.md' }] },
      'environment/ai-memory-setup.md': { any: [{ path: '.claude/rules/' }, { path: 'docs/ai-memory-setup.md' }] },
      'environment/dev-env-setup.md': { all: [{ path: 'docs/dev-setup.md' }] },
      'integration/add-e2e-testing.md': { any: [{ path: 'playwright.config.ts' }, { path: 'playwright.config.js' }, { path: 'maestro/' }] },
    }
    for (const [rel, expected] of Object.entries(expectations)) {
      const { frontmatter, errors } = parseAndValidate(path.join(PIPELINE_DIR, rel))
      expect(errors, rel).toEqual([])
      expect(frontmatter.detect, rel).toEqual(expected)
    }
  })
})
```

- [ ] Run `npx vitest run src/project/frontmatter.content.test.ts` — the second test FAILS (`detect` is null everywhere).
- [ ] Add the blocks. In each file, insert the block immediately after its `outputs:` frontmatter line, mirroring the step's Mode Detection prose:

`content/pipeline/foundation/beads.md`:

```yaml
detect:
  all:
    - path: .beads/
    - cmd: bd info
```

`content/pipeline/foundation/github-setup.md`:

```yaml
detect:
  all:
    - cmd: git remote get-url origin
```

`content/pipeline/foundation/tdd.md`:

```yaml
detect:
  all:
    - path: docs/tdd-standards.md
```

`content/pipeline/environment/git-workflow.md`:

```yaml
detect:
  all:
    - path: docs/git-workflow.md
    - path: scripts/setup-agent-worktree.sh
```

`content/pipeline/environment/merge-throughput.md`:

```yaml
detect:
  all:
    - path: docs/merge-queue.md
```

`content/pipeline/environment/ai-memory-setup.md`:

```yaml
detect:
  any:
    - path: .claude/rules/
    - path: docs/ai-memory-setup.md
```

`content/pipeline/environment/dev-env-setup.md`:

```yaml
detect:
  all:
    - path: docs/dev-setup.md
```

`content/pipeline/integration/add-e2e-testing.md`:

```yaml
detect:
  any:
    - path: playwright.config.ts
    - path: playwright.config.js
    - path: maestro/
```

- [ ] Run `npx vitest run src/project/frontmatter.content.test.ts` — green.
- [ ] Teach `make validate` the schema. In `scripts/validate-frontmatter.sh`, insert before the loop's closing `done` (after the `description` check):

```bash
    # detect: block sanity (D4) — must declare all:/any:, and every list item
    # must be exactly one path: or cmd: check (timeout: continuation lines are
    # indented deeper and pass through).
    if echo "${frontmatter}" | grep -q '^detect:'; then
        detect_block=$(echo "${frontmatter}" | awk '/^detect:/{flag=1; next} flag && /^[^ ]/{flag=0} flag {print}')
        if ! echo "${detect_block}" | grep -qE '^  (all|any):'; then
            echo "Error: ${file} — detect: must declare all: or any:" >&2
            errors=1
            continue
        fi
        if echo "${detect_block}" | grep -E '^    - ' | grep -qvE '^    - (path|cmd): '; then
            echo "Error: ${file} — detect: list items must be 'path:' or 'cmd:' checks" >&2
            errors=1
            continue
        fi
    fi
```

- [ ] Append to `tests/validate-frontmatter.bats` (fixtures follow the file's existing `frontmatter-*.md` naming so teardown cleans them):

```bash
@test "passes for a detect block with path and cmd checks" {
    cat > "$FIXTURES/frontmatter-detect-ok.md" << 'EOF'
---
description: "step with detect"
detect:
  all:
    - path: .beads/
    - cmd: bd info
      timeout: 5
---

# Content
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-detect-ok.md"
    [ "$status" -eq 0 ]
}

@test "fails for a detect block without all: or any:" {
    cat > "$FIXTURES/frontmatter-detect-empty.md" << 'EOF'
---
description: "step with bad detect"
detect:
  paths:
    - path: .beads/
---

# Content
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-detect-empty.md"
    [ "$status" -eq 1 ]
}

@test "fails for a detect list item that is neither path nor cmd" {
    cat > "$FIXTURES/frontmatter-detect-badkey.md" << 'EOF'
---
description: "step with bad detect item"
detect:
  all:
    - glob: "**/*.ts"
---

# Content
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-detect-badkey.md"
    [ "$status" -eq 1 ]
}
```

- [ ] Run `make validate && npx bats tests/validate-frontmatter.bats && npx vitest run src/project src/state/completion.test.ts` — all green (shipped content passes both validators; the beads plan fixtures still classify as conflict because `.beads/` is missing regardless of the `bd info` outcome).
- [ ] Commit: `git add -A && git commit -m "feat(content): detect: contracts on the eight rollout steps + make validate schema coverage (R1 D4)"`

---

### Task 12: D16 — CHANGELOG entries + the one-release adopt notice

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/CHANGELOG.md`
- Modify: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.ts`
- Test: `/Users/kenallred/Developer/scaffold/src/cli/commands/adopt.test.ts`

**Steps:**

- [ ] Write the failing notice test. Append to `src/cli/commands/adopt.test.ts` (inside the top-level describe; reuse its argv helper and mocked `findProjectRoot`):

```ts
  it('prints the one-release behavior-change notice when run without --apply (D16)', async () => {
    const stderrLines: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    await adoptCommand.handler(defaultArgv())
    expect(stderrLines.join('')).toContain('Behavior change')
  })
```

- [ ] Run `npx vitest run src/cli/commands/adopt.test.ts` — the new test FAILS.
- [ ] Add the notice in `src/cli/commands/adopt.ts`, in the plan-mode branch immediately before the plan is rendered (i.e. right after the `argv.apply === true` block from Task 10):

```ts
      // D16 one-release notice — REMOVE in the release after R1 ships.
      output.warn(
        'Behavior change: `scaffold adopt` now renders an Adoption Plan and writes nothing by default. '
        + 'Run `scaffold adopt --apply --plan <path>` (or --plan-key <sha256>) to execute an approved plan. '
        + 'The previous silent write-on-run behavior was a defect — see CHANGELOG.',
      )
```

- [ ] Add the three prominent entries to `CHANGELOG.md` under `## [Unreleased]` (create `### Added` / `### Changed` sub-headings after the existing `### Fixed` block):

```markdown
### Added

- **`scaffold doctor`** — executes health checks (not config-presence inspection)
  across pipeline verification, beads (bd version floor, `bd info` live check,
  `bd backup status --json` behind a capability probe, bd-guard installed +
  registered + armed including the jq fail-open), hooks, gate targets (reported
  as resolve-only this release — the bounded `GATE_PROBE` execution ships in
  R2), merge queue, and scheduler. Not-installed subsystems report "not
  configured" and never affect the exit code (0 healthy / 1 warnings / 2
  errors; `--json` for automation). `--fix` ships exactly one fix in R1:
  delegating `bd doctor --fix`; every other failure prints its remediation.
- **`content/methodology/brownfield.yml` preset** (enablement-only):
  foundation / environment / quality-first; the doc-chain middle
  (modeling → specification), platform parity, and the validation audits are
  disabled by default — opt in via `scaffold adopt --include <step>`.
- **`detect:` frontmatter contract (D4)** — machine-readable live checks
  (`path:` existence + bounded `cmd:` entries, `all:`/`any:` composition)
  mirroring Mode Detection prose, shipped on beads, github-setup, git-workflow,
  merge-throughput, ai-memory-setup, add-e2e-testing, tdd, and dev-env-setup.
  `make validate` learns the schema.

### Changed

- **BREAKING BEHAVIOR FIX: `scaffold adopt` is now propose-then-apply (D1/D2).**
  `scaffold adopt` renders an Adoption Plan (stdout, `--format json`, or
  `--write [path]`, default `docs/adoption-plan.md`) and writes NOTHING.
  `scaffold adopt --apply --plan <path>` (or `--plan-key <sha256>`) re-renders
  against live reality before any write and aborts on plan-key drift; a bare
  `--apply` is interactive-only. The prior silent any-output-exists completion
  marking violated the brownfield spec (a repo containing only a `CLAUDE.md`
  got beads marked complete). Completion truth is now all-outputs + `detect:`
  (D3); conflicts override `completed` everywhere completion is consumed, and
  apply records reversals as append-only audit records in
  `.scaffold/decisions.jsonl`. Scripts that relied on adopt's side effects must
  pass `--apply` with an approved plan. A one-release notice prints when
  `adopt` runs without `--apply`.
- **State-field migration (D3): `artifacts_verified` → `verification`.**
  Automatic and one-way on first load (single-service state files bump to
  schema-version 4): `artifacts_verified: true` migrates to
  `verification: 'declared'` — never `'verified'`, which only a real
  disk-plus-detect check can set; `false`/absent becomes `'unverified'`.
- **`init-mode` staging note (D11).** This release gives `init-mode` its first
  read-sides: adopt selects the `brownfield` preset for brownfield /
  v1-migration repos, and the dashboard stops hardcoding `greenfield` when
  synthesizing skeleton service state. It does NOT change prompt content yet —
  the adoption-mode assembly/knowledge read-side lands in R3.
```

- [ ] Run `npx vitest run src/cli/commands/adopt.test.ts` — green.
- [ ] Commit: `git add -A && git commit -m "docs(changelog): R1 brownfield entries + one-release adopt notice (D16)"`

---

### Task 13: full-suite verification

**Files:**
- No new files — repo-wide gates.

**Steps:**

- [ ] `grep -rn "artifacts_verified" src scripts content --include="*.ts" --include="*.sh" --include="*.md"` — the ONLY allowed `src/` hits are the Task 1 migration site in `state-migration.ts` (the `legacy` cast that deletes the field) and its migration tests; fix any other straggler to `verification`.
- [ ] `npx vitest run src` — all green.
- [ ] `make check-all` — all green (bash lint + validate + bats + eval, TypeScript, mmr, knowledge, guides). Expected failures to watch for and fix at the root:
  - ShellCheck findings in the `validate-frontmatter.sh` addition (quote `${detect_block}` exactly as written above).
  - Bats content suites that assert frontmatter key inventories for the eight modified step files — add `detect` to their expected-keys lists if one exists.
  - Any `loadAllPresets` consumer or mock still missing `brownfield` (grep from Task 6).
- [ ] Re-run the two end-to-end proofs by hand and paste output in the PR description:
  - `cd "$(mktemp -d)" && printf '{"name":"x"}' > package.json && printf '# rules\n' > CLAUDE.md && node <path-to-repo>/dist/index.js adopt` after `npm run build` in the repo — expect: the one-release notice, an Adoption Plan with beads as `conflict`, a `Plan key:` line, and NO `.scaffold/` created.
  - `node <path-to-repo>/dist/index.js adopt --apply --plan-key <key-from-json-output>` in the same directory — expect: config.yml + state.json written, `doctor:` verdict line printed, and `scaffold status` showing beads pending (not completed).
- [ ] Commit any fixes: `git add -A && git commit -m "test(brownfield-r1): full-suite green"`

---

## Verification (whole plan)

- `make check-all` green on the final commit.
- Spec coverage (R1/Tier A): D1 propose-then-apply + plan_key drift contract (Tasks 8–10), D2 first-touch + initialize record (Tasks 8, 10), D3 verification enum/migration + conflict matrix + audit records (Tasks 1, 4, 5, 10), D4 detect contract + rollout + validation (Tasks 2, 3, 11), D5 doctor R1 (Task 7), D11 R1 half — brownfield preset + adopt/dashboard init-mode read-sides (Task 6), D16 CHANGELOG + notice (Task 12), §6.1 renderer scope (Task 8: no map-candidate, no skip-proposed emission, unannotated run rows, disabled-by-preset section, ops-preview deferred to R2), §6.2 single verification path (Tasks 3–4), §6.3 registry shape + skip-not-configured (Task 7).
- Out-of-scope guard: no `scaffold sched`/`hooks install`/`mq bootstrap`/gate component/`GATE_PROBE` execution/`artifact_map`/adoption-mode prompt content — those are R2/R3.
