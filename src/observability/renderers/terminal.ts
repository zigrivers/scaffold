import type { EngineOutput, Finding, Severity } from '../engine/types.js'
import { availabilityLine, needsAttentionLines } from './_lib.js'
import { scrubSecrets } from '../engine/redact.js'

export function renderProgressTerminal(out: EngineOutput): string {
  const lines: string[] = []
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  lines.push(
    `build observability — progress (last ${sinceHours}h · phase: ${out.snapshot?.current_phase ?? 'unknown'})`,
  )
  lines.push('')

  const banner = needsAttentionLines(out.needs_attention)
  if (banner.length > 0) {
    lines.push(...banner)
    lines.push('')
  }

  const snap = out.snapshot
  if (snap && snap.active_agents.length > 0) {
    lines.push(`active agents (${snap.active_agents.length})`)
    for (const a of snap.active_agents) {
      const taskBit = a.current_task
        ? ` · ${a.current_task.id ?? '(unplanned)'} ${a.current_task.title}`
        : ' · idle'
      const prBit = a.open_pr ? ` · PR #${a.open_pr.number}` : ''
      lines.push(`  ${a.actor_label}${taskBit}  branch ${a.branch}${prBit}`)
    }
    lines.push('')
  }
  if (snap && snap.in_flight.length > 0) {
    lines.push(`in flight (${snap.in_flight.length})`)
    for (const t of snap.in_flight) {
      const tid = t.task_id ?? '(unplanned)'
      lines.push(`  ${tid} ${t.task_title}  by ${t.by} · age ${t.age_hours}h · branch ${t.branch}`)
    }
    lines.push('')
  }
  if (snap && snap.completed_in_window.length > 0) {
    lines.push(`completed in window (${snap.completed_in_window.length})`)
    for (const c of snap.completed_in_window) {
      const pr = c.pr_number ? ` PR #${c.pr_number}` : ''
      lines.push(`  ✓ ${c.task_id ?? '(unplanned)'} ${c.task_title}${pr}  by ${c.by}`)
    }
    lines.push('')
  }
  if (snap && snap.recent_decisions.length > 0) {
    lines.push(`recent decisions (${snap.recent_decisions.length})`)
    for (const d of snap.recent_decisions.slice(0, 5)) {
      lines.push(`  ${d.key.padEnd(24).slice(0, 24)} ${d.summary}`)
    }
    lines.push('')
  }
  if (out.replay && out.replay.events.length > 0) {
    lines.push(`timeline (${out.replay.events.length} events · ${out.replay.window.from} – ${out.replay.window.to})`)
    for (const e of out.replay.events.slice(0, 50)) {
      const ts = e.ts.replace('T', ' ').replace(/:\d{2}\.\d+Z$/, '').replace(/Z$/, '')
      const actor = e.actor_label ? ` · ${e.actor_label}` : ''
      lines.push(`  ${ts}  ${e.source.padEnd(7)} ${e.kind.padEnd(20).slice(0, 20)} ${e.summary}${actor}`)
    }
    lines.push('')
  }

  lines.push(`availability: ${availabilityLine(out.availability)}`)
  lines.push('                              (✓ available  · ~ degraded  · — unavailable)')

  return scrubSecrets(lines.join('\n'))
}

const SEVERITY_LABEL: Record<Severity, string> = { P0: '[P0]', P1: '[P1]', P2: '[P2]', P3: '[P3]' }

export interface RenderAuditOptions {
  showAcknowledged?: boolean
}

export function renderAuditTerminal(out: EngineOutput, opts: RenderAuditOptions = {}): string {
  const lines: string[] = []
  const profile = out.invocation.args.profile ?? 'fast'
  const scope = out.invocation.args.scope ?? 'all'
  lines.push(`build observability — audit (profile: ${profile} · scope: ${scope})`)
  lines.push('')

  const visibleFindings: Finding[] = out.findings.filter((f) => {
    if (f.status === 'skipped') return false
    if (f.status === 'acknowledged' && !opts.showAcknowledged) return false
    return true
  })

  if (visibleFindings.length === 0) {
    lines.push('  no findings')
  } else {
    for (const f of visibleFindings) {
      const sev = SEVERITY_LABEL[f.severity] ?? `[${f.severity}]`
      const status = f.status !== 'open' ? ` (${f.status})` : ''
      lines.push(`  ${sev} ${f.title}${status}`)
      if (f.lens_id) lines.push(`       lens: ${f.lens_id}`)
      if (f.fix_hint) {
        lines.push(`       fix:  ${f.fix_hint.prompt}`)
      }
    }
  }
  lines.push('')

  const s = out.summary
  lines.push(`verdict: ${out.verdict}  (blocking: ${s.blocking}  acknowledged: ${s.acknowledged}  total: ${s.total})`)
  lines.push(`availability: ${availabilityLine(out.availability)}`)

  return scrubSecrets(lines.join('\n'))
}
