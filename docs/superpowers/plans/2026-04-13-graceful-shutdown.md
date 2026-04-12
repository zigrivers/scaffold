# Graceful Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add elegant early exit/shutdown to the scaffold CLI — no stack traces, clean messaging, proper cleanup of locks/spinners/state on Ctrl+C.

**Architecture:** A centralized `ShutdownManager` singleton at `src/cli/shutdown.ts` with signal handlers, async cleanup disposers (critical-sequential then normal-parallel), and three wrapper methods (`withPrompt`, `withResource`, `withContext`) that commands use to declare cleanup, catch ExitPromptError, and set phase-aware exit messages. Uses `AsyncLocalStorage` for concurrent-safe context and DI for testability.

**Tech Stack:** TypeScript, Node.js signals (`SIGINT`/`SIGTERM`), `AsyncLocalStorage` from `node:async_hooks`, `@inquirer/prompts` ExitPromptError, vitest

**Spec:** `docs/superpowers/specs/2026-04-12-graceful-shutdown-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/cli/shutdown.ts` | Create | ShutdownManager class + singleton export |
| `src/cli/shutdown.test.ts` | Create | Unit tests for ShutdownManager |
| `src/state/lock-manager.ts` | Modify | Export `getLockPath` |
| `src/cli/index.ts` | Modify | Call `shutdown.install()` at startup |
| `src/cli/output/interactive.ts` | Modify | Spinner auto-register/deregister |
| `src/cli/commands/init.ts` | Modify | withPrompt + withContext + withResource |
| `src/cli/commands/version.ts` | Modify | `.unref()` timer + AbortSignal |
| `src/cli/commands/update.ts` | Modify | `.unref()` timer + AbortSignal |
| `src/cli/commands/build.ts` | Modify | `isShuttingDown` in file loops |
| `src/cli/commands/adopt.ts` | Modify | withResource for lock |
| `src/cli/commands/skip.ts` | Modify | withResource + withPrompt |
| `src/cli/commands/skip.test.ts` | Modify | Update exit assertions |
| `src/cli/commands/complete.ts` | Modify | withResource for lock |
| `src/cli/commands/complete.test.ts` | Modify | Update exit assertions |
| `src/cli/commands/rework.ts` | Modify | withResource for lock |
| `src/cli/commands/rework.test.ts` | Modify | Update exit assertions |
| `src/cli/commands/reset.ts` | Modify | withResource + withPrompt (two sub-commands) |
| `src/cli/commands/reset.test.ts` | Modify | Update exit assertions |
| `src/cli/commands/run.ts` | Modify | process.exit migration + full shutdown integration |
| `src/cli/commands/run.test.ts` | Modify | Migrate throwing exit mock to exitCode assertions |
| `src/cli/commands/adopt.test.ts` | Modify | Add getLockPath to mock |

---

### Task 1: ShutdownManager — types, constructor, install, reset

**Files:**
- Create: `src/cli/shutdown.ts`
- Create: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write the test file with initial tests**

```typescript
// src/cli/shutdown.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { ShutdownManager } from './shutdown.js'
import type { ShutdownProcess } from './shutdown.js'

class FakeProcess extends EventEmitter {
  exit = vi.fn() as unknown as ShutdownProcess['exit']
  env: Record<string, string | undefined> = {}
  stdout = { writable: true, isTTY: true as boolean | undefined, write: vi.fn(() => true) }
  stderr = { writable: true, write: vi.fn(() => true) }
}

function createFakeProcess(): FakeProcess {
  return new FakeProcess()
}

describe('ShutdownManager', () => {
  let proc: FakeProcess
  let mgr: ShutdownManager

  beforeEach(() => {
    proc = createFakeProcess()
    mgr = new ShutdownManager(proc as unknown as ShutdownProcess)
  })

  afterEach(() => {
    mgr.reset()
  })

  describe('constructor', () => {
    it('creates an instance without errors', () => {
      expect(mgr).toBeInstanceOf(ShutdownManager)
    })

    it('is not shutting down initially', () => {
      expect(mgr.isShuttingDown).toBe(false)
    })
  })

  describe('install()', () => {
    it('registers SIGINT and SIGTERM listeners', () => {
      mgr.install()
      expect(proc.listenerCount('SIGINT')).toBe(1)
      expect(proc.listenerCount('SIGTERM')).toBe(1)
    })
  })

  describe('reset()', () => {
    it('removes signal listeners', () => {
      mgr.install()
      mgr.reset()
      expect(proc.listenerCount('SIGINT')).toBe(0)
      expect(proc.listenerCount('SIGTERM')).toBe(0)
    })

    it('clears shutting down state', async () => {
      mgr.install()
      // Force shuttingDown to true via internal state
      // We'll test this more thoroughly later
      mgr.reset()
      expect(mgr.isShuttingDown).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — module `./shutdown.js` not found

- [ ] **Step 3: Write the ShutdownManager skeleton**

```typescript
// src/cli/shutdown.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import { setMaxListeners } from 'node:events'
import fs from 'node:fs'

import { ExitCode } from '../types/enums.js'

export interface ShutdownProcess {
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
  exit(code?: number): never
  env: Record<string, string | undefined>
  stdout: { writable?: boolean; isTTY?: boolean; write(s: string): boolean }
  stderr: { writable?: boolean; write(s: string): boolean }
}

export type CleanupFn = () => void | Promise<void>
export type Deregister = () => void

interface DisposerEntry {
  cleanup: CleanupFn
  priority?: 'critical'
}

export class ShutdownManager {
  private proc: ShutdownProcess
  private shuttingDown = false
  private sigintState: 'idle' | 'cleaning' | 'armed' = 'idle'
  private triggeredBySigterm = false
  private exitHandlerRan = false
  private lockOwned = false
  private lockPath: string | null = null
  private registry = new Map<string, DisposerEntry>()
  private controller: AbortController
  private contextStorage = new AsyncLocalStorage<string | (() => string)>()
  private fallbackContext = 'Cancelled.'

  constructor(proc?: ShutdownProcess) {
    this.proc = proc ?? (process as unknown as ShutdownProcess)
    this.controller = new AbortController()
    setMaxListeners(0, this.controller.signal)
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  private sigintHandler = (): void => {
    // Implemented in Task 2
  }

  private sigtermHandler = (): void => {
    // Implemented in Task 3
  }

  install(): void {
    this.proc.on('SIGINT', this.sigintHandler as (...args: unknown[]) => void)
    this.proc.on('SIGTERM', this.sigtermHandler as (...args: unknown[]) => void)
    this.installExitHandler()
  }

  private installExitHandler(): void {
    // Implemented in Task 6
  }

  reset(): void {
    this.shuttingDown = false
    this.sigintState = 'idle'
    this.triggeredBySigterm = false
    this.exitHandlerRan = false
    this.lockOwned = false
    this.lockPath = null
    this.registry.clear()
    this.controller = new AbortController()
    setMaxListeners(0, this.controller.signal)
    this.proc.removeListener('SIGINT', this.sigintHandler as (...args: unknown[]) => void)
    this.proc.removeListener('SIGTERM', this.sigtermHandler as (...args: unknown[]) => void)
  }

  // Placeholder methods — implemented in subsequent tasks
  register(_name: string, _cleanup: CleanupFn, _opts?: { priority?: 'critical' }): Deregister {
    return () => {}
  }

  registerLockOwnership(_path: string): void {}
  releaseLockOwnership(): void {}
  async shutdown(_exitCode?: number): Promise<never> { return new Promise<never>(() => {}) }
  async withPrompt<T>(fn: () => Promise<T>): Promise<T> { return fn() }
  async withResource<T>(_name: string, _cleanup: CleanupFn, fn: () => T | Promise<T>): Promise<T> { return fn() }
  async withContext<T>(_message: string | (() => string), fn: () => T | Promise<T>): Promise<T> { return Promise.resolve(fn()) }
}

export const shutdown = new ShutdownManager()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): add ShutdownManager skeleton with types, constructor, install, reset"
```

---

### Task 2: SIGINT three-stage state machine

**Files:**
- Modify: `src/cli/shutdown.ts`
- Modify: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write tests for SIGINT three-stage behavior**

Add to `src/cli/shutdown.test.ts` inside the outer `describe`:

```typescript
describe('SIGINT handler (TTY)', () => {
  beforeEach(() => {
    proc.stdout.isTTY = true
    mgr.install()
  })

  it('first SIGINT calls shutdown (idle -> cleaning)', () => {
    const shutdownSpy = vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGINT')
    expect(shutdownSpy).toHaveBeenCalledWith(ExitCode.UserCancellation)
  })

  it('second SIGINT prints warning (cleaning -> armed)', () => {
    vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGINT') // idle -> cleaning
    proc.emit('SIGINT') // cleaning -> armed
    expect(proc.stderr.write).toHaveBeenCalledWith('\nPress Ctrl+C again to force quit.\n')
  })

  it('third SIGINT force-quits (armed -> exit)', () => {
    vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGINT') // idle -> cleaning
    proc.emit('SIGINT') // cleaning -> armed
    proc.emit('SIGINT') // armed -> force quit
    expect(proc.stderr.write).toHaveBeenCalledWith('\nForce quit.\n')
    expect(proc.exit).toHaveBeenCalledWith(ExitCode.UserCancellation)
  })
})

describe('SIGINT handler (non-TTY)', () => {
  beforeEach(() => {
    proc.stdout.isTTY = false
    mgr.install()
  })

  it('first SIGINT calls shutdown immediately', () => {
    const shutdownSpy = vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGINT')
    expect(shutdownSpy).toHaveBeenCalledWith(ExitCode.UserCancellation)
  })

  it('second SIGINT force-exits without warning', () => {
    vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGINT')
    proc.emit('SIGINT')
    expect(proc.exit).toHaveBeenCalledWith(ExitCode.UserCancellation)
    expect(proc.stderr.write).not.toHaveBeenCalledWith(
      expect.stringContaining('Press Ctrl+C'),
    )
  })
})
```

Also add this import at the top of the test file:

```typescript
import { ExitCode } from '../types/enums.js'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — sigintHandler is empty, shutdown not called

- [ ] **Step 3: Implement sigintHandler**

In `src/cli/shutdown.ts`, replace the empty `sigintHandler`:

```typescript
private sigintHandler = (): void => {
  if (!this.proc.stdout.isTTY) {
    if (this.sigintState === 'idle') {
      this.sigintState = 'cleaning'
      this.shutdown(ExitCode.UserCancellation)
    } else {
      this.proc.exit(ExitCode.UserCancellation)
    }
    return
  }

  switch (this.sigintState) {
    case 'idle':
      this.sigintState = 'cleaning'
      this.shutdown(ExitCode.UserCancellation)
      break
    case 'cleaning':
      this.proc.stderr.write('\nPress Ctrl+C again to force quit.\n')
      this.sigintState = 'armed'
      break
    case 'armed':
      this.proc.stderr.write('\nForce quit.\n')
      this.proc.exit(ExitCode.UserCancellation)
      break
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): implement three-stage SIGINT state machine"
```

---

### Task 3: SIGTERM handler + shutdown() method

**Files:**
- Modify: `src/cli/shutdown.ts`
- Modify: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write tests for SIGTERM and shutdown()**

Add to `src/cli/shutdown.test.ts`:

```typescript
describe('SIGTERM handler', () => {
  beforeEach(() => {
    mgr.install()
  })

  it('calls shutdown on SIGTERM', () => {
    const shutdownSpy = vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGTERM')
    expect(shutdownSpy).toHaveBeenCalledWith(ExitCode.UserCancellation)
  })

  it('prevents subsequent SIGINT from also triggering shutdown', () => {
    const shutdownSpy = vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    proc.emit('SIGTERM')
    proc.emit('SIGINT') // should NOT call shutdown again (sigintState already 'cleaning')
    expect(shutdownSpy).toHaveBeenCalledTimes(1)
  })
})

describe('shutdown()', () => {
  it('sets isShuttingDown to true', async () => {
    mgr.install()
    const promise = mgr.shutdown()
    expect(mgr.isShuttingDown).toBe(true)
    // shutdown calls proc.exit, which is mocked — await briefly for cleanup
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())
  })

  it('calls process.exit with provided code', async () => {
    mgr.install()
    mgr.shutdown(ExitCode.ValidationError)
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(ExitCode.ValidationError))
  })

  it('returns never-resolving promise on second call (idempotency)', async () => {
    mgr.install()
    mgr.shutdown()
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())

    // Second call should not call exit again
    const exitCallCount = (proc.exit as ReturnType<typeof vi.fn>).mock.calls.length
    mgr.shutdown()
    // Give it a tick
    await new Promise(r => setTimeout(r, 10))
    expect((proc.exit as ReturnType<typeof vi.fn>).mock.calls.length).toBe(exitCallCount)
  })

  it('writes context message to stderr', async () => {
    mgr.install()
    mgr.shutdown()
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())
    expect(proc.stderr.write).toHaveBeenCalledWith('\nCancelled.\n')
  })

  it('aborts the AbortSignal', async () => {
    mgr.install()
    expect(mgr.signal.aborted).toBe(false)
    mgr.shutdown()
    expect(mgr.signal.aborted).toBe(true)
  })

  it('runs critical disposers sequentially before normal', async () => {
    mgr.install()
    const order: string[] = []
    mgr.register('normal-1', () => { order.push('normal-1') })
    mgr.register('critical-1', () => { order.push('critical-1') }, { priority: 'critical' })
    mgr.register('normal-2', () => { order.push('normal-2') })

    mgr.shutdown()
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())

    expect(order[0]).toBe('critical-1')
    expect(order).toContain('normal-1')
    expect(order).toContain('normal-2')
  })

  it('late registration during shutdown runs cleanup immediately', async () => {
    mgr.install()
    mgr.shutdown()
    await vi.waitFor(() => expect(mgr.isShuttingDown).toBe(true))

    const lateFn = vi.fn()
    const deregister = mgr.register('late', lateFn)
    // Late registration should run cleanup immediately
    await vi.waitFor(() => expect(lateFn).toHaveBeenCalled())
    // Deregister should be a no-op
    expect(typeof deregister).toBe('function')
  })

  it('continues cleanup if a disposer throws', async () => {
    mgr.install()
    const ran: string[] = []
    mgr.register('throws', () => { throw new Error('boom') })
    mgr.register('runs', () => { ran.push('ok') })

    mgr.shutdown()
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())

    expect(ran).toContain('ok')
  })

  it('uses 5000ms timeout for SIGTERM', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    mgr.install()
    proc.emit('SIGTERM')
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())

    const timeoutCall = setTimeoutSpy.mock.calls.find(
      ([, ms]) => ms === 5000 || ms === 2000,
    )
    expect(timeoutCall?.[1]).toBe(5000)
    setTimeoutSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — shutdown() is placeholder, register() is no-op

- [ ] **Step 3: Implement register() and shutdown()**

In `src/cli/shutdown.ts`, replace the placeholder `register` and `shutdown` methods:

```typescript
register(name: string, cleanup: CleanupFn, opts?: { priority?: 'critical' }): Deregister {
  if (this.shuttingDown) {
    Promise.resolve(cleanup()).catch(() => {})
    return () => {}
  }
  this.registry.set(name, { cleanup, priority: opts?.priority })
  return () => { this.registry.delete(name) }
}

async shutdown(exitCode: number = ExitCode.UserCancellation): Promise<never> {
  if (this.shuttingDown) {
    return new Promise<never>(() => {})
  }
  this.shuttingDown = true

  this.controller.abort()

  const msg = this.currentContext
  this.proc.stderr.write(`\n${msg}\n`)

  const timeoutMs = this.getTimeoutMs()
  const timeout = setTimeout(() => this.proc.exit(exitCode), timeoutMs)

  const critical = [...this.registry]
    .filter(([, v]) => v.priority === 'critical').reverse()
  for (const [, d] of critical) {
    try { await Promise.resolve(d.cleanup()) } catch { /* continue */ }
  }

  const normal = [...this.registry]
    .filter(([, v]) => v.priority !== 'critical').reverse()
  await Promise.allSettled(normal.map(([, d]) => {
    try { return Promise.resolve(d.cleanup()) }
    catch { return Promise.resolve() }
  }))

  clearTimeout(timeout)
  this.proc.exit(exitCode)
}

private get currentContext(): string {
  const ctx = this.contextStorage.getStore() ?? this.fallbackContext
  return typeof ctx === 'function' ? ctx() : ctx
}

private getTimeoutMs(): number {
  const env = this.proc.env?.SCAFFOLD_SHUTDOWN_TIMEOUT_MS
  if (env) {
    const n = Number(env)
    if (!Number.isNaN(n) && n > 0) return Math.max(500, Math.min(n, 10000))
  }
  return this.triggeredBySigterm ? 5000 : 2000
}
```

Also implement the `sigtermHandler`:

```typescript
private sigtermHandler = (): void => {
  this.triggeredBySigterm = true
  if (this.sigintState === 'idle') {
    this.sigintState = 'cleaning'
    this.shutdown(ExitCode.UserCancellation)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): implement shutdown() cleanup, register(), SIGTERM handler"
```

---

### Task 4: withPrompt

**Files:**
- Modify: `src/cli/shutdown.ts`
- Modify: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write tests for withPrompt**

Add to `src/cli/shutdown.test.ts`:

```typescript
describe('withPrompt()', () => {
  beforeEach(() => {
    mgr.install()
  })

  it('returns the value from the wrapped function', async () => {
    const result = await mgr.withPrompt(async () => 'hello')
    expect(result).toBe('hello')
  })

  it('re-throws non-ExitPromptError errors', async () => {
    await expect(
      mgr.withPrompt(async () => { throw new Error('oops') }),
    ).rejects.toThrow('oops')
  })

  it('catches ExitPromptError by name and calls shutdown', async () => {
    const shutdownSpy = vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
    const err = new Error('User force closed the prompt with SIGINT')
    err.name = 'ExitPromptError'

    // withPrompt calls shutdown which returns Promise<never>
    // The mock resolves, so withPrompt will return undefined
    await mgr.withPrompt(async () => { throw err })

    expect(shutdownSpy).toHaveBeenCalledWith(ExitCode.UserCancellation)
  })

  it('does not catch errors where only message mentions ExitPromptError', async () => {
    const err = new Error('ExitPromptError happened')
    // name is still 'Error', not 'ExitPromptError'
    await expect(
      mgr.withPrompt(async () => { throw err }),
    ).rejects.toThrow('ExitPromptError happened')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — withPrompt is passthrough placeholder

- [ ] **Step 3: Implement withPrompt**

In `src/cli/shutdown.ts`, replace the placeholder `withPrompt`:

```typescript
async withPrompt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Error && e.name === 'ExitPromptError') {
      return this.shutdown(ExitCode.UserCancellation)
    }
    throw e
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): implement withPrompt — ExitPromptError catch by name"
```

---

### Task 5: withResource

**Files:**
- Modify: `src/cli/shutdown.ts`
- Modify: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write tests for withResource**

Add to `src/cli/shutdown.test.ts`:

```typescript
describe('withResource()', () => {
  beforeEach(() => {
    mgr.install()
  })

  it('returns the value from the wrapped function', async () => {
    const result = await mgr.withResource('test', () => {}, async () => 42)
    expect(result).toBe(42)
  })

  it('runs cleanup on normal completion', async () => {
    const cleanup = vi.fn()
    await mgr.withResource('test', cleanup, async () => 'done')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('runs cleanup on error', async () => {
    const cleanup = vi.fn()
    await expect(
      mgr.withResource('test', cleanup, async () => { throw new Error('fail') }),
    ).rejects.toThrow('fail')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('only runs cleanup once if shutdown also fires (idempotency)', async () => {
    const cleanup = vi.fn()
    let triggerShutdown: (() => void) | undefined

    const promise = mgr.withResource('test', cleanup, async () => {
      // Simulate shutdown happening during fn()
      triggerShutdown = () => {
        // Directly call the registered cleanup via shutdown
        const entry = (mgr as any).registry.get('test')
        if (entry) entry.cleanup()
      }
      triggerShutdown()
      return 'done'
    })

    await promise
    // cleanup was registered with a guarded wrapper, so even though
    // it was called from "shutdown" and from the finally block, it
    // should only have executed the real cleanup once
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('deregisters from registry after completion', async () => {
    await mgr.withResource('test', () => {}, async () => 'done')
    expect((mgr as any).registry.has('test')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — withResource is passthrough placeholder

- [ ] **Step 3: Implement withResource**

In `src/cli/shutdown.ts`, replace the placeholder `withResource`:

```typescript
async withResource<T>(name: string, cleanup: CleanupFn, fn: () => T | Promise<T>): Promise<T> {
  let cleaned = false
  const guardedCleanup = async (): Promise<void> => {
    if (cleaned) return
    cleaned = true
    await cleanup()
  }
  const deregister = this.register(name, guardedCleanup)
  try {
    return await fn()
  } finally {
    deregister()
    try { await guardedCleanup() } catch { /* best effort */ }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): implement withResource — idempotent cleanup guard"
```

---

### Task 6: withContext + lock ownership + exit safety net

**Files:**
- Modify: `src/cli/shutdown.ts`
- Modify: `src/cli/shutdown.test.ts`

- [ ] **Step 1: Write tests for withContext, lock ownership, and exit safety net**

Add to `src/cli/shutdown.test.ts`:

```typescript
describe('withContext()', () => {
  beforeEach(() => {
    mgr.install()
  })

  it('returns the value from the wrapped function', async () => {
    const result = await mgr.withContext('msg', async () => 'value')
    expect(result).toBe('value')
  })

  it('uses context message during shutdown', async () => {
    await mgr.withContext('Custom cancel message.', async () => {
      mgr.shutdown()
      await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())
    })
    expect(proc.stderr.write).toHaveBeenCalledWith('\nCustom cancel message.\n')
  })

  it('supports thunk messages evaluated at shutdown time', async () => {
    let phase = 'wizard'
    await mgr.withContext(() => `Cancelled during ${phase}.`, async () => {
      phase = 'build'
      mgr.shutdown()
      await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())
    })
    expect(proc.stderr.write).toHaveBeenCalledWith('\nCancelled during build.\n')
  })

  it('concurrent async scopes maintain independent contexts', async () => {
    // Two parallel operations should not interfere with each other
    const contexts: string[] = []
    await Promise.all([
      mgr.withContext('scope-A', async () => {
        await new Promise(r => setTimeout(r, 10))
        contexts.push((mgr as any).currentContext)
      }),
      mgr.withContext('scope-B', async () => {
        await new Promise(r => setTimeout(r, 5))
        contexts.push((mgr as any).currentContext)
      }),
    ])
    expect(contexts).toContain('scope-A')
    expect(contexts).toContain('scope-B')
  })

  it('inner context overrides outer context', async () => {
    await mgr.withContext('outer', async () => {
      await mgr.withContext('inner', async () => {
        mgr.shutdown()
        await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled())
      })
    })
    expect(proc.stderr.write).toHaveBeenCalledWith('\ninner\n')
  })
})

describe('lock ownership', () => {
  it('registers and releases lock ownership', () => {
    mgr.registerLockOwnership('/path/to/lock.json')
    expect((mgr as any).lockOwned).toBe(true)
    expect((mgr as any).lockPath).toBe('/path/to/lock.json')

    mgr.releaseLockOwnership()
    expect((mgr as any).lockOwned).toBe(false)
    expect((mgr as any).lockPath).toBeNull()
  })
})

describe('exit safety net', () => {
  it('runs exit handler only once (reentrancy guard)', () => {
    mgr.install()
    // Simulate process.exit triggering exit event
    proc.emit('exit', 0)
    proc.emit('exit', 0) // second call should be no-op

    // Cursor restore should only be written once
    const stderrCalls = (proc.stderr.write as ReturnType<typeof vi.fn>).mock.calls
    const cursorRestores = stderrCalls.filter(
      ([arg]: [string]) => arg.includes('\x1b[?25h'),
    )
    expect(cursorRestores.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: FAIL — withContext is passthrough, lock methods are empty, exit handler not installed

- [ ] **Step 3: Implement withContext, lock ownership, and exit handler**

In `src/cli/shutdown.ts`, replace the placeholder `withContext`, `registerLockOwnership`, `releaseLockOwnership`, and implement `installExitHandler`:

```typescript
async withContext<T>(message: string | (() => string), fn: () => T | Promise<T>): Promise<T> {
  return this.contextStorage.run(message, () => Promise.resolve(fn()))
}

registerLockOwnership(lockFilePath: string): void {
  this.lockPath = lockFilePath
  this.lockOwned = true
}

releaseLockOwnership(): void {
  this.lockOwned = false
  this.lockPath = null
}

private installExitHandler(): void {
  this.proc.on('exit', (() => {
    if (this.exitHandlerRan) return
    this.exitHandlerRan = true
    if (this.lockOwned && this.lockPath) {
      try { fs.unlinkSync(this.lockPath) } catch { /* ok */ }
    }
    if (this.proc.stderr?.writable) {
      try { this.proc.stderr.write('\x1b[?25h\n') } catch { /* ok */ }
    }
  }) as (...args: unknown[]) => void)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/shutdown.test.ts`
Expected: PASS

- [ ] **Step 5: Run full quality gate**

Run: `npx vitest run src/cli/shutdown.test.ts && make lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/shutdown.ts src/cli/shutdown.test.ts
git commit -m "feat(shutdown): implement withContext, lock ownership, exit safety net"
```

---

### Task 7: Export getLockPath + wire shutdown.install() into runCli()

**Files:**
- Modify: `src/state/lock-manager.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Export getLockPath**

In `src/state/lock-manager.ts`, change line 12 from:

```typescript
function getLockPath(projectRoot: string): string {
```

to:

```typescript
export function getLockPath(projectRoot: string): string {
```

- [ ] **Step 2: Wire shutdown.install() into runCli()**

In `src/cli/index.ts`, add the import at the top with other imports:

```typescript
import { shutdown } from './shutdown.js'
```

Then add `shutdown.install()` as the first line inside `runCli()` (before the `await yargs(argv)` call):

```typescript
export async function runCli(argv: string[]): Promise<void> {
  shutdown.install()
  await yargs(argv)
    // ... rest unchanged
```

- [ ] **Step 3: Run full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/state/lock-manager.ts src/cli/index.ts
git commit -m "feat(shutdown): export getLockPath, wire shutdown.install() into runCli"
```

---

### Task 8: Spinner integration

**Files:**
- Modify: `src/cli/output/interactive.ts`

- [ ] **Step 1: Add shutdown import and spinnerDeregister field**

In `src/cli/output/interactive.ts`, add the import at the top:

```typescript
import { shutdown } from '../shutdown.js'
```

Add a field to the `InteractiveOutput` class (near the `spinnerInterval` field at line 48):

```typescript
private spinnerDeregister: (() => void) | null = null
```

- [ ] **Step 2: Register spinner in startSpinner()**

In `startSpinner` (line 306), add registration after the `setInterval` call. The method should become:

```typescript
startSpinner(message: string): void {
  if (!isTTY() || isNoColor()) return
  this.spinnerFrame = 0
  this.spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length] ?? '⠋'
    process.stdout.write(`\r${frame} ${message}`)
    this.spinnerFrame++
  }, 80)
  this.spinnerDeregister = shutdown.register('spinner', () => this.stopSpinner())
}
```

- [ ] **Step 3: Deregister spinner in stopSpinner()**

In `stopSpinner` (line 316), add deregistration. The method should become:

```typescript
stopSpinner(success = true): void {
  if (this.spinnerInterval !== null) {
    clearInterval(this.spinnerInterval)
    this.spinnerInterval = null
    process.stdout.write('\r\x1b[K')
  }
  this.spinnerDeregister?.()
  this.spinnerDeregister = null
  if (success) {
    // Spinner stopped successfully — caller will call success() if needed
  }
}
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/output/interactive.ts
git commit -m "feat(shutdown): auto-register/deregister spinner with ShutdownManager"
```

---

### Task 9: init.ts integration

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/commands/init.test.ts`

**Context for subagent:** The `shutdown` singleton is imported from `../shutdown.js`. It provides `withPrompt<T>(fn: () => Promise<T>): Promise<T>` (catches ExitPromptError and calls shutdown), `withContext<T>(msg: string | (() => string), fn): Promise<T>` (sets phase-aware exit message), and `withResource<T>(name, cleanup, fn): Promise<T>` (registers cleanup for shutdown). `ExitCode.UserCancellation` is 4, imported from `../../types/enums.js`.

- [ ] **Step 1: Add import to init.ts**

Add to the existing imports in `src/cli/commands/init.ts`:

```typescript
import { shutdown } from '../shutdown.js'
```

Note: `ExitCode` may already be imported; if not, add `import { ExitCode } from '../../types/enums.js'`.

- [ ] **Step 2: Replace ExitPromptError catch block**

Find and replace this exact block (around line 537-544):

```typescript
} catch (err) {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    output.info('Cancelled.')
    process.exit(130)
    return
  }
  throw err
}
```

Replace the entire try/catch that wraps `runWizard` with `shutdown.withPrompt`. The `runWizard()` call (around line 460) should be wrapped:

```typescript
result = await shutdown.withPrompt(async () => runWizard({
  // ... all existing arguments unchanged ...
}))
```

Remove the try/catch block entirely — `withPrompt` handles ExitPromptError. Wrap the wizard+build section in `withContext`:

```typescript
await shutdown.withContext('Cancelled. No changes were made.', async () => {
  result = await shutdown.withPrompt(async () => runWizard({ /* existing args */ }))
  if (!result.success) {
    // ... existing error handling ...
    return
  }

  await shutdown.withContext(
    'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
    async () => {
      const buildResult = await runBuild({ /* existing args */ })
      // ... existing build handling ...
    }
  )
})
```

- [ ] **Step 3: Update init.test.ts exit code assertions**

In `src/cli/commands/init.test.ts`, find assertions checking for exit code 130 (search for `130`). Replace with `4` (the value of `ExitCode.UserCancellation`). The init handler no longer calls `process.exit(130)` — shutdown handles the exit.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/cli/commands/init.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat(shutdown): integrate init.ts — withPrompt + withContext, exit code 130→4"
```

---

### Task 10: HTTP timer fixes (version.ts + update.ts)

**Files:**
- Modify: `src/cli/commands/version.ts`
- Modify: `src/cli/commands/update.ts`

**Context for subagent:** The `shutdown` singleton from `../shutdown.js` provides `get signal(): AbortSignal` which is aborted during shutdown.

- [ ] **Step 1: Fix version.ts**

In `src/cli/commands/version.ts`, add import at top:

```typescript
import { shutdown } from '../shutdown.js'
```

In `fetchLatestVersion` (exported, around line 51), find and replace:

Old:
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
const req = https.get(url, (res) => {
```

New:
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
timeout.unref()
const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
const req = https.get(url, { signal: shutdown.signal }, (res) => {
```

Two changes: (1) `timeout.unref()` added, (2) `{ signal: shutdown.signal }` options object added to `https.get`. The existing `req.on('error')` handler already handles `AbortError` from signal abort.

- [ ] **Step 2: Fix update.ts**

In `src/cli/commands/update.ts`, add import at top:

```typescript
import { shutdown } from '../shutdown.js'
```

In `fetchLatestVersion` (private, around line 61), find and replace:

Old:
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
const req = https.get(
  `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
  (res) => {
```

New:
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
timeout.unref()
const req = https.get(
  `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
  { signal: shutdown.signal },
  (res) => {
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/version.test.ts src/cli/commands/update.test.ts`

If tests mock `https.get`, the mock signature may need updating to accept the new options argument. Check if tests fail due to the `{ signal }` parameter change — if so, update the mock to accept `(url, options, callback)` instead of `(url, callback)`.

Expected: PASS (possibly after mock update)

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/version.ts src/cli/commands/update.ts
git commit -m "feat(shutdown): HTTP timer .unref() + AbortSignal in version/update"
```

---

### Task 11: build.ts cooperative shutdown

**Files:**
- Modify: `src/cli/commands/build.ts`

**Context for subagent:** The `shutdown` singleton provides `isShuttingDown: boolean` (read-only getter) and `withContext(msg, fn)`.

- [ ] **Step 1: Add import**

In `src/cli/commands/build.ts`, add import at top:

```typescript
import { shutdown } from '../shutdown.js'
```

- [ ] **Step 2: Find the file-write loops and add isShuttingDown checks**

Read `src/cli/commands/build.ts` and find all `for` loops that write files (using `atomicWriteFile` or `writeFileSync`). There are typically 2 loops — one for pipeline output files and one for skill templates.

Add `if (shutdown.isShuttingDown) break` as the first line inside each loop body:

```typescript
for (const ... of ...) {
  if (shutdown.isShuttingDown) break
  // ... existing file write code ...
}
```

- [ ] **Step 3: Wrap build execution in withContext**

Find the main function body that does the file writing and wrap it in:

```typescript
return shutdown.withContext(
  'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
  async () => {
    // ... existing build logic ...
  }
)
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/cli/commands/build.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/build.ts
git commit -m "feat(shutdown): build.ts — cooperative isShuttingDown + withContext"
```

---

### Task 12: adopt.ts integration

**Files:**
- Modify: `src/cli/commands/adopt.ts`

**Context for subagent:** The `shutdown` singleton provides `withResource(name, cleanup, fn)` and `registerLockOwnership(path)` / `releaseLockOwnership()`. `getLockPath(projectRoot)` is exported from `../../state/lock-manager.js`. `adopt.ts` already uses `process.exitCode` (not `process.exit()`), making it ideal for `withResource`.

- [ ] **Step 1: Add imports**

In `src/cli/commands/adopt.ts`, add `getLockPath` to the existing `lock-manager` import:

```typescript
// Find the existing import like:
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
// Change to:
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
```

Add shutdown import:

```typescript
import { shutdown } from '../shutdown.js'
```

- [ ] **Step 2: Wrap lock section in withResource**

Find where `acquireLock` is called. After it succeeds, add lock ownership registration. Then wrap the lock-protected body in `withResource`, and remove all `releaseLock()` calls inside the wrapped section (they're handled by the cleanup):

```typescript
const lockResult = acquireLock(projectRoot, 'adopt')
// ... existing lock error handling ...
shutdown.registerLockOwnership(getLockPath(projectRoot))

await shutdown.withResource('lock', () => {
  releaseLock(projectRoot)
  shutdown.releaseLockOwnership()
}, async () => {
  // ... existing lock-protected code (move here) ...
  // REMOVE all releaseLock(projectRoot) calls from inside this block
})
```

Do NOT wrap `disambiguate` calls in `withPrompt` — `disambiguate.ts` handles ExitPromptError as valid input internally.

- [ ] **Step 3: Update test mock if needed**

If `src/cli/commands/adopt.test.ts` mocks `lock-manager`, add `getLockPath` to the mock:

```typescript
// Find the vi.mock for lock-manager and add getLockPath:
getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/adopt.ts src/cli/commands/adopt.test.ts
git commit -m "feat(shutdown): adopt.ts — withResource for lock cleanup"
```

---

### Task 13: skip.ts integration

**Files:**
- Modify: `src/cli/commands/skip.ts`
- Modify: `src/cli/commands/skip.test.ts` (if exists)

**Context for subagent:** Same imports and patterns as Task 12. `skip.ts` has a `skipSingle` helper function that acquires a lock and has one `output.confirm()` call. Only convert `process.exit()` calls that are INSIDE the lock-protected scope. Leave `process.exit()` calls that happen before lock acquisition unchanged.

- [ ] **Step 1: Add imports**

Add `getLockPath` to the existing `lock-manager` import. Add `shutdown` import:

```typescript
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
```

- [ ] **Step 2: Wrap lock section in withResource**

Find where `acquireLock` is called in the handler or helper function. Wrap the lock-protected body in `withResource`. Add `shutdown.registerLockOwnership(getLockPath(projectRoot))` after lock acquisition.

Convert `process.exit(N)` calls INSIDE the `withResource` block to `process.exitCode = N; return`.

**Important:** `process.exit()` calls BEFORE lock acquisition (e.g., argument validation failures) should be LEFT UNCHANGED — they're not inside `withResource` scope.

- [ ] **Step 3: Wrap output.confirm() in withPrompt**

Find the `output.confirm()` call and wrap it:

```typescript
const confirmed = await shutdown.withPrompt(() => output.confirm(...))
```

- [ ] **Step 4: Update test file**

If `skip.test.ts` exists and mocks `process.exit` or `lock-manager`, update:
- Add `getLockPath` to the lock-manager mock
- For exit assertions inside the lock scope, change `expect(exitSpy).toHaveBeenCalledWith(N)` to `expect(process.exitCode).toBe(N)`

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/skip.ts src/cli/commands/skip.test.ts
git commit -m "feat(shutdown): skip.ts — withResource + withPrompt"
```

---

### Task 14: complete.ts integration

**Files:**
- Modify: `src/cli/commands/complete.ts`
- Modify: `src/cli/commands/complete.test.ts` (if exists)

**Context for subagent:** Same pattern as Task 13 but simpler — no prompts, just lock.

- [ ] **Step 1: Add imports**

Same pattern: add `getLockPath` to lock-manager import, add `shutdown` import.

- [ ] **Step 2: Wrap lock section in withResource**

Same pattern as Task 13. Convert `process.exit(N)` inside lock scope to `process.exitCode = N; return`.

- [ ] **Step 3: Update test file**

Same pattern: add `getLockPath` to mock, update exit assertions.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run`
Expected: PASS

```bash
git add src/cli/commands/complete.ts src/cli/commands/complete.test.ts
git commit -m "feat(shutdown): complete.ts — withResource for lock cleanup"
```

---

### Task 15: rework.ts integration

**Files:**
- Modify: `src/cli/commands/rework.ts`
- Modify: `src/cli/commands/rework.test.ts` (if exists)

**Context for subagent:** Same pattern. Key difference: `rework.ts` has multiple branches (`--advance`, `--resume`, `--clear`, new rework). Only the new-rework-creation branch acquires a lock. The `--advance` and `--resume` branches do NOT acquire locks — do not wrap those branches.

- [ ] **Step 1: Add imports**

Same pattern.

- [ ] **Step 2: Wrap ONLY the lock-acquiring branch in withResource**

Read `rework.ts` and identify which branch calls `acquireLock`. Only wrap that branch. Leave other branches unchanged.

Convert `process.exit(N)` calls INSIDE the withResource block to `process.exitCode = N; return`.

- [ ] **Step 3: Update test file**

Same pattern.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run`
Expected: PASS

```bash
git add src/cli/commands/rework.ts src/cli/commands/rework.test.ts
git commit -m "feat(shutdown): rework.ts — withResource for lock cleanup"
```

---

### Task 16: reset.ts integration

**Files:**
- Modify: `src/cli/commands/reset.ts`
- Modify: `src/cli/commands/reset.test.ts` (if exists)

**Context for subagent:** `reset.ts` has TWO sub-commands with different lock/prompt ordering:
- `resetStep()`: acquires lock FIRST, then prompts → `withResource` wraps outer, `withPrompt` wraps inner
- `resetPipeline()`: prompts FIRST (line ~187), then acquires lock (line ~210) → `withPrompt` wraps outer, `withResource` wraps inner

Both may have `--force` bypass paths that skip the lock entirely.

- [ ] **Step 1: Add imports**

```typescript
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
```

- [ ] **Step 2: Integrate resetStep()**

Find `resetStep` function. It acquires lock first, then prompts. Wrap lock in `withResource`, wrap confirm in `withPrompt`. Convert `process.exit(N)` inside lock scope to `process.exitCode = N; return`.

- [ ] **Step 3: Integrate resetPipeline()**

Find `resetPipeline` function. It prompts first, THEN acquires lock. The `withPrompt` wraps the confirm OUTSIDE the lock section. After confirm returns true, acquire lock, wrap in `withResource`:

```typescript
// Prompt happens BEFORE lock:
const confirmed = await shutdown.withPrompt(() => output.confirm(...))
if (!confirmed) return

// Lock happens AFTER prompt:
const lockResult = acquireLock(projectRoot, 'reset')
// ... error handling ...
shutdown.registerLockOwnership(getLockPath(projectRoot))

await shutdown.withResource('lock', () => {
  releaseLock(projectRoot)
  shutdown.releaseLockOwnership()
}, async () => {
  // ... pipeline reset logic ...
})
```

- [ ] **Step 4: Update test file**

Add `getLockPath` to the lock-manager mock. Update exit assertions inside lock scope from `expect(exitSpy).toHaveBeenCalledWith(N)` to `expect(process.exitCode).toBe(N)`.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run`
Expected: PASS

```bash
git add src/cli/commands/reset.ts src/cli/commands/reset.test.ts
git commit -m "feat(shutdown): reset.ts — withResource + withPrompt (two sub-commands)"
```

---

### Task 17: run.ts — process.exit() migration

**Files:**
- Modify: `src/cli/commands/run.ts`
- Modify: `src/cli/commands/run.test.ts`

**Context for subagent:** `run.ts` is ~500 lines with 15 `process.exit()` calls and `run.test.ts` has ~66 exit-related lines. The test file mocks `process.exit` as `throw new Error('process.exit called')` and uses `rejects.toThrow('process.exit called')`. This task ONLY converts exits — shutdown integration is Task 18.

This task converts `process.exit(N)` to `process.exitCode = N; return` so that `withResource`'s `finally` blocks will execute in Task 18.

**Important:** Only convert `process.exit()` calls that are in the handler function body or in code that will be inside a `withResource` block. Leave any early validation exits that happen before the handler's main logic.

- [ ] **Step 1: Convert process.exit() calls in run.ts**

Read `src/cli/commands/run.ts`. For each `process.exit(N)`, replace with:

```typescript
process.exitCode = N
return
```

All 15 `process.exit()` calls are in the top-level handler function, so `return` returns from the handler. No nested function propagation is needed — the handler's `process.exit()` calls are all at the handler scope level.

- [ ] **Step 2: Update run.test.ts**

The test file mocks `process.exit` with a throwing implementation:

```typescript
vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit called') }) as never)
```

And tests use:
```typescript
await expect(handler(argv)).rejects.toThrow('process.exit called')
```

Since `process.exit()` is no longer called, the handler completes normally. Update the test pattern:

1. Remove or change the `process.exit` mock — it's no longer called for these paths
2. Replace `await expect(handler(argv)).rejects.toThrow('process.exit called')` with:
```typescript
await handler(argv)
expect(process.exitCode).toBe(N)
```

Do this for each test that checks for `process.exit`. Reset `process.exitCode` in `afterEach`:

```typescript
afterEach(() => {
  process.exitCode = undefined
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/run.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/run.test.ts
git commit -m "refactor(run): convert process.exit() to process.exitCode for shutdown compatibility"
```

---

### Task 18: run.ts — shutdown integration

**Files:**
- Modify: `src/cli/commands/run.ts`

**Depends on:** Task 17 (process.exit migration must be complete first)

**Context for subagent:** After Task 17, `run.ts` uses `process.exitCode` instead of `process.exit()`. Now add shutdown wrappers. The `shutdown` singleton provides `withResource`, `withPrompt`, `withContext`, `registerLockOwnership`, `releaseLockOwnership`. `getLockPath` is exported from `../../state/lock-manager.js`.

- [ ] **Step 1: Add imports**

Add `getLockPath` to the existing `lock-manager` import. Add `shutdown` import:

```typescript
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
```

- [ ] **Step 2: Wrap lock management in withResource**

Find where `acquireLock` succeeds. Add lock ownership, wrap in `withResource`:

```typescript
shutdown.registerLockOwnership(getLockPath(projectRoot))

await shutdown.withResource('lock', () => {
  releaseLock(projectRoot)
  shutdown.releaseLockOwnership()
}, async () => {
  // ... move existing lock-protected handler body here ...
})
```

Remove all scattered `releaseLock(projectRoot)` calls inside the wrapped section — `withResource` handles cleanup.

**Note:** If `--force` bypasses the lock, the non-locked path should NOT be wrapped in `withResource`.

- [ ] **Step 3: Wrap all 5 output.confirm() calls in withPrompt**

Find each `output.confirm(...)` call and wrap:

```typescript
const confirmed = await shutdown.withPrompt(() => output.confirm(...))
```

This fixes the pre-existing bug where Ctrl+C during a `run` confirmation shows `RUN_UNEXPECTED_ERROR`.

- [ ] **Step 4: Add withContext**

Wrap the step-execution section:

```typescript
await shutdown.withContext(
  () => {
    const state = stateManager.loadState()
    return state.in_progress !== null
      ? 'Cancelled. Step progress cleared.'
      : 'Cancelled.'
  },
  async () => {
    // ... step execution logic ...
  }
)
```

- [ ] **Step 5: Update test mock**

In `run.test.ts`, add `getLockPath` to the lock-manager mock:

```typescript
getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/cli/commands/run.test.ts`
Expected: PASS

- [ ] **Step 7: Run full quality gate**

Run: `make check-all`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/run.test.ts
git commit -m "feat(shutdown): run.ts — withResource, withPrompt, withContext integration"
```

---

### Task 19: Final verification

**Files:**
- None modified — verification only

- [ ] **Step 1: Run full quality gate**

Run: `make check-all`
Expected: All checks PASS

- [ ] **Step 2: Run vitest with coverage**

Run: `npx vitest run --coverage`
Expected: Coverage thresholds met

- [ ] **Step 3: Smoke test via signal**

Create a quick test script to verify graceful shutdown works end-to-end:

```bash
# In a temp directory, verify scaffold exits cleanly on SIGINT
cd "$(mktemp -d)"
timeout 5 scaffold init --auto --methodology deep 2>&1 || true
# Should see clean exit, no stack traces
```

- [ ] **Step 4: Create final commit if any fixes needed**

```bash
# Only if fixes were needed during verification
git add -A
git commit -m "fix(shutdown): address issues found during final verification"
```

---

## Task Dependency Graph

```
Task 1 (skeleton) ─────────────────────────────────────────────┐
  ├─ Task 2 (SIGINT) ──────────────────────────────────────────┤
  ├─ Task 3 (SIGTERM + shutdown) ──────────────────────────────┤
  ├─ Task 4 (withPrompt) ─────────────────────────────────────┤
  ├─ Task 5 (withResource) ───────────────────────────────────┤
  ├─ Task 6 (withContext + lock + exit) ──────────────────────┤
  │                                                            │
  └─ Task 7 (getLockPath + install wire) ──────────────────────┤
     └─ Task 8 (spinner) ─────────────────────────────────────┤
                                                               │
Tasks 2-8 complete ────────────────────────────────────────────┤
  ├─ Task 9 (init.ts) ────────────────────────────────────────┤
  ├─ Task 10 (HTTP fixes) ────────────────────────────────────┤
  ├─ Task 11 (build.ts) ──────────────────────────────────────┤
  ├─ Task 12 (adopt.ts) ──────────────────────────────────────┤
  ├─ Task 13 (skip.ts) ───────────────────────────────────────┤
  ├─ Task 14 (complete.ts) ───────────────────────────────────┤
  ├─ Task 15 (rework.ts) ─────────────────────────────────────┤
  ├─ Task 16 (reset.ts) ──────────────────────────────────────┤
  ├─ Task 17 (run.ts exit migration) ─────────────────────────┤
  │     └─ Task 18 (run.ts shutdown) ─────────────────────────┤
  │                                                            │
  └─ Task 19 (final verification) ────────────────────────────┘
```

**Phase 1** (Tasks 1-8): Core ShutdownManager — sequential, each ~10 min.
**Phase 2** (Tasks 9-18): Command integration — parallelizable (except 17→18).
**Phase 3** (Task 19): Verification — must wait for all others.
