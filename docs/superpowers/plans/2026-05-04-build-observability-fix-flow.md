# Build Observability — Fix Flow + Worktree Teardown (Plan 8 of N · final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the final two pieces of the build-observability feature. (1) The `--fix` flow on `scaffold observe audit` dispatches a configurable agent to fix above-threshold findings one at a time, verifies each fix by re-running the relevant lens, and writes a post-fix report — with abort-safe staging and a per-finding 3-retry limit. (2) `scripts/teardown-agent-worktree.sh` partners with Plan 1's setup script: it harvests the worktree's ledger to the central archive, removes the worktree, and optionally cleans up the workspace branch. `scaffold observe harvest --recover` scans for stale active-archive entries when worktrees were deleted without going through the script.

**Architecture:** Five phases per spec §5.4. (1) **Audit** — produces the initial `EngineOutput`; reused unchanged from Plan 2. (2) **Plan** — `buildFixPlan(findings, fixThreshold)` filters and orders blocking findings (severity rank ≤ threshold, status === open, ordered P0 → P3 then by lens_id). (3) **Dispatch** — for each finding, `dispatchFixAgent({ prompt, command, timeoutMs })` runs the configurable subprocess (`fix.dispatcher_command`, default `claude -p`); the agent edits files and exits. (4) **Verify** — re-run the *single* lens that produced this finding; if `finding.id` is absent from the new findings, accept; else retry up to 2 more times (3 total per finding). (5) **Final report** — fresh full audit produces `…-postfix.md` + sidecar. Abort safety: pre-flight `git stash create` snapshot + per-path index tracking; on SIGINT, `git restore --staged --worktree` only the paths *this* run staged, then re-apply the stash if the working tree differs. **Worktree teardown:** new shell script reads branch via `git branch --show-current`, calls `scaffold observe harvest`, runs `git worktree remove`, optionally deletes the branch if it's not checked out elsewhere. `harvest --recover` enumerates active-archive entries whose worktree paths no longer exist and rotates them to the dated archive.

**Tech Stack:** TypeScript (vitest, no new runtime deps), bats-core for end-to-end tests of the fix flow + teardown.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** Plans 1-7. Plan 8 reuses Plan 2's `runAudit()`, Plan 3's `runChecks` (single-lens invocation for verification), Plan 7's LLM-dispatcher pattern (separate `dispatchFixAgent` because fix dispatch doesn't parse JSON — it waits for exit code), Plan 1's `harvestWorktree`, and Plan 4's markdown/sidecar writers.

**Subsequent plans:** None — Plan 8 is the final plan in the build-observability series.

---

## Pre-flight

```bash
test -f src/observability/engine/api.ts && \
  test -f src/observability/engine/llm-dispatcher.ts && \
  test -f src/observability/engine/harvester.ts && \
  test -f src/observability/renderers/sidecar.ts && \
  test -x scripts/setup-agent-worktree.sh && \
  echo "Plans 1-7 present" || echo "missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-fix-flow
cd ../scaffold-observability-fix-flow
```

No new dependencies.

---

## File Structure

```
src/observability/engine/
  fix-plan.ts                   fix-plan.test.ts                (new) buildFixPlan ordering + filter
  fix-agent-dispatcher.ts       fix-agent-dispatcher.test.ts    (new) subprocess wrapper for fix agents (waits for exit)
  fix-flow.ts                   fix-flow.test.ts                (new) runFixFlow orchestrator (5 phases + abort)
  abort-snapshot.ts             abort-snapshot.test.ts          (new) git stash + index tracking + restore

src/observability/engine/checks/observability-config.ts
                                                               (modify) add `fix.dispatcher_command` + `fix.timeout_s`

src/cli/commands/observe.ts
                                                               (modify) handleAudit honors --fix; SIGINT trap
src/cli/index.ts                                               (modify) --fix already exists in CLI from Plan 2
                                                                         (verify wiring — no new flag)

src/observability/engine/api.ts                                (modify) export single-lens runAudit helper for verification

src/observability/adapters/
  audit-history.ts                                             (no change)
  state.ts                                                     (no change)

scripts/
  teardown-agent-worktree.sh                                   (new)
  teardown-agent-worktree.bats                                 (new) bats coverage for teardown script

src/cli/commands/observe.ts                                    (modify) handleHarvest gains --recover branch
src/observability/engine/harvester.ts                          (modify) recoverStaleArchives() helper

tests/observability/audit.bats                                 (modify) bats coverage for --fix flow
```

---

## Task 1: `buildFixPlan` — order blocking findings for fix dispatch

**Files:**
- Create: `src/observability/engine/fix-plan.ts`
- Create: `src/observability/engine/fix-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/fix-plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildFixPlan } from './fix-plan'
import type { Finding } from './types'

function f(id: string, severity: Finding['severity'], lens_id: string, status: Finding['status'] = 'open'): Finding {
  return {
    id, lens_id, severity,
    title: '', description: '', source_doc: '',
    evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' },
    confidence: 'high', first_seen: '', last_seen: '', status,
  }
}

describe('buildFixPlan', () => {
  it('includes blocking open findings (severityRank <= threshold)', () => {
    const findings = [
      f('a', 'P0', 'A-tdd'),
      f('b', 'P1', 'B-ac-coverage'),
      f('c', 'P2', 'C-standards'),
      f('d', 'P3', 'D-stack'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders by severity (P0 first), tiebreak by lens_id', () => {
    const findings = [
      f('z-p1', 'P1', 'Z-zzz'),
      f('a-p1', 'P1', 'A-tdd'),
      f('a-p0', 'P0', 'A-tdd'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['a-p0', 'a-p1', 'z-p1'])
  })

  it('excludes acknowledged + skipped findings', () => {
    const findings = [
      f('a', 'P0', 'A-tdd', 'acknowledged'),
      f('b', 'P1', 'B-ac-coverage', 'skipped'),
      f('c', 'P2', 'C-standards', 'open'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['c'])
  })

  it('returns [] when no blocking findings exist', () => {
    expect(buildFixPlan([f('x', 'P3', 'X')], 'P2')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/fix-plan.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fix-plan.ts`**

Create `src/observability/engine/fix-plan.ts`:

```typescript
import type { Finding, Severity } from './types'
import { severityRank } from './types'

export function buildFixPlan(findings: Finding[], fixThreshold: Severity): Finding[] {
  const thresholdRank = severityRank(fixThreshold)
  return findings
    .filter((f) => f.status === 'open' && severityRank(f.severity) <= thresholdRank)
    .sort((a, b) => {
      const sevDiff = severityRank(a.severity) - severityRank(b.severity)
      if (sevDiff !== 0) return sevDiff
      return a.lens_id < b.lens_id ? -1 : a.lens_id > b.lens_id ? 1 : 0
    })
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/fix-plan.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/fix-plan.ts src/observability/engine/fix-plan.test.ts
git commit -m "observability: buildFixPlan (blocking + open + ordered by severity then lens_id)"
```

---

## Task 2: `dispatchFixAgent` — subprocess wrapper for fix agents

Unlike Plan 7's `dispatchLlm` (which parses JSON), the fix-agent dispatcher waits for exit code only. The agent's job is to edit files and exit; verification happens by re-running the lens.

**Files:**
- Create: `src/observability/engine/fix-agent-dispatcher.ts`
- Create: `src/observability/engine/fix-agent-dispatcher.test.ts`
- Modify: `src/observability/engine/checks/observability-config.ts` (add `fix.dispatcher_command` + `fix.timeout_s`)

- [ ] **Step 1: Extend the config**

In `src/observability/engine/checks/observability-config.ts`:

```typescript
export interface FixConfig {
  dispatcher_command?: string  // default: "claude -p"
  timeout_s?: number           // default: 300 (5 min per finding)
  per_finding_max_attempts?: number  // default: 3
}

export interface ObservabilityConfig {
  // ... existing fields
  fix: FixConfig
}

export const DEFAULT_CONFIG: ObservabilityConfig = {
  // ... existing fields
  fix: { dispatcher_command: 'claude -p', timeout_s: 300, per_finding_max_attempts: 3 },
}
```

- [ ] **Step 2: Write the failing test**

Create `src/observability/engine/fix-agent-dispatcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dispatchFixAgent } from './fix-agent-dispatcher'

describe('dispatchFixAgent', () => {
  it('returns ok=true when subprocess exits 0', async () => {
    const result = await dispatchFixAgent({
      prompt: 'edit something',
      command: 'sh -c "cat >/dev/null; exit 0"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when subprocess exits non-zero', async () => {
    const result = await dispatchFixAgent({
      prompt: 'edit something',
      command: 'sh -c "cat >/dev/null; exit 1"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.exit_code).toBe(1)
    }
  })

  it('returns ok=false with timeout when subprocess exceeds timeoutMs', async () => {
    const result = await dispatchFixAgent({
      prompt: 'long task',
      command: 'sh -c "sleep 5"',
      timeoutMs: 100,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.timed_out).toBe(true)
  })

  it('passes the prompt to subprocess stdin', async () => {
    // The subprocess writes stdin to a known file we can read back
    const tmpfile = '/tmp/observe-fix-test-' + Date.now()
    const result = await dispatchFixAgent({
      prompt: 'EXPECTED-PROMPT',
      command: `sh -c "cat > ${tmpfile}"`,
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    const { readFileSync, unlinkSync } = await import('node:fs')
    expect(readFileSync(tmpfile, 'utf8')).toBe('EXPECTED-PROMPT')
    unlinkSync(tmpfile)
  })

  it('returns ok=false with reason ENOENT when binary is missing', async () => {
    const result = await dispatchFixAgent({
      prompt: '', command: '/no/such/binary', timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ENOENT|not found|spawn/i)
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/fix-agent-dispatcher.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `fix-agent-dispatcher.ts`**

Create `src/observability/engine/fix-agent-dispatcher.ts`:

```typescript
import { spawn } from 'node:child_process'

export interface DispatchFixInput {
  prompt: string
  command: string
  timeoutMs: number
  cwd?: string
}

export type DispatchFixResult =
  | { ok: true; exit_code: 0; elapsed_ms: number }
  | { ok: false; reason: string; exit_code?: number; timed_out?: boolean; elapsed_ms?: number }

function parseShell(cmd: string): string[] {
  return cmd.trim().split(/\s+/)
}

export function dispatchFixAgent(input: DispatchFixInput): Promise<DispatchFixResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const [bin, ...args] = parseShell(input.command)
    let child
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'inherit', 'inherit'], cwd: input.cwd })
    } catch (err) {
      resolve({ ok: false, reason: `spawn failed: ${(err as Error).message}` })
      return
    }

    let resolved = false
    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      resolve({ ok: false, reason: `timed out after ${input.timeoutMs}ms`, timed_out: true, elapsed_ms: Date.now() - started })
    }, input.timeoutMs)

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const code = err.code ?? 'unknown'
      resolve({ ok: false, reason: `subprocess error (${code}): ${err.message}`, elapsed_ms: Date.now() - started })
    })

    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const elapsed = Date.now() - started
      if (code === 0) resolve({ ok: true, exit_code: 0, elapsed_ms: elapsed })
      else resolve({ ok: false, reason: `subprocess exit ${code}`, exit_code: code ?? -1, elapsed_ms: elapsed })
    })

    try {
      child.stdin?.write(input.prompt)
      child.stdin?.end()
    } catch (err) {
      resolved = true
      clearTimeout(timer)
      resolve({ ok: false, reason: `stdin write failed: ${(err as Error).message}` })
    }
  })
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/fix-agent-dispatcher.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/observability/engine/fix-agent-dispatcher.ts src/observability/engine/fix-agent-dispatcher.test.ts src/observability/engine/checks/observability-config.ts
git commit -m "observability: dispatchFixAgent (subprocess wrapper waits for exit code; stdout/stderr inherited so user sees live output)"
```

---

## Task 3: Abort snapshot — pre-flight stash + index tracking

**Files:**
- Create: `src/observability/engine/abort-snapshot.ts`
- Create: `src/observability/engine/abort-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/abort-snapshot.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureSnapshot, restoreSnapshot, recordStaged } from './abort-snapshot'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('abort-snapshot', () => {
  let proj: string

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-abort-'))
    git(proj, ['init', '-q'])
    git(proj, ['config', 'user.email', 't@e.com'])
    git(proj, ['config', 'user.name', 'T'])
    writeFileSync(join(proj, 'a.txt'), 'original\n')
    git(proj, ['add', 'a.txt'])
    git(proj, ['commit', '-q', '-m', 'initial'])
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('captureSnapshot records a stash hash even when working tree is clean', () => {
    const snap = captureSnapshot(proj)
    expect(typeof snap.stash_sha).toBe('string')   // empty string when nothing to stash, or sha when there's WIP
    expect(snap.staged_paths).toEqual([])
    expect(snap.cwd).toBe(proj)
  })

  it('restoreSnapshot un-stages only the paths recorded by recordStaged', () => {
    const snap = captureSnapshot(proj)
    // User had `b.txt` already staged before the fix flow
    writeFileSync(join(proj, 'b.txt'), 'pre-existing-stage\n')
    git(proj, ['add', 'b.txt'])
    // Fix flow stages a NEW path
    writeFileSync(join(proj, 'fixed.txt'), 'fix\n')
    git(proj, ['add', 'fixed.txt'])
    recordStaged(snap, ['fixed.txt'])

    restoreSnapshot(snap)

    // fixed.txt is unstaged + worktree-restored
    expect(existsSync(join(proj, 'fixed.txt'))).toBe(false)
    // b.txt remains staged (user's pre-existing work)
    const status = git(proj, ['status', '--short'])
    expect(status).toMatch(/^A  b\.txt/m)
  })

  it('restoreSnapshot is idempotent', () => {
    const snap = captureSnapshot(proj)
    writeFileSync(join(proj, 'fixed.txt'), 'fix\n')
    git(proj, ['add', 'fixed.txt'])
    recordStaged(snap, ['fixed.txt'])
    restoreSnapshot(snap)
    restoreSnapshot(snap)   // second call should not throw
    expect(existsSync(join(proj, 'fixed.txt'))).toBe(false)
  })

  it('captureSnapshot includes WIP edits in stash so they can be re-applied', () => {
    writeFileSync(join(proj, 'a.txt'), 'WIP modification\n')
    const snap = captureSnapshot(proj)
    expect(snap.stash_sha.length).toBeGreaterThan(0)

    // Fix flow makes its own edit on top
    writeFileSync(join(proj, 'a.txt'), 'fix-edit\n')
    git(proj, ['add', 'a.txt'])
    recordStaged(snap, ['a.txt'])

    restoreSnapshot(snap)

    // After restore, the WIP edit should be present (not the fix edit, not the original)
    expect(readFileSync(join(proj, 'a.txt'), 'utf8')).toBe('WIP modification\n')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/abort-snapshot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `abort-snapshot.ts`**

Create `src/observability/engine/abort-snapshot.ts`:

```typescript
import { execFileSync } from 'node:child_process'

export interface AbortSnapshot {
  cwd: string
  stash_sha: string         // empty string when working tree was clean
  pre_existing_staged: string[]  // paths the user had staged before the fix flow started
  staged_paths: Set<string>      // mutable — paths the fix flow staged
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' })
  } catch (err) {
    return ''   // best-effort; abort restoration shouldn't itself throw
  }
}

export function captureSnapshot(cwd: string): AbortSnapshot {
  const preExistingStaged = git(cwd, ['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean)
  // `git stash create` makes a stash commit without applying or pushing it onto the stash list
  const stashSha = git(cwd, ['stash', 'create']).trim()
  return {
    cwd,
    stash_sha: stashSha,
    pre_existing_staged: preExistingStaged,
    staged_paths: new Set(),
  }
}

export function recordStaged(snap: AbortSnapshot, paths: string[]): void {
  for (const p of paths) {
    if (snap.pre_existing_staged.includes(p)) continue   // user had this staged already; don't track for restore
    snap.staged_paths.add(p)
  }
}

export function restoreSnapshot(snap: AbortSnapshot): void {
  // Step 1: unstage + revert worktree for every path the fix flow staged
  for (const path of snap.staged_paths) {
    git(snap.cwd, ['restore', '--staged', '--worktree', path])
  }
  snap.staged_paths.clear()

  // Step 2: if there was WIP, apply the snapshot stash to restore it
  if (snap.stash_sha) {
    git(snap.cwd, ['stash', 'apply', snap.stash_sha])
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/abort-snapshot.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/abort-snapshot.ts src/observability/engine/abort-snapshot.test.ts
git commit -m "observability: abort-snapshot (git stash create + per-path index tracking; WIP-safe restore)"
```

---

## Task 4: `runFixFlow` orchestrator — five phases

**Files:**
- Create: `src/observability/engine/fix-flow.ts`
- Create: `src/observability/engine/fix-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/fix-flow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runFixFlow } from './fix-flow'
import type { EngineOutput, Finding } from './types'

function f(id: string, severity: Finding['severity'], lens_id: string): Finding {
  return {
    id, lens_id, severity,
    title: `${lens_id} finding`, description: 'd', source_doc: '',
    evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' },
    confidence: 'high', first_seen: '', last_seen: '', status: 'open',
    fix_hint: { kind: 'edit_doc', target: 'docs/x.md', prompt: 'fix it' },
  }
}

describe('runFixFlow', () => {
  let proj: string
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-fix-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'), '## Story s-1: T [priority: must]\n')
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
    execSync('git add . && git commit -q -m initial', { cwd: proj, shell: '/bin/sh' })
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('fixes a finding when the agent succeeds and verification passes', async () => {
    let attemptedFor: string[] = []
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async (_proj: string, finding: Finding) => {
      attemptedFor.push(finding.id)
      return { stillPresent: false }   // verification: finding gone
    })

    const initial: EngineOutput = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.fixed).toEqual(['a'])
    expect(result.failed).toEqual([])
    expect(stubDispatcher).toHaveBeenCalledTimes(1)
    expect(attemptedFor).toEqual(['a'])
  })

  it('retries up to 3 times per finding before declaring failure', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    let verifyCalls = 0
    const stubVerify = vi.fn(async () => {
      verifyCalls++
      return { stillPresent: true }  // every verification fails
    })

    const initial: EngineOutput = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.fixed).toEqual([])
    expect(result.failed).toEqual(['a'])
    expect(stubDispatcher).toHaveBeenCalledTimes(3)
    expect(verifyCalls).toBe(3)
  })

  it('continues to the next finding after a per-finding failure', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async (_p: string, fnd: Finding) =>
      ({ stillPresent: fnd.id === 'a' })   // 'a' fails forever; 'b' succeeds first try
    )

    const initial: EngineOutput = makeFixtureWithFindings([f('a', 'P0', 'A-tdd'), f('b', 'P1', 'B-ac-coverage')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.failed).toEqual(['a'])
    expect(result.fixed).toEqual(['b'])
  })

  it('writes a post-fix report at docs/audits/<id>-postfix.md after the run', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async () => ({ stillPresent: false }))
    const initial: EngineOutput = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })
    expect(result.postfix_markdown_path).toMatch(/-postfix\.md$/)
    expect(result.postfix_sidecar_path).toMatch(/-postfix\.json$/)
  })
})

// Helper — creates an EngineOutput fixture with the given findings
function makeFixtureWithFindings(findings: Finding[]): EngineOutput {
  return {
    schema_version: '1.0',
    invocation: { command: 'audit', args: { profile: 'fast', scope: 'all' }, started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1' },
    availability: {
      git: { status: 'available' }, gh: { status: 'unavailable' },
      pipeline_docs: { status: 'available' }, tests: { status: 'available' },
      state: { status: 'available' }, beads: { status: 'unavailable' },
      mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
      ledger: { events_read: 0, malformed_lines: 0, sources: [] },
    },
    snapshot: null, replay: null, findings, needs_attention: [],
    graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
    fix_threshold: 'P2', verdict: 'blocked',
    summary: { total: findings.length,
      by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
      by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
      blocking: findings.length, acknowledged: 0, skipped_lenses: 0 },
  }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/fix-flow.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fix-flow.ts`**

Create `src/observability/engine/fix-flow.ts`:

```typescript
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EngineOutput, Finding } from './types'
import { buildFixPlan } from './fix-plan'
import { dispatchFixAgent, type DispatchFixResult } from './fix-agent-dispatcher'
import { runAudit } from './api'
import { renderAuditMarkdown } from '../renderers/markdown'
import { writeSidecar, deriveReportId } from '../renderers/sidecar'
import { captureSnapshot, recordStaged, restoreSnapshot, type AbortSnapshot } from './abort-snapshot'
import { loadObservabilityConfig } from './checks/observability-config'

export type FixDispatcher = (input: { prompt: string; command: string; timeoutMs: number; cwd: string }) => Promise<DispatchFixResult>
export type FixVerifier = (cwd: string, finding: Finding) => Promise<{ stillPresent: boolean }>

export interface RunFixFlowInput {
  primaryRoot: string
  initial: EngineOutput
  dispatcher?: FixDispatcher
  verifier?: FixVerifier
  ghBin?: string
  bdBin?: string
  abortSnapshot?: AbortSnapshot   // when caller wants to share/reuse snapshot across multiple flow invocations
}

export interface FixFlowResult {
  fixed: string[]
  failed: string[]
  postfix_markdown_path?: string
  postfix_sidecar_path?: string
  aborted?: boolean
}

function buildFindingPrompt(finding: Finding): string {
  return [
    `# Fix request for finding ${finding.id.slice(0, 8)}`,
    '',
    `Lens: ${finding.lens_id}`,
    `Severity: ${finding.severity}`,
    `Title: ${finding.title}`,
    `Source doc: ${finding.source_doc || '(none)'}`,
    '',
    `## Description`,
    finding.description,
    '',
    `## Evidence`,
    '```json',
    JSON.stringify(finding.evidence, null, 2),
    '```',
    '',
    finding.fix_hint
      ? `## Fix hint\n${finding.fix_hint.prompt ?? '(target only)'}\nTarget: ${finding.fix_hint.target ?? '(none)'}\n`
      : '',
    '## Instructions',
    '',
    'Fix this specific finding only. Do not do unrelated work. Stage your changes with `git add` when finished. Exit when done.',
  ].filter(Boolean).join('\n')
}

function defaultVerifier(cwd: string, finding: Finding): Promise<{ stillPresent: boolean }> {
  return runAudit({
    primaryRoot: cwd, profile: 'fast', scope: 'all',
    sinceHours: 24, lensIds: [finding.lens_id],
    args: { profile: 'fast', scope: 'all', lensIds: [finding.lens_id], verifying: finding.id },
  }).then((out) => ({ stillPresent: out.findings.some((f) => f.id === finding.id) }))
}

function listStagedSince(cwd: string, baselineStaged: Set<string>): string[] {
  try {
    const current = new Set(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' }).trim().split('\n').filter(Boolean))
    return [...current].filter((p) => !baselineStaged.has(p))
  } catch { return [] }
}

async function tryFixFinding(
  finding: Finding,
  cwd: string,
  dispatcher: FixDispatcher,
  verifier: FixVerifier,
  command: string,
  timeoutMs: number,
  maxAttempts: number,
  snapshot: AbortSnapshot,
): Promise<{ fixed: boolean; attempts: number }> {
  const prompt = buildFindingPrompt(finding)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const baselineStaged = new Set([...snapshot.pre_existing_staged, ...snapshot.staged_paths])
    const result = await dispatcher({ prompt, command, timeoutMs, cwd })
    if (!result.ok) continue   // dispatcher failure counts as a failed attempt
    // Track newly-staged paths
    const newlyStaged = listStagedSince(cwd, baselineStaged)
    recordStaged(snapshot, newlyStaged)
    // Verify
    const { stillPresent } = await verifier(cwd, finding)
    if (!stillPresent) return { fixed: true, attempts: attempt }
  }
  return { fixed: false, attempts: maxAttempts }
}

export async function runFixFlow(input: RunFixFlowInput): Promise<FixFlowResult> {
  const config = loadObservabilityConfig(input.primaryRoot)
  const command = config.fix.dispatcher_command ?? 'claude -p'
  const timeoutMs = (config.fix.timeout_s ?? 300) * 1000
  const maxAttempts = config.fix.per_finding_max_attempts ?? 3
  const dispatcher = input.dispatcher ?? dispatchFixAgent
  const verifier = input.verifier ?? defaultVerifier
  const snapshot = input.abortSnapshot ?? captureSnapshot(input.primaryRoot)

  const plan = buildFixPlan(input.initial.findings, input.initial.fix_threshold)
  const fixed: string[] = []
  const failed: string[] = []

  for (const finding of plan) {
    const result = await tryFixFinding(finding, input.primaryRoot, dispatcher, verifier, command, timeoutMs, maxAttempts, snapshot)
    if (result.fixed) fixed.push(finding.id)
    else failed.push(finding.id)
  }

  // Phase 5: post-fix audit
  const postfix = await runAudit({
    primaryRoot: input.primaryRoot,
    profile: 'fast', scope: 'all', sinceHours: 24,
    ghBin: input.ghBin, bdBin: input.bdBin,
    args: { profile: 'fast', scope: 'all', postfix: true },
  })
  const postfixId = `${deriveReportId(postfix)}-postfix`
  const postfixSidecar = await writeSidecar(input.primaryRoot, postfix, `docs/audits/${postfixId}.json`)
  const postfixMd = renderAuditMarkdown(postfix)
  const postfixMdAbs = join(input.primaryRoot, `docs/audits/${postfixId}.md`)
  mkdirSync(dirname(postfixMdAbs), { recursive: true })
  writeFileSync(postfixMdAbs, postfixMd, { mode: 0o644 })

  return {
    fixed, failed,
    postfix_markdown_path: `docs/audits/${postfixId}.md`,
    postfix_sidecar_path: postfixSidecar.replace(`${input.primaryRoot}/`, ''),
  }
}
```

The `writeSidecar` call needs to accept an explicit override path; if its current Plan 4 implementation doesn't, extend it (Plan 4 Task 4 already added an `overridePath` param — verify by reading the function signature).

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/fix-flow.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/fix-flow.ts src/observability/engine/fix-flow.test.ts
git commit -m "observability: runFixFlow (5 phases: audit → plan → dispatch → verify → postfix; per-finding 3 retries; injectable dispatcher + verifier for tests)"
```

---

## Task 5: CLI `--fix` integration in `handleAudit`

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`

The `--fix` CLI flag was registered by Plan 2 Task 25 but never plumbed into the handler. Plan 8 wires it.

- [ ] **Step 1: Append the failing test**

In `src/cli/commands/observe.test.ts`:

```typescript
describe('observe audit --fix', () => {
  it('runs the fix flow and prints fixed/failed counts', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'observe-fix-cli-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n`)
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
    execSync('git add . && git commit -q -m initial', { cwd: proj, shell: '/bin/sh' })

    // Configure a no-op dispatcher so the flow runs without invoking claude
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'),
      'fix:\n  dispatcher_command: "sh -c \\"cat >/dev/null; exit 0\\""\n  timeout_s: 5\n')

    let captured = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleAudit({
        cwd: proj, json: false, profile: 'fast', scope: 'all', sinceHours: 24, fix: true,
        ghBin: '/no/such/gh', bdBin: '/no/such/bd',
      })
    } finally { process.stdout.write = orig }
    rmSync(proj, { recursive: true, force: true })

    expect(captured).toMatch(/fix flow/i)
    expect(captured).toMatch(/postfix\.md/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `fix` not yet in `HandleAuditInput`.

- [ ] **Step 3: Update `handleAudit`**

In `src/cli/commands/observe.ts`:

```typescript
import { runFixFlow } from '../../observability/engine/fix-flow'
import { captureSnapshot, restoreSnapshot } from '../../observability/engine/abort-snapshot'

export interface HandleAuditInput {
  // ... existing fields
  fix?: boolean
}

export async function handleAudit(input: HandleAuditInput): Promise<number> {
  try {
    const out = await runAudit({
      primaryRoot: input.cwd,
      profile: input.profile, scope: input.scope, sinceHours: input.sinceHours,
      lensIds: input.lensIds, fixThresholdOverride: input.fixThresholdOverride,
      ghBin: input.ghBin, bdBin: input.bdBin,
      args: { profile: input.profile, scope: input.scope, lensIds: input.lensIds, fixThreshold: input.fixThresholdOverride },
    })

    // Always write the initial sidecar (Plan 4)
    const sidecarFinal = await writeSidecar(input.cwd, out)
    if (input.outputMode === 'mmr-findings') {
      process.stdout.write(renderMmrFindings(out))
      return out.verdict === 'blocked' ? 1 : 0
    }

    // Render the initial audit
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
    } else {
      const md = renderAuditMarkdown(out)
      const mdFinal = writeMarkdownReport(input.cwd, out, md, input.output)
      process.stdout.write(renderAuditTerminal(out, { showAcknowledged: input.showAcknowledged ?? false }) + '\n')
      process.stdout.write(`\n(written: ${mdFinal} + ${sidecarFinal})\n`)
    }

    // --fix flow
    if (input.fix && out.summary.blocking > 0) {
      const snapshot = captureSnapshot(input.cwd)

      const onAbort = (): void => {
        process.stderr.write('\n[fix] interrupted — restoring index and worktree…\n')
        restoreSnapshot(snapshot)
        process.exit(130)
      }
      process.on('SIGINT', onAbort)

      try {
        process.stdout.write('\n[fix] starting fix flow…\n')
        const fixResult = await runFixFlow({
          primaryRoot: input.cwd, initial: out, abortSnapshot: snapshot,
          ghBin: input.ghBin, bdBin: input.bdBin,
        })
        process.stdout.write(`[fix] fixed ${fixResult.fixed.length}, failed ${fixResult.failed.length}\n`)
        process.stdout.write(`[fix] post-fix report: ${fixResult.postfix_markdown_path}\n`)
        if (fixResult.failed.length > 0) {
          process.stdout.write(`[fix] failed finding ids: ${fixResult.failed.map((id) => id.slice(0, 8)).join(', ')}\n`)
          return 1
        }
      } finally {
        process.removeListener('SIGINT', onAbort)
      }
    }

    return out.verdict === 'blocked' ? 1 : 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe audit: ${(err as Error).message}\n`)
    return 3
  }
}
```

In `src/cli/index.ts`, the `--fix` option already exists; verify it's threaded to `handleAudit({ fix: !!argv.fix, ... })`.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, all CLI tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "cli: handleAudit honors --fix (runFixFlow + SIGINT-safe restore)"
```

---

## Task 6: `harvester.recoverStaleArchives()`

**Files:**
- Modify: `src/observability/engine/harvester.ts`
- Modify: `src/observability/engine/harvester.test.ts`

- [ ] **Step 1: Append the failing test**

```typescript
describe('harvester.recoverStaleArchives', () => {
  let primary: string

  beforeEach(() => {
    primary = mkdtempSync(join(tmpdir(), 'observe-recover-'))
  })
  afterEach(() => { rmSync(primary, { recursive: true, force: true }) })

  it('rotates active-archive entries whose worktree path no longer exists', async () => {
    const activeDir = join(primary, '.scaffold/activity-archive/active')
    mkdirSync(activeDir, { recursive: true })
    // Create an active archive for a worktree that no longer exists
    writeFileSync(join(activeDir, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl'),
      JSON.stringify({ event_id: 'ulid-x', worktree_id: 'aaaa', actor_label: 'orphan', branch: 'b', task_id: 'T-1', type: 'task_claimed', ts: '2026-04-01T00:00:00Z', payload: { task_title: 'gone' } }) + '\n')

    const result = await recoverStaleArchives({ primaryRoot: primary })
    expect(result.rotated).toContain('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(existsSync(join(activeDir, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl'))).toBe(false)
    // Rotated archive exists under YYYY-MM
    const archiveFiles = readdirSync(join(primary, '.scaffold/activity-archive'))
    expect(archiveFiles.some((f) => /^\d{4}-\d{2}\.jsonl(\.gz)?$/.test(f))).toBe(true)
  })

  it('leaves active archives whose worktree still exists alone', async () => {
    const activeDir = join(primary, '.scaffold/activity-archive/active')
    mkdirSync(activeDir, { recursive: true })
    // Create an active archive AND a fake worktree dir that "still exists"
    const wtId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
    const wtPath = mkdtempSync(join(tmpdir(), 'observe-recover-wt-'))
    try {
      mkdirSync(join(wtPath, '.scaffold'), { recursive: true })
      writeFileSync(join(wtPath, '.scaffold/identity.json'), JSON.stringify({ worktree_id: wtId, worktree_label: 'live', created_at: '2026-05-04T00:00:00Z' }))
      writeFileSync(join(activeDir, `${wtId}.jsonl`), '{}\n')

      // Make the harvester believe this worktree is registered (in real use, git worktree list does this).
      // For the test, recoverStaleArchives accepts an injected worktree-list function.
      const result = await recoverStaleArchives({ primaryRoot: primary, listWorktrees: () => [wtPath] })
      expect(result.rotated).toEqual([])
      expect(existsSync(join(activeDir, `${wtId}.jsonl`))).toBe(true)
    } finally {
      rmSync(wtPath, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/harvester.test.ts
```

Expected: FAIL — `recoverStaleArchives` not exported.

- [ ] **Step 3: Implement `recoverStaleArchives` in `harvester.ts`**

Append to `src/observability/engine/harvester.ts`:

```typescript
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, renameSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface RecoverInput {
  primaryRoot: string
  listWorktrees?: () => string[]   // injected for testing; defaults to git worktree list
}
export interface RecoverResult {
  rotated: string[]   // worktree-ids whose active archives were rotated to YYYY-MM
}

function defaultListWorktrees(primaryRoot: string): string[] {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: primaryRoot, encoding: 'utf8' })
    return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length).trim())
  } catch { return [] }
}

function readWorktreeId(worktreePath: string): string | null {
  const idPath = join(worktreePath, '.scaffold/identity.json')
  if (!existsSync(idPath)) return null
  try {
    return (JSON.parse(readFileSync(idPath, 'utf8')) as { worktree_id?: string }).worktree_id ?? null
  } catch { return null }
}

export async function recoverStaleArchives(input: RecoverInput): Promise<RecoverResult> {
  const activeDir = join(input.primaryRoot, '.scaffold/activity-archive/active')
  if (!existsSync(activeDir)) return { rotated: [] }

  const liveWorktrees = (input.listWorktrees ?? (() => defaultListWorktrees(input.primaryRoot)))()
  const liveIds = new Set(liveWorktrees.map((wt) => readWorktreeId(wt)).filter((id): id is string => id !== null))

  const rotated: string[] = []
  for (const file of readdirSync(activeDir)) {
    if (!file.endsWith('.jsonl')) continue
    const wtId = basename(file, '.jsonl')
    if (liveIds.has(wtId)) continue   // worktree still exists — leave the active file alone

    // Rotate to YYYY-MM archive, appending content
    const stat = statSync(join(activeDir, file))
    const ym = stat.mtime.toISOString().slice(0, 7)
    const archiveFile = join(input.primaryRoot, `.scaffold/activity-archive/${ym}.jsonl`)
    mkdirSync(join(input.primaryRoot, '.scaffold/activity-archive'), { recursive: true })
    const content = readFileSync(join(activeDir, file), 'utf8')
    require('node:fs').appendFileSync(archiveFile, content, { mode: 0o644 })
    require('node:fs').unlinkSync(join(activeDir, file))
    rotated.push(wtId)
  }
  return { rotated }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/harvester.test.ts
```

Expected: PASS, all harvester tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/harvester.ts src/observability/engine/harvester.test.ts
git commit -m "observability: recoverStaleArchives (rotate active-archive entries whose worktrees no longer exist)"
```

---

## Task 7: CLI `harvest --recover`

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Append the failing test**

```typescript
describe('observe harvest --recover', () => {
  it('rotates stale active-archive entries and prints the count', async () => {
    const primary = mkdtempSync(join(tmpdir(), 'observe-rcli-'))
    const activeDir = join(primary, '.scaffold/activity-archive/active')
    mkdirSync(activeDir, { recursive: true })
    writeFileSync(join(activeDir, '11111111-2222-4333-8444-555555555555.jsonl'),
      JSON.stringify({ event_id: 'ulid-x', worktree_id: '11111111', actor_label: 'gone', branch: 'b', task_id: null, type: 'progress_heartbeat', ts: '2026-04-01T00:00:00Z', payload: { note: 'orphaned' } }) + '\n')

    let captured = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      const code = await handleHarvest({ primaryRoot: primary, worktreeRoot: '', recover: true })
      expect(code).toBe(0)
    } finally { process.stdout.write = orig }
    rmSync(primary, { recursive: true, force: true })

    expect(captured).toMatch(/rotated 1/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `recover` not in `HandleHarvestInput`.

- [ ] **Step 3: Update `handleHarvest`**

```typescript
import { recoverStaleArchives } from '../../observability/engine/harvester'

export interface HandleHarvestInput {
  primaryRoot: string
  worktreeRoot: string
  recover?: boolean
}

export async function handleHarvest(input: HandleHarvestInput): Promise<number> {
  try {
    if (input.recover) {
      const result = await recoverStaleArchives({ primaryRoot: input.primaryRoot })
      process.stdout.write(`rotated ${result.rotated.length} stale archive(s)\n`)
      if (result.rotated.length > 0) {
        process.stdout.write(`  ${result.rotated.join(', ')}\n`)
      }
      return 0
    }
    if (!input.worktreeRoot) {
      process.stderr.write('scaffold observe harvest: --worktree=<path> required (or use --recover)\n')
      return 2
    }
    await harvestWorktree({ primaryRoot: input.primaryRoot, worktreeRoot: input.worktreeRoot })
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe harvest: ${(err as Error).message}\n`)
    return 3
  }
}
```

In `src/cli/index.ts`, extend the `harvest` builder:

```typescript
.option('worktree', { type: 'string', describe: 'Worktree path to harvest' })
.option('recover', { type: 'boolean', default: false, describe: 'Scan for stale active-archive entries and rotate them' })
```

And thread:

```typescript
recover: !!argv.recover,
worktreeRoot: (argv.worktree as string | undefined) ?? '',
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, all CLI tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "cli: scaffold observe harvest --recover (rotates stale active-archive entries)"
```

---

## Task 8: `scripts/teardown-agent-worktree.sh`

**Files:**
- Create: `scripts/teardown-agent-worktree.sh`

- [ ] **Step 1: Write the script**

Create `scripts/teardown-agent-worktree.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Preflight ──────────────────────────────────────────────

if [ $# -eq 0 ]; then
    echo "Usage: teardown-agent-worktree.sh <worktree-path>" >&2
    echo "  Harvests the worktree's ledger to the central archive, removes the worktree," >&2
    echo "  and (if its branch is not the primary repo's HEAD) deletes the workspace branch." >&2
    exit 1
fi

worktree_dir="$1"

if [ ! -d "$worktree_dir" ]; then
    echo "Error: worktree path does not exist: $worktree_dir" >&2
    exit 1
fi

command -v git >/dev/null 2>&1 || {
    echo "Error: git is required but not installed" >&2
    exit 2
}

# ─── Read the actual branch name from the worktree ──────────

branch_name="$(git -C "$worktree_dir" branch --show-current 2>/dev/null || true)"

# ─── Harvest the ledger to the central archive ──────────────

if command -v scaffold >/dev/null 2>&1; then
    scaffold observe harvest --worktree="$worktree_dir" || \
        echo "Warning: scaffold observe harvest failed; proceeding with worktree removal anyway" >&2
else
    echo "Warning: scaffold not on PATH; skipping ledger harvest" >&2
fi

# ─── Remove the worktree ────────────────────────────────────

git -C "$REPO_DIR" worktree remove "$worktree_dir"
echo "Removed worktree: $worktree_dir"

# ─── Optional branch cleanup ────────────────────────────────

if [ -n "$branch_name" ]; then
    primary_branch="$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || true)"
    if [ "$branch_name" != "$primary_branch" ]; then
        if git -C "$REPO_DIR" branch -D "$branch_name" 2>/dev/null; then
            echo "Deleted branch: $branch_name"
        else
            echo "Note: branch '$branch_name' not deleted (may be checked out elsewhere or already gone)"
        fi
    fi
fi

echo "Teardown complete."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/teardown-agent-worktree.sh
```

- [ ] **Step 3: Verify with shellcheck**

```bash
make lint
```

Expected: no new ShellCheck issues.

- [ ] **Step 4: Smoke-test in a sandbox**

```bash
# Create a sandbox primary repo and a worktree, then tear it down
( set -e
  cd /tmp && rm -rf sandbox-teardown sandbox-teardown-test
  mkdir sandbox-teardown && cd sandbox-teardown && git init -q && git -c init.defaultBranch=main commit --allow-empty -q -m init
  mkdir .scaffold && echo '{"worktree_id":"00000000-0000-4000-8000-000000000000","worktree_label":"primary","created_at":"2026-05-04T00:00:00Z"}' > .scaffold/identity.json
  bash /Users/kenallred/Documents/dev-projects/scaffold/scripts/setup-agent-worktree.sh test
  bash /Users/kenallred/Documents/dev-projects/scaffold/scripts/teardown-agent-worktree.sh ../sandbox-teardown-test
  test ! -d ../sandbox-teardown-test && echo "OK: worktree removed"
)
```

(Adjust paths as needed; clean up `/tmp/sandbox-teardown*` after.)

- [ ] **Step 5: Commit**

```bash
git add scripts/teardown-agent-worktree.sh
git commit -m "scripts: teardown-agent-worktree.sh (read branch via git, harvest first, remove worktree, optional branch cleanup)"
```

---

## Task 9: Bats coverage for fix flow + teardown

**Files:**
- Modify: `tests/observability/audit.bats`
- Create: `scripts/teardown-agent-worktree.bats`

- [ ] **Step 1: Append fix-flow case to existing bats**

Append to `tests/observability/audit.bats`:

```bash
@test "observe audit --fix runs the fix flow with a stub dispatcher" {
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
    cat > docs/tdd-standards.md <<'EOF'
# TDD
EOF
    cat > .scaffold/observability.yaml <<'EOF'
fix:
  dispatcher_command: 'sh -c "cat >/dev/null; exit 0"'
  timeout_s: 5
  per_finding_max_attempts: 1
EOF

    git add . && git commit -q -m initial

    run $BIN observe audit --fix --since-hours=24
    [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
    [[ "$output" == *"[fix] starting fix flow"* ]]
    [[ "$output" == *"-postfix.md"* ]]
}
```

- [ ] **Step 2: Create teardown bats**

Create `scripts/teardown-agent-worktree.bats`:

```bash
#!/usr/bin/env bats

setup() {
    SANDBOX="$(mktemp -d)"
    export SANDBOX
    cd "$SANDBOX"
    git init -q
    git config user.email "t@e.com"
    git config user.name "T"
    git -c init.defaultBranch=main commit --allow-empty -q -m init
}
teardown() {
    rm -rf "$SANDBOX"
}

@test "teardown-agent-worktree.sh removes the worktree" {
    bash "$BATS_TEST_DIRNAME/setup-agent-worktree.sh" testagent

    [ -d "$SANDBOX-testagent" ]
    bash "$BATS_TEST_DIRNAME/teardown-agent-worktree.sh" "$SANDBOX-testagent"
    [ ! -d "$SANDBOX-testagent" ]
}

@test "teardown-agent-worktree.sh deletes the workspace branch" {
    bash "$BATS_TEST_DIRNAME/setup-agent-worktree.sh" testagent
    [ -n "$(git branch --list testagent-workspace)" ]
    bash "$BATS_TEST_DIRNAME/teardown-agent-worktree.sh" "$SANDBOX-testagent"
    [ -z "$(git branch --list testagent-workspace)" ]
}

@test "teardown-agent-worktree.sh exits 1 when worktree path does not exist" {
    run bash "$BATS_TEST_DIRNAME/teardown-agent-worktree.sh" /tmp/no-such-worktree-path
    [ "$status" -eq 1 ]
    [[ "$output" == *"does not exist"* ]]
}
```

- [ ] **Step 3: Run the suites**

```bash
npm run build && bats tests/observability/audit.bats scripts/teardown-agent-worktree.bats
```

Expected: PASS — all original cases + 1 new fix-flow case + 3 teardown cases.

- [ ] **Step 4: Commit**

```bash
git add tests/observability/audit.bats scripts/teardown-agent-worktree.bats
git commit -m "observability: bats coverage for --fix flow + teardown-agent-worktree.sh"
```

---

## Task 10: `make check-all`, CLAUDE.md, and self-review

- [ ] **Step 1: Run the gate**

```bash
make check-all
```

Common Plan 8 issues:
- The fix-flow tests use injected dispatchers; coverage of the *real* `dispatchFixAgent` path is in Task 2's unit tests. If integration coverage drops, add a single small e2e test in `fix-flow.test.ts` that uses the real dispatcher with a `sh -c` no-op command.
- `recoverStaleArchives` uses `require('node:fs').appendFileSync` because of an awkward import order — clean this up to a top-level import if `make check-all`'s lint complains.
- bats failing because the teardown sandbox uses `$SANDBOX-testagent` (sibling of $SANDBOX, not child) — the existing setup-agent-worktree.sh creates the worktree at `$REPO_DIR/../<repo-name>-<agent>`, not inside `$SANDBOX`. Adjust the bats setup or the script's path resolution.

- [ ] **Step 2: Update CLAUDE.md**

Append to the existing observability paragraph:

> Plan 8 ships the `--fix` flow and worktree teardown. `scaffold observe audit --fix` runs the 5-phase flow (audit → plan → dispatch → verify → postfix): blocking findings (severity ≤ fix_threshold, status=open) are ordered by severity then lens_id, dispatched one-at-a-time to the configurable agent (`fix.dispatcher_command`, default `claude -p`), verified by re-running the single lens that produced each finding (3 retries max per finding), and a `…-postfix.md` report is written. SIGINT triggers an abort that restores the index and worktree to the pre-fix state (only paths the fix flow staged are reverted; pre-existing user changes are preserved via `git stash create` snapshot). `scripts/teardown-agent-worktree.sh` partners with `setup-agent-worktree.sh`: it harvests the ledger first, then `git worktree remove`s, then optionally deletes the workspace branch. `scaffold observe harvest --recover` rotates active-archive entries whose worktrees no longer exist.

Add to the Key Commands table:

```markdown
| `scaffold observe audit --fix` | Run audit and dispatch the fix flow for blocking findings (3 retries each) |
| `scaffold observe harvest --recover` | Scan for stale active-archive entries and rotate them |
| `scripts/teardown-agent-worktree.sh <path>` | Harvest + remove a worktree + delete its workspace branch |
```

- [ ] **Step 3: Self-review**

| Spec section | Implemented in |
|---|---|
| buildFixPlan ordering by severity then lens_id (§5.4 Plan phase) | Task 1 |
| dispatchFixAgent subprocess + timeout (§5.4 Dispatch phase) | Task 2 |
| `fix.dispatcher_command` config (§5.4) | Task 2 |
| Pre-flight stash + index tracking (§5.4 abort safety) | Task 3 |
| 5-phase runFixFlow with verification + retries (§5.4) | Task 4 |
| Per-finding 3-retry limit (§5.4) | Task 4 |
| Post-fix `…-postfix.md` report (§5.4) | Task 4 |
| --fix CLI integration + SIGINT trap (§5.4) | Task 5 |
| recoverStaleArchives (§5.6 crash recovery) | Task 6 |
| `scaffold observe harvest --recover` (§5.6) | Task 7 |
| `scripts/teardown-agent-worktree.sh` reads branch via `git --show-current` (§5.6) | Task 8 |
| Bats end-to-end coverage (§6.3) | Task 9 |
| Quality gate + docs (§6.8) | Task 10 |

Out-of-scope: nothing — Plan 8 is the final plan in the build-observability series.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-05-04-build-observability-fix-flow.md
git commit -m "plans: build-observability fix flow + teardown — final pass" --allow-empty
```

---

## Plan 8 — Self-review (built into the plan)

**Spec coverage:** every Plan-8-scoped requirement maps to a task. The 5-phase flow is implemented exactly as spec §5.4 describes: ordered fix plan, configurable dispatcher, single-lens verification with 3-retry-per-finding, post-fix report. Abort safety uses `git stash create` + per-path index tracking exactly as spec §5.4's "index-and-worktree safety on abort" prescribes. Worktree teardown reads the branch dynamically (no naming-convention guess, per spec §5.6) and harvests before removing.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present.

**Type consistency:**
- `Finding`, `EngineOutput`, `Severity` reused unchanged from Plans 1-7.
- `DispatchFixResult` is a discriminated union (`{ ok: true } | { ok: false }`) so all consumers must handle both branches — same pattern as Plan 7's `DispatchResult`.
- `AbortSnapshot` is a plain object passed by reference; `recordStaged` mutates it; `restoreSnapshot` consumes it idempotently.
- `FixFlowResult` exposes `fixed`, `failed`, `postfix_markdown_path`, `postfix_sidecar_path` — consumers map these to user-facing output.
- `EngineOutput` shape unchanged across all 8 plans.

**Scope:** Plan 8 is the final plan. After Plans 1+2+3+4+5+6+7+8, the build-observability feature is feature-complete: ledger + harvest + 8 lenses + verdict + ack + per-project config + markdown + dashboard + sidecars + replay + stall + phase triggers + MMR channel + LLM checks + fix flow + worktree lifecycle. The full design from `docs/superpowers/specs/2026-04-30-build-observability-design.md` ships across these 8 plans.

---

**Plan 8 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-fix-flow.md`.**

---

## Build Observability — Series Complete

| Plan | Status | Tasks | Lines |
|---|---|---|---|
| Plan 1 — Foundation | committed | 30 | 4036 |
| Plan 2 — Audit MVP | committed | 30 | 4690 |
| Plan 3 — Full Lens Suite | written | 17 | 2624 |
| Plan 4 — Renderers + Audit History | written | 16 | 2060 |
| Plan 5 — Replay + Stall | written | 16 | 2039 |
| Plan 6 — Phase Triggers | written | 10 | 1119 |
| Plan 7 — MMR Channel + Lens H Full-Profile | written | 11 | 1459 |
| Plan 8 — Fix Flow + Teardown | written | 10 | (this file) |
| **Total** | | **140 tasks** | |

Spec at `docs/superpowers/specs/2026-04-30-build-observability-design.md` is MMR-clean across 6 review rounds. Every plan is TDD-shaped, self-reviewed clean, with explicit deferred-to-next-plan annotations so subagents can execute one plan at a time without context drift.

**Three execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all eight plans (~140 tasks total). The plans split cleanly so each subagent gets a focused brief.
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.
3. **Pause** — the design is fully committed in the spec + 8 plans; execution can wait until you're ready or hand off to another session.

Which approach?
