import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSingleServiceOrExit, guardStepCommand, guardSteplessCommand } from './guards.js'

function makeNullOutput() {
  return { error: () => {}, result: () => {}, warn: () => {} } as never
}

function makeCapturingOutput() {
  const errors: string[] = []
  return {
    output: {
      error: (m: string) => errors.push(m),
      result: () => {},
      warn: () => {},
    },
    errors,
  }
}

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
    const { output, errors } = makeCapturingOutput()
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      { commandName: 'next', output },
    )
    expect(errors.some(m => m.includes('next'))).toBe(true)
    expect(errors.some(m => m.includes('Wave 2'))).toBe(true)
  })
})

describe('guardStepCommand', () => {
  let origExit: number | string | null | undefined

  beforeEach(() => {
    origExit = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = origExit as number | undefined
  })

  const serviceConfig = { project: { services: [{ name: 'api' }, { name: 'web' }] } } as never
  const noServiceConfig = { project: { projectType: 'backend' } } as never
  const globalSteps = new Set(['phase-0', 'phase-7'])
  const serviceStep = 'phase-1'

  it('passes when no services and no --service flag', () => {
    guardStepCommand(
      serviceStep, noServiceConfig, undefined, globalSteps,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(0)
  })

  it('sets exit 2 when service step requires --service but none provided', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, undefined, globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes(serviceStep))).toBe(true)
  })

  it('sets exit 2 when global step rejects --service flag', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand('phase-0', serviceConfig, 'api', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes('phase-0'))).toBe(true)
  })

  it('sets exit 2 when --service used but no services[] in config', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, noServiceConfig, 'api', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes('--service'))).toBe(true)
  })

  it('sets exit 2 when service name not found in services[]', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, 'unknown', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes('unknown'))).toBe(true)
  })

  it('sets exit 2 when services exist but globalSteps is empty (overlay missing)', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, undefined, new Set(), { commandName: 'run', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.toLowerCase().includes('multi-service'))).toBe(true)
  })

  it('passes when service step targeted with valid --service', () => {
    guardStepCommand(
      serviceStep, serviceConfig, 'api', globalSteps,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(0)
  })

  it('passes when global step targeted without --service', () => {
    guardStepCommand(
      'phase-0', serviceConfig, undefined, globalSteps,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(0)
  })
})

describe('guardSteplessCommand', () => {
  let origExit: number | string | null | undefined

  beforeEach(() => {
    origExit = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = origExit as number | undefined
  })

  const serviceConfig = { project: { services: [{ name: 'api' }, { name: 'web' }] } } as never
  const noServiceConfig = { project: { projectType: 'backend' } } as never

  it('passes when no --service flag provided', () => {
    guardSteplessCommand(noServiceConfig, undefined, { commandName: 'status', output: makeNullOutput() })
    expect(process.exitCode).toBe(0)
  })

  it('passes when --service provided and service exists', () => {
    guardSteplessCommand(serviceConfig, 'api', { commandName: 'status', output: makeNullOutput() })
    expect(process.exitCode).toBe(0)
  })

  it('sets exit 2 when --service provided but no services[] in config', () => {
    const { output, errors } = makeCapturingOutput()
    guardSteplessCommand(noServiceConfig, 'api', { commandName: 'status', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes('--service'))).toBe(true)
  })

  it('sets exit 2 when --service name not found in services[]', () => {
    const { output, errors } = makeCapturingOutput()
    guardSteplessCommand(serviceConfig, 'unknown', { commandName: 'status', output })
    expect(process.exitCode).toBe(2)
    expect(errors.some(m => m.includes('unknown'))).toBe(true)
  })
})
