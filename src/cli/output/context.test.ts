import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ExitCode } from '../../types/index.js'

import { createOutputContext } from './context.js'
import { InteractiveOutput } from './interactive.js'
import { JsonOutput } from './json.js'
import { AutoOutput } from './auto.js'

type WriteSpy = MockInstance<typeof process.stdout.write>

function makeError(overrides: Partial<ScaffoldError> = {}): ScaffoldError {
  return {
    code: 'TEST_ERROR',
    message: 'Something went wrong',
    exitCode: ExitCode.ValidationError,
    ...overrides,
  }
}

function makeWarning(overrides: Partial<ScaffoldWarning> = {}): ScaffoldWarning {
  return {
    code: 'TEST_WARN',
    message: 'Watch out',
    ...overrides,
  }
}

describe('createOutputContext factory', () => {
  it('returns InteractiveOutput for "interactive"', () => {
    const ctx = createOutputContext('interactive')
    expect(ctx).toBeInstanceOf(InteractiveOutput)
  })

  it('returns JsonOutput for "json"', () => {
    const ctx = createOutputContext('json')
    expect(ctx).toBeInstanceOf(JsonOutput)
  })

  it('returns AutoOutput for "auto"', () => {
    const ctx = createOutputContext('auto')
    expect(ctx).toBeInstanceOf(AutoOutput)
  })

  it('returns InteractiveOutput for unknown mode (default)', () => {
    // @ts-expect-error testing unknown mode fallback
    const ctx = createOutputContext('unknown')
    expect(ctx).toBeInstanceOf(InteractiveOutput)
  })
})

describe('InteractiveOutput', () => {
  let stdoutWrite: WriteSpy
  let stderrWrite: WriteSpy

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('success() writes to stdout with checkmark', () => {
    const out = new InteractiveOutput()
    out.success('Done!')
    expect(stdoutWrite).toHaveBeenCalled()
    const written = String(stdoutWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Done!')
    expect(written).toContain('✓')
  })

  it('info() writes to stdout with arrow', () => {
    const out = new InteractiveOutput()
    out.info('Loading...')
    expect(stdoutWrite).toHaveBeenCalled()
    const written = String(stdoutWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Loading...')
    expect(written).toContain('→')
  })

  it('warn() writes to stderr with warning symbol', () => {
    const out = new InteractiveOutput()
    out.warn(makeWarning())
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Watch out')
    expect(written).toContain('⚠')
  })

  it('warn() accepts a plain string', () => {
    const out = new InteractiveOutput()
    out.warn('simple warning')
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('simple warning')
  })

  it('error() writes error code + message to stderr', () => {
    const out = new InteractiveOutput()
    out.error(makeError())
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('TEST_ERROR')
    expect(written).toContain('Something went wrong')
    expect(written).toContain('✗')
  })

  it('error() writes recovery hint when recovery is present', () => {
    const out = new InteractiveOutput()
    out.error(makeError({ recovery: 'Try again later' }))
    const allWritten = stderrWrite.mock.calls.map(c => String(c[0])).join('\n')
    expect(allWritten).toContain('Recovery')
    expect(allWritten).toContain('Try again later')
  })

  it('error() does not write recovery line when recovery is absent', () => {
    const out = new InteractiveOutput()
    out.error(makeError())
    const allWritten = stderrWrite.mock.calls.map(c => String(c[0])).join('\n')
    expect(allWritten).not.toContain('Recovery')
  })

  it('error() accepts a plain string', () => {
    const out = new InteractiveOutput()
    out.error('plain error message')
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('plain error message')
  })

  it('result() writes JSON.stringify output to stdout', () => {
    const out = new InteractiveOutput()
    const data = { steps: ['a', 'b'], count: 2 }
    out.result(data)
    const allWritten = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(allWritten).toContain('"steps"')
    expect(allWritten).toContain('"count"')
  })

  it('startSpinner and stopSpinner do not throw', () => {
    const out = new InteractiveOutput()
    expect(() => out.startSpinner('Working...')).not.toThrow()
    expect(() => out.stopSpinner(true)).not.toThrow()
    expect(() => out.stopSpinner(false)).not.toThrow()
  })

  it('startProgress, updateProgress, stopProgress do not throw', () => {
    const out = new InteractiveOutput()
    expect(() => out.startProgress(100, 'Loading')).not.toThrow()
    expect(() => out.updateProgress(50)).not.toThrow()
    expect(() => out.stopProgress()).not.toThrow()
  })

  it('prompt returns defaultValue when non-TTY', async () => {
    const out = new InteractiveOutput()
    const result = await out.prompt('Enter name:', 'defaultName')
    expect(result).toBe('defaultName')
  })

  it('confirm returns defaultValue when non-TTY', async () => {
    const out = new InteractiveOutput()
    const result = await out.confirm('Continue?', true)
    expect(result).toBe(true)
  })

  it('confirm returns false as default when defaultValue omitted', async () => {
    const out = new InteractiveOutput()
    const result = await out.confirm('Continue?')
    expect(result).toBe(false)
  })
})

describe('InteractiveOutput — NO_COLOR', () => {
  let stdoutWrite: WriteSpy
  let originalNoColor: string | undefined

  beforeEach(() => {
    originalNoColor = process.env['NO_COLOR']
    process.env['NO_COLOR'] = '1'
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env['NO_COLOR']
    } else {
      process.env['NO_COLOR'] = originalNoColor
    }
    vi.restoreAllMocks()
  })

  it('success() output does not contain ANSI escape codes when NO_COLOR is set', () => {
    const out = new InteractiveOutput()
    out.success('Done!')
    const written = String(stdoutWrite.mock.calls[0]?.[0] ?? '')
    expect(written).not.toContain('\x1b[')
  })
})

describe('JsonOutput', () => {
  let stdoutWrite: WriteSpy
  let stderrWrite: WriteSpy

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('result() writes JSON envelope with success:true to stdout', () => {
    const out = new JsonOutput()
    const data = { name: 'test', value: 42 }
    out.result(data)
    expect(stdoutWrite).toHaveBeenCalled()
    const written = String(stdoutWrite.mock.calls[0]?.[0] ?? '')
    const parsed = JSON.parse(written) as { success: boolean; data: unknown }
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(data)
  })

  it('success() writes to stderr, not stdout', () => {
    const out = new JsonOutput()
    out.success('Operation complete')
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Operation complete')
  })

  it('info() writes to stderr, not stdout', () => {
    const out = new JsonOutput()
    out.info('Loading config')
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).toHaveBeenCalled()
  })

  it('warn() writes to stderr, not stdout', () => {
    const out = new JsonOutput()
    out.warn(makeWarning())
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Watch out')
  })

  it('warn() accepts a plain string', () => {
    const out = new JsonOutput()
    out.warn('simple warning')
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('simple warning')
  })

  it('error() writes to stderr, not stdout', () => {
    const out = new JsonOutput()
    out.error(makeError())
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Something went wrong')
  })

  it('error() accepts a plain string', () => {
    const out = new JsonOutput()
    out.error('plain error')
    expect(stderrWrite).toHaveBeenCalled()
    const written = String(stderrWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('plain error')
  })

  it('prompt() returns defaultValue immediately without interaction', async () => {
    const out = new JsonOutput()
    const result = await out.prompt('Enter name:', 'myDefault')
    expect(result).toBe('myDefault')
  })

  it('prompt() writes "Using default" message to stderr', async () => {
    const out = new JsonOutput()
    await out.prompt('Enter name:', 'myDefault')
    const allStderr = stderrWrite.mock.calls.map(c => String(c[0])).join('')
    expect(allStderr).toContain('Using default')
  })

  it('confirm() returns defaultValue immediately', async () => {
    const out = new JsonOutput()
    const result = await out.confirm('Continue?', true)
    expect(result).toBe(true)
  })

  it('confirm() returns false when no defaultValue provided', async () => {
    const out = new JsonOutput()
    const result = await out.confirm('Continue?')
    expect(result).toBe(false)
  })

  it('startSpinner is a no-op', () => {
    const out = new JsonOutput()
    expect(() => out.startSpinner('Working')).not.toThrow()
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).not.toHaveBeenCalled()
  })

  it('stopSpinner is a no-op', () => {
    const out = new JsonOutput()
    expect(() => out.stopSpinner()).not.toThrow()
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).not.toHaveBeenCalled()
  })

  it('startProgress, updateProgress, stopProgress are no-ops', () => {
    const out = new JsonOutput()
    expect(() => out.startProgress(100, 'Loading')).not.toThrow()
    expect(() => out.updateProgress(50)).not.toThrow()
    expect(() => out.stopProgress()).not.toThrow()
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).not.toHaveBeenCalled()
  })
})

describe('AutoOutput', () => {
  let stdoutWrite: WriteSpy
  let stderrWrite: WriteSpy

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('success() writes to stdout', () => {
    const out = new AutoOutput()
    out.success('Done!')
    expect(stdoutWrite).toHaveBeenCalled()
    const written = String(stdoutWrite.mock.calls[0]?.[0] ?? '')
    expect(written).toContain('Done!')
  })

  it('prompt() returns defaultValue without interaction', async () => {
    const out = new AutoOutput()
    const result = await out.prompt('Enter name:', 'autoDefault')
    expect(result).toBe('autoDefault')
  })

  it('prompt() writes "(auto) Using default" to stderr', async () => {
    const out = new AutoOutput()
    await out.prompt('Enter name:', 'autoDefault')
    const allStderr = stderrWrite.mock.calls.map(c => String(c[0])).join('')
    expect(allStderr).toContain('(auto)')
    expect(allStderr).toContain('Enter name:')
  })

  it('confirm() returns defaultValue without interaction', async () => {
    const out = new AutoOutput()
    const result = await out.confirm('Continue?', true)
    expect(result).toBe(true)
  })

  it('confirm() returns false as default when defaultValue omitted', async () => {
    const out = new AutoOutput()
    const result = await out.confirm('Continue?')
    expect(result).toBe(false)
  })

  it('confirm() writes "(auto) Confirming" to stderr', async () => {
    const out = new AutoOutput()
    await out.confirm('Continue?', false)
    const allStderr = stderrWrite.mock.calls.map(c => String(c[0])).join('')
    expect(allStderr).toContain('(auto)')
    expect(allStderr).toContain('Continue?')
  })

  it('startSpinner and stopSpinner do not throw', () => {
    const out = new AutoOutput()
    expect(() => out.startSpinner('Working')).not.toThrow()
    expect(() => out.stopSpinner(true)).not.toThrow()
  })

  it('result() writes to stdout', () => {
    const out = new AutoOutput()
    out.result({ key: 'value' })
    expect(stdoutWrite).toHaveBeenCalled()
    const allWritten = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(allWritten).toContain('"key"')
  })
})
