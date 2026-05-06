import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AvailabilityMap, Event, Snapshot,
  ActiveAgent, TaskInFlight, TaskCompletion, BlockedTask, DecisionSummary,
  ReplayEvent, ReplayTimeline,
} from './types.js'
import { validateEvent } from './event-schemas.js'
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
    let perSource = 0
    try {
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const result = validateEvent(JSON.parse(line))
          if (!result.ok) { malformed++; continue }
          const ev = result.event
          if (seen.has(ev.event_id)) continue
          seen.add(ev.event_id)
          events.push(ev)
          perSource++
        } catch {
          malformed++
        }
      }
    } catch {
      return
    }
    if (perSource > 0) sources.push({ worktree_id, events: perSource, harvested_at })
  }

  const localLedger = ledgerPath(primaryRoot)
  await ingestFile(localLedger, 'local')

  const activeDir = join(archiveDir(primaryRoot), 'active')
  try {
    await access(activeDir)
    const files = (await readdir(activeDir)).filter((f) => f.endsWith('.jsonl'))
    for (const file of files) {
      const path = join(activeDir, file)
      const worktree_id = file.replace(/\.jsonl$/, '')
      try {
        const harvested_at = (await stat(path)).mtime.toISOString()
        await ingestFile(path, worktree_id, harvested_at)
      } catch { /* file removed between readdir and stat — skip */ }
    }
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
  const blockedByEventId = new Map<string, BlockedTask>()
  const decisions: DecisionSummary[] = []
  const claimsByTask = new Map<string, Event & { type: 'task_claimed' }>()
  const openPrByActor = new Map<string, { number: number; opened_at: string }>()

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
    } else if (e.type === 'task_completed') {
      if (e.task_id) {
        inFlightByTask.delete(e.task_id)
        for (const [key, b] of blockedByEventId.entries()) {
          if (b.task_id === e.task_id) blockedByEventId.delete(key)
        }
      } else {
        const anonymousKey = [...inFlightByTask.entries()]
          .reverse()
          .find(([, t]) => t.by === e.actor_label && t.task_id === null)?.[0]
        if (anonymousKey) inFlightByTask.delete(anonymousKey)
      }
      if (ts >= cutoff) {
        const claim = e.task_id ? claimsByTask.get(e.task_id) : undefined
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
      blockedByEventId.set(e.event_id, {
        task_id: e.task_id ?? '(none)',
        task_title: claimsByTask.get(e.task_id ?? '')?.payload.task_title ?? '(unknown)',
        blocker_kind: bh.payload.kind,
        reason: bh.payload.summary,
        blocked_at: e.ts,
        age_hours: round1(ageH),
      })
    } else if (e.type === 'blocker_resolved') {
      const br = e as Event & { type: 'blocker_resolved' }
      if (br.payload.references.length > 0) {
        for (const ref of br.payload.references) blockedByEventId.delete(ref)
      } else {
        if (e.task_id != null) {
          const staleKey = [...blockedByEventId.entries()]
            .reverse()
            .find(([, b]) => b.task_id === e.task_id)?.[0]
          if (staleKey) blockedByEventId.delete(staleKey)
        }
      }
    } else if (e.type === 'pr_opened') {
      const po = e as Event & { type: 'pr_opened' }
      openPrByActor.set(e.actor_label, { number: po.payload.pr_number, opened_at: e.ts })
    } else if (e.type === 'decision_recorded' && ts >= cutoff) {
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

  const recentEvents = events.filter((e) => Date.parse(e.ts) >= cutoff)
  const actorsSeen = new Set([
    ...recentEvents.map((e) => e.actor_label),
    ...[...inFlightByTask.values()].map((t) => t.by),
  ])
  const activeAgents: ActiveAgent[] = [...actorsSeen].map((actor) => {
    const ev = [...events].reverse().find((e) => e.actor_label === actor)
    const inflight = [...inFlightByTask.values()].find((t) => t.by === actor) ?? null
    const pr = openPrByActor.get(actor) ?? null
    return {
      worktree_id: ev?.worktree_id ?? '',
      actor_label: actor,
      branch: ev?.branch ?? '',
      current_task: inflight
        ? { id: inflight.task_id, title: inflight.task_title, claimed_at: inflight.claimed_at }
        : null,
      open_pr: pr ? { number: pr.number, url: '', opened_at: pr.opened_at } : null,
    }
  })

  return {
    current_phase: input.currentPhase,
    active_agents: activeAgents,
    completed_in_window: completed,
    in_flight: [...inFlightByTask.values()],
    blocked: [...blockedByEventId.values()],
    upcoming: [],
    recent_decisions: decisions.slice(0, 10),
    story_coverage: [],
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

// ─── Replay composer ────────────────────────────────────────────────────────

export interface ComposeReplayInput {
  ledgerEvents: Event[]
  adapterEvents: ReplayEvent[]
  window: { from: string; to: string }
}

const SOURCE_PRIORITY: Record<ReplayEvent['source'], number> = {
  ledger: 0, mmr: 1, gh: 2, git: 3, state: 4, tests: 5,
}

function ledgerEventToReplay(e: Event): ReplayEvent {
  let kind: string = e.type
  let summary = ''
  let task_id: string | undefined
  if (e.task_id) task_id = e.task_id
  let correlation_id: string | null = null
  if (e.type === 'task_claimed') summary = `${e.task_id} claimed: ${(e.payload as { task_title: string }).task_title}`
  else if (e.type === 'task_completed') summary = `${e.task_id} completed (${(e.payload as { outcome: string }).outcome})`
  else if (e.type === 'decision_recorded') summary = `decision recorded: ${(e.payload as { key: string }).key}`
  else if (e.type === 'blocker_hit') summary = `blocker on ${e.task_id ?? '(no task)'}: ${(e.payload as { summary: string }).summary}`
  else if (e.type === 'blocker_resolved') summary = `blocker resolved on ${e.task_id ?? '(no task)'}`
  else if (e.type === 'pr_opened') {
    const pn = (e.payload as { pr_number: number }).pr_number
    summary = `PR #${pn} opened`
    correlation_id = `pr:${pn}:opened`
    kind = 'pr_opened'
  }
  else if (e.type === 'progress_heartbeat') summary = `heartbeat on ${e.task_id ?? '(no task)'}: ${(e.payload as { note: string }).note}`
  else if (e.type === 'finding_acknowledged') summary = `finding ${(e.payload as { finding_id: string }).finding_id} → ${(e.payload as { status: string }).status}`
  return {
    sort_id: `ledger:${e.event_id}`,
    correlation_id,
    ts: e.ts, source: 'ledger', kind,
    actor_label: e.actor_label, task_id,
    summary,
  }
}

export function composeReplay(input: ComposeReplayInput): ReplayTimeline {
  const allEvents: ReplayEvent[] = [
    ...input.ledgerEvents.map(ledgerEventToReplay),
    ...input.adapterEvents,
  ].filter((e) => e.ts >= input.window.from && e.ts <= input.window.to)

  // Dedupe by correlation_id, keeping highest-priority source (lowest number)
  const byCorrelation = new Map<string, ReplayEvent>()
  const passthrough: ReplayEvent[] = []
  for (const e of allEvents) {
    if (e.correlation_id === null) { passthrough.push(e); continue }
    const prev = byCorrelation.get(e.correlation_id)
    if (!prev) { byCorrelation.set(e.correlation_id, e); continue }
    if (SOURCE_PRIORITY[e.source] < SOURCE_PRIORITY[prev.source]) {
      byCorrelation.set(e.correlation_id, e)
    } else if (SOURCE_PRIORITY[e.source] === SOURCE_PRIORITY[prev.source] && e.ts < prev.ts) {
      byCorrelation.set(e.correlation_id, e)
    }
  }
  const merged = [...passthrough, ...byCorrelation.values()]
  merged.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
    const pri = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    if (pri !== 0) return pri
    return a.sort_id < b.sort_id ? -1 : 1
  })
  return { window: input.window, events: merged }
}
