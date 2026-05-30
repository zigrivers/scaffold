# MMR Grok Channel Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MMR's grok review channel a closed-book reviewer — no cross-session memory, no filesystem reads, and no host/project context (instructions, skills, MCP, hooks, permissions) — while keeping web search.

**Architecture:** Add `--no-memory`, a web-only `--tools` allowlist, and `--no-subagents --no-plan` to the grok channel; isolate host config by running grok with an isolated `HOME`/`XDG_CONFIG_HOME` and a neutral `cwd`. A new `host-isolation` helper expands `{{neutral_home}}`/`{{neutral_cwd}}` placeholders into a per-invocation temp dir (created + cleaned up locally at each spawn), used by both the dispatcher and the auth probe so the probe verifies the same posture the review runs under. The schema gains an optional channel `cwd`; the compensator threads `cwd` through so grok-as-compensator inherits the posture.

**Tech Stack:** TypeScript (ESM, `node:` built-ins), Zod (config schema), Vitest (tests), `packages/mmr`.

**Authoritative spec:** `docs/superpowers/specs/2026-05-30-mmr-grok-channel-hardening-design.md` (passed 10-round multi-model review). Defer to it where this plan is silent.

**Working directory:** all paths are relative to repo root; the package lives under `packages/mmr/`. Run package commands from `packages/mmr/` (it has its own `package.json`/`vitest`).

---

## File Structure

- `packages/mmr/src/core/host-isolation.ts` — **new.** Placeholder constants + `withNeutralPosture()` (per-call temp-dir create + placeholder expansion + cleanup) + a stale-dir sweep. Single responsibility: turn a "wants isolation" channel env/cwd into a concrete isolated env/cwd plus a cleanup handle.
- `packages/mmr/src/config/schema.ts` — add optional `cwd` to `CommonChannelFields`.
- `packages/mmr/src/core/dispatcher.ts` — add `cwd` to `DispatchOptions`; expand neutral posture before spawn; set spawn `cwd`; clean up after the process closes.
- `packages/mmr/src/core/auth.ts` — expand neutral posture around the auth-probe spawn so the probe runs under the isolated `HOME`.
- `packages/mmr/src/commands/review.ts` — thread `chConfig.cwd` into both `dispatchChannel` option builders (parallel ~L661, sequential ~L695). (Auth at ~L542 already passes `chConfig` to `checkAuth`, which reads `env`/`cwd`.)
- `packages/mmr/src/core/compensator.ts` — add `cwd` to `CompensatorDispatch`, populate it in `resolveCompensatorDispatch`, forward it in `dispatchCompensatingPasses`.
- `packages/mmr/src/config/defaults.ts` — set the hardened `BUILTIN_CHANNELS.grok` flags + `env` + `cwd`.
- `packages/mmr/tests/...` — unit tests per task.
- `CLAUDE.md` + MMR package docs — manual-fallback + closed-book-override docs.
- `tasks/lessons.md` + memory `grok-not-in-brew-mmr` — record outcome.

---

## Task 1: Pre-flight verification gate (manual; determines concrete flag values)

**No code.** This produces the concrete values Task 8 bakes into `defaults.ts`. Per the spec, the posture is chosen **once** here (static), not detected at runtime. Record results in `tasks/lessons.md` (Task 11).

- [ ] **Step 1: Confirm `--no-memory` is accepted**

Run: `grok --no-memory -p "reply with the single word ok" --output-format json 2>&1 | head`
Expected: a JSON reply (no flag error). Note any rejection.

- [ ] **Step 2: Confirm the web-tool allowlist names and that a review still runs with FS denied**

Run: `printf 'Reply with the word READY and do not call any tools.' > /tmp/grok-probe.txt && grok --prompt-file /tmp/grok-probe.txt --output-format json --no-memory --tools web_search,web_fetch --no-subagents --no-plan 2>&1 | head -40`
Expected: a JSON reply. If `--tools` or a name is rejected (e.g. `unknown tool`, HTTP 400), record the working alternative (e.g. names from `grok --disable-web-search` semantics, or fall back per spec D2 — enumerated `--disallowed-tools` of every FS-read tool, or disable the channel). **Write down the exact accepted tuple.**

- [ ] **Step 3: Confirm the JSON envelope still parses with agency disabled**

Inspect the Step 2 output: confirm it is `{ "text": "...", ... }` (the shape the grok `output_parser: unwrap-jsonpath $.text` expects). If `--no-subagents --no-plan` changes it (bare string / missing `text`), record that — Task 9 adds a parser test and the parser may need adjustment.

- [ ] **Step 4: Confirm isolated HOME empties host config AND preserves auth on THIS platform**

Run:
```bash
D=$(mktemp -d /tmp/mmr-grok-verify.XXXXXX)
( cd "$D" && HOME="$D" XDG_CONFIG_HOME="$D" grok inspect --json ) | \
  python3 -c "import sys,json;d=json.load(sys.stdin);print('instr',len(d.get('projectInstructions',[])),'skills',len(d.get('skills',[])),'mcp',len(d.get('mcpServers',[])),'hooks',len(d.get('hooks',[])),'perms',(d.get('permissions') or {}).get('loaded'))"
HOME="$D" XDG_CONFIG_HOME="$D" grok models >/dev/null 2>&1 && echo "AUTH OK" || echo "AUTH FAILS — apply spec D3 surgical-creds fallback"
rm -rf "$D"
```
Expected: all counts `0` and `AUTH OK`. If `AUTH FAILS` (file-based auth, e.g. Linux/CI), the implementation must symlink `~/.grok/auth.json` into the isolated dir (spec D3) — record the working recipe.

- [ ] **Step 5: Record the verified tuple** in a scratch note for Task 8 (flags array + env + whether surgical-creds symlink is needed). No commit (no files changed yet).

---

## Task 2: Add optional `cwd` to the channel schema

**Files:**
- Modify: `packages/mmr/src/config/schema.ts` (`CommonChannelFields`, ~L109-130)
- Test: `packages/mmr/tests/config/schema.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { MmrConfigSchema } from '../../src/config/schema.js'

describe('channel schema — cwd', () => {
  it('accepts an optional cwd on a subprocess channel', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        grok: { kind: 'subprocess', command: 'grok', cwd: '{{neutral_cwd}}' },
      },
    })
    expect((parsed.channels.grok as { cwd?: string }).cwd).toBe('{{neutral_cwd}}')
  })

  it('leaves cwd undefined when omitted', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: { grok: { kind: 'subprocess', command: 'grok' } },
    })
    expect((parsed.channels.grok as { cwd?: string }).cwd).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd packages/mmr && npx vitest run tests/config/schema.test.ts`
Expected: FAIL — `cwd` is stripped/undefined in the first test (unknown key or missing).

- [ ] **Step 3: Add the field**

In `CommonChannelFields`, after the `prompt_delivery` field, add:
```ts
  // Working directory for the spawned process. Used by host-isolation to run a
  // channel in a neutral cwd (clears grok's cwd-scoped projectInstructions).
  // Supports the {{neutral_cwd}} placeholder expanded at dispatch/auth time.
  cwd: z.string().optional(),
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd packages/mmr && npx vitest run tests/config/schema.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/config/schema.ts packages/mmr/tests/config/schema.test.ts
git commit -m "feat(mmr): add optional channel cwd to schema"
```

---

## Task 3: `host-isolation` helper (per-call neutral dir + placeholder expansion + cleanup)

**Files:**
- Create: `packages/mmr/src/core/host-isolation.ts`
- Test: `packages/mmr/tests/core/host-isolation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import {
  NEUTRAL_HOME_PLACEHOLDER,
  NEUTRAL_CWD_PLACEHOLDER,
  withNeutralPosture,
} from '../../src/core/host-isolation.js'

describe('withNeutralPosture', () => {
  const made: string[] = []
  afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

  it('passes env/cwd through unchanged when no placeholder is present', () => {
    const r = withNeutralPosture({ FOO: 'bar' }, '/some/dir')
    expect(r.env).toEqual({ FOO: 'bar' })
    expect(r.cwd).toBe('/some/dir')
    r.cleanup()
  })

  it('creates a real, unique dir and substitutes both placeholders', () => {
    const a = withNeutralPosture(
      { HOME: NEUTRAL_HOME_PLACEHOLDER, XDG_CONFIG_HOME: NEUTRAL_HOME_PLACEHOLDER },
      NEUTRAL_CWD_PLACEHOLDER,
    )
    made.push(a.cwd!)
    expect(a.env.HOME).toBe(a.cwd)                 // same per-call dir reused
    expect(a.env.XDG_CONFIG_HOME).toBe(a.cwd)
    expect(fs.existsSync(a.cwd!)).toBe(true)
    expect(a.cwd!).toContain('mmr-grok-')

    const b = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, undefined)
    made.push(b.env.HOME!)
    expect(b.env.HOME).not.toBe(a.env.HOME)        // unique per call
    a.cleanup(); b.cleanup()
  })

  it('cleanup removes the created dir', () => {
    const r = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, NEUTRAL_CWD_PLACEHOLDER)
    const dir = r.cwd!
    expect(fs.existsSync(dir)).toBe(true)
    r.cleanup()
    expect(fs.existsSync(dir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd packages/mmr && npx vitest run tests/core/host-isolation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/mmr/src/core/host-isolation.ts`:
```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const NEUTRAL_HOME_PLACEHOLDER = '{{neutral_home}}'
export const NEUTRAL_CWD_PLACEHOLDER = '{{neutral_cwd}}'
const PREFIX = 'mmr-grok-'

export interface NeutralPosture {
  env: Record<string, string>
  cwd?: string
  /** Synchronous, idempotent removal of any dir this call created. */
  cleanup: () => void
}

function needsIsolation(env: Record<string, string>, cwd?: string): boolean {
  if (cwd === NEUTRAL_CWD_PLACEHOLDER) return true
  return Object.values(env).some((v) => v === NEUTRAL_HOME_PLACEHOLDER)
}

/**
 * Expand {{neutral_home}}/{{neutral_cwd}} placeholders into a single fresh
 * per-call temp directory (unique → safe for parallel channel runs; each call
 * owns its dir lifetime). Returns the concrete env/cwd plus a synchronous
 * cleanup fn. When no placeholder is present, returns the inputs unchanged with
 * a no-op cleanup.
 */
export function withNeutralPosture(env: Record<string, string>, cwd?: string): NeutralPosture {
  if (!needsIsolation(env, cwd)) {
    return { env, cwd, cleanup: () => {} }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX))
  const outEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    outEnv[k] = v === NEUTRAL_HOME_PLACEHOLDER ? dir : v
  }
  const outCwd = cwd === NEUTRAL_CWD_PLACEHOLDER ? dir : cwd
  let removed = false
  return {
    env: outEnv,
    cwd: outCwd,
    cleanup: () => {
      if (removed) return
      removed = true
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
    },
  }
}

/**
 * Backstop for dirs orphaned by SIGKILL/crashes: remove stale mmr-grok-* temp
 * dirs older than `maxAgeMs`. Call once at process start. Best-effort/sync.
 */
export function sweepStaleNeutralDirs(maxAgeMs = 6 * 60 * 60 * 1000): void {
  const tmp = os.tmpdir()
  let entries: string[] = []
  try { entries = fs.readdirSync(tmp) } catch { return }
  const now = Date.now()
  for (const name of entries) {
    if (!name.startsWith(PREFIX)) continue
    const full = path.join(tmp, name)
    try {
      const st = fs.statSync(full)
      if (now - st.mtimeMs > maxAgeMs) fs.rmSync(full, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
}
```

> Note on `Date.now()`: this file is runtime code (not a workflow script), so `Date.now()` is fine here.

- [ ] **Step 4: Run it, expect pass**

Run: `cd packages/mmr && npx vitest run tests/core/host-isolation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/host-isolation.ts packages/mmr/tests/core/host-isolation.test.ts
git commit -m "feat(mmr): add host-isolation helper for neutral HOME/cwd"
```

---

## Task 4: Dispatcher applies neutral posture + sets spawn cwd

**Files:**
- Modify: `packages/mmr/src/core/dispatcher.ts` (`DispatchOptions` ~L8-22; spawn ~L98-103; close handler)
- Test: `packages/mmr/tests/core/dispatcher.cwd.test.ts`

- [ ] **Step 1: Write the failing test**

This asserts the spawn receives an expanded (non-placeholder) cwd and an isolated HOME. Use a fake command that writes its cwd+HOME to a file.

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dispatchChannel } from '../../src/core/dispatcher.js'
import { NEUTRAL_HOME_PLACEHOLDER, NEUTRAL_CWD_PLACEHOLDER } from '../../src/core/host-isolation.js'
import { JobStore } from '../../src/core/job-store.js'

describe('dispatcher — neutral posture', () => {
  it('expands {{neutral_*}} and runs the process in an isolated cwd/HOME', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-disp-test-'))
    const store = new JobStore(root)                       // adjust to JobStore's real ctor
    const job = store.createJob({ /* minimal job per JobStore API */ } as never)
    const out = path.join(root, 'probe-out.txt')

    await dispatchChannel(store, job.job_id, 'grok', {
      command: 'sh',
      prompt: '',
      // sh -c writes "$PWD|$HOME" to the out file
      flags: ['-c', `printf '%s|%s' "$PWD" "$HOME" > ${out}`],
      env: { HOME: NEUTRAL_HOME_PLACEHOLDER },
      cwd: NEUTRAL_CWD_PLACEHOLDER,
      timeout: 30,
      stderr: 'suppress',
    })

    // poll until the child writes (dispatchChannel monitors async)
    for (let i = 0; i < 50 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 100))
    const [pwd, home] = fs.readFileSync(out, 'utf8').split('|')
    expect(pwd).toContain('mmr-grok-')
    expect(home).toBe(pwd)                                  // HOME == cwd (same neutral dir)
    expect(pwd).not.toContain('{{')                         // placeholder expanded
  })
})
```

> If `JobStore`'s constructor/`createJob` signature differs, adapt the setup to the real API (read `packages/mmr/src/core/job-store.ts`); the assertions are the point.

- [ ] **Step 2: Run it, expect failure**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.cwd.test.ts`
Expected: FAIL — `cwd` not on `DispatchOptions` / process runs in repo cwd with literal placeholder.

- [ ] **Step 3: Add `cwd` to `DispatchOptions`**

In `DispatchOptions` (after `promptDelivery`):
```ts
  /** Working directory for the spawned process. {{neutral_cwd}} is expanded
   *  (with {{neutral_home}} in env) into a per-run isolated dir before spawn. */
  cwd?: string
```

- [ ] **Step 4: Expand posture and use it in the spawn**

At the top of `dispatcher.ts`, import the helper:
```ts
import { withNeutralPosture } from './host-isolation.js'
```
Immediately before the `spawn(cmd, args, { ... })` call, replace the env handling:
```ts
  const posture = withNeutralPosture(opts.env, opts.cwd)
  const proc = spawn(cmd, args, {
    detached: true,
    stdio: ['pipe', 'pipe', stderrStdio],
    env: { ...process.env, ...posture.env },
    cwd: posture.cwd,                       // undefined ⇒ inherit (unchanged for non-isolated channels)
  })
```

- [ ] **Step 5: Clean up the dir when the process closes**

In the existing `proc.on('close', ...)` handler (and any error path that resolves the dispatch), call `posture.cleanup()` after the process is done. If there is no single close handler, add `proc.on('close', () => posture.cleanup())` right after the spawn. Ensure cleanup runs on the error path too (`proc.on('error', () => posture.cleanup())`).

- [ ] **Step 6: Run it, expect pass**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.cwd.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/tests/core/dispatcher.cwd.test.ts
git commit -m "feat(mmr): dispatcher expands neutral posture + sets spawn cwd"
```

---

## Task 5: Auth probe runs under the same isolated posture

**Files:**
- Modify: `packages/mmr/src/core/auth.ts` (`runAuthCheck`, ~L37-50)
- Test: `packages/mmr/tests/core/auth.isolation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { checkAuth } from '../../src/core/auth.js'
import { NEUTRAL_HOME_PLACEHOLDER } from '../../src/core/host-isolation.js'

describe('auth probe — neutral posture', () => {
  it('runs the auth check under an expanded isolated HOME (no literal placeholder)', async () => {
    // The check asserts HOME is a real mmr-grok-* dir, not the placeholder.
    const res = await checkAuth({
      kind: 'subprocess',
      command: 'true',
      env: { HOME: NEUTRAL_HOME_PLACEHOLDER },
      flags: [], prompt_wrapper: '{{prompt}}', output_parser: 'default',
      stderr: 'capture', abstract: false, enabled: true,
      auth: {
        check: 'case "$HOME" in *mmr-grok-*) exit 0;; *) exit 1;; esac',
        timeout: 10, failure_exit_codes: [1], recovery: 'n/a',
      },
    } as never)
    expect(res.status).toBe('ok')
  })
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd packages/mmr && npx vitest run tests/core/auth.isolation.test.ts`
Expected: FAIL — probe runs with literal `{{neutral_home}}`, so the `case` match fails → exit 1 → `failed`.

- [ ] **Step 3: Apply posture in `runAuthCheck`**

In `auth.ts`, import the helper:
```ts
import { withNeutralPosture } from './host-isolation.js'
```
In `runAuthCheck`, wrap the spawn:
```ts
async function runAuthCheck(config: AuthenticatedChannelConfig): Promise<AuthResult> {
  const { auth, env } = config
  const posture = withNeutralPosture(env, config.cwd)

  return new Promise((resolve) => {
    let settled = false
    let timedOut = false

    const child = spawn('sh', ['-c', auth.check], {
      env: { ...process.env, ...posture.env },
      cwd: posture.cwd,
      stdio: 'ignore',
    })
    // ... existing timer / close / error handlers ...
  }).finally?.(() => posture.cleanup()) as Promise<AuthResult>
}
```
If `AuthenticatedChannelConfig` does not surface `cwd`, read it from the underlying config (it is part of `CommonChannelFields` now) — pass `config.cwd`. Ensure `posture.cleanup()` runs after the promise settles (add `.finally(() => posture.cleanup())`, or call cleanup inside both the `close` and `error` handlers before `resolve`).

> Keep the existing timeout-retry behavior in `checkAuth` intact — it calls `runAuthCheck` twice on timeout; each call creates and cleans up its own dir, which is correct.

- [ ] **Step 4: Run it, expect pass**

Run: `cd packages/mmr && npx vitest run tests/core/auth.isolation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/auth.ts packages/mmr/tests/core/auth.isolation.test.ts
git commit -m "feat(mmr): auth probe runs under isolated HOME posture"
```

---

## Task 6: Thread channel `cwd` through the review dispatch sites

**Files:**
- Modify: `packages/mmr/src/commands/review.ts` (parallel dispatch ~L661-671; sequential ~L695-705)
- Test: covered indirectly by Task 4/Task 8; add an assertion only if a unit seam exists.

- [ ] **Step 1: Add `cwd` to the parallel dispatch options (~L661)**

In the `dispatchChannel(store, job.job_id, name, { ... })` object inside the parallel loop, add after `promptDelivery: chConfig.prompt_delivery,`:
```ts
            cwd: chConfig.cwd,
```

- [ ] **Step 2: Add `cwd` to the sequential dispatch options (~L695)**

In the second `dispatchChannel(...)` options object, add the same line:
```ts
          cwd: chConfig.cwd,
```

- [ ] **Step 3: Confirm the auth path needs no change**

`checkAuth(chConfig)` (~L542) already receives the full `chConfig`, and Task 5 reads `config.cwd` + `config.env` inside `runAuthCheck`. No edit needed at the call site. (Verify by reading L542.)

- [ ] **Step 4: Typecheck + build**

Run: `cd packages/mmr && npx tsc --noEmit`
Expected: no errors (the new `cwd` field is optional and now flows end-to-end).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/commands/review.ts
git commit -m "feat(mmr): thread channel cwd through review dispatch sites"
```

---

## Task 7: Compensator forwards `cwd` (grok-as-compensator inherits posture)

**Files:**
- Modify: `packages/mmr/src/core/compensator.ts` (`CompensatorDispatch` ~L30-39; `resolveCompensatorDispatch` ~L62-72; `dispatchCompensatingPasses` ~L204-218)
- Test: `packages/mmr/tests/core/compensator.cwd.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolveCompensatorDispatch } from '../../src/core/compensator.js'

describe('compensator — cwd inheritance', () => {
  it('carries the configured grok channel cwd into the dispatch', () => {
    const config = {
      version: 1,
      defaults: { compensator: { channel: 'grok' }, timeout: 300 },
      channels: {
        grok: {
          kind: 'subprocess', command: 'grok',
          flags: ['--no-memory'], env: { HOME: '{{neutral_home}}' },
          cwd: '{{neutral_cwd}}', stderr: 'capture',
          prompt_wrapper: '{{prompt}}', output_parser: 'default',
          prompt_delivery: 'prompt-file', enabled: true, abstract: false,
        },
      },
    } as never
    const d = resolveCompensatorDispatch(config)
    expect(d.cwd).toBe('{{neutral_cwd}}')
    expect(d.env.HOME).toBe('{{neutral_home}}')
    expect(d.flags).toContain('--no-memory')
  })
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd packages/mmr && npx vitest run tests/core/compensator.cwd.test.ts`
Expected: FAIL — `d.cwd` is `undefined` (field doesn't exist).

- [ ] **Step 3: Add `cwd` to `CompensatorDispatch`**

In the `CompensatorDispatch` interface, add:
```ts
  cwd?: string
```

- [ ] **Step 4: Populate it in `resolveCompensatorDispatch`**

In the object returned by `resolveCompensatorDispatch` (the configured-channel branch), add after `prompt_delivery: channelConfig.prompt_delivery,`:
```ts
    cwd: channelConfig.cwd,
```
(The default `claude` branch in `defaultCompensatorDispatch` leaves `cwd` unset — correct.)

- [ ] **Step 5: Forward it in `dispatchCompensatingPasses`**

In the subprocess branch's `dispatchChannel(store, jobId, comp.compensatingName, { ... })` call, add after `promptDelivery: dispatch.prompt_delivery,`:
```ts
        cwd: dispatch.cwd,
```

- [ ] **Step 6: Run it, expect pass**

Run: `cd packages/mmr && npx vitest run tests/core/compensator.cwd.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/core/compensator.ts packages/mmr/tests/core/compensator.cwd.test.ts
git commit -m "feat(mmr): compensator forwards cwd so grok-as-compensator inherits posture"
```

---

## Task 8: Harden `BUILTIN_CHANNELS.grok` defaults

**Files:**
- Modify: `packages/mmr/src/config/defaults.ts` (`grok` channel, ~L100-129)
- Test: Task 9.

> Use the **verified tuple from Task 1**. The values below assume Task 1 confirmed `--tools web_search,web_fetch` and macOS-keychain auth (no surgical-creds symlink). If Task 1 found otherwise, substitute the recorded fallback (and, for file-based auth, do NOT use a bare isolated HOME — implement the spec D3 surgical-creds variant in `host-isolation.ts` first).

- [ ] **Step 1: Replace the grok `flags` and add `env`/`cwd`**

In `BUILTIN_CHANNELS.grok`, set:
```ts
    command: 'grok',
    prompt_delivery: 'prompt-file',
    cwd: '{{neutral_cwd}}',
    env: { HOME: '{{neutral_home}}', XDG_CONFIG_HOME: '{{neutral_home}}' },
    flags: [
      '--prompt-file', '{{prompt_file}}',
      '--output-format', 'json',
      '--no-memory',
      '--tools', 'web_search,web_fetch',
      '--no-subagents', '--no-plan',
    ],
```
Leave `auth`, `prompt_wrapper`, and `output_parser` unchanged. (The `{{prompt_file}}` path the dispatcher writes is already absolute — under the job dir — so it survives the neutral cwd, satisfying the spec's absolute-path requirement.)

- [ ] **Step 2: Typecheck**

Run: `cd packages/mmr && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/mmr/src/config/defaults.ts
git commit -m "feat(mmr): harden grok channel (no-memory, web-only tools, isolated HOME/cwd)"
```

---

## Task 9: Regression tests for the hardened grok channel + parser

**Files:**
- Modify: `packages/mmr/tests/config/defaults.test.ts` (grok describe block, ~L38-71)

- [ ] **Step 1: Add the hardening assertions**

Append to the `BUILTIN_CHANNELS — grok` describe block:
```ts
  it('disables cross-session memory', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-memory')
  })

  it('locks tools to a web-only allowlist (no filesystem tools)', () => {
    const flags = BUILTIN_CHANNELS.grok?.flags ?? []
    const i = flags.indexOf('--tools')
    expect(i).toBeGreaterThanOrEqual(0)
    const value = flags[i + 1] ?? ''
    expect(value.split(',')).toEqual(['web_search', 'web_fetch'])
    expect(value).not.toMatch(/read_file|write_file/)
  })

  it('disables agentic subagents and planning for determinism', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-subagents')
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-plan')
  })

  it('isolates host config via neutral HOME/XDG and cwd', () => {
    expect(BUILTIN_CHANNELS.grok?.env?.HOME).toBe('{{neutral_home}}')
    expect(BUILTIN_CHANNELS.grok?.env?.XDG_CONFIG_HOME).toBe('{{neutral_home}}')
    expect((BUILTIN_CHANNELS.grok as { cwd?: string }).cwd).toBe('{{neutral_cwd}}')
  })

  it('does NOT disable web search (web stays available by default)', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).not.toContain('--disable-web-search')
  })
```

- [ ] **Step 2: Run the file, expect pass**

Run: `cd packages/mmr && npx vitest run tests/config/defaults.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 3: (Conditional) parser test if Task 1 Step 3 showed an envelope change**

Only if Task 1 found `--no-subagents --no-plan` alters the JSON shape: add a test under the grok output_parser suite asserting the parser handles the new shape, and adjust `output_parser` accordingly. If Task 1 showed the `{ "text": ... }` envelope unchanged, skip this step and note "envelope unchanged — no parser change" in the commit body.

- [ ] **Step 4: Commit**

```bash
git add packages/mmr/tests/config/defaults.test.ts
git commit -m "test(mmr): regression-cover hardened grok channel flags + posture"
```

---

## Task 10: Full package gate + documentation updates

**Files:**
- Modify: `CLAUDE.md` (review-dispatch line, current L267; quick-ref auth lines L255/L260 left as-is)
- Modify: MMR package docs (`packages/mmr/README.md` and/or `.mmr.yaml` schema comments) — closed-book override guidance

- [ ] **Step 1: Run the whole MMR test suite + typecheck**

Run: `cd packages/mmr && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 2: Update the CLAUDE.md manual grok fallback (L267)**

Replace:
```bash
grok --prompt-file PROMPT_FILE --output-format json 2>/dev/null
```
with (keep it on the existing line region; PROMPT_FILE must be absolute):
```bash
# grok ignores stdin — pass an ABSOLUTE prompt-file path. Hardened review posture:
# isolated HOME/cwd (no host config), no cross-session memory, web-only tools.
HOME="$(mktemp -d)" XDG_CONFIG_HOME="$HOME" grok --prompt-file "$PROMPT_FILE" \
  --output-format json --no-memory --tools web_search,web_fetch \
  --no-subagents --no-plan 2>/dev/null
```
Add a one-line note: relative `--prompt-file` paths break under the isolated `HOME`; use an absolute path.

- [ ] **Step 3: Document the closed-book override for end users**

In `packages/mmr/README.md` (and/or `.mmr.yaml` schema comments), add a short subsection: to run grok closed-book (no web), a `.mmr.yaml` `channels.grok.flags` override **must restate the entire hardened flags array** (config merge replaces arrays, it does not append) and append `--disable-web-search`; any file-path flag added must be **absolute** because the channel runs in a neutral cwd. Show the full array.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md packages/mmr/README.md .mmr.yaml
git commit -m "docs: hardened grok manual fallback + closed-book override guidance"
```

---

## Task 11: Record outcome in lessons + memory

**Files:**
- Modify: `tasks/lessons.md`
- Modify: memory `grok-not-in-brew-mmr` (`/Users/kenallred/.claude/projects/-Users-kenallred-Developer-scaffold/memory/grok-not-in-brew-mmr.md`)

- [ ] **Step 1: Append the verified tuple + outcome to `tasks/lessons.md`**

Record: the exact accepted flag/env tuple from Task 1, whether file-based-auth surgical-creds was needed, the observed residual `grok inspect` counts under the hardened posture (should be all 0), and the rule: "a grok review channel must run with `--no-memory` + web-only `--tools` + isolated HOME/cwd; verify FS tools denied and host config empty via `grok inspect`."

- [ ] **Step 2: Update the memory file**

Add a note to `grok-not-in-brew-mmr` that the MMR grok channel is now hardened (link `[[mmr-review-channels]]`), including the verified flag tuple and the isolated-HOME mechanism, so future sessions don't re-derive it.

- [ ] **Step 3: Commit**

```bash
git add tasks/lessons.md
git commit -m "docs(lessons): record grok channel hardening outcome + verified tuple"
```

(The memory file lives outside the repo; it is saved via the Write tool, not committed.)

---

## Task 12: End-to-end verification (the real acceptance evidence)

**No new code.** Confirms the deterministic gate from the spec.

- [ ] **Step 1: Build the package**

Run: `cd packages/mmr && npm run build` (or the package's build script)
Expected: clean build.

- [ ] **Step 2: Run a real grok review and confirm the isolated posture**

Run a focused review through the hardened channel (e.g. `mmr review --diff <small.patch> --channels grok --sync --format json`). While it runs (or from the verified tuple), confirm via `grok inspect` under the same `HOME`/cwd that `projectInstructions`, `skills`, `mcpServers`, `hooks`, and `permissions.loaded` are all empty/zero, and that the grok channel completed (parsed findings, no auth failure).

- [ ] **Step 3: Confirm no FS-tool calls**

Inspect the channel's raw output/trace for the run: no `read_file`/working-tree tool-call lines. (Best-effort stale-context repro per the spec is optional narrative, not a gate.)

- [ ] **Step 4: Final full gate**

Run: `cd packages/mmr && npx vitest run && npx tsc --noEmit`
Expected: all pass. Then run the repo-level `make check-all` if MMR is wired into it.

- [ ] **Step 5: Push + open PR** (per CLAUDE.md committing workflow) and run the mandatory multi-model code review on the PR.

---

## Self-Review notes

- **Spec coverage:** D1 (web kept) → Task 8 (no `--disable-web-search`) + Task 9 assertion. D2 (web-only allowlist, fail-closed fallback, static selection) → Task 1 (verify + choose) + Task 8. D3 (isolated HOME/cwd, schema cwd, per-run dir + cleanup, auth probe parity, dispatcher plumbing) → Tasks 2–6. D4 (determinism flags + envelope check) → Task 8 + Task 1/9. D5 (closed-book override docs, absolute paths) → Task 10. Compensator cwd → Task 7. Docs/lessons/memory → Tasks 10–11. Verified-tuple recording → Tasks 1 + 11.
- **Type consistency:** `cwd?: string` is the same name across schema, `DispatchOptions`, `CompensatorDispatch`, and `defaults.ts`; `NEUTRAL_HOME_PLACEHOLDER`/`NEUTRAL_CWD_PLACEHOLDER`/`withNeutralPosture` used identically in dispatcher and auth.
- **Known adaptation point:** Task 4's test setup must match the real `JobStore` constructor/`createJob` API (read `core/job-store.ts`); the cwd/HOME assertions are the invariant.
