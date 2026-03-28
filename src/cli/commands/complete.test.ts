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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import completeCommand from './complete.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('complete command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  let tempDir: string

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-complete-test-'))
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
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function writeState(steps: Record<string, { status: string; source?: string; produces?: string[] }>) {
    const state = {
      'schema-version': 1,
      methodology: 'deep',
      steps,
      in_progress: null,
    }
    fs.writeFileSync(
      path.join(tempDir, '.scaffold', 'state.json'),
      JSON.stringify(state, null, 2),
    )
  }

  function defaultArgv(overrides: Record<string, unknown> = {}) {
    return {
      step: 'review-testing',
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: tempDir,
      force: undefined,
      ...overrides,
    } as Parameters<typeof completeCommand.handler>[0]
  }

  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)
    await completeCommand.handler(defaultArgv({ root: undefined }))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 2 when step not found in state', async () => {
    writeState({ 'some-other-step': { status: 'pending', source: 'pipeline' } })
    await completeCommand.handler(defaultArgv({ step: 'nonexistent' }))
    expect(exitSpy).toHaveBeenCalledWith(2)
  })

  it('marks in_progress step as completed', async () => {
    writeState({ 'review-testing': { status: 'in_progress', source: 'pipeline' } })
    await completeCommand.handler(defaultArgv())

    const state = JSON.parse(fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'))
    expect(state.steps['review-testing'].status).toBe('completed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('marks pending step as completed', async () => {
    writeState({ 'review-testing': { status: 'pending', source: 'pipeline' } })
    await completeCommand.handler(defaultArgv())

    const state = JSON.parse(fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'))
    expect(state.steps['review-testing'].status).toBe('completed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('reports already completed step without error', async () => {
    writeState({ 'review-testing': { status: 'completed', source: 'pipeline' } })
    await completeCommand.handler(defaultArgv())

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('already completed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('clears in_progress record when completing that step', async () => {
    const state = {
      'schema-version': 1,
      methodology: 'deep',
      steps: { 'review-testing': { status: 'in_progress', source: 'pipeline' } },
      in_progress: { step: 'review-testing', started: '2026-03-28T00:00:00Z', partial_artifacts: [] },
    }
    fs.writeFileSync(
      path.join(tempDir, '.scaffold', 'state.json'),
      JSON.stringify(state, null, 2),
    )

    await completeCommand.handler(defaultArgv())

    const updated = JSON.parse(fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'))
    expect(updated.steps['review-testing'].status).toBe('completed')
    expect(updated.in_progress).toBeNull()
  })

  it('outputs JSON in json mode', async () => {
    writeState({ 'review-testing': { status: 'in_progress', source: 'pipeline' } })
    mockResolveOutputMode.mockReturnValue('json')
    await completeCommand.handler(defaultArgv({ format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.step).toBe('review-testing')
    expect(data.newStatus).toBe('completed')
  })

  it('suggests closest match for misspelled step', async () => {
    writeState({ 'review-testing': { status: 'in_progress', source: 'pipeline' } })
    await completeCommand.handler(defaultArgv({ step: 'review-testin' }))

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('review-testing')
    expect(exitSpy).toHaveBeenCalledWith(2)
  })
})
