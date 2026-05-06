import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensEDesign } from './lens-e-design.js'
import { buildDocGraph } from '../engine/doc-graph/index.js'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensEDesign', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensE-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits P1 when a UI file has more than the configured ad-hoc threshold (default 3)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
      '## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n    ad_hoc_token_threshold: 3\n')
    writeFileSync(join(dir, 'src/components/Big.tsx'),
      'export const Big = () => ' +
      '<div style={{ color: \'#abc\', background: \'#def\', borderColor: \'#123\', padding: \'13px\' }} />')
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings.find((f) => /ad-hoc/i.test(f.title))).toBeDefined()
    expect(findings.find((f) => /ad-hoc/i.test(f.title))?.severity).toBe('P1')
  })

  it('emits P0 when a must-priority token is replaced by a literal', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
      '## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      'export const Btn = () => <button style={{ color: \'#zz0011\' }}>X</button>')
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    const must = findings.find((f) => /must-priority/i.test(f.title))
    expect(must?.severity).toBe('P0')
  })

  it('emits P0 only for ad-hoc uses on properties whose category has a must-priority token', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    // Only color is must-priority; spacing is not in the design system at all.
    writeFileSync(join(dir, 'docs/design-system.md'),
      '## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n    ad_hoc_token_threshold: 100\n')
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      'export const Btn = () => <button style={{ color: \'#zz0011\', padding: \'13px\' }} />')
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings.find((f) => /must-priority/i.test(f.title) && /color/i.test(f.description))?.severity).toBe('P0')
    expect(findings.find((f) => /must-priority/i.test(f.title) && /padding/i.test(f.description))).toBeUndefined()
  })

  it('does NOT emit must-priority P0 when the design-system declares no must tokens', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
      '## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | should |\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      'export const Btn = () => ' +
      '<button style={{ color: \'#aaa\', background: \'#bbb\', borderColor: \'#ccc\', padding: \'11px\' }} />')
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings.find((f) => /must-priority/i.test(f.title))).toBeUndefined()
  })

  it('emits no findings when files use tokens correctly', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
      '## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      'export const Btn = () => <button style={{ color: \'#4f46e5\' }}>X</button>')
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings).toEqual([])
  })
})
