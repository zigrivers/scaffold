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
  ServiceRequiredError,
  ServiceRejectedError,
  ServiceNotFoundError,
  ServiceFlagWithoutServicesError,
  MultiServiceOverlayMissingError,
} from './user-errors.js'

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
