import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
  releaseLock: vi.fn(),
}))
vi.mock('../shutdown.js', () => ({
  shutdown: {
    registerLockOwnership: vi.fn(),
    releaseLockOwnership: vi.fn(),
    withResource: vi.fn(async (_name: string, _cleanup: () => void, fn: () => Promise<unknown>) => fn()),
  },
}))
vi.mock('../../project/adopt.js', () => ({
  runAdoption: vi.fn().mockResolvedValue({
    mode: 'brownfield', artifactsFound: 0, detectedArtifacts: [],
    stepsCompleted: [], stepsRemaining: [], methodology: 'brownfield',
    errors: [], warnings: [],
  }),
  TYPE_KEY: { 'web-app': 'webAppConfig' },
}))
vi.mock('../../project/adoption-plan.js', () => ({
  buildAdoptionPlan: vi.fn(() => ({
    plan: {
      generated_at: '2026-07-19T00:00:00.000Z', project_root: '/mock', mode: 'brownfield',
      methodology: 'brownfield', includes: [], initialize: null, steps: [], disabled_by_preset: [],
      plan_key: 'f'.repeat(64),
    },
    errors: [],
  })),
  renderPlanMarkdown: vi.fn(() => `Plan key: ${'f'.repeat(64)}`),
  extractPlanKey: vi.fn((content: string) => (content.includes('f'.repeat(64)) ? 'f'.repeat(64) : null)),
}))
vi.mock('../../project/adoption-apply.js', () => ({
  applyAdoptionPlan: vi.fn().mockResolvedValue({
    initialized: true, marked_completed: ['tech-stack'], reopened: [], recorded_pending: ['beads'],
    audit_records: 1, warnings: [], doctor: { results: [], verdict: 'healthy', exitCode: 0 },
  }),
}))

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { applyAdoptionPlan } from '../../project/adoption-apply.js'
import adoptCommand from './adopt.js'

type AdoptArgv = Parameters<typeof adoptCommand.handler>[0]

function argvWith(overrides: Partial<AdoptArgv> = {}): AdoptArgv {
  return { 'dry-run': false, force: false, auto: false, verbose: false, ...overrides } as AdoptArgv
}

describe('adopt --apply (D1/D2)', () => {
  let stderrLines: string[]
  const savedExitCode = process.exitCode

  beforeEach(() => {
    stderrLines = []
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    vi.mocked(resolveOutputMode).mockReturnValue('interactive')
    vi.mocked(applyAdoptionPlan).mockClear()
  })

  afterEach(() => {
    process.exitCode = savedExitCode
    // NOTE: clearAllMocks (not restoreAllMocks) — the module-level vi.fn()s
    // above are plain mocks, not vi.spyOn wrappers around a real
    // implementation, so mockRestore() would wipe their mockResolvedValue/
    // mockReturnValue back to a no-op after the FIRST test in this file,
    // breaking every test that runs after it. clearAllMocks resets call
    // counts (so toHaveBeenCalledTimes assertions stay valid per-test)
    // without touching the configured implementations.
    vi.clearAllMocks()
  })

  it('bare --apply errors in non-interactive mode and applies nothing', async () => {
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    await adoptCommand.handler(argvWith({ apply: true, format: 'json' }))
    expect(process.exitCode).not.toBe(0)
    expect(vi.mocked(applyAdoptionPlan)).not.toHaveBeenCalled()
    expect(stderrLines.join('')).toContain('ADOPT_APPLY_NON_INTERACTIVE')
  })

  it('aborts with ADOPT_PLAN_DRIFT when the approved key does not match the live re-render', async () => {
    await adoptCommand.handler(argvWith({ apply: true, 'plan-key': 'a'.repeat(64) }))
    expect(process.exitCode).not.toBe(0)
    expect(vi.mocked(applyAdoptionPlan)).not.toHaveBeenCalled()
  })

  it('applies when the approved key matches the live re-render', async () => {
    await adoptCommand.handler(argvWith({ apply: true, 'plan-key': 'f'.repeat(64) }))
    expect(vi.mocked(applyAdoptionPlan)).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(0)
  })
})
