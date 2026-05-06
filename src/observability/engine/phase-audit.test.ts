import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runPhaseAudit } from './phase-audit.js'

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
})
