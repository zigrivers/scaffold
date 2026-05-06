import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensATdd } from './lens-a-tdd.js'
import { buildDocGraph } from '../engine/doc-graph/index.js'
import type { Finding } from '../engine/types.js'

const stubAvailability = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensATdd', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensA-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits P0 for skipped tests on a "must" priority story', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(dir, 'docs/plan.md'), '# PRD\n\n## Features\n\n### User Auth [priority: must]\n')
    writeFileSync(join(dir, 'docs/user-stories.md'),
      `## Story user-auth-1: Sign in [priority: must]

### AC 1: signs in
Given valid credentials.
`)
    writeFileSync(join(dir, 'src/auth.test.ts'),
      'import { it } from \'vitest\'\nit.skip(\'AC 1: signs in\', () => {})\n')
    writeFileSync(join(dir, 'docs/tdd-standards.md'), '# TDD\n\n## Tests-first policy.')

    const graph = await buildDocGraph(dir)
    const findings = await lensATdd(graph, { events: [] }, stubAvailability, [], new Set(['A-tdd']))
    expect(findings.length).toBeGreaterThan(0)
    const skipFinding = findings.find((f: Finding) => /skip/i.test(f.title))
    expect(skipFinding?.severity).toBe('P0')
  })

  it('emits P1 for skipped tests on lower-priority stories', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(dir, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: should]\n')
    writeFileSync(join(dir, 'docs/user-stories.md'),
      '## Story s-1: T [priority: should]\n\n### AC 1: t\n')
    writeFileSync(join(dir, 'src/foo.test.ts'),
      'it.skip(\'something\', () => {})\n')
    writeFileSync(join(dir, 'docs/tdd-standards.md'), '# TDD\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensATdd(graph, { events: [] }, stubAvailability, [], new Set(['A-tdd']))
    const skipFinding = findings.find((f: Finding) => /skip/i.test(f.title))
    expect(skipFinding?.severity).toBe('P1')
  })

  it('emits no findings on a clean tree', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(dir, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(dir, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
    writeFileSync(join(dir, 'src/foo.test.ts'),
      'import { it, expect } from \'vitest\'\nit(\'AC 1: t\', () => { expect(1).toBe(1) })\n')
    writeFileSync(join(dir, 'docs/tdd-standards.md'), '# TDD\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensATdd(graph, { events: [] }, stubAvailability, [], new Set(['A-tdd']))
    expect(findings).toEqual([])
  })
})
