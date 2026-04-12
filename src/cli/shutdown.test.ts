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
})
