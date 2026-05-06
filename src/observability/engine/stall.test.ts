import { describe, it, expect } from 'vitest'
import { evaluateStall } from './stall.js'
import type { Event, ReplayEvent, Finding } from './types.js'
import { DEFAULT_CONFIG } from './checks/observability-config.js'

const NOW = '2026-05-04T14:00:00Z'

function ledgerTaskClaimed(taskId: string, ts: string, actor = 'agent-alice'): Event {
  return {
    event_id: `ulid-${taskId}-${ts}`, worktree_id: 'wid-1', actor_label: actor,
    branch: 'feat', task_id: taskId, type: 'task_claimed', ts,
    payload: { task_title: taskId },
  } as Event
}
function ledgerHeartbeat(taskId: string, ts: string): Event {
  return {
    event_id: `ulid-hb-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: taskId, type: 'progress_heartbeat', ts,
    payload: { note: 'still working' },
  } as Event
}
function ledgerPrOpened(prNum: number, ts: string): Event {
  return {
    event_id: `ulid-pr-${prNum}-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: null, type: 'pr_opened', ts,
    payload: { pr_number: prNum },
  } as Event
}
function ledgerBlockerHit(taskId: string, ts: string): Event {
  return {
    event_id: `ulid-bh-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: taskId, type: 'blocker_hit', ts,
    payload: { kind: 'external', summary: 'vendor outage' },
  } as Event
}
function commitReplayEvent(sha: string, ts: string): ReplayEvent {
  return { sort_id: `git:${sha}`, correlation_id: null, ts, source: 'git', kind: 'commit', summary: 'work', actor_label: 'agent-alice' }
}
function prMergedReplayEvent(prNum: number, ts: string): ReplayEvent {
  return { sort_id: `gh:${prNum}:merged`, correlation_id: `pr:${prNum}:merged`, ts, source: 'gh', kind: 'pr_merged', summary: `PR #${prNum} merged` }
}

describe('evaluateStall', () => {
  it('emits task_stale when task_claimed has no commits or completion past threshold', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')] // 6h ago, threshold is 4h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    const stale = items.find((i) => i.signal === 'task_stale')
    expect(stale).toBeDefined()
    expect(stale?.ref.id).toBe('T-001')
    expect(stale?.age_hours).toBeGreaterThanOrEqual(6)
  })

  it('does not emit task_stale when a heartbeat is recent', () => {
    const events = [
      ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z'),
      ledgerHeartbeat('T-001', '2026-05-04T13:30:00Z'),  // 30 min ago
    ]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })

  it('does not emit task_stale when commits are present on the branch since claim', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')]
    const replay = [commitReplayEvent('abc', '2026-05-04T13:30:00Z')]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: replay, findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })

  it('emits pr_stale when pr_opened has no merge/commits past threshold', () => {
    const events = [ledgerPrOpened(42, '2026-05-02T00:00:00Z')] // 60h ago, threshold 48h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'pr_stale')).toBeDefined()
  })

  it('does not emit pr_stale when the PR has been merged', () => {
    const events = [ledgerPrOpened(42, '2026-05-02T00:00:00Z')]
    const replay = [prMergedReplayEvent(42, '2026-05-03T00:00:00Z')]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: replay, findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'pr_stale')).toBeUndefined()
  })

  it('emits blocker_unaddressed when blocker_hit has no resolution past threshold', () => {
    const events = [ledgerBlockerHit('T-001', '2026-05-04T11:00:00Z')] // 3h ago, threshold 2h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'blocker_unaddressed')).toBeDefined()
  })

  it('emits audit_findings_unresolved when findings above threshold are open past 24h', () => {
    const oldFinding: Finding = {
      id: 'f1', lens_id: 'A-tdd', severity: 'P0',
      title: 't', description: 'd', source_doc: '',
      evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' },
      confidence: 'high',
      first_seen: '2026-05-03T00:00:00Z',  // 38h ago
      last_seen: '2026-05-04T13:00:00Z',
      status: 'open',
    }
    const items = evaluateStall({ now: NOW, ledgerEvents: [], replayEvents: [], findings: [oldFinding], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'audit_findings_unresolved')).toBeDefined()
  })

  it('emits lens_skipped_repeatedly when a lens streak is ≥ 3', () => {
    const items = evaluateStall({ now: NOW, ledgerEvents: [], replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: { 'B-ac-coverage': 4 } })
    expect(items.find((i) => i.signal === 'lens_skipped_repeatedly')).toBeDefined()
  })

  it('does not emit a signal when its threshold is configured "off"', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')]
    const config = { ...DEFAULT_CONFIG, stall: { ...DEFAULT_CONFIG.stall, task_stale: 'off' as const } }
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })
})
