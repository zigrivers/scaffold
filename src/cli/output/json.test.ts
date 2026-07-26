import { describe, it, expect, vi, afterEach } from 'vitest'
import { JsonOutput } from './json.js'
import { ExitCode } from '../../types/enums.js'

function captureStdout(fn: () => void): string {
  let out = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk)
    return true
  })
  // Keep the human-readable half off the test reporter.
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('JsonOutput.fail', () => {
  it('writes success:false with populated errors and a non-zero exit_code', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail([{
        code: 'INIT_AUTO_FLAG_REQUIRED',
        message: '--cli-interactivity is required in auto mode for cli projects',
        exitCode: ExitCode.ValidationError,
        recovery: 'Pass --cli-interactivity <args-only|interactive|hybrid>',
      }])
    })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(false)
    expect(parsed.data).toBeNull()
    expect(parsed.exit_code).toBe(ExitCode.ValidationError)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].code).toBe('INIT_AUTO_FLAG_REQUIRED')
    expect(parsed.errors[0].recovery).toContain('--cli-interactivity')
  })

  it('carries buffered warnings into the failure envelope', () => {
    const output = new JsonOutput()
    output.warn({ code: 'ADOPT_LOW_ONLY', message: 'Only low-confidence matches found: backend' })
    const raw = captureStdout(() => {
      output.fail([{
        code: 'X_FAILED', message: 'boom',
        exitCode: ExitCode.ValidationError, recovery: 'try again',
      }])
    })
    const parsed = JSON.parse(raw)
    expect(parsed.warnings).toHaveLength(1)
    expect(parsed.warnings[0].code).toBe('ADOPT_LOW_ONLY')
  })

  it('takes the exit code from the first error when none is passed explicitly', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail([{
        code: 'LOCK_HELD', message: 'locked',
        exitCode: ExitCode.StateCorruption, recovery: 'retry with --force',
      }])
    })
    expect(JSON.parse(raw).exit_code).toBe(ExitCode.StateCorruption)
  })

  it('lets an explicit exit code override the first error', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail(
        [{
          code: 'X_FAILED', message: 'boom',
          exitCode: ExitCode.ValidationError, recovery: 'try again',
        }],
        ExitCode.StateCorruption,
      )
    })
    expect(JSON.parse(raw).exit_code).toBe(ExitCode.StateCorruption)
  })

  it('never emits a failure envelope with an empty errors array', () => {
    // An empty errors array says something failed and nothing about what,
    // which is barely better than the empty stdout this replaced. Consumers
    // must always be able to read errors[0].code.
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail([])
    })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(false)
    expect(parsed.exit_code).toBe(ExitCode.ValidationError)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].code).toBe('INTERNAL_ERROR')
    expect(parsed.errors[0].recovery).toBeTruthy()
  })

  it('emits exactly one line of JSON so a caller can parse stdout whole', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.fail([{
        code: 'X_FAILED', message: 'boom',
        exitCode: ExitCode.ValidationError, recovery: 'try again',
      }])
    })
    expect(raw.trimEnd().split('\n')).toHaveLength(1)
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('still emits success:true from result()', () => {
    const output = new JsonOutput()
    const raw = captureStdout(() => {
      output.result({ ok: 1 })
    })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.exit_code).toBe(0)
  })
})
