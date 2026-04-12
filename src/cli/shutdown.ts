import { AsyncLocalStorage } from 'node:async_hooks'
import { setMaxListeners } from 'node:events'
// fs and ExitCode used by methods implemented in subsequent tasks
import fs from 'node:fs' // eslint-disable-line @typescript-eslint/no-unused-vars

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
  async withResource<T>(
    _name: string, _cleanup: CleanupFn, fn: () => T | Promise<T>,
  ): Promise<T> { return fn() }
  async withContext<T>(
    _message: string | (() => string), fn: () => T | Promise<T>,
  ): Promise<T> { return Promise.resolve(fn()) }
}

export const shutdown = new ShutdownManager()
