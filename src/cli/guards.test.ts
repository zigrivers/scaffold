import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSingleServiceOrExit } from './guards.js'

describe('assertSingleServiceOrExit', () => {
  let origExit: number | string | null | undefined

  beforeEach(() => {
    origExit = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = origExit as number | undefined
  })

  it('passes on single-service config (no services[])', () => {
    expect(() => assertSingleServiceOrExit(
      { project: { projectType: 'backend' } } as never,
      { commandName: 'run', output: makeNullOutput() },
    )).not.toThrow()
    expect(process.exitCode).toBe(0)
  })

  it('passes on config with no project at all', () => {
    expect(() => assertSingleServiceOrExit(
      {} as never,
      { commandName: 'run', output: makeNullOutput() },
    )).not.toThrow()
  })

  it('sets exit 2 on services-only config', () => {
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(2)
  })

  it('sets exit 2 on config with services[] AND root projectType', () => {
    assertSingleServiceOrExit(
      { project: { projectType: 'backend', services: [{ name: 'a' }] } } as never,
      { commandName: 'status', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(2)
  })

  it('emits diagnostic that names the command and Wave 2', () => {
    const errors: string[] = []
    const ctx = {
      commandName: 'next',
      output: {
        error: (m: string) => errors.push(m),
        result: () => {},
        warn: () => {},
      },
    } as never
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      ctx,
    )
    expect(errors.some(m => m.includes('next'))).toBe(true)
    expect(errors.some(m => m.includes('Wave 2'))).toBe(true)
  })
})

function makeNullOutput() {
  return { error: () => {}, result: () => {}, warn: () => {} } as never
}
