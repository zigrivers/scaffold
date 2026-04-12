/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { ShutdownManager } from './shutdown.js'
import type { ShutdownProcess } from './shutdown.js'
import { ExitCode } from '../types/enums.js'

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
      ;(mgr as any).shuttingDown = true
      expect(mgr.isShuttingDown).toBe(true)
      mgr.reset()
      expect(mgr.isShuttingDown).toBe(false)
    })
  })

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
      proc.emit('SIGINT')
      proc.emit('SIGINT')
      expect(proc.stderr.write).toHaveBeenCalledWith('\nPress Ctrl+C again to force quit.\n')
    })

    it('third SIGINT force-quits (armed -> exit)', () => {
      vi.spyOn(mgr, 'shutdown').mockResolvedValue(undefined as never)
      proc.emit('SIGINT')
      proc.emit('SIGINT')
      proc.emit('SIGINT')
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
      proc.emit('SIGINT')
      expect(shutdownSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('shutdown()', () => {
    it('sets isShuttingDown to true', async () => {
      mgr.install()
      mgr.shutdown()
      expect(mgr.isShuttingDown).toBe(true)
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

      const exitMock = proc.exit as unknown as ReturnType<typeof vi.fn>
      const exitCallCount = exitMock.mock.calls.length
      mgr.shutdown()
      await new Promise(r => setTimeout(r, 10))
      expect(exitMock.mock.calls.length).toBe(exitCallCount)
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
      await vi.waitFor(() => expect(lateFn).toHaveBeenCalled())
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

      const promise = mgr.withResource('test', cleanup, async () => {
        // Simulate shutdown calling the registered cleanup
        const entry = (mgr as any).registry.get('test')
        if (entry) entry.cleanup()
        return 'done'
      })

      await promise
      expect(cleanup).toHaveBeenCalledOnce()
    })

    it('deregisters from registry after completion', async () => {
      await mgr.withResource('test', () => {}, async () => 'done')
      expect((mgr as any).registry.has('test')).toBe(false)
    })
  })

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
      proc.emit('exit', 0)
      proc.emit('exit', 0)

      const stderrCalls = (proc.stderr.write as ReturnType<typeof vi.fn>).mock.calls
      const cursorRestores = stderrCalls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('\x1b[?25h'),
      )
      expect(cursorRestores.length).toBe(1)
    })
  })

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

      await mgr.withPrompt(async () => { throw err })

      expect(shutdownSpy).toHaveBeenCalledWith(ExitCode.UserCancellation)
    })

    it('does not catch errors where only message mentions ExitPromptError', async () => {
      const err = new Error('ExitPromptError happened')
      await expect(
        mgr.withPrompt(async () => { throw err }),
      ).rejects.toThrow('ExitPromptError happened')
    })
  })
})
