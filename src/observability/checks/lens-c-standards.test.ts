import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensCStandards } from './lens-c-standards.js'
import { buildDocGraph } from '../engine/doc-graph/index.js'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensCStandards', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensC-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits findings when pattern matches in source files (default P2)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
      '# Coding Standards\n### Rule: no-console\n' +
      '- pattern: `console\\.log\\(`\n- match: src/**/*.ts\n- language: typescript\n')
    writeFileSync(join(dir, 'src/foo.ts'), 'console.log(\'debug\')\n')

    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings).toHaveLength(1)
    expect(findings[0].lens_id).toBe('C-standards')
    expect(findings[0].severity).toBe('P2')
    expect(findings[0].evidence.kind).toBe('rule_violation')
    if (findings[0].evidence.kind === 'rule_violation') {
      expect(findings[0].evidence.rule_id).toMatch(/no-console/)
    }
  })

  it('honors explicit rule severity from the doc', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
      '### Rule: no-console\n- pattern: `console\\.log\\(`\n- match: src/**/*.ts\n- severity: P0\n')
    writeFileSync(join(dir, 'src/foo.ts'), 'console.log(\'debug\')\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].severity).toBe('P0')
  })

  it('escalates to P1 when the same rule is violated more than 5 times', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
      '### Rule: no-console\n- pattern: `console\\.log\\(`\n- match: src/**/*.ts\n')
    writeFileSync(join(dir, 'src/foo.ts'),
      'console.log(1)\nconsole.log(2)\nconsole.log(3)\nconsole.log(4)\nconsole.log(5)\nconsole.log(6)\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings).toHaveLength(6)
    expect(findings.every((f) => f.severity === 'P1')).toBe(true)
  })

  it('honors observability.yaml rule_overrides over doc-declared severity', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
      '### Rule: no-console\n- pattern: `console\\.log\\(`\n- match: src/**/*.ts\n- severity: P2\n')
    writeFileSync(join(dir, 'src/foo.ts'), 'console.log(\'x\')\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  C-standards:\n    rule_overrides:\n      no-console: P0\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].severity).toBe('P0')
  })

  it('checks forbidden symbols too', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
      '### Rule: no-eval\n- forbidden: eval, new Function\n- match: src/**/*.ts\n')
    writeFileSync(join(dir, 'src/foo.ts'), 'eval(\'1 + 1\')\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].lens_id).toBe('C-standards')
  })
})
