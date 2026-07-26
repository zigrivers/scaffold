import { describe, it, expect } from 'vitest'
import {
  ScaffoldUserError,
  FlagConflictError,
  InvalidYamlError,
  InvalidConfigError,
  FromPathReadError,
  TTYStdinError,
  MultiServiceNotSupportedError,
  ExistingScaffoldError,
  isScaffoldUserError,
  toScaffoldError,
  USER_ERROR_CODES,
  ServiceRequiredError,
  ServiceRejectedError,
  ServiceNotFoundError,
  ServiceFlagWithoutServicesError,
  MultiServiceOverlayMissingError,
} from './user-errors.js'
import { ExitCode } from '../types/enums.js'
import { withRecovery } from './errors.js'

describe('ScaffoldUserError taxonomy', () => {
  it('FlagConflictError extends ScaffoldUserError', () => {
    const err = new FlagConflictError('foo')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('foo')
  })

  it('InvalidYamlError carries source label', () => {
    const err = new InvalidYamlError('services.yml', 'unexpected token')
    expect(err.message).toContain('services.yml')
    expect(err.message).toContain('unexpected token')
  })

  it('InvalidConfigError carries formatted Zod message', () => {
    const err = new InvalidConfigError('services.yml', 'bad field')
    expect(err.message).toContain('services.yml')
    expect(err.message).toContain('bad field')
  })

  it('FromPathReadError carries path and cause', () => {
    const err = new FromPathReadError('x.yml', 'ENOENT')
    expect(err.message).toContain('x.yml')
    expect(err.message).toContain('ENOENT')
  })

  it('TTYStdinError has a fixed message', () => {
    const err = new TTYStdinError()
    expect(err.message).toContain('stdin')
  })

  it('MultiServiceNotSupportedError identifies the blocked command', () => {
    const err = new MultiServiceNotSupportedError('run')
    expect(err.message).toContain('run')
    expect(err.message).toContain('Wave 2')
  })

  it('ExistingScaffoldError carries project root and recovery hint', () => {
    const err = new ExistingScaffoldError('/tmp/my-project')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('/tmp/my-project')
    expect(err.message).toContain('--force')
  })

  it('isScaffoldUserError narrows correctly', () => {
    expect(isScaffoldUserError(new FlagConflictError('x'))).toBe(true)
    expect(isScaffoldUserError(new Error('plain'))).toBe(false)
    expect(isScaffoldUserError(null)).toBe(false)
    expect(isScaffoldUserError(undefined)).toBe(false)
  })

  it('ServiceRequiredError', () => {
    const err = new ServiceRequiredError('tech-stack')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('tech-stack')
    expect(err.message).toContain('--service')
  })

  it('ServiceNotFoundError', () => {
    const err = new ServiceNotFoundError('nonexistent')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('nonexistent')
  })

  it('ServiceRejectedError', () => {
    const err = new ServiceRejectedError('service-ownership-map')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('service-ownership-map')
    expect(err.message).toContain('global')
  })

  it('ServiceFlagWithoutServicesError', () => {
    const err = new ServiceFlagWithoutServicesError()
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('--service')
    expect(err.message).toContain('services[]')
  })

  it('MultiServiceOverlayMissingError', () => {
    const err = new MultiServiceOverlayMissingError()
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('multi-service-overlay.yml')
  })
})

describe('withRecovery (shared terminal-error widening)', () => {
  it('preserves message when the source is an Error subclass', () => {
    // Error.prototype.message is NON-ENUMERABLE. Object spread drops it, so a
    // `{ ...e }` clone ships message: undefined. Both adopt and init route
    // wizard/adopt errors through here, and init previously kept its own
    // spread-based copy — reintroducing the bug one file from the comment
    // warning about it.
    class CodedError extends Error {
      code = 'INIT_SCAFFOLD_EXISTS'
      exitCode = 1
    }
    const widened = withRecovery(new CodedError('the real message') as never, 'fallback')
    expect(widened.message).toBe('the real message')
    expect(widened.code).toBe('INIT_SCAFFOLD_EXISTS')
    expect(widened.recovery).toBe('fallback')
  })

  it('keeps an existing recovery rather than overwriting it', () => {
    const widened = withRecovery(
      { code: 'X', message: 'm', exitCode: 1, recovery: 'the real fix' } as never,
      'fallback',
    )
    expect(widened.recovery).toBe('the real fix')
  })

  it('carries context through', () => {
    const widened = withRecovery(
      { code: 'X', message: 'm', exitCode: 1, context: { file: 'a.ts' } } as never,
      'fallback',
    )
    expect(widened.context).toEqual({ file: 'a.ts' })
  })
})

describe('toScaffoldError (Task 8)', () => {
  it('maps ExistingScaffoldError to a coded error with exit 1, not 2', () => {
    // Exit 2 is MissingDependency in the enum, so the old --from path used a
    // semantically wrong code for an input error.
    const e = toScaffoldError(new ExistingScaffoldError('/tmp/p'))
    expect(e.code).toBe('INIT_SCAFFOLD_EXISTS')
    expect(e.exitCode).toBe(ExitCode.ValidationError)
    expect(e.recovery).toContain('--force')
  })

  it('gives every user-error subclass a code and a non-empty recovery', () => {
    const cases = [
      new FlagConflictError('--methodology'),
      new InvalidYamlError('cfg.yml', 'bad indent'),
      new InvalidConfigError('cfg.yml', 'methodology: invalid'),
      new FromPathReadError('cfg.yml', 'ENOENT'),
      new TTYStdinError(),
      new ExistingScaffoldError('/tmp/p'),
      new MultiServiceNotSupportedError('init'),
      new ServiceRequiredError('tech-stack'),
      new ServiceRejectedError('tech-stack'),
      new ServiceNotFoundError('api'),
      new ServiceFlagWithoutServicesError(),
      new MultiServiceOverlayMissingError(),
    ]
    for (const c of cases) {
      const m = toScaffoldError(c)
      expect(m.exitCode, `${c.name} exitCode`).toBe(ExitCode.ValidationError)
      expect(m.code, `${c.name} code`).toMatch(/^(INIT|RUN)_[A-Z_]+$/)
      expect(m.recovery, `${c.name} recovery`).toBeTruthy()
    }
  })

  it('throws on an unmapped subclass rather than emitting a recovery-less error', () => {
    class NewlyAddedError extends ScaffoldUserError {
      constructor() { super('something new') }
    }
    expect(() => toScaffoldError(new NewlyAddedError())).toThrow(/Unmapped ScaffoldUserError/)
  })

  it('has a mapping for every exported ScaffoldUserError subclass', async () => {
    // Reflective, so a future subclass cannot be forgotten: whoever skips the
    // mapping would also skip a hand-written list.
    const mod = await import('./user-errors.js')
    const subclasses = Object.entries(mod)
      .filter(([, v]) => {
        const fn = v as { prototype?: unknown }
        return typeof v === 'function'
          && v !== mod.ScaffoldUserError
          && fn.prototype instanceof mod.ScaffoldUserError
      })
      .map(([name]) => name)
    expect(subclasses.length).toBeGreaterThanOrEqual(12)
    const unmapped = subclasses.filter(n => !(n in USER_ERROR_CODES))
    expect(unmapped, `unmapped: ${unmapped.join(', ')}`).toEqual([])
  })
})
