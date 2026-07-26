import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSingleServiceOrExit, guardStepCommand, guardSteplessCommand } from './guards.js'
import type { TerminalError } from '../types/errors.js'
import { ExitCode } from '../types/enums.js'

function makeNullOutput() {
  return { error: () => {}, fail: () => {}, result: () => {}, warn: () => {} } as never
}

function makeCapturingOutput() {
  const errors: string[] = []
  const failures: TerminalError[] = []
  return {
    output: {
      error: (m: string) => errors.push(m),
      // Guards report through fail() so `--format json` gets a parseable
      // envelope on stdout instead of a bare stderr line and empty stdout.
      fail: (errs: TerminalError[]) => {
        failures.push(...errs)
        errors.push(...errs.map(e => e.message))
      },
      result: () => {},
      warn: () => {},
    },
    errors,
    failures,
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

  it('fails with a parseable envelope (exit 1) on services-only config', () => {
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(ExitCode.ValidationError)
  })

  it('fails with a parseable envelope (exit 1) on config with services[] AND root projectType', () => {
    assertSingleServiceOrExit(
      { project: { projectType: 'backend', services: [{ name: 'a' }] } } as never,
      { commandName: 'status', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(ExitCode.ValidationError)
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

  it('fails with a parseable envelope (exit 1) when service step requires --service but none provided', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, undefined, globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes(serviceStep))).toBe(true)
  })

  it('fails with a parseable envelope (exit 1) when global step rejects --service flag', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand('phase-0', serviceConfig, 'api', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes('phase-0'))).toBe(true)
  })

  it('fails with a parseable envelope (exit 1) when --service used but no services[] in config', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, noServiceConfig, 'api', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes('--service'))).toBe(true)
  })

  it('fails with a parseable envelope (exit 1) when service name not found in services[]', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, 'unknown', globalSteps, { commandName: 'run', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes('unknown'))).toBe(true)
  })

  it('fails with a parseable envelope (exit 1) when services exist but globalSteps is empty (overlay missing)', () => {
    const { output, errors } = makeCapturingOutput()
    guardStepCommand(serviceStep, serviceConfig, undefined, new Set(), { commandName: 'run', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
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

  it('fails with a parseable envelope (exit 1) when --service provided but no services[] in config', () => {
    const { output, errors } = makeCapturingOutput()
    guardSteplessCommand(noServiceConfig, 'api', { commandName: 'status', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes('--service'))).toBe(true)
  })

  it('fails with a parseable envelope (exit 1) when --service name not found in services[]', () => {
    const { output, errors } = makeCapturingOutput()
    guardSteplessCommand(serviceConfig, 'unknown', { commandName: 'status', output })
    expect(process.exitCode).toBe(ExitCode.ValidationError)
    expect(errors.some(m => m.includes('unknown'))).toBe(true)
  })
})

describe('the envelope contract is CLI-wide', () => {
  // The audit that produced Release 1 found 68 `output.error(` call sites
  // across 21 files. `error()` writes to stderr ONLY, so every terminal one
  // gave `--format json` a non-zero exit with EMPTY stdout — nothing for an
  // agent to parse. Release 1 fixed init/adopt; this gate is what stops the
  // other 19 files from drifting back.
  //
  // error-display.ts is the one legitimate exception: it is the shared
  // non-terminal renderer for config errors and warnings, and the command
  // decides separately whether to exit.
  const ALLOWED = new Set(['src/cli/output/error-display.ts'])

  it('no command reports a failure through the stderr-only error()', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
        if (ALLOWED.has(p)) continue
        // Strip comments so prose mentioning the old call doesn't trip the gate.
        const src = readFileSync(p, 'utf-8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        if (/\boutput\.error\(/.test(src)) offenders.push(p)
      }
    }
    walk('src/cli')
    expect(offenders, `use output.fail() instead: ${offenders.join(', ')}`).toEqual([])
  })

  it('no command ends on displayErrors(), which routes through error()', async () => {
    // The first sweep converted every `output.error(` call site and declared
    // CLI-wide coverage — but `displayErrors()` calls `output.error()` for
    // each error, so six terminal sites in run/build/rework still produced
    // empty stdout under --format json. Banning the direct call was not
    // enough; the indirection had to be banned at terminal sites too.
    // `failWithErrors()` is the terminal form.
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const offenders: string[] = []
    for (const f of readdirSync('src/cli/commands')) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
      const p = join('src/cli/commands', f)
      const src = readFileSync(p, 'utf-8')
      // A terminal site is a displayErrors() call whose next few lines set or
      // return a non-zero exit. Warning-only calls (empty error array) are
      // fine and are how the remaining callers use it.
      //
      // Both spellings must match. An earlier version of this gate only
      // handled `process.exitCode = …` and the numeric-literal `exitCode: 1`,
      // so `return { exitCode: ExitCode.ValidationError }` — build.ts's shape —
      // slipped straight through. It was found by review, not by me: my
      // not-vacuous check had exercised a single form and I reported the gate
      // as verified on that basis.
      const NONZERO_EXIT =
        /process\.exitCode\s*=\s*(?!0\b)|exitCode:\s*(?:ExitCode\.(?!Success\b)\w+|[1-9])/
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!/\bdisplayErrors\(/.test(line)) return
        if (/displayErrors\(\s*\[\]/.test(line)) return   // warnings-only
        const after = lines.slice(i, i + 4).join(' ')
        if (NONZERO_EXIT.test(after)) offenders.push(`${p}:${i + 1}`)
      })
    }
    expect(offenders, `use failWithErrors() instead: ${offenders.join(', ')}`).toEqual([])
  })

  it('no command prints a raw PROJECT_NOT_INITIALIZED line to stderr', async () => {
    // Five commands hand-rolled this to stderr and exited, bypassing
    // exitNotInitialized — so the single most common agent failure (running
    // any command outside a project) was unparseable in exactly those places.
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const offenders = readdirSync('src/cli/commands')
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f => /stderr\.write\([^)]*PROJECT_NOT_INITIALIZED/
        .test(readFileSync(join('src/cli/commands', f), 'utf-8')))
    expect(offenders, `use exitNotInitialized(argv): ${offenders.join(', ')}`).toEqual([])
  })
})

describe('no command sniffs the guard exit code', () => {
  // Every guard caller used to bail with `if (process.exitCode === 2) return`.
  // That coupled twelve command files to a magic number owned by the guard
  // layer, so correcting the guards' exit code (2 MissingDependency → 1
  // ValidationError) silently turned each of those bails into a no-op and let
  // the command run on past a failure it had already reported. Guards now
  // return `false` and callers check the return value.
  it('leaves no `process.exitCode === 2` bail in src/cli', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const roots = ['src/cli', 'src/cli/commands']
    const offenders: string[] = []
    for (const root of roots) {
      for (const f of readdirSync(root)) {
        if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
        const p = join(root, f)
        const src = readFileSync(p, 'utf-8')
        if (/process\.exitCode\s*===\s*2/.test(src)) offenders.push(p)
      }
    }
    expect(offenders, `still sniffing the guard exit code: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('guards report whether the command may proceed', () => {
  const serviceConfig = { project: { services: [{ name: 'api' }] } } as never
  const noServiceConfig = { project: { projectType: 'backend' } } as never
  const globalSteps = new Set(['phase-0'])

  it('returns true when the command may proceed', () => {
    expect(guardStepCommand('phase-1', noServiceConfig, undefined, globalSteps,
      { commandName: 'run', output: makeNullOutput() })).toBe(true)
    expect(guardSteplessCommand(noServiceConfig, undefined,
      { commandName: 'status', output: makeNullOutput() })).toBe(true)
    expect(assertSingleServiceOrExit(noServiceConfig,
      { commandName: 'next', output: makeNullOutput() })).toBe(true)
  })

  it('returns false when it has reported a failure', () => {
    expect(guardStepCommand('phase-1', serviceConfig, undefined, globalSteps,
      { commandName: 'run', output: makeNullOutput() })).toBe(false)
    expect(guardSteplessCommand(noServiceConfig, 'api',
      { commandName: 'status', output: makeNullOutput() })).toBe(false)
    expect(assertSingleServiceOrExit(serviceConfig,
      { commandName: 'next', output: makeNullOutput() })).toBe(false)
  })
})

describe('guard failure envelopes', () => {
  // Every guard used to report via output.error(err.message) — which writes
  // only to stderr — and then set exit 2. Two defects in one line: an agent
  // running `--format json` got a non-zero exit with EMPTY stdout, and exit 2
  // is MissingDependency in the enum, not a validation failure. Guards are the
  // shared layer behind run/skip/complete/next/status, so both defects were
  // inherited by every command that routes through them.
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

  const cases: Array<{ name: string; run: (o: never) => void; code: string }> = [
    {
      name: 'missing --service on a service step',
      code: 'RUN_SERVICE_REQUIRED',
      run: o => guardStepCommand('phase-1', serviceConfig, undefined, globalSteps,
        { commandName: 'run', output: o }),
    },
    {
      name: '--service on a global step',
      code: 'RUN_SERVICE_REJECTED',
      run: o => guardStepCommand('phase-0', serviceConfig, 'api', globalSteps,
        { commandName: 'run', output: o }),
    },
    {
      name: '--service without services[]',
      code: 'RUN_SERVICE_WITHOUT_SERVICES',
      run: o => guardStepCommand('phase-1', noServiceConfig, 'api', globalSteps,
        { commandName: 'run', output: o }),
    },
    {
      name: 'unknown service name',
      code: 'RUN_SERVICE_NOT_FOUND',
      run: o => guardStepCommand('phase-1', serviceConfig, 'nope', globalSteps,
        { commandName: 'run', output: o }),
    },
    {
      name: 'multi-service overlay missing',
      code: 'INIT_OVERLAY_MISSING',
      run: o => guardStepCommand('phase-1', serviceConfig, undefined, new Set(),
        { commandName: 'run', output: o }),
    },
    {
      name: 'stepless --service without services[]',
      code: 'RUN_SERVICE_WITHOUT_SERVICES',
      run: o => guardSteplessCommand(noServiceConfig, 'api', { commandName: 'status', output: o }),
    },
    {
      name: 'stepless unknown service name',
      code: 'RUN_SERVICE_NOT_FOUND',
      run: o => guardSteplessCommand(serviceConfig, 'nope', { commandName: 'status', output: o }),
    },
    {
      name: 'multi-service command not yet executable',
      code: 'INIT_MULTI_SERVICE_UNSUPPORTED',
      run: o => assertSingleServiceOrExit(serviceConfig, { commandName: 'next', output: o }),
    },
  ]

  for (const c of cases) {
    it(`emits code, recovery and exit 1 for: ${c.name}`, () => {
      const { output, failures } = makeCapturingOutput()
      c.run(output as never)

      expect(failures).toHaveLength(1)
      expect(failures[0]?.code).toBe(c.code)
      expect(failures[0]?.exitCode).toBe(ExitCode.ValidationError)
      // TerminalError makes recovery mandatory at the type level; assert it is
      // also non-empty, since "" would satisfy the compiler and help nobody.
      expect(failures[0]?.recovery.length).toBeGreaterThan(0)
      expect(process.exitCode).toBe(ExitCode.ValidationError)
    })
  }
})
