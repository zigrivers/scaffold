# Graceful Shutdown Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Author:** Ken Allred + Claude (4 rounds of multi-model review: 3x Claude, 1x Codex+Gemini+Claude)

## Problem

The scaffold CLI has zero signal handling. When a user presses Ctrl+C during an interactive prompt, they see an ugly stack trace (`ExitPromptError: User force closed the prompt with SIGINT`). Spinners, locks, and partial `.scaffold/` state are left behind. There is no cleanup, no informative messaging, and no graceful exit path.

## Goals

1. **Clean terminal output** — no stack trace, just a friendly contextual message and clean exit
2. **State safety** — if Ctrl+C happens mid-init, ensure `.scaffold/` is either fully created or fully cleaned up (no partial state)
3. **Resumability** — hybrid: roll back during wizard phase (no answers committed), preserve state during build phase (config finalized, build is idempotent)
4. **Shared infrastructure** — all interactive commands benefit, not just `init`

## Non-Goals

- No `setPromptActive` — removed entirely (readline handles separation)
- No `lastSignal` tracking for `.unref()` decisions — timeout always ref'd (a simple `triggeredBySigterm` boolean distinguishes timeout duration only)
- No debounce — three-stage state machine replaces it
- No `process.exit()` refactoring of existing 50+ call sites — safety net covers them; gradual migration over time

---

## Architecture

### ShutdownManager API

```typescript
class ShutdownManager {
  constructor(proc?: ShutdownProcess);

  install(): void;
  withPrompt<T>(fn: () => Promise<T>): Promise<T>;
  withResource<T>(name: string, cleanup: CleanupFn, fn: () => T | Promise<T>): Promise<T>;
  withContext<T>(message: string | (() => string), fn: () => T | Promise<T>): Promise<T>;
  register(name: string, cleanup: CleanupFn, opts?: { priority?: 'critical' }): Deregister;
  registerLockOwnership(path: string): void;
  releaseLockOwnership(): void;
  get isShuttingDown(): boolean;
  get signal(): AbortSignal;
  shutdown(exitCode?: number): Promise<never>;
  reset(): void; // test isolation only
}

type CleanupFn = () => void | Promise<void>;
type Deregister = () => void;

interface ShutdownProcess {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  exit(code?: number): never;
  env: Record<string, string | undefined>;
  stdout: { writable?: boolean; write(s: string): boolean };
  stderr: { writable?: boolean; write(s: string): boolean };
}

export const shutdown: ShutdownManager;
```

**File location:** `src/cli/shutdown.ts`

### Exit Codes

Uses scaffold's own `ExitCode` enum from `src/types/enums.ts`, NOT POSIX conventions:

- User cancellation (Ctrl+C, SIGINT, SIGTERM): `ExitCode.UserCancellation` (value 4)
- This aligns with ADR-025 (CLI output contract) and maintains consistency for automation consumers

### Signal Handling (Dual-Path)

The key insight: **keyboard Ctrl+C during a readline prompt never reaches `process.on('SIGINT')`** (only true for TTY + raw mode). Readline intercepts the `0x03` byte at the keypress level and emits `'SIGINT'` on the readline interface, not the process. @inquirer catches `rl.on('SIGINT')` and throws `ExitPromptError`.

```
Keyboard Ctrl+C during prompt (TTY + raw mode):
  -> readline intercepts at keypress level
  -> @inquirer throws ExitPromptError
  -> withPrompt catches it by name (err.name === 'ExitPromptError')
  -> calls shutdown(ExitCode.UserCancellation)
  -> process.on('SIGINT') never fires

Keyboard Ctrl+C outside prompt:
  -> process.on('SIGINT') fires
  -> ShutdownManager's SIGINT handler handles directly

External kill -2 during prompt:
  -> process.on('SIGINT') fires (readline does NOT intercept kernel signals)
  -> ShutdownManager calls shutdown()
  -> @inquirer's prompt is abandoned (signal-exit defers when other listeners exist)
  -> idempotency guard prevents double shutdown

SIGTERM:
  -> single-stage, always: run cleanup -> exit(ExitCode.UserCancellation)
```

**ExitPromptError detection:** Always use `err.name === 'ExitPromptError'` (name-based), never `instanceof`. `ExitPromptError` is not exported from `@inquirer/prompts` — only from `@inquirer/core`. Name-based detection is stable across package versions and duplicates. This matches existing codebase conventions (`init.ts:538`, `disambiguate.ts:110`).

### Three-Stage Ctrl+C (TTY only, SIGINT only)

The SIGINT handler has its own independent state machine, separate from `shutdown()` idempotency:

```typescript
private sigintState: 'idle' | 'cleaning' | 'armed' = 'idle';

private sigintHandler = () => {
  if (!this.proc.stdout.isTTY) {
    // Non-TTY: immediate cleanup + exit, no stages
    if (this.sigintState === 'idle') {
      this.sigintState = 'cleaning';
      this.shutdown(ExitCode.UserCancellation);
    } else {
      this.proc.exit(ExitCode.UserCancellation);
    }
    return;
  }

  switch (this.sigintState) {
    case 'idle':
      this.sigintState = 'cleaning';
      this.shutdown(ExitCode.UserCancellation); // floating promise, ref'd timeout keeps it alive
      break;
    case 'cleaning':
      this.proc.stderr.write('\nPress Ctrl+C again to force quit.\n');
      this.sigintState = 'armed';
      break;
    case 'armed':
      this.proc.stderr.write('\nForce quit.\n');
      this.proc.exit(ExitCode.UserCancellation);
      break;
  }
};
```

Only the `idle -> cleaning` transition calls `shutdown()`. The `cleaning -> armed -> force-quit` path is handled entirely by the SIGINT handler, independent of the `shutdown()` idempotency guard.

### Cleanup Execution

```typescript
async shutdown(exitCode = ExitCode.UserCancellation): Promise<never> {
  if (this.shuttingDown) {
    // Already in progress — hang caller until process.exit() kills everything
    return new Promise<never>(() => {});
  }
  this.shuttingDown = true;

  // Abort all signal-aware operations (HTTP requests, etc.)
  this.controller.abort();

  // Phase-aware message from AsyncLocalStorage context
  const msg = this.currentContext;
  this.proc.stderr.write(`\n${msg}\n`);

  // Hard timeout — always ref'd (keeps event loop alive for cleanup)
  const timeoutMs = this.getTimeoutMs();
  const timeout = setTimeout(() => this.proc.exit(exitCode), timeoutMs);

  // Critical disposers: run sequentially (locks, terminal state)
  const critical = [...this.registry]
    .filter(([, v]) => v.priority === 'critical').reverse();
  for (const [, d] of critical) {
    try { await Promise.resolve(d.cleanup()); } catch { /* continue */ }
  }

  // Normal disposers: run in parallel
  const normal = [...this.registry]
    .filter(([, v]) => v.priority !== 'critical').reverse();
  await Promise.allSettled(normal.map(([, d]) => {
    try { return Promise.resolve(d.cleanup()); }
    catch { return Promise.resolve(); }
  }));

  clearTimeout(timeout);
  this.proc.exit(exitCode); // always explicit — never rely on event loop drain
}

private getTimeoutMs(): number {
  const env = this.proc.env?.SCAFFOLD_SHUTDOWN_TIMEOUT_MS;
  if (env) {
    const n = Number(env);
    if (!Number.isNaN(n) && n > 0) return Math.max(500, Math.min(n, 10000));
  }
  return this.triggeredBySigterm ? 5000 : 2000;
}
```

**Cleanup ordering:**
1. Critical disposers run **sequentially** in LIFO order (locks, terminal state). Each wrapped in try-catch so one failure doesn't skip others.
2. Normal disposers run **in parallel** via `Promise.allSettled` (spinners, partial state, etc.). Synchronous throws converted to rejected promises.
3. `process.exit()` always called at end — never rely on natural event loop drain.

**Timeout:** SIGINT default 2000ms, SIGTERM default 5000ms. Override via `SCAFFOLD_SHUTDOWN_TIMEOUT_MS` env var (range: 500-10000ms, invalid values ignored).

### Context Management (AsyncLocalStorage)

Uses `AsyncLocalStorage` to avoid stack corruption when async scopes overlap:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

private contextStorage = new AsyncLocalStorage<string | (() => string)>();
private fallbackContext = 'Cancelled.';

async withContext<T>(
  message: string | (() => string), fn: () => T | Promise<T>
): Promise<T> {
  return this.contextStorage.run(message, () => Promise.resolve(fn()));
}

private get currentContext(): string {
  const ctx = this.contextStorage.getStore() ?? this.fallbackContext;
  return typeof ctx === 'function' ? ctx() : ctx;
}
```

Each async scope has its own context. No push/pop interleaving. Safe for concurrent operations.

### withPrompt (abort semantics only)

```typescript
async withPrompt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && e.name === 'ExitPromptError') {
      return this.shutdown(ExitCode.UserCancellation);
    }
    throw e;
  }
}
```

**Usage constraint:** `withPrompt` is for prompts where Ctrl+C means "abort the command." For prompts where cancellation is a valid input (like `disambiguate.ts`), keep the existing `try/catch` pattern and handle `ExitPromptError` as a return value, not a shutdown trigger.

### withResource (idempotent cleanup guard)

```typescript
async withResource<T>(
  name: string, cleanup: CleanupFn, fn: () => T | Promise<T>
): Promise<T> {
  let cleaned = false;
  const guardedCleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await cleanup();
  };
  const deregister = this.register(name, guardedCleanup);
  try {
    return await fn();
  } finally {
    deregister(); // remove from shutdown registry first
    try { await guardedCleanup(); } catch { /* best effort */ }
  }
}
```

Whichever path runs first (shutdown or normal finally) executes real cleanup; the other is a no-op via the `cleaned` flag.

**Important:** `process.exit()` inside `fn()` will skip the `finally` block. Commands using `withResource` should prefer `throw` or `return` + `process.exitCode` for early exit. The `process.on('exit')` safety net covers critical cleanup (lock release) as a fallback.

### Late Registration

```typescript
register(name: string, cleanup: CleanupFn, opts?: { priority?: 'critical' }): Deregister {
  if (this.shuttingDown) {
    // During shutdown: run cleanup immediately, return no-op deregister
    Promise.resolve(cleanup()).catch(() => {});
    return () => {};
  }
  this.registry.set(name, { cleanup, priority: opts?.priority });
  return () => { this.registry.delete(name); };
}
```

### AbortSignal

```typescript
import { setMaxListeners } from 'node:events';

private controller = new AbortController();

constructor(proc: ShutdownProcess = process) {
  this.proc = proc;
  setMaxListeners(0, this.controller.signal); // prevent MaxListenersExceeded warning
}

get signal(): AbortSignal {
  return this.controller.signal;
}
```

`setMaxListeners(0)` prevents `MaxListenersExceededWarning` when many HTTP calls share the global signal.

### Lock Ownership Guard

The exit safety net only deletes the lock file if this process still owns it, preventing deletion of another process's lock (per ADR-019):

```typescript
private lockOwned = false;
private lockPath: string | null = null;

registerLockOwnership(path: string): void {
  this.lockPath = path;
  this.lockOwned = true;
}

releaseLockOwnership(): void {
  this.lockOwned = false;
  this.lockPath = null;
}
```

Commands call `registerLockOwnership` after `acquireLock` and `releaseLockOwnership` after `releaseLock`.

### Exit Safety Net

```typescript
private exitHandlerRan = false;

private installExitHandler(): void {
  this.proc.on('exit', () => {
    if (this.exitHandlerRan) return;
    this.exitHandlerRan = true;
    // Only delete lock if WE still own it
    if (this.lockOwned && this.lockPath) {
      try { fs.unlinkSync(this.lockPath); } catch { /* ok */ }
    }
    // Cursor restore via stderr (more reliable than stdout when piped)
    if (this.proc.stderr?.writable) {
      try { this.proc.stderr.write('\x1b[?25h\n'); } catch { /* ok */ }
    }
  });
}
```

**This is a last-resort safety net**, not the primary cleanup path. It catches `process.exit()` calls from any location. Cursor restore is **exclusively** here (not as an async disposer) to guarantee it runs even if async cleanup hangs.

### install() Ordering

```typescript
install(): void {
  this.proc.on('SIGINT', this.sigintHandler);
  this.proc.on('SIGTERM', this.sigtermHandler);
  this.installExitHandler();
}
```

Must be called in `runCli()` at CLI startup, NOT at import time. This ensures ShutdownManager's SIGINT handler registers after `signal-exit`'s handler (installed when @inquirer modules load), allowing `signal-exit` to correctly detect other handlers and defer.

### Test Isolation

```typescript
reset(): void {
  this.shuttingDown = false;
  this.sigintState = 'idle';
  this.exitHandlerRan = false;
  this.lockOwned = false;
  this.lockPath = null;
  this.registry.clear();
  this.controller = new AbortController();
  setMaxListeners(0, this.controller.signal);
  this.proc.removeListener('SIGINT', this.sigintHandler);
  this.proc.removeListener('SIGTERM', this.sigtermHandler);
}
```

Tests call `shutdown.reset()` in `afterEach`. DI via `new ShutdownManager(fakeProcess)` for unit tests.

### Spinner Integration

`OutputContext.startSpinner()` registers with ShutdownManager internally — commands don't need to wire it:

```typescript
// In InteractiveOutput (interactive.ts)
startSpinner(message: string): void {
  // ... existing spinner logic ...
  this.spinnerDeregister = shutdown.register('spinner', () => this.stopSpinner());
}

stopSpinner(success = true): void {
  // ... existing stop logic ...
  this.spinnerDeregister?.();
  this.spinnerDeregister = null;
}
```

`InteractiveOutput` imports the module-level singleton `shutdown` directly. The DI constructor is for testing only — production always uses the singleton.

### Disposer Constraints

- Disposers must **never** call `shutdown()` — doing so hangs on the idempotency guard and consumes a cleanup slot until the hard timeout kills everything.
- Disposers must **never** call `process.exit()` — this terminates the process mid-cleanup, skipping remaining disposers.

---

## Command Integration

### scaffold init

```typescript
// In init handler:
await shutdown.withContext('Cancelled. No changes were made.', async () => {
  // --force backup: wrap rename through file-write
  if (force && fs.existsSync(scaffoldDir)) {
    const backupPath = computeBackupPath();
    await shutdown.withResource('init-backup', () => {
      // Restore backup if new .scaffold/ wasn't fully written
      if (!fs.existsSync(scaffoldDir) && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, scaffoldDir);
      }
    }, async () => {
      fs.renameSync(scaffoldDir, backupPath);

      // Wizard prompts
      const answers = await shutdown.withPrompt(() => askWizardQuestions(output));

      // Build phase
      await shutdown.withContext(
        'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
        async () => {
          // Write .scaffold/ config
          writeConfig(answers);
          // Build loop with cooperative shutdown
          for (const file of outputFiles) {
            if (shutdown.isShuttingDown) break;
            atomicWriteFile(file.path, file.content);
          }
        }
      );
    });
  }
});
```

### scaffold run

```typescript
// In run handler:
await shutdown.withResource('lock', () => {
  releaseLock(projectRoot);
  shutdown.releaseLockOwnership();
}, async () => {
  acquireLock(projectRoot, 'scaffold-run');
  shutdown.registerLockOwnership(lockPath);

  // ... dependency checks ...

  await shutdown.withContext(
    () => stateManager.isInProgress()
      ? 'Cancelled. Step progress cleared.'
      : 'Cancelled.',
    async () => {
      await shutdown.withResource('in-progress', () => {
        stateManager.clearInProgress();
      }, async () => {
        stateManager.setInProgress(step, 'scaffold-run');

        // Confirmation prompt
        const isComplete = await shutdown.withPrompt(() =>
          output.confirm('Mark step as complete?')
        );
      });
    }
  );
});
```

### scaffold build

```typescript
await shutdown.withContext(
  'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
  async () => {
    for (const file of allOutputFiles) {
      if (shutdown.isShuttingDown) break;
      atomicWriteFile(file.path, file.content);
    }
  }
);
```

### scaffold adopt

`disambiguate.ts` already catches `ExitPromptError` as valid input (`skipReason: 'user-cancelled'`). Do NOT wrap in `withPrompt()`. Keep existing pattern.

Lock cleanup uses `withResource`:

```typescript
await shutdown.withResource('lock', () => {
  releaseLock(projectRoot);
  shutdown.releaseLockOwnership();
}, async () => {
  acquireLock(projectRoot, 'scaffold-adopt');
  shutdown.registerLockOwnership(lockPath);
  // ... adoption logic ...
});
```

### scaffold skip / reset / rework / complete

All four commands acquire locks and some have interactive prompts:

```typescript
// skip.ts — lock + confirmation prompt
await shutdown.withResource('lock', lockCleanup, async () => {
  acquireLock(...); shutdown.registerLockOwnership(lockPath);
  const confirmed = await shutdown.withPrompt(() => output.confirm('Skip this step?'));
  // ...
});

// reset.ts — lock + two confirmation prompts
await shutdown.withResource('lock', lockCleanup, async () => {
  acquireLock(...); shutdown.registerLockOwnership(lockPath);
  const confirmed = await shutdown.withPrompt(() => output.confirm('Reset step?'));
  // ...
});

// rework.ts — lock only (no prompts)
await shutdown.withResource('lock', lockCleanup, async () => {
  acquireLock(...); shutdown.registerLockOwnership(lockPath);
  // ...
});

// complete.ts — lock only (no prompts)
await shutdown.withResource('lock', lockCleanup, async () => {
  acquireLock(...); shutdown.registerLockOwnership(lockPath);
  // ...
});
```

### HTTP timers (version.ts, update.ts)

Two separate fixes:
1. `.unref()` on existing `setTimeout(..., 3000)` calls — prevents timers from blocking exit
2. Pass `shutdown.signal` to `https.get()` — aborts in-flight requests on shutdown

```typescript
// version.ts / update.ts
const req = https.get(url, { signal: shutdown.signal }, (res) => { ... });
const timeout = setTimeout(() => resolve(null), 3000);
timeout.unref(); // don't block exit
```

---

## Testing Strategy

### Unit tests for ShutdownManager (`src/cli/shutdown.test.ts`)

```typescript
// Fake process for DI
const createFakeProcess = (): ShutdownProcess => {
  const emitter = new EventEmitter();
  return {
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    exit: vi.fn() as any,
    env: {},
    stdout: { writable: true, write: vi.fn(), isTTY: true },
    stderr: { writable: true, write: vi.fn() },
    emit: emitter.emit.bind(emitter), // for triggering signals in tests
  };
};

// Test cases:
// - Three-stage Ctrl+C state machine (idle -> cleaning -> armed -> force quit)
// - shutdown() idempotency (second call returns never-resolving promise)
// - withPrompt catches ExitPromptError by name
// - withResource double-cleanup idempotency (cleaned flag)
// - withContext via AsyncLocalStorage (nested, concurrent)
// - register() returns working deregister function
// - Late registration during shutdown runs cleanup immediately
// - Exit safety net with lock ownership guard
// - Non-TTY single-stage behavior
// - SIGTERM single-stage behavior
// - reset() clears all state for test isolation
// - AbortSignal is aborted on shutdown
```

### Integration tests

- Commands with `withPrompt` + mocked ExitPromptError throw
- `withResource` with `process.exit()` inside fn (verify exit handler runs)
- Spinner auto-registration/deregistration

---

## Review History

This design went through 4 rounds of multi-model review:

1. **Round 1** (3x Claude agents: signal safety, architecture, edge cases): Found 6 P0s, 12 P1s, 9 P2s. Key fixes: dual-path signal strategy, async cleanup, withPrompt/withResource/withContext API.
2. **Round 2** (3x Claude agents: revised signal, API ergonomics, edge cases): Found 3 P0s, 13 P1s, 9 P2s. Key fixes: removed setPromptActive, added idempotency guard, three-stage Ctrl+C, async priority tiers.
3. **Round 3** (3x Claude agents: final correctness, API completeness, Node.js internals): Found 2 P0s, 11 P1s, 10 P2s. Key fixes: withResource cleaned flag, all timeouts ref'd, name-based ExitPromptError detection, thunk-based withContext.
4. **Round 4** (Codex + Gemini + Claude code-reviewer): Found 2 P0s, 6 P1s, 4 P2s. Key fixes: lock ownership guard, scaffold exit codes (not POSIX), AsyncLocalStorage for context, independent SIGINT state machine, AbortSignal listener limit, test reset(), late registration behavior, complete command inventory.

Total unique findings addressed: 72+ across all rounds.
