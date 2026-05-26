import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderGapSignalTail } from './gap-signal-tail.js'

describe('renderGapSignalTail', () => {
  const originalEnv = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']

  beforeEach(() => {
    delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
    else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = originalEnv
  })

  it('returns a non-empty tail string when the env var is unset', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail.length).toBeGreaterThan(0)
  })

  it('includes the scaffold observe event invocation', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toContain('scaffold observe event knowledge_gap_signal')
  })

  it('substitutes {{step_name}} with the provided stepName', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toContain('--step-name="tech-stack"')
    expect(tail).not.toContain('{{step_name}}')
  })

  it('returns empty string when SCAFFOLD_GAP_SIGNAL_QUIET=1', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1'
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toBe('')
  })

  it('does not suppress when SCAFFOLD_GAP_SIGNAL_QUIET is any value other than "1"', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '0'
    expect(renderGapSignalTail({ stepName: 'x' }).length).toBeGreaterThan(0)

    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = 'true'
    expect(renderGapSignalTail({ stepName: 'x' }).length).toBeGreaterThan(0)
  })

  it('uses portable PROJECT_ID computation (shasum-first with sha256sum fallback)', () => {
    const tail = renderGapSignalTail({ stepName: 'x' })
    expect(tail).toContain('shasum -a 256')
    expect(tail).toContain('sha256sum')
    expect(tail).toContain('pwd -P')
  })

  it('uses a non-failing branch resolution', () => {
    const tail = renderGapSignalTail({ stepName: 'x' })
    expect(tail).toContain('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown')
  })
})
