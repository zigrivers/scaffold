import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { runAudit } from './api.js'

const tmpDirs: string[] = []

function makeFixtureProject(opts: {
  events: Array<{ topic: string; project_id: string }>
  withKbRoot?: boolean
  kbEntries?: string[]
}): { primaryRoot: string; kbRoot?: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-int-'))
  tmpDirs.push(root)
  // Ledger lives at <root>/.scaffold/activity.jsonl (NOT
  // .scaffold/ledger/events.jsonl). The path is set by ledgerPath() in
  // src/observability/engine/ledger-writer.ts and consumed by
  // readMergedLedger via synthesizer.ts.
  const ledgerDir = path.join(root, '.scaffold')
  fs.mkdirSync(ledgerDir, { recursive: true })
  const now = new Date().toISOString()
  const lines = opts.events.map(ev => JSON.stringify({
    event_id: crypto.randomUUID(),
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test', branch: 'main', task_id: null, ts: now,
    type: 'knowledge_gap_signal',
    payload: {
      topic: ev.topic,
      source: 'agent_search',
      project_id: ev.project_id,
      // step_name and agent_excerpt are optional in the schema (see
      // event-schemas.ts:205-206 — both via `optStr`), but real
      // emitted events include them; supplying them in the fixture
      // makes the test more representative of production data.
      step_name: 'implementation',
      agent_excerpt: `searching for ${ev.topic}`,
    },
  })).join('\n') + '\n'
  fs.writeFileSync(path.join(ledgerDir, 'activity.jsonl'), lines)
  // Optional KB root
  let kbRoot: string | undefined
  if (opts.withKbRoot) {
    kbRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-int-kb-'))
    tmpDirs.push(kbRoot)
    fs.writeFileSync(path.join(kbRoot, 'VERSION'), '0.1.0\n')
    for (const slug of opts.kbEntries ?? []) {
      const sub = path.join(kbRoot, 'core')
      fs.mkdirSync(sub, { recursive: true })
      fs.writeFileSync(path.join(sub, `${slug}.md`), `---\nname: ${slug}\n---\nbody\n`)
    }
  }
  return { primaryRoot: root, kbRoot }
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)

describe('Lens I knowledge-root integration', () => {
  it('suppresses covered topic and surfaces uncovered topic in one runAudit', async () => {
    const events = [
      { topic: 'covered', project_id: HEX_A },
      { topic: 'covered', project_id: HEX_A },
      { topic: 'covered', project_id: HEX_B },
      { topic: 'uncovered', project_id: HEX_A },
      { topic: 'uncovered', project_id: HEX_A },
      { topic: 'uncovered', project_id: HEX_B },
    ]
    const { primaryRoot, kbRoot } = makeFixtureProject({
      events, withKbRoot: true, kbEntries: ['covered'],
    })
    const out = await runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
      knowledgeRootOverride: kbRoot,
    })
    const gapFindings = out.findings.filter(f => f.lens_id === 'I-knowledge-gaps')
    const topics = gapFindings.map(f =>
      (f.evidence as { topic?: string }).topic,
    )
    expect(topics).toEqual(['uncovered'])
  })

  it('throws on invalid --knowledge-root override at audit time', async () => {
    const { primaryRoot } = makeFixtureProject({ events: [] })
    await expect(runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
      knowledgeRootOverride: '/tmp/definitely-nope-99999',
    })).rejects.toThrow(/--knowledge-root path .* is invalid/)
  })

  it('runs without suppression when no knowledgeRoot is resolvable', async () => {
    const events = [
      { topic: 'lonely', project_id: HEX_A },
      { topic: 'lonely', project_id: HEX_A },
      { topic: 'lonely', project_id: HEX_B },
    ]
    const { primaryRoot } = makeFixtureProject({ events })
    // No override, no yaml, no scaffold install above the tmp dir
    const out = await runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
    })
    const gap = out.findings.find(f => f.lens_id === 'I-knowledge-gaps')
    expect(gap).toBeDefined()
    expect((gap?.evidence as { topic?: string }).topic).toBe('lonely')
  })
})
