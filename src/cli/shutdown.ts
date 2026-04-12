import { AsyncLocalStorage } from 'node:async_hooks'
import { setMaxListeners } from 'node:events'
import * as fs from 'node:fs'

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

  private sigtermHandler = (): void => {
    this.triggeredBySigterm = true
    if (this.sigintState === 'idle') {
      this.sigintState = 'cleaning'
      this.shutdown(ExitCode.UserCancellation)
    }
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

  install(): void {
    this.proc.on('SIGINT', this.sigintHandler as (...args: unknown[]) => void)
    this.proc.on('SIGTERM', this.sigtermHandler as (...args: unknown[]) => void)
    this.installExitHandler()
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
  register(name: string, cleanup: CleanupFn, opts?: { priority?: 'critical' }): Deregister {
    if (this.shuttingDown) {
      try { Promise.resolve(cleanup()).catch(() => {}) } catch { /* sync throw */ }
      return () => {}
    }
    this.registry.set(name, { cleanup, priority: opts?.priority })
    return () => { this.registry.delete(name) }
  }

  registerLockOwnership(lockFilePath: string): void {
    this.lockPath = lockFilePath
    this.lockOwned = true
  }
  releaseLockOwnership(): void {
    this.lockOwned = false
    this.lockPath = null
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

    const entries = Array.from(this.registry.entries())
    const critical = entries
      .filter(([, v]) => v.priority === 'critical').reverse()
    for (const [, d] of critical) {
      try { await Promise.resolve(d.cleanup()) } catch { /* continue */ }
    }

    const normal = entries
      .filter(([, v]) => v.priority !== 'critical').reverse()
    await Promise.allSettled(normal.map(([, d]) => {
      try { return Promise.resolve(d.cleanup()) }
      catch { return Promise.resolve() }
    }))

    clearTimeout(timeout)
    this.proc.exit(exitCode)
  }
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
  async withResource<T>(
    name: string, cleanup: CleanupFn, fn: () => T | Promise<T>,
  ): Promise<T> {
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
  async withContext<T>(
    message: string | (() => string), fn: () => T | Promise<T>,
  ): Promise<T> {
    return this.contextStorage.run(message, () => Promise.resolve(fn()))
  }
}

export const shutdown = new ShutdownManager()
