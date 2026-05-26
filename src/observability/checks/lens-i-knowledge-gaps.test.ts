import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { lensIKnowledgeGaps } from './lens-i-knowledge-gaps.js'
import type {
  Event, DocGraph, AvailabilityMap, Finding, KnowledgeGapSignalPayload,
} from '../engine/types.js'
import type { LensContext } from '../engine/checks/runner.js'

// ── Test fixtures ──

const VALID_HEX_A = 'a'.repeat(64)
const VALID_HEX_B = 'b'.repeat(64)
const VALID_HEX_C = 'c'.repeat(64)

function makeEvent(overrides: Partial<{
  ts: string; payload: KnowledgeGapSignalPayload
}>): Event {
  return {
    event_id: crypto.randomUUID(),
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test',
    branch: 'main',
    task_id: null,
    // Default to "now" so events fall inside the lens's 90-day window
    // regardless of when the test runs. Tests that need a specific age
    // pass `ts` in overrides (e.g. the >90-day-old window-exclusion test).
    ts: overrides.ts ?? new Date().toISOString(),
    type: 'knowledge_gap_signal',
    payload: overrides.payload ?? {
      topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A,
    },
  } as Event
}

// Empty graph stub — Lens I ignores the graph
const emptyGraph: DocGraph = {
  cwd: '/tmp',
  features: [], stories: [], acceptance_criteria: [],
  plan_tasks: [], playbook_tasks: [], tests: [],
  pull_requests: [], files: [], rules: [], components: [],
  tokens: [], decisions: [], edges: [], provenance: {},
  unresolved_globs: [],
}

const stubAvailability: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'available' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'available' },
  mmr: { status: 'available' }, audit_history: { status: 'available' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

const tmpDirs: string[] = []

function makeTmpProject(lessonsContent?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-test-'))
  tmpDirs.push(dir)
  if (lessonsContent !== undefined) {
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'tasks', 'lessons.md'), lessonsContent, 'utf8')
  }
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

function makeContext(cwd: string): LensContext {
  return { profile: 'fast', cwd }
}

async function runLens(opts: {
  events?: Event[], cwd?: string,
}): Promise<Finding[]> {
  const cwd = opts.cwd ?? makeTmpProject()
  return await lensIKnowledgeGaps(
    emptyGraph,
    { events: opts.events ?? [] },
    stubAvailability,
    [],
    new Set(['I-knowledge-gaps']),
    makeContext(cwd),
  )
}

// ── Tests ──

describe('lensIKnowledgeGaps', () => {
  it('returns no findings on empty ledger and missing lessons.md', async () => {
    const findings = await runLens({ events: [] })
    expect(findings).toEqual([])
  })

  it('returns no findings when below P2 threshold (2 signals, 2 projects)', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('surfaces P2 when 3 signals from 2 real projects target the same normalized topic', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
    expect(findings[0].lens_id).toBe('I-knowledge-gaps')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.topic).toBe('foo-bar')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('escalates to P1 when 5 signals from 3 real projects target the same normalized topic', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_C } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P1')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.distinct_project_count).toBe(3)
  })

  it('does NOT surface when 5 signals come from a single project (diversity gate)', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('does NOT count synthetic project_id="lessons" as a distinct project (gate)', async () => {
    // 2 CLI from project A + 1 lessons mention should be 1 distinct project, no P2.
    const cwd = makeTmpProject('No knowledge entry for "foo-bar".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('lessons mentions still contribute to signal_count when real projects also signal', async () => {
    // 2 CLI from 2 different projects + 1 lessons = signal_count=3, distinct=2 → P2 fires
    const cwd = makeTmpProject('No knowledge entry for "foo-bar".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('collapses different surface-spellings of the same topic via normalizeTopic', async () => {
    // Three different on-the-wire topics that all normalize to 'foo-bar'.
    // If the lens bucketed by raw `payload.topic`, this would produce 3
    // buckets of size 1 (no finding). If it normalizes first, it produces
    // one bucket of size 3 with 2 distinct projects (P2 fires).
    const findings = await runLens({
      events: [
        makeEvent({ payload: {
          topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A,
        } }),
        makeEvent({ payload: {
          topic: 'Foo_Bar', source: 'agent_search', project_id: VALID_HEX_A,
        } }),
        makeEvent({ payload: {
          topic: 'foo bar', source: 'agent_search', project_id: VALID_HEX_B,
        } }),
      ],
    })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.topic).toBe('foo-bar')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('lessons-only signals never cross the P2 threshold (negative case)', async () => {
    // Five lessons mentions of the same topic, no ledger signals.
    // distinct_project_count = 0 after delete('lessons') → no finding.
    const cwd = makeTmpProject([
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
    ].join('\n'))
    const findings = await runLens({ cwd, events: [] })
    expect(findings).toEqual([])
  })

  it('high count from a single project + lessons still fails the diversity gate', async () => {
    // 5 CLI signals from project A + 3 lessons mentions = signal_count=8,
    // distinct_project_count = 1 (only A; 'lessons' is excluded). No finding.
    const cwd = makeTmpProject([
      'No knowledge entry for "same-proj-topic".',
      'No knowledge entry for "same-proj-topic".',
      'No knowledge entry for "same-proj-topic".',
    ].join('\n'))
    const events = Array.from({ length: 5 }, () => makeEvent({ payload: {
      topic: 'same-proj-topic', source: 'agent_search', project_id: VALID_HEX_A,
    } }))
    const findings = await runLens({ cwd, events })
    expect(findings).toEqual([])
  })

  it('excludes ledger signals older than 90 days from window', async () => {
    const oldTs = new Date(Date.now() - 100 * 86400 * 1000).toISOString()
    const newTs = new Date().toISOString()
    const findings = await runLens({
      events: [
        makeEvent({ ts: oldTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ ts: newTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ ts: newTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toEqual([]) // signal_count = 2, distinct = 2 — below P2 threshold
  })

  it('emits up to 5 sample project IDs but reports the authoritative count', async () => {
    const projects = Array.from({ length: 7 }, (_, i) =>
      'a'.repeat(63) + String.fromCharCode('0'.charCodeAt(0) + i),
    )
    const events = projects.map(p =>
      makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: p } }),
    )
    const findings = await runLens({ events })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.distinct_project_count).toBe(7)
    expect(findings[0].evidence.distinct_projects.length).toBeLessThanOrEqual(5)
  })

  it('includes up to 3 distinct example_excerpts', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A,
          agent_excerpt: 'excerpt-1',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B,
          agent_excerpt: 'excerpt-2',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_C,
          agent_excerpt: 'excerpt-3',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A,
          agent_excerpt: 'excerpt-4',
        } }),
      ],
    })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.example_excerpts.length).toBeLessThanOrEqual(3)
    expect(findings[0].evidence.example_excerpts.length).toBeGreaterThan(0)
  })

  it('uses context.cwd to locate tasks/lessons.md', async () => {
    const cwd = makeTmpProject('No knowledge entry for "from-lessons".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'from-lessons', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'from-lessons', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    // 2 real signals from 2 projects + 1 lessons mention → signal_count=3, distinct=2 → P2
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
  })
})
