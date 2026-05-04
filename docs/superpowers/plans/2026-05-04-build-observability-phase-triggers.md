# Build Observability — Phase-Boundary Triggers + StateManager Refactor (Plan 6 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire automatic phase-boundary audits into the scaffold pipeline. After this plan: every time a pipeline step completes — whether via `StateManager.markCompleted()` or via the `scaffold complete` CLI — `runPhaseAudit(step)` invokes `runAudit({ scope: 'docs', lensIds: ['H-cross-doc'] })` against the project, surfaces findings via a compact `[audit] N findings — see docs/audits/<file>.md` line at the end of the calling command's output, and persists the audit's markdown + sidecar. The audit is non-gating (state has already transitioned) but visible. Step completion paths are centralized through `markCompleted` so the hook is a single insertion point.

**Architecture:** Three changes. (1) **StateManager extension** — `StepEntry` gains `completed_at` and `in_progress_started_at` ISO timestamps; `markCompleted()` writes the former and `markInProgress()` (new) writes the latter. (2) **`scaffold complete` CLI refactor** — replace the direct `saveState(state)` call with a `markCompleted()` call so every completion path goes through one method. (3) **`runPhaseAudit()` orchestrator** — new module under `src/observability/engine/` that calls `runAudit()` directly via the TS API (no shell-out), enforces the observability.yaml `phase_audit.timeout_s` and `enabled` knobs, supports detached/foreground execution, and returns a compact result. `markCompleted` `await`s `runPhaseAudit` (foreground) or fire-and-forgets (detached) per config. The `state` adapter's `replayEvents()` now uses real per-step timestamps instead of the mtime-based fallback.

**Tech Stack:** TypeScript (vitest, no new runtime deps), bats-core for end-to-end tests.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** Plans 1, 2, 3, 4, 5. Plan 6 reuses Plan 2's `runAudit()`, Plan 3's `loadObservabilityConfig` (the `phase_audit` schema landed in Plan 3 already), Plan 5's `state` adapter `replayEvents()` (extended here), and the markdown/sidecar writers from Plan 4. It does not modify the `EngineOutput` shape.

**Subsequent plans:** Plan 7 — MMR `doc-conformance` channel + Lens H full-profile LLM checks. Plan 8 — `--fix` flow + worktree teardown.

---

## Pre-flight

```bash
test -f src/observability/engine/api.ts && \
  test -f src/observability/engine/replay.ts -o -f src/observability/engine/synthesizer.ts && \
  test -f src/observability/engine/stall.ts && \
  test -f src/observability/renderers/sidecar.ts && \
  test -f src/state/state-manager.ts && \
  test -f src/cli/commands/complete.ts && \
  echo "Plans 1-5 + StateManager + complete.ts present" || echo "missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-phase-triggers
cd ../scaffold-observability-phase-triggers
```

No new dependencies.

---

## File Structure

```
src/state/
  state-manager.ts                 (modify) StepEntry adds timestamps; markCompleted sets them; markInProgress added
  state-manager.test.ts            (modify) cover timestamp setting
  schema.ts                        (modify) StepEntry zod schema picks up new optional fields (or equivalent type)

src/cli/commands/
  complete.ts                      (modify) call markCompleted instead of saveState; print phase-audit result
  complete.test.ts                 (modify) cover the refactor + audit hook

src/observability/engine/
  phase-audit.ts                   phase-audit.test.ts                 (new) runPhaseAudit orchestrator
  phase-subsets.ts                 phase-subsets.test.ts               (new) step-slug → audit-context map (spec §3.9)

src/observability/adapters/
  state.ts                         (modify) replayEvents uses completed_at + in_progress_started_at when present
  state.test.ts                    (modify) cover the timestamp-based path

tests/observability/audit.bats     (modify) bats end-to-end for phase-boundary trigger
```

---

## Task 1: Extend `StepEntry` with timestamps + add `markInProgress`

**Files:**
- Modify: `src/state/state-manager.ts`
- Modify: `src/state/state-manager.test.ts`
- Modify: `src/state/schema.ts` (or wherever the StepEntry zod/type lives)

- [ ] **Step 1: Read the existing StateManager**

```bash
grep -n "markCompleted\|markSkipped\|StepEntry\|saveState" src/state/state-manager.ts | head -20
grep -n "StepEntry" src/state/schema.ts | head -10
```

Identify the exact `StepEntry` type/schema, the `markCompleted(step, outputs, completedBy, depth)` signature, and where step status is set elsewhere (look for `status: 'in_progress'` or similar).

- [ ] **Step 2: Append the failing test**

In `src/state/state-manager.test.ts`, append:

```typescript
import { StateManager } from './state-manager'   // adapt to actual export shape

describe('StateManager — step timestamps (Plan 6)', () => {
  it('markCompleted sets completed_at to an ISO timestamp', () => {
    const sm = new StateManager(/* construct per existing test pattern */)
    // bootstrap a step in pending state per existing test setup, then:
    const before = new Date().toISOString()
    sm.markCompleted('user-stories', ['docs/user-stories.md'], 'pipeline', 1 as never)
    const state = sm.readState()
    expect(state.steps['user-stories'].completed_at).toBeDefined()
    expect(state.steps['user-stories'].completed_at!).toBeGreaterThanOrEqual(before)
  })

  it('markInProgress(step) sets status=in_progress + in_progress_started_at', () => {
    const sm = new StateManager(/* bootstrap */)
    sm.markInProgress('tech-stack')
    const state = sm.readState()
    expect(state.steps['tech-stack'].status).toBe('in_progress')
    expect(state.steps['tech-stack'].in_progress_started_at).toBeDefined()
  })

  it('markCompleted does not regress an already-completed step (timestamps stay stable)', () => {
    const sm = new StateManager(/* bootstrap */)
    sm.markCompleted('user-stories', ['docs/user-stories.md'], 'pipeline', 1 as never)
    const firstTs = sm.readState().steps['user-stories'].completed_at
    // Wait a tick and re-mark
    return new Promise<void>((resolve) => setTimeout(() => {
      sm.markCompleted('user-stories', ['docs/user-stories.md'], 'pipeline', 1 as never)
      expect(sm.readState().steps['user-stories'].completed_at).toBe(firstTs)
      resolve()
    }, 10))
  })
})
```

(Adapt the bootstrap and any constructor/factory calls to match the actual existing test pattern in this file.)

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/state/state-manager.test.ts
```

Expected: FAIL — `markInProgress` not exported, `completed_at` not set.

- [ ] **Step 4: Update `StepEntry` type/schema**

In `src/state/schema.ts` (or the file where the StepEntry zod schema lives), add the two optional fields:

```typescript
export const StepEntrySchema = z.object({
  // ... existing fields (status, source, produces, etc.)
  completed_at: z.string().datetime().optional(),
  in_progress_started_at: z.string().datetime().optional(),
})
```

If the project uses plain TypeScript types instead of zod, add the fields to the `StepEntry` interface analogously.

- [ ] **Step 5: Update `markCompleted` to set `completed_at` and add `markInProgress`**

In `src/state/state-manager.ts`, locate `markCompleted` and change the body to set `completed_at` only when transitioning from a non-completed status (preserving the "no-regression" invariant):

```typescript
markCompleted(step: string, outputs: string[], completedBy: string, depth: DepthLevel): void {
  const entry = this.state.steps[step]
  if (!entry) {
    throw Object.assign(new Error(`Cannot mark unknown step '${step}' as completed`), { /* existing error props */ })
  }
  const wasCompleted = entry.status === 'completed'
  entry.status = 'completed'
  entry.source = 'pipeline'
  entry.produces = outputs
  entry.completed_by = completedBy   // if this field already exists
  entry.depth = depth                // if this field already exists
  if (!wasCompleted) {
    entry.completed_at = new Date().toISOString()
  }
  this.saveState(this.state)
}

markInProgress(step: string): void {
  const entry = this.state.steps[step]
  if (!entry) {
    throw Object.assign(new Error(`Cannot mark unknown step '${step}' as in_progress`), { code: 'UNKNOWN_STEP' })
  }
  if (entry.status === 'in_progress') return   // idempotent
  entry.status = 'in_progress'
  entry.in_progress_started_at = new Date().toISOString()
  this.saveState(this.state)
}
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
npx vitest run src/state/state-manager.test.ts
```

Expected: PASS, all StateManager tests including the 3 new ones.

- [ ] **Step 7: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts src/state/schema.ts
git commit -m "state: StepEntry adds completed_at + in_progress_started_at timestamps; markInProgress() added; markCompleted is no-regression-on-timestamp"
```

---

## Task 2: Phase-subset map (step-slug → audit-context)

The map only carries metadata (which step boundary triggered the audit, optional human label) — Plan 5's Lens H runs whichever sub-checks have the data they need, so the phase-aware behavior is a *consequence* of artifact availability, not a strict subset gate. We still keep an explicit map so the runtime knows which boundaries are scaffold-pipeline phase boundaries (versus arbitrary `markCompleted` calls).

**Files:**
- Create: `src/observability/engine/phase-subsets.ts`
- Create: `src/observability/engine/phase-subsets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/phase-subsets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PHASE_BOUNDARY_STEPS, isPhaseBoundary, phaseLabel } from './phase-subsets'

describe('phase-subsets', () => {
  it('isPhaseBoundary returns true for spec §3.9 boundary steps', () => {
    for (const slug of ['user-stories', 'tech-stack', 'coding-standards', 'design-system', 'implementation-plan', 'implementation-playbook']) {
      expect(isPhaseBoundary(slug), `slug: ${slug}`).toBe(true)
    }
  })

  it('isPhaseBoundary returns false for non-boundary steps', () => {
    expect(isPhaseBoundary('create-prd')).toBe(false)
    expect(isPhaseBoundary('arbitrary-step')).toBe(false)
  })

  it('PHASE_BOUNDARY_STEPS includes a label for each entry', () => {
    for (const slug of PHASE_BOUNDARY_STEPS) {
      expect(typeof phaseLabel(slug)).toBe('string')
      expect(phaseLabel(slug).length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/phase-subsets.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phase-subsets.ts`**

Create `src/observability/engine/phase-subsets.ts`:

```typescript
// Phase-boundary steps from spec §3.9. Each one triggers a phase-boundary audit
// when StateManager.markCompleted() is called for that slug. The actual sub-checks
// Lens H runs are determined by which planning artifacts exist at that moment;
// missing-input checks are no-ops, so we don't need to wire an explicit subset gate.

export const PHASE_BOUNDARY_STEPS = [
  'user-stories',
  'tech-stack',
  'coding-standards',
  'design-system',
  'implementation-plan',
  'implementation-playbook',
] as const

export type PhaseBoundaryStep = typeof PHASE_BOUNDARY_STEPS[number]

const PHASE_LABELS: Record<PhaseBoundaryStep, string> = {
  'user-stories': 'after user stories',
  'tech-stack': 'after tech stack',
  'coding-standards': 'after coding standards',
  'design-system': 'after design system',
  'implementation-plan': 'after implementation plan',
  'implementation-playbook': 'after implementation playbook',
}

export function isPhaseBoundary(slug: string): slug is PhaseBoundaryStep {
  return (PHASE_BOUNDARY_STEPS as readonly string[]).includes(slug)
}

export function phaseLabel(slug: PhaseBoundaryStep): string {
  return PHASE_LABELS[slug]
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/phase-subsets.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/phase-subsets.ts src/observability/engine/phase-subsets.test.ts
git commit -m "observability: phase-boundary step list (spec §3.9) + isPhaseBoundary helper"
```

---

## Task 3: `runPhaseAudit()` orchestrator

**Files:**
- Create: `src/observability/engine/phase-audit.ts`
- Create: `src/observability/engine/phase-audit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/phase-audit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runPhaseAudit } from './phase-audit'

describe('runPhaseAudit', () => {
  let proj: string

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-phase-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n`)
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('produces a phase-audit result with the count, sidecar path, and verdict', async () => {
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(true)
    expect(result.step).toBe('user-stories')
    expect(typeof result.findings_count).toBe('number')
    expect(typeof result.verdict).toBe('string')
    expect(result.markdown_path).toMatch(/docs\/audits\/audit-.*\.md$/)
    expect(result.sidecar_path).toMatch(/docs\/audits\/audit-.*\.json$/)
    expect(existsSync(join(proj, result.markdown_path))).toBe(true)
    expect(existsSync(join(proj, result.sidecar_path))).toBe(true)
  })

  it('returns ran=false when phase_audit.enabled=false in observability.yaml', async () => {
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  enabled: false\n')
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(false)
    expect(result.reason).toMatch(/disabled/i)
  })

  it('returns ran=false for steps that are not phase boundaries', async () => {
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'arbitrary-step' })
    expect(result.ran).toBe(false)
    expect(result.reason).toMatch(/not a phase boundary/i)
  })

  it('aborts and returns timed_out when the audit exceeds phase_audit.timeout_s', async () => {
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  timeout_s: 0\n')   // forces immediate timeout
    // Even though the audit would otherwise run quickly, timeout_s=0 forces the timeout race
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(true)
    expect(result.timed_out).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/phase-audit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phase-audit.ts`**

Create `src/observability/engine/phase-audit.ts`:

```typescript
import { join } from 'node:path'
import { runAudit } from './api'
import { writeSidecar, deriveReportId } from '../renderers/sidecar'
import { renderAuditMarkdown } from '../renderers/markdown'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isPhaseBoundary, phaseLabel } from './phase-subsets'
import { loadObservabilityConfig } from './checks/observability-config'

export interface RunPhaseAuditInput {
  primaryRoot: string
  step: string
  ghBin?: string
  bdBin?: string
}

export interface PhaseAuditResult {
  ran: boolean
  step: string
  reason?: string
  verdict?: 'pass' | 'degraded-pass' | 'blocked'
  findings_count?: number
  blocking_count?: number
  markdown_path?: string
  sidecar_path?: string
  timed_out?: boolean
  elapsed_ms?: number
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<{ value: T; timed_out: false } | { value: undefined; timed_out: true }> {
  if (ms <= 0) return Promise.resolve({ value: undefined, timed_out: true })
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ value: undefined, timed_out: true }), ms)
    promise.then((value) => {
      clearTimeout(timer)
      resolve({ value, timed_out: false })
    }).catch(() => {
      clearTimeout(timer)
      resolve({ value: undefined, timed_out: true })
    })
  })
}

export async function runPhaseAudit(input: RunPhaseAuditInput): Promise<PhaseAuditResult> {
  const config = loadObservabilityConfig(input.primaryRoot)
  if (!config.phase_audit.enabled) {
    return { ran: false, step: input.step, reason: 'phase_audit disabled in observability.yaml' }
  }
  if (!isPhaseBoundary(input.step)) {
    return { ran: false, step: input.step, reason: `${input.step} is not a phase boundary` }
  }

  const started = Date.now()
  const auditPromise = runAudit({
    primaryRoot: input.primaryRoot,
    profile: 'fast',
    scope: 'docs',
    sinceHours: 24,
    lensIds: ['H-cross-doc'],
    ghBin: input.ghBin,
    bdBin: input.bdBin,
    args: { triggered_by: 'phase-boundary', step: input.step, phase_label: phaseLabel(input.step) },
  })

  const raced = await timeout(auditPromise, config.phase_audit.timeout_s * 1000)
  if (raced.timed_out) {
    return { ran: true, step: input.step, timed_out: true, elapsed_ms: Date.now() - started, reason: `audit exceeded ${config.phase_audit.timeout_s}s budget` }
  }
  const out = raced.value!

  // Persist markdown + sidecar (same paths as a manual audit)
  const reportId = deriveReportId(out)
  const sidecarFinal = await writeSidecar(input.primaryRoot, out)
  const md = renderAuditMarkdown(out)
  const mdRel = `docs/audits/${reportId}.md`
  const mdAbs = join(input.primaryRoot, mdRel)
  mkdirSync(dirname(mdAbs), { recursive: true })
  writeFileSync(mdAbs, md, { mode: 0o644 })

  return {
    ran: true,
    step: input.step,
    verdict: out.verdict,
    findings_count: out.summary.total,
    blocking_count: out.summary.blocking,
    markdown_path: mdRel,
    sidecar_path: sidecarFinal.replace(`${input.primaryRoot}/`, ''),
    timed_out: false,
    elapsed_ms: Date.now() - started,
  }
}

export function formatPhaseAuditLine(r: PhaseAuditResult): string {
  if (!r.ran) return ''
  if (r.timed_out) return `[audit] timed out after ${r.elapsed_ms}ms — partial findings may not be written`
  return `[audit] ${r.findings_count} findings (${r.blocking_count ?? 0} blocking, verdict=${r.verdict}) — see ${r.markdown_path}`
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/phase-audit.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/phase-audit.ts src/observability/engine/phase-audit.test.ts
git commit -m "observability: runPhaseAudit() orchestrator (TS API call to runAudit; timeout race; markdown+sidecar write; formatPhaseAuditLine)"
```

---

## Task 4: Hook `runPhaseAudit` into `markCompleted`

**Files:**
- Modify: `src/state/state-manager.ts`
- Modify: `src/state/state-manager.test.ts`

The hook is async; we change `markCompleted`'s signature accordingly. Callers that don't care about the audit result can `void`-call it; callers that do (e.g., `complete.ts`) `await` it.

- [ ] **Step 1: Append the failing test**

In `src/state/state-manager.test.ts`, append (using dependency injection so the test does not depend on the project's runtime audit pipeline):

```typescript
import type { PhaseAuditResult } from '../observability/engine/phase-audit'

describe('StateManager.markCompleted — phase audit hook', () => {
  function bootstrapSm(): StateManager {
    // Reuse whatever bootstrap the file already uses for other markCompleted tests
    // (e.g., the constructor pattern + initial pending step). The hook tests below only
    // require that the SM has the 'user-stories' and 'create-prd' steps in 'pending' or 'in_progress'.
    return makeBootstrapped()
  }

  it('returns the phase-audit result when the step is a boundary', async () => {
    const sm = bootstrapSm()
    const stub = async (input: { primaryRoot: string; step: string }): Promise<PhaseAuditResult> => ({
      ran: true, step: input.step, verdict: 'pass', findings_count: 0, blocking_count: 0,
      markdown_path: 'docs/audits/audit-x.md', sidecar_path: 'docs/audits/audit-x.json', timed_out: false, elapsed_ms: 5,
    })
    sm.setPhaseAuditFn(stub)
    const result = await sm.markCompleted('user-stories', ['docs/user-stories.md'], 'pipeline', 1 as never)
    expect(result).toBeDefined()
    expect(result!.ran).toBe(true)
    expect(result!.verdict).toBe('pass')
  })

  it('returns ran=false from the hook for non-boundary steps', async () => {
    const sm = bootstrapSm()
    let called = false
    const stub = async (input: { primaryRoot: string; step: string }): Promise<PhaseAuditResult> => {
      called = true
      return { ran: false, step: input.step, reason: `${input.step} is not a phase boundary` }
    }
    sm.setPhaseAuditFn(stub)
    const result = await sm.markCompleted('create-prd', ['docs/plan.md'], 'pipeline', 1 as never)
    // The stub IS called; runPhaseAudit's own boundary check returns ran=false.
    expect(called).toBe(true)
    expect(result?.ran).toBe(false)
  })

  it('does not throw if runPhaseAudit fails internally; returns an error-shaped result', async () => {
    const sm = bootstrapSm()
    sm.setPhaseAuditFn(async () => { throw new Error('synthetic failure') })
    const result = await sm.markCompleted('user-stories', ['docs/user-stories.md'], 'pipeline', 1 as never)
    expect(result?.reason).toMatch(/synthetic failure/)
    // State transition still happened
    expect(sm.readState().steps['user-stories'].status).toBe('completed')
  })
})
```

`makeBootstrapped()` is the same helper the existing `state-manager.test.ts` uses for other `markCompleted` cases — reuse it directly. If the file uses a different convention (factory function, beforeEach, etc.), adopt it; the test bodies above only depend on `setPhaseAuditFn` and `readState()`, which Tasks 1 + 4 add.

- [ ] **Step 2: Update `markCompleted` signature**

Refactor `markCompleted` in `src/state/state-manager.ts` to be async and to invoke the hook. Add an optional injected `runPhaseAuditFn` for testability:

```typescript
import { runPhaseAudit, type PhaseAuditResult } from '../observability/engine/phase-audit'

// Allow injection so tests can stub the audit. Default uses the real runPhaseAudit.
private phaseAuditFn: typeof runPhaseAudit = runPhaseAudit

setPhaseAuditFn(fn: typeof runPhaseAudit): void {
  this.phaseAuditFn = fn
}

async markCompleted(step: string, outputs: string[], completedBy: string, depth: DepthLevel): Promise<PhaseAuditResult | undefined> {
  const entry = this.state.steps[step]
  if (!entry) {
    throw Object.assign(new Error(`Cannot mark unknown step '${step}' as completed`), { /* existing error props */ })
  }
  const wasCompleted = entry.status === 'completed'
  entry.status = 'completed'
  entry.source = 'pipeline'
  entry.produces = outputs
  entry.completed_by = completedBy
  entry.depth = depth
  if (!wasCompleted) entry.completed_at = new Date().toISOString()
  this.saveState(this.state)

  // Phase-boundary audit hook (foreground; non-gating; errors are caught and surfaced as a result)
  try {
    return await this.phaseAuditFn({ primaryRoot: this.cwd, step })
  } catch (err) {
    return { ran: true, step, reason: (err as Error).message, verdict: undefined, findings_count: undefined }
  }
}
```

(Adapt `this.cwd` to the actual property the StateManager holds; if the StateManager doesn't currently know its cwd, add a constructor parameter or a setter for it.)

- [ ] **Step 3: Run the tests to confirm they pass**

```bash
npx vitest run src/state/state-manager.test.ts
```

Expected: PASS — existing tests + the 3 new hook tests.

- [ ] **Step 4: Verify all callers of `markCompleted` are updated to await**

```bash
grep -rn "markCompleted" src/ tests/ packages/ 2>/dev/null | grep -v ".test.ts:" | grep -v "phase-audit"
```

Every result should either await the call (in async contexts) or use `void sm.markCompleted(...)` (when ignoring the audit result). Update each call site.

- [ ] **Step 5: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts
git commit -m "state: markCompleted is async + invokes runPhaseAudit hook (catches errors; non-gating)"
```

---

## Task 5: Refactor `scaffold complete` CLI to call `markCompleted`

**Files:**
- Modify: `src/cli/commands/complete.ts`
- Modify: `src/cli/commands/complete.test.ts`

- [ ] **Step 1: Read the current `complete.ts`**

```bash
sed -n '140,170p' src/cli/commands/complete.ts
```

Identify the line where `stateManager.saveState(state)` is called (the bypass that Plan 2's MMR review flagged). Confirm what data is being mutated on `state.steps[step]` before the save.

- [ ] **Step 2: Append the failing test**

In `src/cli/commands/complete.test.ts`, append:

```typescript
describe('scaffold complete — Plan 6', () => {
  it('routes through StateManager.markCompleted (no direct saveState call)', async () => {
    // Spy on saveState and markCompleted; run the complete command on a phase-boundary step;
    // assert markCompleted was called and saveState was NOT called directly from complete.ts.
  })

  it('prints a [audit] line with the findings count and report path', async () => {
    // Capture stdout; run complete on user-stories; assert output contains "[audit]" and a docs/audits/ path.
  })

  it('still completes the step transition when phase audit fails', async () => {
    // Inject a phase-audit that throws; assert state is still marked completed
    // and the [audit] line surfaces the error message.
  })
})
```

(Adapt to the existing test pattern.)

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
npx vitest run src/cli/commands/complete.test.ts
```

Expected: FAIL — `complete.ts` still bypasses markCompleted.

- [ ] **Step 4: Refactor `complete.ts`**

Replace the direct `saveState(state)` call with a `markCompleted` call. Indicative shape:

```typescript
import { formatPhaseAuditLine } from '../../observability/engine/phase-audit'

// inside the existing handler, where the original was:
//   stateManager.saveState(state)
// replace with:

const auditResult = await stateManager.markCompleted(step, outputs, completedBy, depth)
const auditLine = auditResult ? formatPhaseAuditLine(auditResult) : ''
if (auditLine) process.stdout.write(auditLine + '\n')
```

If the original `complete.ts` mutated other state fields besides what `markCompleted` already sets, move that logic into a small helper inside `complete.ts` that runs *after* `markCompleted` (preserving the same final on-disk shape).

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
npx vitest run src/cli/commands/complete.test.ts
```

Expected: PASS, all complete-command tests.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/complete.ts src/cli/commands/complete.test.ts
git commit -m "cli: scaffold complete routes through StateManager.markCompleted; surfaces [audit] line"
```

---

## Task 6: State adapter — use real per-step timestamps

**Files:**
- Modify: `src/observability/adapters/state.ts`
- Modify: `src/observability/adapters/state.test.ts`

- [ ] **Step 1: Append the failing test**

In `src/observability/adapters/state.test.ts`, append:

```typescript
describe('state adapter — replayEvents with real timestamps', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-st-rt-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('uses StepEntry.completed_at for step_completed events when available', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: {
        'user-stories': { status: 'completed', source: 'pipeline', completed_at: '2026-05-04T10:30:00Z' },
        'tech-stack':   { status: 'in_progress', source: 'pipeline', in_progress_started_at: '2026-05-04T13:45:00Z' },
        'coding-standards': { status: 'pending', source: 'pipeline' },
      },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 })
    const completed = events.find((e) => e.kind === 'step_completed')
    const inProgress = events.find((e) => e.kind === 'step_in_progress')
    expect(completed?.ts).toBe('2026-05-04T10:30:00Z')
    expect(inProgress?.ts).toBe('2026-05-04T13:45:00Z')
  })

  it('falls back to file mtime when timestamps are absent', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: { 'user-stories': { status: 'completed', source: 'pipeline' } },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events).toHaveLength(1)
    // mtime is a recent ISO string; just assert it's well-formed
    expect(events[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: FAIL — adapter still uses mtime universally.

- [ ] **Step 3: Update `replayEvents` to prefer real timestamps**

In `src/observability/adapters/state.ts`, replace the `replayEvents` body:

```typescript
async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
  const path = join(cwd, ROOT_STATE)
  if (!existsSync(path)) return []
  const fallbackTs = statSync(path).mtime.toISOString()
  const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
  const merged = await stateAdapter.readMergedState(cwd)
  const out: ReplayEvent[] = []
  for (const [slug, entry] of Object.entries(merged.steps)) {
    if (entry.status !== 'completed' && entry.status !== 'in_progress') continue
    const ts = entry.status === 'completed'
      ? (entry.completed_at ?? fallbackTs)
      : (entry.in_progress_started_at ?? fallbackTs)
    if (ts < cutoff) continue
    const kind = entry.status === 'completed' ? 'step_completed' : 'step_in_progress'
    out.push({
      sort_id: `state:${slug}:${entry.status}`,
      correlation_id: null,
      ts,
      source: 'state', kind,
      summary: `pipeline step ${slug} → ${entry.status}`,
    })
  }
  return out
}
```

Add `completed_at?: string; in_progress_started_at?: string` to the local `StepEntry` type if the adapter has its own copy.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: PASS, all state adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/state.ts src/observability/adapters/state.test.ts
git commit -m "observability: state adapter uses real completed_at / in_progress_started_at timestamps; mtime is fallback"
```

---

## Task 7: Detached mode (`phase_audit.detached: true`)

When detached, `markCompleted` should fire-and-forget the phase audit so the CLI returns to the user immediately. The audit still runs to completion in the background and writes the markdown + sidecar; the `[audit] dispatched` line is printed instead of `[audit] N findings`.

**Files:**
- Modify: `src/observability/engine/phase-audit.ts`
- Modify: `src/observability/engine/phase-audit.test.ts`

- [ ] **Step 1: Append the failing test**

```typescript
it('returns immediately with detached=true when phase_audit.detached=true', async () => {
  mkdirSync(join(proj, '.scaffold'), { recursive: true })
  writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  detached: true\n')
  const start = Date.now()
  const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
  const elapsed = Date.now() - start
  expect(result.ran).toBe(true)
  expect(result.detached).toBe(true)
  expect(elapsed).toBeLessThan(500)  // returned immediately, didn't wait for audit
})

it('formatPhaseAuditLine prints "[audit] dispatched" for detached results', () => {
  const line = formatPhaseAuditLine({ ran: true, step: 'user-stories', detached: true })
  expect(line).toMatch(/dispatched/i)
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/phase-audit.test.ts
```

Expected: FAIL — `detached` not yet honored.

- [ ] **Step 3: Add detached branch**

Update `runPhaseAudit` and `formatPhaseAuditLine`:

```typescript
export interface PhaseAuditResult {
  // ... existing fields
  detached?: boolean
}

// Inside runPhaseAudit, immediately after the enabled + boundary checks and before the audit invocation:
if (config.phase_audit.detached) {
  // Fire-and-forget the audit. Errors are swallowed (logged via stderr if PHASE_AUDIT_DEBUG=1).
  void runAudit({ /* same args */ }).then(async (out) => {
    try {
      const reportId = deriveReportId(out)
      await writeSidecar(input.primaryRoot, out)
      const md = renderAuditMarkdown(out)
      const mdAbs = join(input.primaryRoot, `docs/audits/${reportId}.md`)
      mkdirSync(dirname(mdAbs), { recursive: true })
      writeFileSync(mdAbs, md, { mode: 0o644 })
    } catch (err) {
      if (process.env.PHASE_AUDIT_DEBUG === '1') process.stderr.write(`detached phase-audit failed: ${(err as Error).message}\n`)
    }
  })
  return { ran: true, step: input.step, detached: true, elapsed_ms: 0 }
}

// formatPhaseAuditLine:
export function formatPhaseAuditLine(r: PhaseAuditResult): string {
  if (!r.ran) return ''
  if (r.detached) return `[audit] dispatched in background (step: ${r.step})`
  if (r.timed_out) return `[audit] timed out after ${r.elapsed_ms}ms — partial findings may not be written`
  return `[audit] ${r.findings_count} findings (${r.blocking_count ?? 0} blocking, verdict=${r.verdict}) — see ${r.markdown_path}`
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/phase-audit.test.ts
```

Expected: PASS, all phase-audit tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/phase-audit.ts src/observability/engine/phase-audit.test.ts
git commit -m "observability: runPhaseAudit honors phase_audit.detached (fire-and-forget; CLI returns immediately)"
```

---

## Task 8: Bats end-to-end — `scaffold complete` triggers a phase audit

**Files:**
- Modify: `tests/observability/audit.bats`

- [ ] **Step 1: Append cases**

Append to `tests/observability/audit.bats`:

```bash
@test "scaffold complete user-stories triggers a phase audit and prints the [audit] line" {
    # Bootstrap a project where the user-stories step exists in state.json
    cat > .scaffold/state.json <<'EOF'
{
  "version": "1.0",
  "methodology": "deep",
  "steps": {
    "create-prd":   { "status": "completed",  "source": "pipeline" },
    "user-stories": { "status": "in_progress","source": "pipeline" }
  }
}
EOF
    cat > docs/plan.md <<'EOF'
# PRD
## Features
### F [priority: must]
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF

    run $BIN complete user-stories
    [ "$status" -eq 0 ]
    [[ "$output" == *"[audit]"* ]]
    [[ "$output" == *"docs/audits/audit-"* ]]

    # The audit produced a sidecar
    json="$(ls docs/audits/audit-*.json | head -1)"
    [ -n "$json" ]
    grep -q '"engine_output"' "$json"
}

@test "scaffold complete create-prd does NOT trigger a phase audit (not a boundary step)" {
    cat > .scaffold/state.json <<'EOF'
{
  "version": "1.0",
  "methodology": "deep",
  "steps": { "create-prd": { "status": "in_progress", "source": "pipeline" } }
}
EOF
    cat > docs/plan.md <<'EOF'
# PRD
EOF
    run $BIN complete create-prd
    [ "$status" -eq 0 ]
    # No [audit] line because create-prd is not in PHASE_BOUNDARY_STEPS
    if echo "$output" | grep -q "\\[audit\\]"; then
        echo "Unexpected [audit] line: $output"
        false
    fi
}

@test "phase_audit.enabled=false suppresses the trigger" {
    cat > .scaffold/state.json <<'EOF'
{
  "version": "1.0",
  "methodology": "deep",
  "steps": { "user-stories": { "status": "in_progress", "source": "pipeline" } }
}
EOF
    cat > docs/plan.md <<'EOF'
# PRD
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF
    cat > .scaffold/observability.yaml <<'EOF'
phase_audit:
  enabled: false
EOF
    run $BIN complete user-stories
    [ "$status" -eq 0 ]
    if echo "$output" | grep -q "\\[audit\\]"; then
        echo "Unexpected [audit] line when disabled: $output"
        false
    fi
}
```

(The setup function from Plan 1 already creates `.scaffold/identity.json` and `package.json`. The cases above add their own `.scaffold/state.json` and docs.)

- [ ] **Step 2: Run the bats suite**

```bash
npm run build && bats tests/observability/audit.bats
```

Expected: PASS — all original cases + 3 new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/audit.bats
git commit -m "observability: bats end-to-end for scaffold complete phase-audit trigger (boundary, non-boundary, disabled)"
```

---

## Task 9: `make check-all` and CLAUDE.md update

- [ ] **Step 1: Run the gate**

```bash
make check-all
```

Common Plan 6 issues:
- Tests in `state-manager.test.ts` failing because of cwd assumptions in `runPhaseAudit` — pass an explicit `cwd` via the new constructor parameter rather than relying on `process.cwd()`.
- Some callers of `markCompleted` not updated to await — use `grep -rn "markCompleted" src/ tests/ packages/` and fix each.
- Coverage drop in the detached branch of `phase-audit.ts` — Vitest can't easily await fire-and-forget; cover via a synchronous branch test that asserts the function returns immediately, then a separate test that mocks `runAudit` to verify side effects with a small `setTimeout`.

- [ ] **Step 2: Update CLAUDE.md**

Append to the existing observability paragraph (last edited by Plan 5):

> Plan 6 ships phase-boundary triggers: `StateManager.markCompleted()` invokes `runPhaseAudit(step)` after every state transition for the spec §3.9 boundary steps (user-stories, tech-stack, coding-standards, design-system, implementation-plan, implementation-playbook). The audit runs Lens H against existing planning artifacts, persists markdown + sidecar to `docs/audits/`, and surfaces `[audit] N findings — see <path>` at the end of the calling command's output. Configurable via `.scaffold/observability.yaml` `phase_audit.enabled | timeout_s | detached`. `scaffold complete` is refactored to route through `markCompleted` so every completion path triggers the hook. The `state` adapter now uses real per-step `completed_at` / `in_progress_started_at` timestamps when present.

(No new top-level commands in this plan — the trigger is automatic.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Plan 6 — phase-boundary triggers via StateManager.markCompleted"
```

---

## Task 10: Self-review the plan against the spec

- [ ] **Step 1: Spec coverage matrix**

| Spec section | Implemented in |
|---|---|
| StepEntry timestamps for completed + in_progress (§5.2 — implied; needed for state adapter replay accuracy) | Task 1 |
| Centralize completion through StateManager.markCompleted (§5.2) | Tasks 1, 5 |
| Phase-boundary step list (§3.9) | Task 2 |
| runPhaseAudit() TS API; non-shell-out (§5.2) | Task 3 |
| time-capped foreground; configurable timeout_s (§5.2 phase_audit.timeout_s) | Task 3 |
| markdown + sidecar persistence (§5.2 reuses Plan 4 paths) | Task 3 |
| markCompleted async hook into runPhaseAudit (§5.2) | Task 4 |
| Non-gating: state already transitioned before audit (§5.2) | Task 4 |
| `[audit] N findings` surfacing line at end of CLI output (§5.2) | Tasks 3 (formatPhaseAuditLine) + 5 (complete.ts) |
| State adapter uses real timestamps (Plan 5 deferral) | Task 6 |
| phase_audit.detached fire-and-forget (§5.2) | Task 7 |
| Bats end-to-end coverage (§6.3) | Task 8 |
| Quality gate + docs (§6.8) | Task 9 |

- [ ] **Step 2: Out-of-scope confirmations**

| Deferred capability | Plan |
|---|---|
| MMR `doc-conformance` channel | Plan 7 |
| Lens H full-profile prose checks (LLM-graded) | Plan 7 |
| `--fix` flow + worktree teardown | Plan 8 |

- [ ] **Step 3: Type consistency final check**

```bash
grep -E '^export (type|interface) ' src/observability/engine/types.ts | sort | uniq -c | sort -rn | head -20
npx tsc --noEmit
```

Expected: no duplicate exports; tsc clean. Plan 6's only type changes are in `src/state/schema.ts` (StepEntry timestamps) and the new `phase-audit.ts` (`PhaseAuditResult`).

- [ ] **Step 4: Mark Plan 6 complete**

```bash
git add docs/superpowers/plans/2026-05-04-build-observability-phase-triggers.md
git commit -m "plans: build-observability phase triggers — final self-review pass" --allow-empty
```

---

## Plan 6 — Self-review (built into the plan)

**Spec coverage:** every Plan-6-scoped requirement maps to a task. Phase-boundary triggers are wired through the spec's exact mechanism (`StateManager.markCompleted()` post-state-write hook, time-capped foreground execution with `phase_audit.detached: true` opt-in, non-gating semantics, `[audit]` surfacing line). The `complete.ts` refactor flagged by Plan 2's MMR review is fixed.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present. Test step bodies that say "Adapt to existing test pattern" point to a concrete pattern in the file being modified, not to a placeholder.

**Type consistency:**
- `PhaseAuditResult` type added in Task 3 is used unchanged in Tasks 4, 5, 7.
- `StepEntry.completed_at` / `in_progress_started_at` (Task 1) are read by Task 6's adapter and produced by Task 1's StateManager updates.
- `runAudit` reused unchanged from Plan 2; `runPhaseAudit` is a thin wrapper.
- `EngineOutput` shape unchanged.

**Scope:** Plan 6 ships the operational integration that closes the phase-trigger loop. Plans 1+2+3+4+5+6 produce a complete observability layer with automatic phase-boundary audits and full timeline + stall + replay surfaces. Plan 7 (MMR channel + LLM checks) and Plan 8 (--fix flow) remain.

---

**Plan 6 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-phase-triggers.md`.**

After Plans 1–6 the audit feature is automatically triggered at every pipeline-phase boundary, surfaced inline at command completion, and persisted with timestamped trend data. Plans 7–8 add:
- Plan 7 — MMR `doc-conformance` channel + Lens H full-profile LLM-graded prose checks.
- Plan 8 — `--fix` flow + worktree teardown script.

**Three execution options for Plans 1–6:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all six plans (~120 tasks total).
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.
3. **Pause and write Plans 7–8 first** — full design committed before any code lands.

Which approach?
