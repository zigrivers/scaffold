import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'auto'),
}))

vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  releaseLock: vi.fn(),
}))

vi.mock('../output/context.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    createOutputContext: (...args: unknown[]) => {
      const ctx = (original['createOutputContext'] as (...a: unknown[]) => Record<string, unknown>)(...args)
      return ctx
    },
  }
})

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import reworkCommand from './rework.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(steps: Record<string, { status: string; source?: string; produces?: string[] }>) {
  return {
    'schema-version': 1,
    'scaffold-version': '2.30.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-01-01T00:00:00Z',
    in_progress: null,
    steps: Object.fromEntries(
      Object.entries(steps).map(([k, v]) => [k, {
        status: v.status,
        source: v.source ?? 'pipeline',
        produces: v.produces ?? [],
      }]),
    ),
    next_eligible: [],
    'extra-steps': [],
  }
}

function makeReworkSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    created: '2026-03-29T10:00:00Z',
    config: { phases: [1], depth: null, fix: true, fresh: false, auto: false },
    steps: [
      { name: 'create-prd', phase: 1, status: 'pending', completed_at: null, error: null },
      { name: 'review-prd', phase: 1, status: 'pending', completed_at: null, error: null },
    ],
    current_step: null as string | null,
    stats: { total: 2, completed: 0, skipped: 0, failed: 0 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rework command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  let tempDir: string

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-rework-test-'))
    const scaffoldDir = path.join(tempDir, '.scaffold')
    fs.mkdirSync(scaffoldDir)

    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    mockFindProjectRoot.mockReturnValue(tempDir)
    mockResolveOutputMode.mockReturnValue('auto')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    await reworkCommand.handler({
      auto: true,
      format: undefined,
      root: undefined,
      force: undefined,
    } as Parameters<typeof reworkCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  describe('--clear', () => {
    it('deletes rework.json and exits 0', async () => {
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      fs.writeFileSync(reworkPath, JSON.stringify(makeReworkSession()))

      await reworkCommand.handler({
        clear: true,
        auto: true,
        format: undefined,
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(fs.existsSync(reworkPath)).toBe(false)
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 0 even when no session exists', async () => {
      await reworkCommand.handler({
        clear: true,
        auto: true,
        format: undefined,
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('--advance', () => {
    it('advances step and outputs JSON result', async () => {
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      const session = makeReworkSession()
      ;(session.steps as Array<Record<string, unknown>>)[0].status = 'in_progress'
      session.current_step = 'create-prd'
      fs.writeFileSync(reworkPath, JSON.stringify(session))

      mockResolveOutputMode.mockReturnValue('json')

      await reworkCommand.handler({
        advance: 'create-prd',
        auto: true,
        format: 'json',
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)

      // Verify the session was updated
      const updated = JSON.parse(fs.readFileSync(reworkPath, 'utf8'))
      expect(updated.steps[0].status).toBe('completed')
      expect(updated.stats.completed).toBe(1)
    })

    it('deletes session and reports completion when all steps done', async () => {
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      const session = makeReworkSession()
      const steps = session.steps as Array<Record<string, unknown>>
      steps[0].status = 'completed'
      steps[0].completed_at = '2026-03-29T10:05:00Z'
      steps[1].status = 'in_progress'
      session.current_step = 'review-prd'
      ;(session.stats as Record<string, number>).completed = 1
      fs.writeFileSync(reworkPath, JSON.stringify(session))

      await reworkCommand.handler({
        advance: 'review-prd',
        auto: true,
        format: undefined,
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      // Session should be cleaned up
      expect(fs.existsSync(reworkPath)).toBe(false)
    })
  })

  describe('--resume', () => {
    it('exits 1 when no session exists', async () => {
      await reworkCommand.handler({
        resume: true,
        auto: true,
        format: undefined,
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('outputs session status in json mode', async () => {
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      fs.writeFileSync(reworkPath, JSON.stringify(makeReworkSession()))

      mockResolveOutputMode.mockReturnValue('json')

      await reworkCommand.handler({
        resume: true,
        auto: true,
        format: 'json',
        root: undefined,
        force: undefined,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      const jsonOutput = writtenLines.find(l => l.includes('schema_version'))
      expect(jsonOutput).toBeDefined()
    })
  })

  describe('new rework', () => {
    it('creates rework session with --phases and --auto', async () => {
      // Write state.json with completed steps
      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, JSON.stringify(makeState({
        'create-prd': { status: 'completed' },
        'review-prd': { status: 'completed' },
      })))

      // Write a minimal config
      const configPath = path.join(tempDir, '.scaffold', 'config.yml')
      fs.writeFileSync(configPath, 'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n')

      await reworkCommand.handler({
        phases: '1',
        auto: true,
        format: undefined,
        root: undefined,
        force: true,
      } as Parameters<typeof reworkCommand.handler>[0])

      // Check rework.json was created
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      expect(fs.existsSync(reworkPath)).toBe(true)

      const session = JSON.parse(fs.readFileSync(reworkPath, 'utf8'))
      expect(session.config.phases).toEqual([1])
      expect(session.steps.length).toBeGreaterThan(0)
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('errors when session exists in auto mode without --force', async () => {
      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      fs.writeFileSync(reworkPath, JSON.stringify(makeReworkSession()))

      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, JSON.stringify(makeState({
        'create-prd': { status: 'completed' },
      })))

      const configPath = path.join(tempDir, '.scaffold', 'config.yml')
      fs.writeFileSync(configPath, 'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n')

      await reworkCommand.handler({
        phases: '1',
        auto: true,
        format: undefined,
        root: undefined,
        force: false,
      } as Parameters<typeof reworkCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('resets selected steps in state.json to pending', async () => {
      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, JSON.stringify(makeState({
        'create-prd': { status: 'completed' },
        'review-prd': { status: 'completed' },
      })))

      const configPath = path.join(tempDir, '.scaffold', 'config.yml')
      fs.writeFileSync(configPath, 'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n')

      await reworkCommand.handler({
        phases: '1',
        auto: true,
        format: undefined,
        root: undefined,
        force: true,
      } as Parameters<typeof reworkCommand.handler>[0])

      // Verify steps were reset in state.json
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      for (const stepName of Object.keys(state.steps)) {
        // All phase-1 steps should be pending
        expect(state.steps[stepName].status).toBe('pending')
      }
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('records --fix --fresh --depth in config', async () => {
      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, JSON.stringify(makeState({
        'create-prd': { status: 'completed' },
      })))

      const configPath = path.join(tempDir, '.scaffold', 'config.yml')
      fs.writeFileSync(configPath, 'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n')

      await reworkCommand.handler({
        phases: '1',
        depth: 4,
        fix: true,
        fresh: true,
        auto: true,
        format: undefined,
        root: undefined,
        force: true,
      } as Parameters<typeof reworkCommand.handler>[0])

      const reworkPath = path.join(tempDir, '.scaffold', 'rework.json')
      const session = JSON.parse(fs.readFileSync(reworkPath, 'utf8'))
      expect(session.config.depth).toBe(4)
      expect(session.config.fix).toBe(true)
      expect(session.config.fresh).toBe(true)
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })
})
