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
  getLockPath: vi.fn((root: string) => `${root}/.scaffold/.lock`),
}))

vi.mock('../shutdown.js', () => ({
  shutdown: {
    withResource: vi.fn((_name: string, _cleanup: () => void, fn: () => Promise<unknown>) => fn()),
    withPrompt: vi.fn((fn: () => Promise<unknown>) => fn()),
    registerLockOwnership: vi.fn(),
    releaseLockOwnership: vi.fn(),
  },
}))

// createOutputContext is optionally mocked per-test for interactive confirm tests
let mockConfirmResult: boolean | null = null
vi.mock('../output/context.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    createOutputContext: (...args: unknown[]) => {
      const ctx = (original['createOutputContext'] as (...a: unknown[]) => Record<string, unknown>)(...args)
      if (mockConfirmResult !== null) {
        ctx.confirm = vi.fn().mockResolvedValue(mockConfirmResult)
      }
      return ctx
    },
  }
})

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
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })

    // Defaults
    mockFindProjectRoot.mockReturnValue(tempDir)
    mockResolveOutputMode.mockReturnValue('auto')
    mockAcquireLock.mockReturnValue({ acquired: true })
    mockConfirmResult = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
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
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(0)
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

    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(0)
  })

  // Test 8: Releases lock after reset completes (via withResource cleanup)
  it('releases lock after reset completes', async () => {
    // Use a withResource mock that calls cleanup after fn
    const { shutdown: shutdownMock } = await import('../shutdown.js')
    vi.mocked(shutdownMock.withResource).mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_name: string, cleanup: any, fn: any) => {
        try { return await fn() } finally { cleanup() }
      },
    )

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
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(0)
  })

  it('reports already pending step without error', async () => {
    writeState({ 'tdd': { status: 'pending' } })

    await resetCommand.handler({
      step: 'tdd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'tdd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
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

    expect(process.exitCode).toBe(2)
    expect(writtenLines.join('')).toContain('Did you mean')
  })

  // --- Additional step-level reset tests ---

  it('exits 2 for nonexistent step without suggestion when no close match', async () => {
    writeState({ 'create-prd': { status: 'completed' } })

    await resetCommand.handler({
      step: 'zzzzzzzzzzzzz',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'zzzzzzzzzzzzz'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(2)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('not found')
    expect(allOutput).not.toContain('Did you mean')
  })

  it('step reset: lock failure with error exits 3', async () => {
    writeState({ 'create-prd': { status: 'completed' } })
    mockAcquireLock.mockReturnValue({
      acquired: false,
      error: { code: 'LOCK_HELD', message: 'Lock held by PID 12345', exitCode: 3 },
    })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(3)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('LOCK_HELD')
  })

  it('step reset: lock failure without error object exits 3', async () => {
    writeState({ 'create-prd': { status: 'completed' } })
    mockAcquireLock.mockReturnValue({ acquired: false })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(3)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Lock is held by another process')
  })

  it('warns when resetting in_progress step', async () => {
    writeState({ 'create-prd': { status: 'in_progress' } })

    await resetCommand.handler({
      step: 'create-prd',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('appears to be in progress')

    const state = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(state.steps['create-prd'].status).toBe('pending')
  })

  it('completed step in non-interactive mode without --force exits 3', async () => {
    mockResolveOutputMode.mockReturnValue('auto')
    writeState({ 'create-prd': { status: 'completed' } })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      force: false,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(3)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('PSM_INVALID_TRANSITION')
    expect(allOutput).toContain('Use --force')
  })

  it('completed step in interactive mode: user confirms proceeds', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    mockConfirmResult = true
    writeState({ 'create-prd': { status: 'completed' } })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    const state = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(state.steps['create-prd'].status).toBe('pending')
  })

  it('completed step in interactive mode: user declines exits 0', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    mockConfirmResult = false
    writeState({ 'create-prd': { status: 'completed' } })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    // State should NOT have changed
    const state = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(state.steps['create-prd'].status).toBe('completed')
  })

  it('clears in_progress when it references the reset step', async () => {
    const state = {
      'schema-version': 1,
      'scaffold-version': '2.4.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-01-01T00:00:00.000Z',
      in_progress: { step: 'create-prd', started: '2026-01-01T00:00:00.000Z' },
      steps: {
        'create-prd': { status: 'in_progress', source: 'pipeline', produces: [] },
      },
      next_eligible: [],
      'extra-steps': [],
    }
    fs.writeFileSync(
      path.join(tempDir, '.scaffold', 'state.json'),
      JSON.stringify(state, null, 2),
    )

    await resetCommand.handler({
      step: 'create-prd',
      force: true,
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    const savedState = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(savedState.in_progress).toBeNull()
    expect(savedState.steps['create-prd'].status).toBe('pending')
  })

  it('step reset: JSON output includes step, previousStatus, newStatus', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    writeState({ 'create-prd': { status: 'completed', produces: ['docs/plan.md'] } })

    await resetCommand.handler({
      step: 'create-prd',
      force: true,
      root: tempDir,
      format: 'json',
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.step).toBe('create-prd')
    expect(data.previousStatus).toBe('completed')
    expect(data.newStatus).toBe('pending')
  })

  // --- Additional pipeline reset tests ---

  it('interactive pipeline reset: user confirms proceeds', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    mockConfirmResult = true

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    await resetCommand.handler({
      root: tempDir,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    expect(fs.existsSync(statePath)).toBe(false)
  })

  it('interactive pipeline reset: user declines exits 0 without deleting', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    mockConfirmResult = false

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    await resetCommand.handler({
      root: tempDir,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(fs.existsSync(statePath)).toBe(true) // Should be preserved
  })

  it('pipeline reset: lock failure with error exits 3', async () => {
    mockResolveOutputMode.mockReturnValue('auto')
    mockAcquireLock.mockReturnValue({
      acquired: false,
      error: { code: 'LOCK_HELD', message: 'Lock held by PID 999', exitCode: 3 },
    })

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    await resetCommand.handler({
      confirmReset: true,
      'confirm-reset': true,
      root: tempDir,
      auto: true,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(3)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('LOCK_HELD')
  })

  it('pipeline reset: lock failure without error object exits 3', async () => {
    mockResolveOutputMode.mockReturnValue('auto')
    mockAcquireLock.mockReturnValue({ acquired: false })

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    await resetCommand.handler({
      confirmReset: true,
      'confirm-reset': true,
      root: tempDir,
      auto: true,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(3)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Lock is held by another process')
  })

  it('pipeline reset with --force skips lock acquisition', async () => {
    mockResolveOutputMode.mockReturnValue('auto')

    const statePath = path.join(tempDir, '.scaffold', 'state.json')
    fs.writeFileSync(statePath, '{"schema-version": 1}')

    await resetCommand.handler({
      confirmReset: true,
      'confirm-reset': true,
      root: tempDir,
      auto: true,
      force: true,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    expect(fs.existsSync(statePath)).toBe(false)
    // acquireLock should NOT have been called for pipeline reset path
    // (it gets called with 'reset' as operation name, no step)
    // With --force, the pipeline reset skips lock entirely
  })

  it('pipeline reset with --force does not call releaseLock', async () => {
    mockResolveOutputMode.mockReturnValue('auto')
    mockReleaseLock.mockClear()

    await resetCommand.handler({
      confirmReset: true,
      'confirm-reset': true,
      root: tempDir,
      auto: true,
      force: true,
      $0: 'scaffold',
      _: ['reset'],
    } as Parameters<typeof resetCommand.handler>[0])

    // The finally block should skip releaseLock when force is true
    expect(mockReleaseLock).not.toHaveBeenCalled()
  })

  it('builder configures step positional and confirm-reset option', () => {
    const yargsMock = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
    }
    const builder = resetCommand.builder as (y: unknown) => unknown
    builder(yargsMock)

    expect(yargsMock.positional).toHaveBeenCalledWith('step', expect.objectContaining({
      type: 'string',
    }))
    expect(yargsMock.option).toHaveBeenCalledWith('confirm-reset', expect.objectContaining({
      type: 'boolean',
      default: false,
    }))
  })

  it('uses argv.root when provided instead of findProjectRoot', async () => {
    // Even though findProjectRoot returns null, argv.root should be used
    mockFindProjectRoot.mockReturnValue(null)

    writeState({ 'create-prd': { status: 'pending' } })

    await resetCommand.handler({
      step: 'create-prd',
      root: tempDir,
      $0: 'scaffold',
      _: ['reset', 'create-prd'],
    } as Parameters<typeof resetCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    expect(writtenLines.join('')).toContain('already pending')
  })
})
