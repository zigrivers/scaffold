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
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import resetCommand from './reset.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reset command', () => {
  let exitSpy: MockInstance
  let stdoutSpy: MockInstance
  let writtenLines: string[]
  let tempDir: string

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockAcquireLock = vi.mocked(acquireLock)
  const mockReleaseLock = vi.mocked(releaseLock)

  beforeEach(() => {
    // Create a real temp directory for filesystem tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-reset-test-'))
    const scaffoldDir = path.join(tempDir, '.scaffold')
    fs.mkdirSync(scaffoldDir)

    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Defaults
    mockFindProjectRoot.mockReturnValue(tempDir)
    mockResolveOutputMode.mockReturnValue('auto')
    mockAcquireLock.mockReturnValue({ acquired: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Cleanup temp directory
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // Test 1: Exits 1 when project root not found
  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    const argv = {
      confirmReset: true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // Test 2: Deletes state.json when it exists
  it('deletes state.json when it exists', async () => {
    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(fs.existsSync(statePath)).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 3: Deletes decisions.jsonl when it exists
  it('deletes decisions.jsonl when it exists', async () => {
    const decisionsPath = path.join(tempDir, '.scaffold', 'decisions.jsonl')
    fs.writeFileSync(decisionsPath, '{"decision": "test"}')

    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(fs.existsSync(decisionsPath)).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 4: Preserves config.yml
  it('preserves config.yml after reset', async () => {
    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    const configPath = path.join(tempDir, '.scaffold', 'config.yml')
    fs.writeFileSync(statePath, '{"schema-version": 1}')
    fs.writeFileSync(configPath, 'methodology: deep')

    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(fs.existsSync(statePath)).toBe(false)
    expect(fs.existsSync(configPath)).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 5: Auto mode without --confirm-reset exits 1 (RESET_CONFIRM_REQUIRED)
  it('auto mode without --confirm-reset exits 1 with RESET_CONFIRM_REQUIRED', async () => {
    mockResolveOutputMode.mockReturnValue('auto')

    const argv = {
      confirmReset: false,
      'confirm-reset': false,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('RESET_CONFIRM_REQUIRED')
  })

  // Test 6: Auto mode with --confirm-reset proceeds
  it('auto mode with --confirm-reset proceeds and exits 0', async () => {
    mockResolveOutputMode.mockReturnValue('auto')

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(fs.existsSync(statePath)).toBe(false)
  })

  // Test 7: JSON output has files_deleted and files_preserved arrays
  it('JSON output has files_deleted and files_preserved arrays', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    const configPath = path.join(tempDir, '.scaffold', 'config.yml')
    fs.writeFileSync(statePath, '{"schema-version": 1}')
    fs.writeFileSync(configPath, 'methodology: deep')

    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: 'json',
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed

    expect(data).toHaveProperty('files_deleted')
    expect(data).toHaveProperty('files_preserved')
    expect(Array.isArray(data.files_deleted)).toBe(true)
    expect(Array.isArray(data.files_preserved)).toBe(true)
    expect(data.files_deleted).toContain('.scaffold/state.json')
    expect(data.files_preserved).toContain('.scaffold/config.yml')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 8: Releases lock after reset completes
  it('releases lock after reset completes', async () => {
    const argv = {
      confirmReset: true,
      'confirm-reset': true,
      format: undefined,
      auto: true,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await resetCommand.handler(argv as Parameters<typeof resetCommand.handler>[0])

    expect(mockReleaseLock).toHaveBeenCalledWith(tempDir)

    // Silence unused warnings
    void stdoutSpy
    void mockAcquireLock
  })

  // --- Step-level reset tests ---

  function writeState(steps: Record<string, { status: string; produces?: string[] }>) {
    const state = {
      'schema-version': 1,
      'scaffold-version': '2.4.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-01-01T00:00:00.000Z',
      in_progress: null,
      steps: Object.fromEntries(
        Object.entries(steps).map(([name, entry]) => [
          name,
          { status: entry.status, source: 'pipeline', produces: entry.produces ?? [] },
        ]),
      ),
      next_eligible: [],
      'extra-steps': [],
    }
    fs.writeFileSync(
      path.join(tempDir, '.scaffold', 'state.json'),
      JSON.stringify(state, null, 2),
    )
  }

  it('resets a completed step to pending', async () => {
    writeState({ 'create-prd': { status: 'completed', produces: ['docs/plan.md'] } })

    await resetCommand.handler({
      step: 'create-prd',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    const state = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(state.steps['create-prd'].status).toBe('pending')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('resets a skipped step to pending', async () => {
    writeState({ 'design-system': { status: 'skipped' } })

    await resetCommand.handler({
      step: 'design-system',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'design-system'],
    } as Parameters<typeof resetCommand.handler>[0])

    const state = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(state.steps['design-system'].status).toBe('pending')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('reports already pending step without error', async () => {
    writeState({ 'tdd': { status: 'pending' } })

    await resetCommand.handler({
      step: 'tdd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'tdd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(writtenLines.join('')).toContain('already pending')
  })

  it('exits 2 for nonexistent step with suggestion', async () => {
    writeState({ 'create-prd': { status: 'completed' } })

    await resetCommand.handler({
      step: 'creat-prd',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'creat-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(2)
    expect(writtenLines.join('')).toContain('Did you mean')
  })
})
