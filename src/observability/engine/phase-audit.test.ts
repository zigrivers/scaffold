import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runPhaseAudit, formatPhaseAuditLine } from './phase-audit.js'

describe('runPhaseAudit', () => {
  let proj: string

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-phase-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('produces a phase-audit result with the count, sidecar path, and verdict', async () => {
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(true)
    expect(result.step).toBe('user-stories')
    expect(typeof result.findings_count).toBe('number')
    expect(typeof result.verdict).toBe('string')
    expect(result.markdown_path).toMatch(/docs\/audits\/audit-.*\.md$/)
    expect(result.sidecar_path).toMatch(/docs\/audits\/audit-.*\.json$/)
    expect(existsSync(join(proj, result.markdown_path!))).toBe(true)
    expect(existsSync(join(proj, result.sidecar_path!))).toBe(true)
  })

  it('returns ran=false when phase_audit.enabled=false in observability.yaml', async () => {
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  enabled: false\n')
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(false)
    expect(result.reason).toMatch(/disabled/i)
  })

  it('returns ran=false for steps that are not phase boundaries', async () => {
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'arbitrary-step' })
    expect(result.ran).toBe(false)
    expect(result.reason).toMatch(/not a phase boundary/i)
  })

  it('aborts and returns timed_out when the audit exceeds phase_audit.timeout_s', async () => {
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  timeout_s: 0\n')
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    expect(result.ran).toBe(true)
    expect(result.timed_out).toBe(true)
  })

  it('returns immediately with detached=true when phase_audit.detached=true', async () => {
    mkdirSync(join(proj, '.scaffold'), { recursive: true })
    writeFileSync(join(proj, '.scaffold/observability.yaml'), 'phase_audit:\n  detached: true\n')
    const start = Date.now()
    const result = await runPhaseAudit({ primaryRoot: proj, step: 'user-stories' })
    const elapsed = Date.now() - start
    expect(result.ran).toBe(true)
    expect(result.detached).toBe(true)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('formatPhaseAuditLine (Plan 6)', () => {
  it('returns empty string when ran=false', () => {
    expect(formatPhaseAuditLine({ ran: false, step: 'user-stories' })).toBe('')
  })

  it('prints "[audit] dispatched" for detached results', () => {
    const line = formatPhaseAuditLine({ ran: true, step: 'user-stories', detached: true })
    expect(line).toMatch(/dispatched/i)
  })

  it('prints timed out message for timed_out results', () => {
    const line = formatPhaseAuditLine({ ran: true, step: 'user-stories', timed_out: true, elapsed_ms: 5000 })
    expect(line).toMatch(/timed out/i)
  })

  it('prints findings count and path for normal results', () => {
    const line = formatPhaseAuditLine({
      ran: true, step: 'user-stories', verdict: 'pass', findings_count: 3, blocking_count: 0,
      markdown_path: 'docs/audits/audit-x.md', timed_out: false,
    })
    expect(line).toContain('[audit]')
    expect(line).toContain('3 findings')
    expect(line).toContain('docs/audits/audit-x.md')
  })
})
