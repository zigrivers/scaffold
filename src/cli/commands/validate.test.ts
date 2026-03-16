import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../validation/index.js', () => ({
  runValidation: vi.fn(() => ({
    errors: [],
    warnings: [],
    scopes: ['config', 'frontmatter', 'state', 'dependencies'],
    validFilesCount: 3,
    totalFilesCount: 3,
  })),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { runValidation } from '../../validation/index.js'
import validateCommand from './validate.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ValidateArgv = Parameters<typeof validateCommand.handler>[0]

function defaultArgv(overrides: Partial<ValidateArgv> = {}): ValidateArgv {
  return {
    format: undefined,
    auto: undefined,
    verbose: undefined,
    root: undefined,
    force: undefined,
    scope: undefined,
    ...overrides,
  } as ValidateArgv
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validate command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  let stderrLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockRunValidation = vi.mocked(runValidation)

  beforeEach(() => {
    writtenLines = []
    stderrLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })

    // Defaults
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockResolveOutputMode.mockReturnValue('interactive')
    mockRunValidation.mockReturnValue({
      errors: [],
      warnings: [],
      scopes: ['config', 'frontmatter', 'state', 'dependencies'],
      validFilesCount: 3,
      totalFilesCount: 3,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Test 1: Exits 1 when project root not found
  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)
    await validateCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // Test 2: Exits 0 when all valid
  it('exits 0 when all valid', async () => {
    await validateCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('passed')
  })

  // Test 3: Exits 1 when errors found
  it('exits 1 when validation errors found', async () => {
    mockRunValidation.mockReturnValue({
      errors: [{
        code: 'CONFIG_MISSING',
        message: 'Config file not found',
        exitCode: 1,
        recovery: 'Run scaffold init',
        context: { file: '/fake/project/.scaffold/config.yml' },
      }],
      warnings: [],
      scopes: ['config'],
      validFilesCount: 0,
      totalFilesCount: 0,
    })
    await validateCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // Test 4: JSON output has correct shape (valid, errors, warnings, scopes, files)
  it('JSON output has correct shape', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    await validateCommand.handler(defaultArgv({ format: 'json' }))
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('valid', true)
    expect(data).toHaveProperty('errors')
    expect(data).toHaveProperty('warnings')
    expect(data).toHaveProperty('scopes')
    expect(data).toHaveProperty('files')
    expect(data.files).toHaveProperty('valid', 3)
    expect(data.files).toHaveProperty('total', 3)
    expect(Array.isArray(data.errors)).toBe(true)
    expect(Array.isArray(data.warnings)).toBe(true)
    expect(Array.isArray(data.scopes)).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 5: --scope config limits validation to config scope
  it('--scope config limits validation to config scope', async () => {
    mockRunValidation.mockReturnValue({
      errors: [],
      warnings: [],
      scopes: ['config'],
      validFilesCount: 0,
      totalFilesCount: 0,
    })
    await validateCommand.handler(defaultArgv({ scope: 'config' }))
    expect(mockRunValidation).toHaveBeenCalledWith('/fake/project', ['config'])
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 6: Displays errors using displayErrors (errors appear in output)
  it('displays errors in output when errors found', async () => {
    mockRunValidation.mockReturnValue({
      errors: [{
        code: 'CONFIG_MISSING',
        message: 'Config file not found at /fake/path',
        exitCode: 1,
        recovery: 'Run scaffold init',
        context: { file: '/fake/path' },
      }],
      warnings: [],
      scopes: ['config'],
      validFilesCount: 0,
      totalFilesCount: 0,
    })
    await validateCommand.handler(defaultArgv())
    const allOutput = [...writtenLines, ...stderrLines].join('')
    // displayErrors calls output.error() which writes to stderr in interactive mode
    expect(allOutput).toContain('CONFIG_MISSING')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
