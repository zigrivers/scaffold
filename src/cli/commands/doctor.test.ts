import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../doctor/run.js', () => ({ runDoctor: vi.fn() }))

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { runDoctor } from '../../doctor/run.js'
import doctorCommand from './doctor.js'

type DoctorArgv = Parameters<typeof doctorCommand.handler>[0]

function argvWith(overrides: Partial<DoctorArgv> = {}): DoctorArgv {
  return {
    fix: false, json: false, format: undefined, auto: undefined, root: undefined, verbose: undefined,
    force: undefined, ...overrides,
  } as DoctorArgv
}

describe('doctor command', () => {
  let writtenLines: string[]
  const savedExitCode = process.exitCode

  beforeEach(() => {
    writtenLines = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    vi.mocked(resolveOutputMode).mockReturnValue('interactive')
  })

  afterEach(() => {
    process.exitCode = savedExitCode
    vi.restoreAllMocks()
  })

  it('sets process.exitCode from the report and prints the verdict + remediation', async () => {
    vi.mocked(runDoctor).mockReturnValue({
      results: [{
        id: 'queue/paused', section: 'queue', title: 'queue not paused',
        status: 'warn', detail: 'queue is paused: gate red', remediation: 'rm .mq/PAUSED',
      }],
      verdict: 'warnings', exitCode: 1,
    })
    await doctorCommand.handler(argvWith())
    expect(process.exitCode).toBe(1)
    const stdout = writtenLines.join('')
    expect(stdout).toContain('doctor: warnings')
    expect(stdout).toContain('rm .mq/PAUSED')
  })

  it('--json emits the structured report', async () => {
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    vi.mocked(runDoctor).mockReturnValue({ results: [], verdict: 'healthy', exitCode: 0 })
    await doctorCommand.handler(argvWith({ json: true }))
    const envelope = JSON.parse(writtenLines.join('')) as { data?: unknown }
    const parsed = (envelope.data ?? envelope) as { verdict: string; exit_code: number }
    expect(parsed.verdict).toBe('healthy')
    expect(parsed.exit_code).toBe(0)
  })

  it('passes --fix through to runDoctor', async () => {
    vi.mocked(runDoctor).mockReturnValue({ results: [], verdict: 'healthy', exitCode: 0 })
    await doctorCommand.handler(argvWith({ fix: true }))
    expect(vi.mocked(runDoctor)).toHaveBeenCalledWith('/fake/project', { fix: true })
  })
})
