import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAdoptionPlan } from './adoption-plan.js'
import { applyAdoptionPlan } from './adoption-apply.js'
import type { AdoptionResult } from './adopt.js'

function brownfieldResult(): AdoptionResult {
  return {
    mode: 'brownfield', artifactsFound: 0, detectedArtifacts: [],
    stepsCompleted: [], stepsRemaining: [], methodology: 'brownfield',
    errors: [], warnings: [],
  }
}

describe('applyAdoptionPlan (D1/D2/D3)', () => {
  it('first touch: initializes config + state, records the beads partial-artifacts audit, '
    + 'marks verified steps completed, and runs doctor', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-apply-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# rules\n')
    fs.mkdirSync(path.join(dir, 'docs'))
    fs.writeFileSync(path.join(dir, 'docs', 'tech-stack.md'), 'stack\n')
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const result = await applyAdoptionPlan({ projectRoot: dir, plan, scaffoldVersion: '3.48.0' })

    expect(result.initialized).toBe(true)
    const configText = fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf8')
    expect(configText).toContain('methodology: brownfield')
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.scaffold', 'state.json'), 'utf8')) as {
      'init-mode': string
      steps: Record<string, { status: string; verification?: string }>
    }
    expect(state['init-mode']).toBe('brownfield')
    expect(state.steps['tech-stack'].status).toBe('completed')
    expect(state.steps['tech-stack'].verification).toBe('verified')
    expect(state.steps['beads'].status).toBe('pending')
    expect(state.steps['beads'].verification).toBe('unverified')
    expect(result.recorded_pending).toContain('beads')
    expect(result.marked_completed).toContain('tech-stack')

    // Regression: next_eligible + its graph hash come from the REAL resolved
    // pipeline, not a `() => []` placeholder. With only tech-stack completed,
    // the pipeline root (create-vision) is an eligible pending step, so the
    // dashboard and other raw-cache readers see live work after apply.
    const fullState = JSON.parse(fs.readFileSync(path.join(dir, '.scaffold', 'state.json'), 'utf8')) as {
      next_eligible: string[]
      next_eligible_hash?: string
    }
    expect(fullState.next_eligible_hash).toBeTruthy()
    expect(fullState.next_eligible).toContain('create-vision')

    const auditLines = fs.readFileSync(path.join(dir, '.scaffold', 'decisions.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const beadsAudit = auditLines.find((l) => l['step_slug'] === 'beads')
    expect(beadsAudit?.['event']).toBe('partial-artifacts')
    expect(beadsAudit?.['plan_key']).toBe(plan.plan_key)
    expect(result.doctor.verdict).toBeDefined()
  })

  it('reopens a false completion with a verification-reversal audit record preserving the prior claim', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-apply-rev-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: brownfield\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: {
        tdd: {
          status: 'completed', source: 'pipeline', produces: ['docs/tdd-standards.md'],
          completed_by: 'old-agent', verification: 'declared',
        },
      },
      next_eligible: [], 'extra-steps': [],
    }))
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const result = await applyAdoptionPlan({ projectRoot: dir, plan, scaffoldVersion: '3.48.0' })

    expect(result.initialized).toBe(false)
    expect(result.reopened).toContain('tdd')
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.scaffold', 'state.json'), 'utf8')) as {
      steps: Record<string, { status: string; verification?: string }>
    }
    expect(state.steps['tdd'].status).toBe('pending')
    expect(state.steps['tdd'].verification).toBe('unverified')
    const auditLines = fs.readFileSync(path.join(dir, '.scaffold', 'decisions.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    const reversal = auditLines.find((l) => l['event'] === 'verification-reversal')
    expect(reversal?.['step_slug']).toBe('tdd')
    expect(reversal?.['from_status']).toBe('completed')
    expect(reversal?.['from_verification']).toBe('declared')
    expect(String(reversal?.['reason'])).toContain('old-agent')
  })
})
