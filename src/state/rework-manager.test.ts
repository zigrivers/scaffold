import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { ReworkManager } from './rework-manager.js'
import type { ReworkConfig, ReworkStep } from '../types/index.js'

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-rework-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

const SAMPLE_CONFIG: ReworkConfig = {
  phases: [1, 2, 3],
  depth: null,
  fix: true,
  fresh: false,
  auto: false,
}

const SAMPLE_STEPS: ReworkStep[] = [
  { name: 'create-prd', phase: 1, status: 'pending', completed_at: null, error: null },
  { name: 'review-prd', phase: 1, status: 'pending', completed_at: null, error: null },
  { name: 'tech-stack', phase: 2, status: 'pending', completed_at: null, error: null },
]

describe('ReworkManager', () => {
  describe('hasSession', () => {
    it('returns false when no rework.json exists', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      expect(manager.hasSession()).toBe(false)
    })

    it('returns true after creating a session', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)
      expect(manager.hasSession()).toBe(true)
    })
  })

  describe('createSession', () => {
    it('creates rework.json with correct structure', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      const session = manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      expect(session.schema_version).toBe(1)
      expect(session.config).toEqual(SAMPLE_CONFIG)
      expect(session.steps).toHaveLength(3)
      expect(session.current_step).toBeNull()
      expect(session.stats).toEqual({ total: 3, completed: 0, skipped: 0, failed: 0 })
      expect(session.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('persists to disk', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      const filePath = path.join(dir, '.scaffold', 'rework.json')
      expect(fs.existsSync(filePath)).toBe(true)

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      expect(raw.schema_version).toBe(1)
      expect(raw.steps).toHaveLength(3)
    })

    it('throws if session already exists', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      expect(() => manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)).toThrow()
    })
  })

  describe('loadSession', () => {
    it('loads a previously created session', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      const loaded = manager.loadSession()
      expect(loaded.schema_version).toBe(1)
      expect(loaded.steps).toHaveLength(3)
      expect(loaded.config.phases).toEqual([1, 2, 3])
    })

    it('throws when no session exists', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      expect(() => manager.loadSession()).toThrow()
    })
  })

  describe('startStep', () => {
    it('marks step as in_progress and sets current_step', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      manager.startStep('create-prd')
      const session = manager.loadSession()
      expect(session.current_step).toBe('create-prd')
      expect(session.steps[0].status).toBe('in_progress')
    })

    it('throws if step not found in session', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      expect(() => manager.startStep('nonexistent')).toThrow()
    })
  })

  describe('advanceStep', () => {
    it('marks step completed and updates stats', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)
      manager.startStep('create-prd')

      manager.advanceStep('create-prd')
      const session = manager.loadSession()
      expect(session.steps[0].status).toBe('completed')
      expect(session.steps[0].completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(session.stats.completed).toBe(1)
      expect(session.current_step).toBeNull()
    })

    it('throws if step not found', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      expect(() => manager.advanceStep('nonexistent')).toThrow()
    })
  })

  describe('failStep', () => {
    it('marks step failed with error and updates stats', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)
      manager.startStep('create-prd')

      manager.failStep('create-prd', 'something went wrong')
      const session = manager.loadSession()
      expect(session.steps[0].status).toBe('failed')
      expect(session.steps[0].error).toBe('something went wrong')
      expect(session.stats.failed).toBe(1)
      expect(session.current_step).toBeNull()
    })
  })

  describe('nextStep', () => {
    it('returns first pending step', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      const next = manager.nextStep()
      expect(next).not.toBeNull()
      expect(next!.name).toBe('create-prd')
    })

    it('returns null when all steps completed', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      for (const step of SAMPLE_STEPS) {
        manager.startStep(step.name)
        manager.advanceStep(step.name)
      }

      expect(manager.nextStep()).toBeNull()
    })

    it('skips completed steps and returns next pending', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)

      manager.startStep('create-prd')
      manager.advanceStep('create-prd')

      const next = manager.nextStep()
      expect(next!.name).toBe('review-prd')
    })
  })

  describe('clearSession', () => {
    it('deletes rework.json', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      manager.createSession(SAMPLE_CONFIG, SAMPLE_STEPS)
      expect(manager.hasSession()).toBe(true)

      manager.clearSession()
      expect(manager.hasSession()).toBe(false)
    })

    it('does not throw when no session exists', () => {
      const dir = makeTempDir()
      const manager = new ReworkManager(dir)
      expect(() => manager.clearSession()).not.toThrow()
    })
  })
})
