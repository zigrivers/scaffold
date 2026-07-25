import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildAdoptionPlan, canonicalJson, computePlanKey, extractPlanKey, renderPlanMarkdown,
} from './adoption-plan.js'
import type { AdoptionResult } from './adopt.js'

function brownfieldResult(): AdoptionResult {
  return {
    mode: 'brownfield',
    artifactsFound: 0,
    detectedArtifacts: [],
    stepsCompleted: [],
    stepsRemaining: [],
    methodology: 'brownfield',
    errors: [],
    warnings: [],
  }
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-plan-'))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}')
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# rules\n')
  return dir
}

describe('canonicalJson', () => {
  it('is invariant to object key order, recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } }))
      .toBe(canonicalJson({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }))
  })

  it('omits undefined-valued keys (a present-but-undefined optional field keys the same as an absent one)', () => {
    // Mirrors JSON.stringify object semantics; keeps the key deterministic when
    // reused with optional fields (R3 target?/mode?). A bare `undefined` token
    // would be invalid JSON.
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(canonicalJson({ a: 1, mode: undefined })).toBe(canonicalJson({ a: 1 }))
  })
})

describe('buildAdoptionPlan (D1/D2/§6.1)', () => {
  it('scans only the resolved brownfield pipeline and reports the beads artifact-only conflict', () => {
    const dir = makeRepo()
    const { plan, errors } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(errors).toEqual([])
    const beads = plan.steps.find((s) => s.step_slug === 'beads')
    expect(beads).toBeDefined()
    expect(beads!.disposition).toBe('conflict')
    expect(beads!.apply_action).toBe('record-pending')
    expect(beads!.audit_event).toBe('partial-artifacts')
    expect(beads!.outputs_present).toContain('CLAUDE.md')
    // resolved pipeline, not the 99-step superset: preset-disabled steps are
    // rendered in the opt-in section, not as step records
    expect(plan.steps.some((s) => s.step_slug === 'domain-modeling')).toBe(false)
    expect(plan.disabled_by_preset).toContain('domain-modeling')
    // R1 never emits skip-proposed or map-candidate
    expect(plan.steps.some((s) => s.disposition === 'skip-proposed')).toBe(false)
  })

  it('renders the initialize apply-action record on first touch with the exact config payload', () => {
    const dir = makeRepo()
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(plan.initialize).not.toBeNull()
    expect(plan.initialize!.config).toEqual({
      version: 2, methodology: 'brownfield', platforms: ['claude-code'], project: null,
    })
    expect(plan.initialize!.state['init-mode']).toBe('brownfield')
    expect(plan.initialize!.state.steps['beads']).toBe('pending')
  })

  it('omits the initialize record when .scaffold/state.json already exists', () => {
    const dir = makeRepo()
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: brownfield\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: {
        tdd: {
          status: 'completed', source: 'pipeline',
          produces: ['docs/tdd-standards.md'], verification: 'declared',
        },
      },
      next_eligible: [], 'extra-steps': [],
    }))
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    expect(plan.initialize).toBeNull()
    const tdd = plan.steps.find((s) => s.step_slug === 'tdd')
    expect(tdd!.disposition).toBe('conflict')
    expect(tdd!.apply_action).toBe('reopen-pending')
    expect(tdd!.audit_event).toBe('verification-reversal')
  })

  it('plan_key is stable across renders and prose, and changes when an include is accepted', () => {
    const dir = makeRepo()
    const first = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    const second = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    expect(second.plan_key).toBe(first.plan_key)
    expect(second.generated_at >= first.generated_at).toBe(true)  // timestamps may differ; key must not
    const included = buildAdoptionPlan({
      projectRoot: dir, adoptResult: brownfieldResult(), includes: ['domain-modeling'],
    }).plan
    expect(included.plan_key).not.toBe(first.plan_key)
    expect(included.steps.some((s) => s.step_slug === 'domain-modeling')).toBe(true)
    expect(included.disabled_by_preset).not.toContain('domain-modeling')
  })

  it('plan_key changes when reality changes a disposition', () => {
    const dir = makeRepo()
    const before = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs', 'tech-stack.md'), 'x')
    const after = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    expect(after.plan_key).not.toBe(before.plan_key)
    expect(after.steps.find((s) => s.step_slug === 'tech-stack')!.disposition).toBe('done-verified')
    expect(after.steps.find((s) => s.step_slug === 'tech-stack')!.apply_action).toBe('mark-completed')
  })

  it('plan_key changes when an ops-action record changes (R2 §6.1)', () => {
    // Render once on a bare tmp project, then install every file the git
    // component's ops-action record would write (its complete plannedInstallPaths
    // set) so that record disappears from the ops-actions preview entirely, and
    // render again: the two keys MUST differ, because ops-action records are part
    // of the keyed records. Prose/whitespace edits to the written markdown must
    // NOT change the key (covered by R1's existing tests, which still pass
    // unchanged).
    const dir = makeRepo()
    const before = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    const gitRecord = before.ops_actions.find((r) => r.command.endsWith('--component git'))
    expect(gitRecord).toBeDefined()
    for (const f of gitRecord!.files) {
      const p = path.join(dir, f)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, 'x\n')
    }
    const after = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() }).plan
    expect(after.ops_actions.some((r) => r.command.endsWith('--component git'))).toBe(false)
    expect(after.plan_key).not.toBe(before.plan_key)
  })
})

describe('renderPlanMarkdown + extractPlanKey', () => {
  it('embeds the plan key, the disabled-by-preset opt-in section, and the follow-up commands', () => {
    const dir = makeRepo()
    const { plan } = buildAdoptionPlan({ projectRoot: dir, adoptResult: brownfieldResult() })
    const markdown = renderPlanMarkdown(plan)
    expect(markdown).toContain(`Plan key: ${plan.plan_key}`)
    expect(markdown).toContain('## Disabled by preset (opt-in)')
    expect(markdown).toContain('--include domain-modeling')
    expect(markdown).toContain('scaffold adopt --apply')
    expect(markdown).toContain('scaffold doctor')
    expect(extractPlanKey(markdown)).toBe(plan.plan_key)
    expect(extractPlanKey(JSON.stringify(plan))).toBe(plan.plan_key)
    expect(extractPlanKey('no key here')).toBeNull()
  })
})

describe('computePlanKey canonicalization', () => {
  it('ignores ordering of includes, steps, and disabled slugs', () => {
    const record = (slug: string) => ({
      step_slug: slug, disposition: 'run' as const, apply_action: 'none' as const,
      audit_event: null, detect_checks: [], outputs_present: [], outputs_missing: [],
    })
    const a = computePlanKey({
      initialize: null, includes: ['b', 'a'], steps: [record('y'), record('x')], disabled_by_preset: ['d', 'c'],
    })
    const b = computePlanKey({
      initialize: null, includes: ['a', 'b'], steps: [record('x'), record('y')], disabled_by_preset: ['c', 'd'],
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
