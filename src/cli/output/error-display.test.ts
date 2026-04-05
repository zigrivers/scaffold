import { describe, it, expect, vi } from 'vitest'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ExitCode } from '../../types/index.js'
import type { OutputContext } from './context.js'

import {
  formatError,
  formatWarning,
  formatBatch,
  formatErrorWithSuggestion,
  displayErrors,
} from './error-display.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(overrides: Partial<ScaffoldError> = {}): ScaffoldError {
  return {
    code: 'CONFIG_MISSING',
    message: 'The configuration file was not found',
    exitCode: ExitCode.ValidationError,
    ...overrides,
  }
}

function makeWarning(overrides: Partial<ScaffoldWarning> = {}): ScaffoldWarning {
  return {
    code: 'CONFIG_UNKNOWN_FIELD',
    message: 'Unknown field in configuration',
    ...overrides,
  }
}

function makeMockOutput(): OutputContext {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiSelect: vi.fn(),
    multiInput: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
  it('produces ✗ error [CODE]: message on the first line', () => {
    const err = makeError()
    const result = formatError(err)
    const firstLine = result.split('\n')[0]
    expect(firstLine).toBe('✗ error [CONFIG_MISSING]: The configuration file was not found')
  })

  it('includes File: line when context.file is set', () => {
    const err = makeError({ context: { file: '.scaffold/config.yml' } })
    const result = formatError(err)
    expect(result).toContain('  File: .scaffold/config.yml')
  })

  it('includes Line: line when context.line is set', () => {
    const err = makeError({ context: { line: 42 } })
    const result = formatError(err)
    expect(result).toContain('  Line: 42')
  })

  it('includes Fix: line when recovery is set', () => {
    const err = makeError({ recovery: 'Run `scaffold init` to create the configuration file' })
    const result = formatError(err)
    expect(result).toContain('  Fix: Run `scaffold init` to create the configuration file')
  })

  it('excludes optional lines when context is empty and recovery is absent', () => {
    const err = makeError()
    const result = formatError(err)
    expect(result).not.toContain('File:')
    expect(result).not.toContain('Line:')
    expect(result).not.toContain('Fix:')
    // Only one line
    expect(result.split('\n').length).toBe(1)
  })

  it('includes all optional lines when all fields are present', () => {
    const err = makeError({
      context: { file: 'config.yml', line: 10 },
      recovery: 'Fix the config',
    })
    const result = formatError(err)
    const lines = result.split('\n')
    expect(lines[0]).toBe('✗ error [CONFIG_MISSING]: The configuration file was not found')
    expect(lines[1]).toBe('  File: config.yml')
    expect(lines[2]).toBe('  Line: 10')
    expect(lines[3]).toBe('  Fix: Fix the config')
  })
})

// ---------------------------------------------------------------------------
// formatWarning
// ---------------------------------------------------------------------------

describe('formatWarning', () => {
  it('produces ⚠ warning [CODE]: message', () => {
    const warn = makeWarning()
    const result = formatWarning(warn)
    expect(result).toBe('⚠ warning [CONFIG_UNKNOWN_FIELD]: Unknown field in configuration')
  })

  it('uses the correct code and message', () => {
    const warn = makeWarning({ code: 'DEPRECATED_KEY', message: 'This key is deprecated' })
    const result = formatWarning(warn)
    expect(result).toBe('⚠ warning [DEPRECATED_KEY]: This key is deprecated')
  })
})

// ---------------------------------------------------------------------------
// formatBatch
// ---------------------------------------------------------------------------

describe('formatBatch', () => {
  it('returns empty array for empty inputs', () => {
    const result = formatBatch([], [])
    expect(result).toEqual([])
  })

  it('returns formatted errors when only errors are present', () => {
    const errors = [makeError(), makeError({ code: 'SECOND_ERROR', message: 'Second problem' })]
    const result = formatBatch(errors, [])
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('✗ error [CONFIG_MISSING]')
    expect(result[1]).toContain('✗ error [SECOND_ERROR]')
  })

  it('returns formatted warnings when only warnings are present', () => {
    const warnings = [makeWarning(), makeWarning({ code: 'ANOTHER_WARN', message: 'Watch out again' })]
    const result = formatBatch([], warnings)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('⚠ warning [CONFIG_UNKNOWN_FIELD]')
    expect(result[1]).toContain('⚠ warning [ANOTHER_WARN]')
  })

  it('puts errors before warnings', () => {
    const errors = [makeError()]
    const warnings = [makeWarning()]
    const result = formatBatch(errors, warnings)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('✗ error')
    expect(result[1]).toContain('⚠ warning')
  })

  it('handles multiple errors and warnings in correct order', () => {
    const errors = [
      makeError({ code: 'ERR_1', message: 'Error 1' }),
      makeError({ code: 'ERR_2', message: 'Error 2' }),
    ]
    const warnings = [
      makeWarning({ code: 'WARN_1', message: 'Warning 1' }),
      makeWarning({ code: 'WARN_2', message: 'Warning 2' }),
    ]
    const result = formatBatch(errors, warnings)
    expect(result).toHaveLength(4)
    expect(result[0]).toContain('[ERR_1]')
    expect(result[1]).toContain('[ERR_2]')
    expect(result[2]).toContain('[WARN_1]')
    expect(result[3]).toContain('[WARN_2]')
  })
})

// ---------------------------------------------------------------------------
// formatErrorWithSuggestion
// ---------------------------------------------------------------------------

describe('formatErrorWithSuggestion', () => {
  it('appends "Did you mean...?" when a close match is found', () => {
    const err = makeError({ context: { value: 'configg' } })
    const candidates = ['config', 'context', 'content']
    const result = formatErrorWithSuggestion(err, candidates)
    expect(result).toContain('Did you mean \'config\'?')
  })

  it('does not append suggestion when no candidate is within distance', () => {
    const err = makeError({ context: { value: 'zzzzzzzzz' } })
    const candidates = ['config', 'context', 'content']
    const result = formatErrorWithSuggestion(err, candidates)
    expect(result).not.toContain('Did you mean')
  })

  it('still formats error normally when suggestion is appended', () => {
    const err = makeError({ context: { value: 'configg' } })
    const result = formatErrorWithSuggestion(err, ['config'])
    const firstLine = result.split('\n')[0]
    expect(firstLine).toContain('✗ error [CONFIG_MISSING]')
    expect(firstLine).toContain('The configuration file was not found')
    expect(firstLine).toContain('Did you mean \'config\'?')
  })

  it('works with empty candidates array (no suggestion)', () => {
    const err = makeError({ context: { value: 'config' } })
    const result = formatErrorWithSuggestion(err, [])
    expect(result).not.toContain('Did you mean')
  })

  it('works when context.value is undefined (no suggestion)', () => {
    const err = makeError({ context: {} })
    const candidates = ['config', 'context']
    const result = formatErrorWithSuggestion(err, candidates)
    expect(result).not.toContain('Did you mean')
  })

  it('works when context is undefined (no suggestion)', () => {
    const err = makeError()
    const candidates = ['config', 'context']
    const result = formatErrorWithSuggestion(err, candidates)
    expect(result).not.toContain('Did you mean')
  })
})

// ---------------------------------------------------------------------------
// displayErrors
// ---------------------------------------------------------------------------

describe('displayErrors', () => {
  it('calls output.error() for each error', () => {
    const output = makeMockOutput()
    const errors = [
      makeError({ code: 'ERR_A' }),
      makeError({ code: 'ERR_B' }),
    ]
    displayErrors(errors, [], output)
    expect(output.error).toHaveBeenCalledTimes(2)
    expect(vi.mocked(output.error).mock.calls[0]?.[0]).toMatchObject({ code: 'ERR_A' })
    expect(vi.mocked(output.error).mock.calls[1]?.[0]).toMatchObject({ code: 'ERR_B' })
  })

  it('calls output.warn() for each warning', () => {
    const output = makeMockOutput()
    const warnings = [
      makeWarning({ code: 'WARN_A' }),
      makeWarning({ code: 'WARN_B' }),
    ]
    displayErrors([], warnings, output)
    expect(output.warn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(output.warn).mock.calls[0]?.[0]).toMatchObject({ code: 'WARN_A' })
    expect(vi.mocked(output.warn).mock.calls[1]?.[0]).toMatchObject({ code: 'WARN_B' })
  })

  it('calls both output.error() and output.warn() together', () => {
    const output = makeMockOutput()
    const errors = [makeError()]
    const warnings = [makeWarning()]
    displayErrors(errors, warnings, output)
    expect(output.error).toHaveBeenCalledTimes(1)
    expect(output.warn).toHaveBeenCalledTimes(1)
  })

  it('calls nothing when arrays are empty', () => {
    const output = makeMockOutput()
    displayErrors([], [], output)
    expect(output.error).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })
})
