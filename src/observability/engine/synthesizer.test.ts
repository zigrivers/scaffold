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

import { composeReplay } from './synthesizer.js'
import type { Event, ReplayEvent } from './types.js'

describe('synthesizer.composeReplay', () => {
  it('merges ledger events + adapter replay events sorted by (ts, source_priority, sort_id)', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-A', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-05-04T10:00:00Z', payload: { task_title: 'A' },
    } as Event]
    const adapterReplay: ReplayEvent[] = [
      { sort_id: 'git:abc', correlation_id: null, ts: '2026-05-04T11:00:00Z', source: 'git', kind: 'commit', summary: 'work' },
      { sort_id: 'mmr:job-1', correlation_id: null, ts: '2026-05-04T10:30:00Z', source: 'mmr', kind: 'job_completed', summary: 'pass' },
    ]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: adapterReplay, window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events.map((e) => e.sort_id)).toEqual(['ledger:ulid-A', 'mmr:job-1', 'git:abc'])
  })

  it('dedupes cross-source events sharing a correlation_id (ledger > gh > git priority)', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-X', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: null,
      type: 'pr_opened', ts: '2026-05-04T09:00:00Z', payload: { pr_number: 42 },
    } as Event]
    const adapterReplay: ReplayEvent[] = [
      { sort_id: 'gh:42:opened', correlation_id: 'pr:42:opened', ts: '2026-05-04T09:00:00Z', source: 'gh', kind: 'pr_opened', summary: 'PR #42' },
      { sort_id: 'gh:42:merged', correlation_id: 'pr:42:merged', ts: '2026-05-04T17:00:00Z', source: 'gh', kind: 'pr_merged', summary: 'PR #42 merged' },
    ]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: adapterReplay, window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events.map((e) => e.kind)).toEqual(['pr_opened', 'pr_merged'])
    expect(out.events[0].source).toBe('ledger')
  })

  it('filters events outside the time window', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-old', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-04-01T00:00:00Z', payload: { task_title: 'old' },
    } as Event]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: [], window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events).toEqual([])
  })

  it('ledger events get sort_id "ledger:<event_id>"', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-Z', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-05-04T10:00:00Z', payload: { task_title: 'Z' },
    } as Event]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: [], window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events[0].sort_id).toBe('ledger:ulid-Z')
  })
})
