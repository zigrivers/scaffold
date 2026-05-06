import type { Event, ReplayEvent, Finding, NeedsAttentionItem, Severity } from './types.js'
import { severityRank } from './types.js'
import type { ObservabilityConfig } from './checks/observability-config.js'

export interface EvaluateStallInput {
  now: string
  ledgerEvents: Event[]
  replayEvents: ReplayEvent[]
  findings: Finding[]
  config: ObservabilityConfig
  lensSkippedStreaks: Record<string, number>
  fixThreshold?: Severity
}

function parseHours(s: string | 'off' | undefined): number | null {
  if (!s || s === 'off') return null
  const m = s.match(/^(\d+(?:\.\d+)?)([hd])$/)
  if (!m) return null
  const n = Number(m[1])
  return m[2] === 'd' ? n * 24 : n
}

function ageHours(now: string, ts: string): number {
  return Math.max(0, (Date.parse(now) - Date.parse(ts)) / 3_600_000)
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

export function evaluateStall(input: EvaluateStallInput): NeedsAttentionItem[] {
  const out: NeedsAttentionItem[] = []
  const now = input.now

  const lastClaimByTask = new Map<string, Event>()
  const lastResolutionByTask = new Map<string, Event>()
  const lastHeartbeatByTask = new Map<string, Event>()
  const openBlockersByTask = new Map<string, Event>()
  const prOpenedById = new Map<number, Event>()

  for (const e of input.ledgerEvents) {
    if (e.type === 'task_claimed' && e.task_id) {
      lastClaimByTask.set(e.task_id, e)
    } else if (e.type === 'task_completed' && e.task_id) {
      lastResolutionByTask.set(e.task_id, e)
    } else if (e.type === 'progress_heartbeat' && e.task_id) {
      const prev = lastHeartbeatByTask.get(e.task_id)
      if (!prev || prev.ts < e.ts) lastHeartbeatByTask.set(e.task_id, e)
    } else if (e.type === 'blocker_hit') {
      if (e.task_id) openBlockersByTask.set(e.task_id, e)
    } else if (e.type === 'blocker_resolved') {
      if (e.task_id) openBlockersByTask.delete(e.task_id)
    } else if (e.type === 'pr_opened') {
      const pn = (e.payload as { pr_number: number }).pr_number
      prOpenedById.set(pn, e)
    }
  }

  function latestCommitOnBranchSince(branch: string, since: string): string | null {
    let latest: string | null = null
    for (const r of input.replayEvents) {
      if (r.source !== 'git' || r.kind !== 'commit') continue
      if (r.ts <= since) continue
      if (r.branch && r.branch !== branch) continue
      if (latest === null || r.ts > latest) latest = r.ts
    }
    return latest
  }

  // task_stale
  const taskStaleH = parseHours(input.config.stall.task_stale)
  if (taskStaleH !== null) {
    for (const [taskId, claim] of lastClaimByTask) {
      if (lastResolutionByTask.has(taskId)) continue
      const heartbeat = lastHeartbeatByTask.get(taskId)?.ts
      const branchCommit = latestCommitOnBranchSince(claim.branch, claim.ts)
      const lastActivityTs = [claim.ts, heartbeat, branchCommit].filter((x): x is string => Boolean(x)).sort().pop()!
      const age = ageHours(now, lastActivityTs)
      if (age <= taskStaleH) continue
      out.push({
        signal: 'task_stale',
        ref: { kind: 'task', id: taskId },
        age_hours: round1(age),
        threshold_hours: taskStaleH,
        summary: `task ${taskId} (${claim.actor_label}) claimed ${round1(age)}h ago, no recent activity`,
      })
    }
  }

  // pr_stale
  const prStaleH = parseHours(input.config.stall.pr_stale)
  if (prStaleH !== null) {
    for (const [pn, opened] of prOpenedById) {
      const merged = input.replayEvents.find(
        (r) => r.source === 'gh' && r.correlation_id === `pr:${pn}:merged` && r.ts > opened.ts,
      )
      const closed = input.replayEvents.find(
        (r) => r.source === 'gh' && r.kind === 'pr_closed'
          && r.correlation_id === `pr:${pn}:closed` && r.ts > opened.ts,
      )
      if (merged || closed) continue
      const age = ageHours(now, opened.ts)
      if (age <= prStaleH) continue
      out.push({
        signal: 'pr_stale',
        ref: { kind: 'pr', id: String(pn) },
        age_hours: round1(age),
        threshold_hours: prStaleH,
        summary: `PR #${pn} opened ${round1(age)}h ago, not merged or closed`,
      })
    }
  }

  // pr_review_stale
  const prReviewStaleH = parseHours(input.config.stall.pr_review_stale)
  if (prReviewStaleH !== null) {
    for (const [pn, opened] of prOpenedById) {
      const mmrSince = input.replayEvents.find(
        (r) => r.source === 'mmr' && r.kind === 'job_completed' && r.ts > opened.ts,
      )
      if (mmrSince) continue
      const age = ageHours(now, opened.ts)
      if (age <= prReviewStaleH) continue
      out.push({
        signal: 'pr_review_stale',
        ref: { kind: 'pr', id: String(pn) },
        age_hours: round1(age),
        threshold_hours: prReviewStaleH,
        summary: `PR #${pn} has no completed MMR review in ${round1(age)}h`,
      })
    }
  }

  // blocker_unaddressed
  const blockerH = parseHours(input.config.stall.blocker_unaddressed)
  if (blockerH !== null) {
    for (const [taskId, blocker] of openBlockersByTask) {
      const age = ageHours(now, blocker.ts)
      if (age <= blockerH) continue
      const summary = (blocker.payload as { summary?: string }).summary ?? '(no summary)'
      out.push({
        signal: 'blocker_unaddressed',
        ref: { kind: 'task', id: taskId },
        age_hours: round1(age),
        threshold_hours: blockerH,
        summary: `${taskId} blocked ${round1(age)}h: ${summary}`,
      })
    }
  }

  // audit_findings_unresolved
  const findingsH = parseHours(input.config.stall.audit_findings_unresolved)
  const fixThreshold = input.fixThreshold ?? 'P2'
  if (findingsH !== null) {
    for (const f of input.findings) {
      if (f.status !== 'open') continue
      if (severityRank(f.severity) > severityRank(fixThreshold)) continue
      const age = ageHours(now, f.first_seen)
      if (age <= findingsH) continue
      out.push({
        signal: 'audit_findings_unresolved',
        ref: { kind: 'finding', id: f.id },
        age_hours: round1(age),
        threshold_hours: findingsH,
        summary: `${f.severity} finding [${f.id.slice(0, 8)}] open ${round1(age)}h: ${f.title}`,
      })
    }
  }

  // lens_skipped_repeatedly — streak ≥ 3
  for (const [lensId, streak] of Object.entries(input.lensSkippedStreaks)) {
    if (streak < 3) continue
    out.push({
      signal: 'lens_skipped_repeatedly',
      ref: { kind: 'lens', id: lensId },
      age_hours: 0,
      threshold_hours: 3,
      summary: `lens ${lensId} skipped for ${streak} consecutive audits`,
    })
  }

  return out
}
