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
| `src/cli/commands/complete.ts` | Modify | withResource for lock |
| `src/cli/commands/rework.ts` | Modify | withResource for lock |
| `src/cli/commands/reset.ts` | Modify | withResource + withPrompt (two sub-commands) |
| `src/cli/commands/run.ts` | Modify | process.exit migration + full shutdown integration |

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

function createFakeProcess(): ShutdownProcess & { emit: (event: string, ...args: unknown[]) => boolean } {
  const emitter = new EventEmitter()
  return {
    on: emitter.on.bind(emitter) as ShutdownProcess['on'],
    removeListener: emitter.removeListener.bind(emitter) as ShutdownProcess['removeListener'],
    exit: vi.fn() as unknown as ShutdownProcess['exit'],
    env: {},
    stdout: { writable: true, isTTY: true, write: vi.fn(() => true) },
    stderr: { writable: true, write: vi.fn(() => true) },
    emit: emitter.emit.bind(emitter),
  }
}

describe('ShutdownManager', () => {
  let proc: ReturnType<typeof createFakeProcess>
  let mgr: ShutdownManager

  beforeEach(() => {
    proc = createFakeProcess()
    mgr = new ShutdownManager(proc)
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
      const emitter = proc as unknown as EventEmitter
      expect(emitter.listenerCount('SIGINT')).toBe(1)
      expect(emitter.listenerCount('SIGTERM')).toBe(1)
    })
  })

  describe('reset()', () => {
    it('removes signal listeners', () => {
      mgr.install()
      mgr.reset()
      const emitter = proc as unknown as EventEmitter
      expect(emitter.listenerCount('SIGINT')).toBe(0)
      expect(emitter.listenerCount('SIGTERM')).toBe(0)
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
Expected: PASS (3 tests)

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

- [ ] **Step 1: Read current init.ts to understand the flow**

Read `src/cli/commands/init.ts` from the handler function (around line 415) to understand the full flow before modifying.

- [ ] **Step 2: Add imports**

Add at the top of `src/cli/commands/init.ts`:

```typescript
import { shutdown } from '../shutdown.js'
import { ExitCode } from '../../types/enums.js'
```

- [ ] **Step 3: Replace ExitPromptError catch with withPrompt + withContext**

Find the `try/catch` block that wraps the `runWizard` call (around lines 458-544). Replace the try/catch structure. The handler body should wrap the wizard + build in `withContext` and use `withPrompt` around `runWizard`:

Replace the existing try/catch pattern:
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

With a `withContext` + `withPrompt` wrapper around the `runWizard()` call. The `runWizard` call should be inside `shutdown.withPrompt(async () => runWizard(...))` and the whole init body should be inside `shutdown.withContext(...)`. Let ExitPromptError propagate up through withPrompt naturally.

After the change, the exit code for user cancellation becomes `ExitCode.UserCancellation` (4) instead of 130.

- [ ] **Step 4: Update init.test.ts exit code assertions**

In `src/cli/commands/init.test.ts`, find any assertions that check for exit code 130 and update them to check for `ExitCode.UserCancellation` (value 4).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/cli/commands/init.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat(shutdown): integrate init.ts — withPrompt + withContext, exit code 130→4"
```

---

### Task 10: HTTP timer fixes (version.ts + update.ts)

**Files:**
- Modify: `src/cli/commands/version.ts`
- Modify: `src/cli/commands/update.ts`

- [ ] **Step 1: Fix version.ts**

In `src/cli/commands/version.ts`, add import:

```typescript
import { shutdown } from '../shutdown.js'
```

In the `fetchLatestVersion` function (line 51-73), make two changes:

1. Add `.unref()` to the setTimeout (line 53):
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
timeout.unref()
```

2. Pass `shutdown.signal` to https.get (line 55). Add signal to the options and handle abort:
```typescript
const req = https.get(url, { signal: shutdown.signal }, (res) => {
```

Also add an abort error handler after the existing `req.on('error')`:
```typescript
req.on('error', (err) => {
  clearTimeout(timeout)
  resolve(null)
})
```

The existing error handler already handles this — `signal` abort causes an `AbortError` which triggers `req.on('error')`.

- [ ] **Step 2: Fix update.ts**

In `src/cli/commands/update.ts`, add import:

```typescript
import { shutdown } from '../shutdown.js'
```

Same two changes in `fetchLatestVersion` (line 61-87):

1. Add `.unref()` to setTimeout (line 63):
```typescript
const timeout = setTimeout(() => resolve(null), 3000)
timeout.unref()
```

2. Pass `shutdown.signal` to https.get (line 64):
```typescript
const req = https.get(
  `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
  { signal: shutdown.signal },
  (res) => {
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/version.ts src/cli/commands/update.ts
git commit -m "feat(shutdown): HTTP timer .unref() + AbortSignal in version/update"
```

---

### Task 11: build.ts cooperative shutdown

**Files:**
- Modify: `src/cli/commands/build.ts`

- [ ] **Step 1: Read build.ts to find the file-write loops**

Read `src/cli/commands/build.ts` to find the loops that call `atomicWriteFile` and `writeFileSync`. Note the line numbers.

- [ ] **Step 2: Add imports and isShuttingDown checks**

Add import:

```typescript
import { shutdown } from '../shutdown.js'
```

Add `if (shutdown.isShuttingDown) break` at the top of each file-writing loop body. Also wrap the build in `withContext`:

Find the main build execution and wrap it:

```typescript
await shutdown.withContext(
  'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
  async () => {
    // ... existing build logic with isShuttingDown checks in loops ...
  }
)
```

Inside each loop that writes files, add the check:

```typescript
for (const ... of ...) {
  if (shutdown.isShuttingDown) break
  // ... existing write logic ...
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/build.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/build.ts
git commit -m "feat(shutdown): build.ts — cooperative isShuttingDown + withContext"
```

---

### Task 12: adopt.ts integration

**Files:**
- Modify: `src/cli/commands/adopt.ts`

- [ ] **Step 1: Read adopt.ts to find lock acquire/release pattern**

Read `src/cli/commands/adopt.ts` to find where `acquireLock` and `releaseLock` are called, and confirm it uses `process.exitCode` (not `process.exit()`).

- [ ] **Step 2: Add imports and wrap lock in withResource**

Add imports:

```typescript
import { shutdown } from '../shutdown.js'
import { getLockPath } from '../../state/lock-manager.js'
```

Wrap the lock-protected section in `withResource`. After `acquireLock`, call `shutdown.registerLockOwnership(getLockPath(projectRoot))`. The `withResource` cleanup should call `releaseLock(projectRoot)` and `shutdown.releaseLockOwnership()`. Remove the scattered `releaseLock()` calls that are now handled by `withResource`.

Note: Do NOT wrap `disambiguate` calls in `withPrompt` — `disambiguate.ts` already handles `ExitPromptError` as valid input.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/adopt.test.ts 2>/dev/null; npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/adopt.ts
git commit -m "feat(shutdown): adopt.ts — withResource for lock cleanup"
```

---

### Task 13: skip.ts + complete.ts + rework.ts integration

**Files:**
- Modify: `src/cli/commands/skip.ts`
- Modify: `src/cli/commands/complete.ts`
- Modify: `src/cli/commands/rework.ts`

- [ ] **Step 1: Read all three files to understand lock patterns**

Read `src/cli/commands/skip.ts`, `complete.ts`, and `rework.ts` to find where locks are acquired/released and where prompts exist.

- [ ] **Step 2: Integrate skip.ts**

Add imports:
```typescript
import { shutdown } from '../shutdown.js'
import { getLockPath } from '../../state/lock-manager.js'
```

Wrap lock-protected section in `withResource`. Wrap the `output.confirm()` call in `withPrompt`. Replace `process.exit()` calls inside the wrapped section with `process.exitCode = N; return`. After `acquireLock`, call `shutdown.registerLockOwnership(getLockPath(projectRoot))`.

- [ ] **Step 3: Integrate complete.ts**

Same pattern as skip.ts but no prompts — just `withResource` for the lock. Add same imports, wrap lock section, replace `process.exit()` with `process.exitCode`.

- [ ] **Step 4: Integrate rework.ts**

Same pattern. Note: only the new-rework-creation branch acquires a lock; `--advance` and `--resume` do not. Only wrap the branch that acquires the lock.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/skip.ts src/cli/commands/complete.ts src/cli/commands/rework.ts
git commit -m "feat(shutdown): skip/complete/rework — withResource for lock cleanup"
```

---

### Task 14: reset.ts integration

**Files:**
- Modify: `src/cli/commands/reset.ts`

- [ ] **Step 1: Read reset.ts to understand the two sub-commands**

Read `src/cli/commands/reset.ts`. Key insight: `resetStep()` acquires lock FIRST then prompts, but `resetPipeline()` prompts FIRST then acquires lock. Different wrapping order needed.

- [ ] **Step 2: Add imports**

```typescript
import { shutdown } from '../shutdown.js'
import { getLockPath } from '../../state/lock-manager.js'
```

- [ ] **Step 3: Integrate resetStep()**

`resetStep` acquires lock first, then confirms. Wrap lock in `withResource`, wrap confirm in `withPrompt`. Replace `process.exit()` with `process.exitCode = N; return`.

- [ ] **Step 4: Integrate resetPipeline()**

`resetPipeline` confirms first (line 187), then acquires lock (line 210). Wrap the confirm in `withPrompt` OUTSIDE `withResource`. Then wrap the lock section in `withResource` after the confirm returns. Replace `process.exit()` with `process.exitCode = N; return`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/reset.ts
git commit -m "feat(shutdown): reset.ts — withResource + withPrompt (two sub-commands)"
```

---

### Task 15: run.ts — process.exit() migration

**Files:**
- Modify: `src/cli/commands/run.ts`

This task ONLY converts `process.exit()` calls to `process.exitCode + return`. No shutdown integration yet — that's Task 16.

- [ ] **Step 1: Read run.ts and identify all process.exit() calls**

Read `src/cli/commands/run.ts` and list every `process.exit(N)` call. Each must be converted to `process.exitCode = N; return`.

- [ ] **Step 2: Convert each process.exit() to process.exitCode + return**

For each `process.exit(N)` in the handler function, replace with:
```typescript
process.exitCode = N
return
```

For calls inside nested functions (not the top-level handler), the function must also return and the caller must check the return value. Read the code carefully to determine the right approach for each call site.

- [ ] **Step 3: Run existing tests to verify behavior is preserved**

Run: `npx vitest run src/cli/commands/run.test.ts`
Expected: PASS — all existing behavior preserved

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "refactor(run): convert process.exit() to process.exitCode for shutdown compatibility"
```

---

### Task 16: run.ts — shutdown integration

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Add imports**

```typescript
import { shutdown } from '../shutdown.js'
import { getLockPath } from '../../state/lock-manager.js'
```

- [ ] **Step 2: Wrap lock management in withResource**

After `acquireLock` succeeds, call `shutdown.registerLockOwnership(getLockPath(projectRoot))`. Wrap the lock-protected body in:

```typescript
await shutdown.withResource('lock', () => {
  releaseLock(projectRoot)
  shutdown.releaseLockOwnership()
}, async () => {
  // ... existing handler body ...
})
```

Remove all the scattered `if (lockAcquired) releaseLock(projectRoot)` calls — `withResource` handles this now.

- [ ] **Step 3: Wrap confirmation prompts in withPrompt**

Find all 5 `output.confirm()` calls and wrap each in `shutdown.withPrompt()`:

```typescript
const confirmed = await shutdown.withPrompt(() => output.confirm(...))
```

This fixes the pre-existing bug where ExitPromptError during `run` shows `RUN_UNEXPECTED_ERROR`.

- [ ] **Step 4: Add withContext for phase-aware messaging**

Wrap the step-execution section in:

```typescript
await shutdown.withContext(
  () => stateManager.loadState().in_progress !== null
    ? 'Cancelled. Step progress cleared.'
    : 'Cancelled.',
  async () => {
    // ... step execution logic ...
  }
)
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/cli/commands/run.test.ts`
Expected: PASS

- [ ] **Step 6: Run full quality gate**

Run: `make check-all`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat(shutdown): run.ts — withResource, withPrompt, withContext integration"
```

---

### Task 17: Final verification

**Files:**
- None modified — verification only

- [ ] **Step 1: Run full quality gate**

Run: `make check-all`
Expected: All checks PASS

- [ ] **Step 2: Run vitest with coverage**

Run: `npx vitest run --coverage`
Expected: Coverage thresholds met

- [ ] **Step 3: Manual smoke test**

Run `scaffold init` in a temp directory and press Ctrl+C at various points:
- During methodology selection → should show "Cancelled." and exit cleanly
- During project type selection → same
- After wizard completes during build → should show partial output message

Run `scaffold version` and press Ctrl+C → should exit cleanly without hanging

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
  ├─ Task 13 (skip/complete/rework) ──────────────────────────┤
  ├─ Task 14 (reset.ts) ──────────────────────────────────────┤
  ├─ Task 15 (run.ts exit migration) ─────────────────────────┤
  │     └─ Task 16 (run.ts shutdown) ─────────────────────────┤
  │                                                            │
  └─ Task 17 (final verification) ────────────────────────────┘
```

**Phase 1** (Tasks 1-8): Core ShutdownManager — can be done sequentially, each ~10 min.
**Phase 2** (Tasks 9-16): Command integration — can be parallelized across subagents (except 15→16).
**Phase 3** (Task 17): Verification — must wait for all others.
