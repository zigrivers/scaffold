import type { EngineOutput } from '../engine/types.js'
import { availabilityLine } from './_lib.js'
import { scrubSecrets } from '../engine/redact.js'

export function renderProgressTerminal(out: EngineOutput): string {
  const lines: string[] = []
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  lines.push(
    `build observability — progress (last ${sinceHours}h · phase: ${out.snapshot?.current_phase ?? 'unknown'})`,
  )
  lines.push('')

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
  lines.push(`availability: ${availabilityLine(out.availability)}`)
  lines.push('                              (✓ available  · ~ degraded  · — unavailable)')

  return scrubSecrets(lines.join('\n'))
}
