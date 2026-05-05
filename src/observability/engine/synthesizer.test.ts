import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { composeAvailability, readMergedLedger, composeSnapshot } from './synthesizer.js'
import { ensureIdentity } from './identity.js'
import { writeEvent } from './ledger-writer.js'
import { harvestWorktree } from './harvester.js'

describe('synthesizer.composeAvailability', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-syn-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: dir, shell: '/bin/sh' })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns one AdapterStatus per adapter', async () => {
    const a = await composeAvailability(dir, { ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(a.git.status).toBe('available')
    expect(a.gh.status).toBe('unavailable')
    expect(a.beads.status).toBe('unavailable')
    expect(a.pipeline_docs.status).toBe('unavailable')
    expect(a.tests.status).toBe('unavailable')
    expect(a.state.status).toBe('unavailable')
    expect(a.mmr.status).toBe('unavailable')
    expect(a.audit_history.status).toBe('unavailable')
  })
})

describe('synthesizer.readMergedLedger', () => {
  let primary: string
  let wtA: string
  let wtB: string

  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-rl-pri-'))
    wtA = mkdtempSync(join(tmpdir(), 'observe-rl-A-'))
    wtB = mkdtempSync(join(tmpdir(), 'observe-rl-B-'))
    ensureIdentity(wtA, 'agent-alice')
    ensureIdentity(wtB, 'agent-bob')
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await writeEvent(wtB, { type: 'task_claimed', branch: 'b', task_id: 'T-2', payload: { task_title: 'B' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtB })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wtA, { recursive: true, force: true })
    rmSync(wtB, { recursive: true, force: true })
  })

  it('merges events from multiple worktree archives sorted by ts', async () => {
    const merged = await readMergedLedger(primary)
    expect(merged.events).toHaveLength(2)
    expect(merged.events.map((e) => e.task_id).sort()).toEqual(['T-1', 'T-2'])
    expect(merged.summary.events_read).toBe(2)
    expect(merged.summary.sources).toHaveLength(2)
  })

  it('skips malformed trailing lines and reports them in summary', async () => {
    const id = JSON.parse(readFileSync(join(wtA, '.scaffold/identity.json'), 'utf8')) as { worktree_id: string }
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    writeFileSync(archived, readFileSync(archived, 'utf8') + '{not-json\n', { flag: 'w' })
    const merged = await readMergedLedger(primary)
    expect(merged.summary.malformed_lines).toBe(1)
  })
})

describe('synthesizer.composeSnapshot', () => {
  let primary: string
  let wtA: string

  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-cs-pri-'))
    wtA = mkdtempSync(join(tmpdir(), 'observe-cs-A-'))
    ensureIdentity(wtA, 'agent-alice')
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wtA, { recursive: true, force: true })
  })

  it('places a claimed-but-not-completed task into in_flight + active_agents', async () => {
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.in_flight).toHaveLength(1)
    expect(snap.in_flight[0].task_id).toBe('T-1')
    expect(snap.active_agents).toHaveLength(1)
    expect(snap.active_agents[0].current_task?.id).toBe('T-1')
    expect(snap.completed_in_window).toHaveLength(0)
  })

  it('moves a task from in_flight to completed_in_window after task_completed', async () => {
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await writeEvent(
      wtA,
      { type: 'task_completed', branch: 'a', task_id: 'T-1', payload: { outcome: 'pr_submitted', pr_number: 42 } },
    )
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.in_flight).toHaveLength(0)
    expect(snap.completed_in_window).toHaveLength(1)
    expect(snap.completed_in_window[0].pr_number).toBe(42)
    expect(snap.active_agents[0].current_task).toBeNull()
  })

  it('lists recent decisions in reverse-chronological order', async () => {
    await writeEvent(
      wtA,
      { type: 'decision_recorded', branch: 'a', task_id: null, payload: { key: 'older', summary: 'a', affects: [] } },
    )
    await new Promise((r) => setTimeout(r, 10))
    await writeEvent(
      wtA,
      { type: 'decision_recorded', branch: 'a', task_id: null, payload: { key: 'newer', summary: 'b', affects: [] } },
    )
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.recent_decisions.map((d) => d.key)).toEqual(['newer', 'older'])
  })

  it('populates open_pr on active_agent from pr_opened event', async () => {
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await writeEvent(wtA, { type: 'pr_opened', branch: 'a', task_id: 'T-1', payload: { pr_number: 42 } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.active_agents[0].open_pr).not.toBeNull()
    expect(snap.active_agents[0].open_pr?.number).toBe(42)
  })

  it('excludes decision_recorded events older than sinceHours from recent_decisions', () => {
    const oldTs = new Date(Date.now() - 49 * 3600 * 1000).toISOString()
    const newTs = new Date().toISOString()
    const base = { event_id: 'x', worktree_id: 'w', actor_label: 'a', branch: 'b', task_id: null }
    const events = [
      { ...base, event_id: 'old-dec', type: 'decision_recorded' as const, ts: oldTs,
        payload: { key: 'old-key', summary: 'old', affects: [] } },
      { ...base, event_id: 'new-dec', type: 'decision_recorded' as const, ts: newTs,
        payload: { key: 'new-key', summary: 'new', affects: [] } },
    ]
    const snap = composeSnapshot({ events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.recent_decisions.map((d) => d.key)).toEqual(['new-key'])
  })
})
