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
      ;(mgr as any).shuttingDown = true
      expect(mgr.isShuttingDown).toBe(true)
      mgr.reset()
      expect(mgr.isShuttingDown).toBe(false)
    })
  })
})
