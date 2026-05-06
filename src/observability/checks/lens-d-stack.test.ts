import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensDStack } from './lens-d-stack.js'
import { buildDocGraph } from '../engine/doc-graph/index.js'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensDStack', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensD-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits P0 for unsanctioned dependency without a recorded decision', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
      '## Frontend\n\n### React\n\npackage_or_url: react@18\n')
    writeFileSync(join(dir, 'src/lib/x.ts'), 'import { uniq } from \'lodash\'\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensDStack(graph, { events: [] }, stubAvail, [], new Set(['D-stack']))
    expect(findings.length).toBe(1)
    expect(findings[0].severity).toBe('P0')
    expect(findings[0].title).toContain('unsanctioned')
    if (findings[0].evidence.kind === 'rule_violation') {
      expect(findings[0].evidence.file).toBe('file:src/lib/x.ts')
    }
  })

  it('does NOT emit when the unsanctioned import has a matching decision_recorded ledger event', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
      '## Frontend\n\n### React\n\npackage_or_url: react@18\n')
    writeFileSync(join(dir, 'src/lib/x.ts'), 'import { uniq } from \'lodash\'\n')
    const graph = await buildDocGraph(dir)
    const events = [{
      event_id: 'ulid-x', worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
      type: 'decision_recorded', ts: '2026-05-04T00:00:00Z',
      payload: { key: 'lodash-allowed', summary: 'Allow lodash for now', affects: ['src/lib/**'], links: [] },
    } as never]
    const findings = await lensDStack(graph, { events }, stubAvail, [], new Set(['D-stack']))
    expect(findings.find((f) => /unsanctioned/i.test(f.title))).toBeUndefined()
  })

  it('emits P1 for sanctioned component used outside its layer (heuristic)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/api'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
      '## Frontend\n\n### React\n\npackage_or_url: react@18\nlayer: frontend\n')
    writeFileSync(join(dir, 'src/api/handler.ts'), 'import React from \'react\'\n')
    const graph = await buildDocGraph(dir)
    const findings = await lensDStack(graph, { events: [] }, stubAvail, [], new Set(['D-stack']))
    const layerFinding = findings.find((f) => /layer/i.test(f.title))
    expect(layerFinding?.severity).toBe('P1')
  })
})
