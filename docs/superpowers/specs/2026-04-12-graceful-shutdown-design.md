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
- No **broad** `process.exit()` refactoring across all 50+ call sites — safety net covers commands not yet migrated. However, commands wrapped in `withResource` (run, skip, reset, etc.) **must** convert their internal `process.exit()` calls to `process.exitCode = N; return;` so `finally` blocks execute. This is a per-command requirement, not a codebase-wide refactor.

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
  stdout: { writable?: boolean; isTTY?: boolean; write(s: string): boolean };
  stderr: { writable?: boolean; write(s: string): boolean };
}

export const shutdown: ShutdownManager;
```

**File location:** `src/cli/shutdown.ts`

### Exit Codes

Uses scaffold's own `ExitCode` enum from `src/types/enums.ts`, NOT POSIX conventions:

- User cancellation (Ctrl+C, SIGINT, SIGTERM): `ExitCode.UserCancellation` (value 4)
- This aligns with ADR-025 (CLI output contract) and maintains consistency for automation consumers
- **Migration note:** `init.ts` currently exits with code 130 (POSIX convention). This changes to 4. Update `init.test.ts` assertions accordingly. Any external automation checking for exit code 130 will need updating — this is an intentional breaking change for correctness.

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

**ExitPromptError detection:** Always use `err.name === 'ExitPromptError'` (name-based), never `instanceof`. `ExitPromptError` is not exported from `@inquirer/prompts` — only from `@inquirer/core`. Name-based detection is stable across package versions and duplicates. This matches existing codebase conventions in `init.ts` and `disambiguate.ts`.

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

The SIGTERM handler is simpler — always single-stage:

```typescript
private triggeredBySigterm = false;

private sigtermHandler = () => {
  this.triggeredBySigterm = true;
  if (this.sigintState === 'idle') {
    this.sigintState = 'cleaning'; // prevent SIGINT from also triggering shutdown
    this.shutdown(ExitCode.UserCancellation);
  }
};
```

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

**Lock path access:** `getLockPath()` in `lock-manager.ts` is currently unexported. As part of this work, export it so commands can pass the path to `registerLockOwnership()`. Alternatively, `registerLockOwnership` can accept `projectRoot` and derive the path internally using the same `path.join(projectRoot, '.scaffold', 'lock.json')` logic.

**Lock command names:** The `LockableCommand` type in `src/types/lock.ts` accepts `'run' | 'skip' | 'init' | 'reset' | 'adopt' | 'complete' | 'rework'` — always the short form, never prefixed with `scaffold-`.

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

Must be called in `runCli()` at CLI startup, NOT at import time. Note: `@inquirer/prompts` is loaded lazily via dynamic `import()` in `interactive.ts`, so `signal-exit`'s handler is installed later (at first prompt usage), not at startup. This means ShutdownManager's SIGINT handler will be registered first. This is fine — when `signal-exit` registers later and sees ShutdownManager's existing listener, it correctly defers. The key constraint is that `install()` must run exactly once, early in `runCli()`, before any command handler executes.

### Test Isolation

```typescript
reset(): void {
  this.shuttingDown = false;
  this.sigintState = 'idle';
  this.triggeredBySigterm = false;
  this.exitHandlerRan = false;
  this.lockOwned = false;
  this.lockPath = null;
  this.registry.clear();
  this.controller = new AbortController();
  setMaxListeners(0, this.controller.signal);
  this.proc.removeListener('SIGINT', this.sigintHandler);
  this.proc.removeListener('SIGTERM', this.sigtermHandler);
  // Note: exit handler uses exitHandlerRan guard, so resetting the flag
  // is sufficient — no need to remove/re-add the exit listener.
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

The init handler delegates to `runWizard()` (which handles backup rename, questions, `.scaffold/` creation, config/state writing) and then `runBuild()`. Integration wraps these at the correct abstraction level — not decomposing their internals:

```typescript
// Pseudocode — shows integration points, not exact function signatures.
// In init handler (init.ts):
await shutdown.withContext('Cancelled. No changes were made.', async () => {
  // --force backup: wrap runWizard so backup is restored on cancel.
  // runWizard() internally does: backup rename -> questions -> .scaffold/ creation -> config write.
  // The withResource cleanup checks if .scaffold/ was fully created; if not, restores backup.
  if (force && fs.existsSync(scaffoldDir)) {
    const backupPath = /* computed inline, same logic as wizard.ts line 116-118 */;
    await shutdown.withResource('init-backup', () => {
      if (!fs.existsSync(scaffoldDir) && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, scaffoldDir);
      }
    }, async () => {
      const wizardResult = await runWizard(/* ... */);
      if (!wizardResult.success) return;

      // Build phase — runBuild is idempotent, so partial output is safe
      await shutdown.withContext(
        'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
        async () => {
          const buildResult = await runBuild(/* ... */);
          // ...
        }
      );
    });
  } else {
    // Non-force path: no backup to restore
    const wizardResult = await runWizard(/* ... */);
    if (!wizardResult.success) return;

    await shutdown.withContext(
      'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
      async () => {
        const buildResult = await runBuild(/* ... */);
        // ...
      }
    );
  }
});
```

**Note on `runWizard` internals:** `runWizard()` calls `askWizardQuestions()` which uses `output.prompt()`, `output.confirm()`, and `output.select()` — all of which dynamically import `@inquirer/prompts`. These prompt calls must be individually wrapped in `shutdown.withPrompt()` inside `questions.ts`, or `runWizard` itself must catch `ExitPromptError` and propagate it. The cleanest approach is wrapping `runWizard()` in `withPrompt` at the init handler level and letting ExitPromptError propagate up naturally from the prompt calls.

**Note on locks:** `init` does not currently acquire an advisory lock (unlike `run`, `skip`, etc.). This is intentional — init creates `.scaffold/` from scratch and concurrent inits are protected by the filesystem (the directory either exists or doesn't).

### scaffold run

`run.ts` currently has 5 `output.confirm()` calls (lines 162, 234, 251, 445, 447), 15 `process.exit()` calls, and 11 scattered `releaseLock()` calls. The primary goal of `withResource` is consolidating these scattered cleanup paths.

**Pre-existing bug:** `run.ts` has no `ExitPromptError` handling. Ctrl+C during any prompt shows `RUN_UNEXPECTED_ERROR`. This is fixed by wrapping prompts in `withPrompt`.

```typescript
// Pseudocode — shows integration points, not exact function signatures.
// In run handler (run.ts):
const lockResult = acquireLock(projectRoot, 'run', step);
if (!lockResult.acquired) { /* handle error/warning */ return; }
shutdown.registerLockOwnership(getLockPath(projectRoot));

await shutdown.withResource('lock', () => {
  releaseLock(projectRoot);
  shutdown.releaseLockOwnership();
}, async () => {
  // ... dependency checks (multiple early returns, no process.exit()) ...

  await shutdown.withContext(
    () => stateManager.loadState().in_progress !== null
      ? 'Cancelled. Step progress cleared.'
      : 'Cancelled.',
    async () => {
      await shutdown.withResource('in-progress', () => {
        stateManager.clearInProgress();
      }, async () => {
        stateManager.setInProgress(step, 'run');

        // All 5 confirmation prompts wrapped in withPrompt:
        const isComplete = await shutdown.withPrompt(() =>
          output.confirm('Mark step as complete?')
        );
        // ... other prompts similarly wrapped ...
      });
    }
  );
});
```

**Migration note:** The 15 `process.exit()` calls inside `run.ts` must be converted to `process.exitCode = N; return;` so `withResource`'s `finally` blocks execute. This is a required refactoring for `run.ts` specifically — the "no broad process.exit() refactoring" non-goal applies to commands NOT wrapped in `withResource`. Commands that adopt `withResource` must migrate their internal exit calls.

### scaffold build

`build.ts` writes files in a loop using `atomicWriteFile` (each write is atomic — no partial files). The `isShuttingDown` check between iterations allows graceful exit:

```typescript
// Pseudocode — shows integration points.
// In runBuild() or the build command handler:
await shutdown.withContext(
  'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
  async () => {
    for (const file of allOutputFiles) {
      if (shutdown.isShuttingDown) break;
      atomicWriteFile(file.path, file.content);
    }
    // Also check in skill template loop (uses raw writeFileSync):
    for (const skill of skillFiles) {
      if (shutdown.isShuttingDown) break;
      fs.writeFileSync(skill.path, skill.content);
    }
  }
);
```

### scaffold adopt

`disambiguate.ts` already catches `ExitPromptError` as valid input (`skipReason: 'user-cancelled'`). Do NOT wrap in `withPrompt()`. Keep existing pattern.

Lock cleanup uses `withResource`. Note: `adopt.ts` already uses `process.exitCode` instead of `process.exit()`, making it a good candidate for `withResource`:

```typescript
const lockResult = acquireLock(projectRoot, 'adopt');
if (!lockResult.acquired) { /* handle */ return; }
shutdown.registerLockOwnership(getLockPath(projectRoot));

await shutdown.withResource('lock', () => {
  releaseLock(projectRoot);
  shutdown.releaseLockOwnership();
}, async () => {
  // ... adoption logic ...
});
```

### scaffold skip / reset / rework / complete

All four commands acquire locks. Some have interactive prompts:

```typescript
// Pseudocode — shows integration pattern, not exact signatures.

// skip.ts — lock + one confirmation prompt (skipSingle has output.confirm)
acquireLock(projectRoot, 'skip', step);
shutdown.registerLockOwnership(getLockPath(projectRoot));
await shutdown.withResource('lock', lockCleanup, async () => {
  const confirmed = await shutdown.withPrompt(() => output.confirm(...));
  // ...
});

// reset.ts — two sub-commands with different lock ordering:
//   resetStep: acquires lock FIRST, then confirms
//   resetPipeline: confirms FIRST, then acquires lock (lock comes AFTER prompt)
// For resetPipeline, withPrompt wraps the confirmation OUTSIDE withResource:
const confirmed = await shutdown.withPrompt(() => output.confirm('Reset entire pipeline?'));
if (!confirmed) return;
acquireLock(projectRoot, 'reset');
shutdown.registerLockOwnership(getLockPath(projectRoot));
await shutdown.withResource('lock', lockCleanup, async () => { /* ... */ });

// rework.ts — lock for new rework creation only (no prompts)
// Note: --advance and --resume branches do NOT acquire locks
acquireLock(projectRoot, 'rework');
shutdown.registerLockOwnership(getLockPath(projectRoot));
await shutdown.withResource('lock', lockCleanup, async () => { /* ... */ });

// complete.ts — lock only (no prompts)
acquireLock(projectRoot, 'complete', step);
shutdown.registerLockOwnership(getLockPath(projectRoot));
await shutdown.withResource('lock', lockCleanup, async () => { /* ... */ });
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
// Note: emit() is not on ShutdownProcess — it's added for test convenience
// to simulate signal delivery. Cast with `as any` or extend the type.
const createFakeProcess = () => {
  const emitter = new EventEmitter();
  return {
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    exit: vi.fn() as any,
    env: {},
    stdout: { writable: true, isTTY: true, write: vi.fn() },
    stderr: { writable: true, write: vi.fn() },
    emit: emitter.emit.bind(emitter), // test-only: trigger SIGINT/SIGTERM
  } as ShutdownProcess & { emit: typeof emitter.emit };
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

5. **Round 5** (Codex + Gemini + Claude code-reviewer, spec file review): Found 3 P0s, 6 P1s, 6 P2s. Key fixes: ShutdownProcess interface missing isTTY, exit code 130→4 migration note, lock API mismatch (getLockPath unexported, wrong command names), init/run flow corrected to match actual architecture, SIGTERM handler implementation added, install() ordering rationale corrected for lazy imports, reset.ts lock-after-prompt ordering, process.exit() constraint clarified per-command.

Total unique findings addressed: 85+ across all rounds.
