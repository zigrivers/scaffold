import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AvailabilityMap, Event, Snapshot,
  ActiveAgent, TaskInFlight, TaskCompletion, BlockedTask, DecisionSummary,
} from './types.js'
import { gitAdapter } from '../adapters/git.js'
import { ghAdapter } from '../adapters/gh.js'
import { pipelineDocsAdapter } from '../adapters/pipeline-docs.js'
import { testsAdapter } from '../adapters/tests.js'
import { stateAdapter } from '../adapters/state.js'
import { beadsAdapter } from '../adapters/beads.js'
import { mmrAdapter } from '../adapters/mmr.js'
import { auditHistoryAdapter } from '../adapters/audit-history.js'
import { archiveDir } from './harvester.js'
import { ledgerPath } from './ledger-writer.js'

export interface SynthesizerOpts {
  ghBin?: string
  bdBin?: string
}

export async function composeAvailability(
  cwd: string,
  opts: SynthesizerOpts = {},
): Promise<AvailabilityMap> {
  const [git, gh, pipeline_docs, tests, state, beads, mmr, audit_history] = await Promise.all([
    gitAdapter.probe(cwd),
    ghAdapter.probe(cwd, { ghBin: opts.ghBin }),
    pipelineDocsAdapter.probe(cwd),
    testsAdapter.probe(cwd),
    stateAdapter.probe(cwd),
    beadsAdapter.probe(cwd, { bdBin: opts.bdBin }),
    mmrAdapter.probe(cwd),
    auditHistoryAdapter.probe(cwd),
  ])
  return {
    git, gh, pipeline_docs, tests, state, beads, mmr, audit_history,
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  }
}

// ─── MergedLedger ────────────────────────────────────────────────────────────

export interface MergedLedger {
  events: Event[]
  summary: {
    events_read: number
    malformed_lines: number
    sources: { worktree_id: string; events: number; harvested_at?: string }[]
  }
}

export async function readMergedLedger(primaryRoot: string): Promise<MergedLedger> {
  const events: Event[] = []
  const sources: MergedLedger['summary']['sources'] = []
  let malformed = 0
  const seen = new Set<string>()

  async function ingestFile(path: string, worktree_id: string, harvested_at?: string): Promise<void> {
    let txt: string
    try { txt = await readFile(path, 'utf8') } catch { return }
    let perSource = 0
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue
      try {
        const ev = JSON.parse(line) as Event
        if (seen.has(ev.event_id)) continue
        seen.add(ev.event_id)
        events.push(ev)
        perSource++
      } catch {
        malformed++
      }
    }
    sources.push({ worktree_id, events: perSource, harvested_at })
  }

  const localLedger = ledgerPath(primaryRoot)
  await ingestFile(localLedger, 'local')

  const activeDir = join(archiveDir(primaryRoot), 'active')
  try {
    await access(activeDir)
    const files = (await readdir(activeDir)).filter((f) => f.endsWith('.jsonl'))
    await Promise.all(files.map(async (file) => {
      const path = join(activeDir, file)
      const worktree_id = file.replace(/\.jsonl$/, '')
      const harvested_at = (await stat(path)).mtime.toISOString()
      await ingestFile(path, worktree_id, harvested_at)
    }))
  } catch { /* no archive yet — local-only */ }

  events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
    return a.event_id < b.event_id ? -1 : 1
  })

  return { events, summary: { events_read: events.length, malformed_lines: malformed, sources } }
}

// ─── Snapshot composer ───────────────────────────────────────────────────────

export interface ComposeSnapshotInput {
  events: Event[]
  sinceHours: number
  currentPhase: string
}

export function composeSnapshot(input: ComposeSnapshotInput): Snapshot {
  const cutoff = Date.now() - input.sinceHours * 3600 * 1000
  const { events } = input

  const inFlightByTask = new Map<string, TaskInFlight>()
  const completed: TaskCompletion[] = []
  const blocked: BlockedTask[] = []
  const decisions: DecisionSummary[] = []
  const claimsByTask = new Map<string, Event & { type: 'task_claimed' }>()

  for (const e of events) {
    const ts = Date.parse(e.ts)
    if (Number.isNaN(ts)) continue

    if (e.type === 'task_claimed') {
      const key = e.task_id ?? e.event_id
      if (e.task_id) claimsByTask.set(e.task_id, e as Event & { type: 'task_claimed' })
      const ageH = Math.max(0, (Date.now() - ts) / 3600 / 1000)
      inFlightByTask.set(key, {
        task_id: e.task_id ?? null,
        task_title: (e as Event & { type: 'task_claimed' }).payload.task_title,
        story_id: (e as Event & { type: 'task_claimed' }).payload.story_id,
        by: e.actor_label,
        claimed_at: e.ts,
        age_hours: round1(ageH),
        branch: e.branch,
      })
    } else if (e.type === 'task_completed' && e.task_id) {
      inFlightByTask.delete(e.task_id)
      if (ts >= cutoff) {
        const claim = claimsByTask.get(e.task_id)
        const comp = e as Event & { type: 'task_completed' }
        completed.push({
          task_id: e.task_id,
          task_title: claim?.payload.task_title ?? '(unknown)',
          outcome: comp.payload.outcome,
          pr_number: comp.payload.pr_number,
          by: e.actor_label,
        })
      }
    } else if (e.type === 'blocker_hit') {
      const ageH = Math.max(0, (Date.now() - ts) / 3600 / 1000)
      const bh = e as Event & { type: 'blocker_hit' }
      blocked.push({
        task_id: e.task_id ?? '(none)',
        task_title: claimsByTask.get(e.task_id ?? '')?.payload.task_title ?? '(unknown)',
        blocker_kind: bh.payload.kind,
        reason: bh.payload.summary,
        blocked_at: e.ts,
        age_hours: round1(ageH),
      })
    } else if (e.type === 'blocker_resolved') {
      const br = e as Event & { type: 'blocker_resolved' }
      const idx = [...blocked].reverse().findIndex(
        (b) => br.payload.references.length === 0 || b.task_id === e.task_id,
      )
      if (idx >= 0) blocked.splice(blocked.length - 1 - idx, 1)
    } else if (e.type === 'decision_recorded') {
      const dr = e as Event & { type: 'decision_recorded' }
      decisions.push({
        decision_id: `decision:${dr.payload.key}`,
        key: dr.payload.key,
        summary: dr.payload.summary,
        recorded_at: e.ts,
        affects: dr.payload.affects,
      })
    }
  }

  decisions.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))

  const actorsSeen = new Set(events.map((e) => e.actor_label))
  const activeAgents: ActiveAgent[] = [...actorsSeen].map((actor) => {
    const ev = [...events].reverse().find((e) => e.actor_label === actor)
    const inflight = [...inFlightByTask.values()].find((t) => t.by === actor) ?? null
    return {
      worktree_id: ev?.worktree_id ?? '',
      actor_label: actor,
      branch: ev?.branch ?? '',
      current_task: inflight
        ? { id: inflight.task_id, title: inflight.task_title, claimed_at: inflight.claimed_at }
        : null,
      open_pr: null,
    }
  })

  return {
    current_phase: input.currentPhase,
    active_agents: activeAgents,
    completed_in_window: completed,
    in_flight: [...inFlightByTask.values()],
    blocked,
    upcoming: [],
    recent_decisions: decisions.slice(0, 10),
    story_coverage: [],
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
