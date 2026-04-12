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
      const promise = mgr.shutdown()
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

      const exitCallCount = (proc.exit as ReturnType<typeof vi.fn>).mock.calls.length
      mgr.shutdown()
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
})
