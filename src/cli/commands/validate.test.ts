import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  let writtenLines: string[]
  let stderrLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockRunValidation = vi.mocked(runValidation)

  beforeEach(() => {
    writtenLines = []
    stderrLines = []
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
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
    expect(process.exitCode).toBe(1)
  })

  // Test 2: Exits 0 when all valid
  it('exits 0 when all valid', async () => {
    await validateCommand.handler(defaultArgv())
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(1)
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
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(0)
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
    expect(process.exitCode).toBe(1)
  })
})

describe('validate --format json on failure (review round 1, PR #793)', () => {
  let stdout: string[]

  beforeEach(() => {
    stdout = []
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => { stdout.push(String(c)); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    process.exitCode = 0
  })
  afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0 })

  it('emits the FAILURE envelope, not a success-shaped payload', async () => {
    // The JSON branch returned early through output.result(), so a failing
    // validation exited 1 while stdout said `"success": true`. That is worse
    // than the empty stdout this sweep set out to fix: empty output is
    // obviously unusable, whereas success:true on a failed command is a lie a
    // caller will act on.
    vi.mocked(runValidation).mockReturnValue({
      errors: [{ code: 'FM_MISSING_FIELD', message: 'missing name', context: { file: 'a.md' } }],
      warnings: [],
      scopes: ['frontmatter'],
      validFilesCount: 2,
      totalFilesCount: 3,
    } as never)

    await validateCommand.handler(defaultArgv({ format: 'json' }))

    const envelope = JSON.parse(stdout.join(''))
    expect(envelope.success).toBe(false)
    expect(envelope.exit_code).toBe(1)
    expect(envelope.errors.length).toBeGreaterThan(0)
    expect(envelope.errors[0].code).toBe('FM_MISSING_FIELD')
    expect(envelope.errors[0].recovery).toBeTruthy()
    expect(process.exitCode).toBe(1)
  })

  it('still emits the success envelope when validation passes', async () => {
    vi.mocked(runValidation).mockReturnValue({
      errors: [], warnings: [], scopes: ['frontmatter'], validFilesCount: 3, totalFilesCount: 3,
    } as never)

    await validateCommand.handler(defaultArgv({ format: 'json' }))

    const envelope = JSON.parse(stdout.join(''))
    expect(envelope.success).toBe(true)
    expect(envelope.data.valid).toBe(true)
    expect(process.exitCode).toBe(0)
  })
})

describe('validate --format json carries warnings on the failure path (round 3)', () => {
  let stdout: string[]

  beforeEach(() => {
    stdout = []
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => { stdout.push(String(c)); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    process.exitCode = 0
  })
  afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0 })

  it('reports warnings whether validation passes or fails', async () => {
    // Warnings were rendered only in non-JSON mode, and output.warn() is what
    // buffers them into the envelope — so a failing --format json run listed
    // no warnings while a passing one did. Same data, present or absent
    // depending on whether the command happened to succeed.
    vi.mocked(runValidation).mockReturnValue({
      errors: [{ code: 'FM_MISSING_FIELD', message: 'missing name', context: { file: 'a.md' } }],
      warnings: [{ code: 'FM_UNKNOWN_FIELD', message: 'unknown key `foo`' }],
      scopes: ['frontmatter'], validFilesCount: 2, totalFilesCount: 3,
    } as never)

    await validateCommand.handler(defaultArgv({ format: 'json' }))

    const envelope = JSON.parse(stdout.join(''))
    expect(envelope.success).toBe(false)
    expect(envelope.warnings).toHaveLength(1)
    expect(envelope.warnings[0].code).toBe('FM_UNKNOWN_FIELD')
  })
})
