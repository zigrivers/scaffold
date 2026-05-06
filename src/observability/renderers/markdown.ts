import type { EngineOutput, AvailabilityMap, AdapterStatus, Finding, Severity } from '../engine/types.js'
import { scrubSecrets, sanitizePath } from '../engine/redact.js'

function fmtDate(iso: string): string {
  const d = new Date(iso); if (isNaN(d.valueOf())) return iso
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}
function header(out: EngineOutput, kind: 'Progress' | 'Audit'): string {
  const lines = [
    `# Build Observability — ${kind}`,
    '',
    `**Generated:** ${fmtDate(out.invocation.started_at)}`,
    `**Scaffold version:** ${out.invocation.scaffold_version}`,
  ]
  return lines.join('\n')
}

function availabilityTable(a: AvailabilityMap): string {
  const ord: (keyof AvailabilityMap)[] = ['git', 'gh', 'pipeline_docs', 'tests', 'state', 'beads', 'mmr', 'audit_history']
  const rows = ord.map((k) => {
    const s = a[k] as AdapterStatus
    const reason = s.reason ? sanitizePath(s.reason) : ''
    return `| ${k} | ${s.status} | ${reason} |`
  })
  return ['## Availability', '', '| Adapter | Status | Reason / Notes |', '|---|---|---|', ...rows].join('\n')
}

function ledgerSummary(a: AvailabilityMap): string {
  const lines = [
    '## Ledger',
    '',
    `- Events read: ${a.ledger.events_read}`,
    `- Malformed lines: ${a.ledger.malformed_lines}`,
    `- Sources:`,
    ...a.ledger.sources.map((s) => `  - \`${s.worktree_id}\` — ${s.events} events${s.harvested_at ? ` (harvested ${fmtDate(s.harvested_at)})` : ''}`),
  ]
  return lines.join('\n')
}

function activeAgentsSection(out: EngineOutput): string {
  const ag = out.snapshot?.active_agents ?? []
  if (ag.length === 0) return ''
  const rows = ag.map((a) => {
    const task = a.current_task ? `${a.current_task.id ?? '(unplanned)'} — ${a.current_task.title}` : 'idle'
    const pr = a.open_pr ? ` (PR #${a.open_pr.number})` : ''
    return `| ${a.actor_label} | ${a.branch} | ${task}${pr} |`
  })
  return ['## Active Agents', '', '| Actor | Branch | Current Task |', '|---|---|---|', ...rows].join('\n')
}

function completedSection(out: EngineOutput): string {
  const cs = out.snapshot?.completed_in_window ?? []
  if (cs.length === 0) return ''
  const rows = cs.map((c) => {
    const pr = c.pr_number ? `PR #${c.pr_number}` : '—'
    return `| ${c.task_id ?? '(unplanned)'} | ${c.task_title} | ${c.outcome} | ${pr} | ${c.by} |`
  })
  return ['## Completed in Window', '', '| Task | Title | Outcome | PR | By |', '|---|---|---|---|---|', ...rows].join('\n')
}

function inFlightSection(out: EngineOutput): string {
  const ts = out.snapshot?.in_flight ?? []
  if (ts.length === 0) return ''
  const rows = ts.map((t) => `| ${t.task_id} | ${t.task_title} | ${t.by} | ${t.age_hours}h | ${t.branch} |`)
  return ['## In Flight', '', '| Task | Title | By | Age | Branch |', '|---|---|---|---|---|', ...rows].join('\n')
}

function decisionsSection(out: EngineOutput): string {
  const ds = out.snapshot?.recent_decisions ?? []
  if (ds.length === 0) return ''
  const rows = ds.slice(0, 10).map((d) =>
    `| \`${d.key}\` | ${d.summary} | ${fmtDate(d.recorded_at)} | ${d.affects.length > 0 ? d.affects.join(', ') : '—'} |`)
  return ['## Recent Decisions', '', '| Key | Summary | Recorded | Affects |', '|---|---|---|---|', ...rows].join('\n')
}

export function renderProgressMarkdown(out: EngineOutput): string {
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  const windowEnd = fmtDate(out.invocation.started_at)
  const sections = [
    header(out, 'Progress'),
    '',
    `**Window:** last ${sinceHours} hours (ending ${windowEnd})`,
    `**Phase:** ${out.snapshot?.current_phase ?? '(unknown)'}`,
    '',
    activeAgentsSection(out),
    inFlightSection(out),
    completedSection(out),
    decisionsSection(out),
    availabilityTable(out.availability),
    '',
    ledgerSummary(out.availability),
  ].filter(Boolean)
  return scrubSecrets(sections.join('\n\n')) + '\n'
}

const SEVERITIES: Severity[] = ['P0', 'P1', 'P2', 'P3']

function summaryTable(out: EngineOutput): string {
  const rows = SEVERITIES.map((s) => {
    const total = out.summary.by_severity[s]
    const stat = out.summary.by_severity_status[s]
    const visible = stat.open
    return `| ${s} | ${total} | ${visible} | ${stat.acknowledged} |`
  })
  const hdr = [
    '## Summary',
    '',
    `${out.summary.total} findings · ${out.summary.blocking} blocking (severity at or above ${out.fix_threshold}) · ${out.summary.acknowledged} acknowledged · ${out.summary.skipped_lenses} skipped lenses.`,
    '',
    '| Severity | Total | Visible | Acknowledged |',
    '|---|---|---|---|',
    ...rows,
  ]
  return hdr.join('\n')
}

function findingSection(f: Finding): string {
  const idShort = f.id.slice(0, 8)
  const lines = [
    `### [${f.severity}] ${f.lens_id} — ${f.title}`,
    '',
    `\`${idShort}\` · *source:* \`${f.source_doc || '—'}\` · *confidence:* ${f.confidence}`,
    '',
    f.description,
    '',
    '**Evidence:**',
    '',
    '```json',
    JSON.stringify(f.evidence, null, 2),
    '```',
  ]
  if (f.fix_hint) {
    lines.push('', '**Fix hint:**', '', '```json', JSON.stringify(f.fix_hint, null, 2), '```')
  }
  return lines.join('\n')
}

function findingsSection(out: EngineOutput): string {
  const visible = out.findings.filter((f) => f.status !== 'acknowledged' && f.status !== 'skipped')
  if (visible.length === 0) return '## Findings\n\nNo open findings.'
  const grouped: string[] = ['## Findings']
  for (const sev of SEVERITIES) {
    const inSev = visible.filter((f) => f.severity === sev)
    if (inSev.length === 0) continue
    grouped.push('', `### Severity ${sev} (${inSev.length})`, '')
    for (const f of inSev) grouped.push(findingSection(f), '')
  }
  return grouped.join('\n')
}

function acknowledgedSection(out: EngineOutput): string {
  const acks = out.findings.filter((f) => f.status === 'acknowledged')
  if (acks.length === 0) return ''
  const rows = acks.map((f) => `| \`${f.id.slice(0, 8)}\` | ${f.severity} | ${f.lens_id} | ${f.title} | ${f.ack_note ?? ''} |`)
  return ['## Acknowledged', '', '| ID | Severity | Lens | Title | Note |', '|---|---|---|---|---|', ...rows].join('\n')
}

function skippedSection(out: EngineOutput): string {
  const skipped = out.findings.filter((f) => f.status === 'skipped')
  if (skipped.length === 0) return ''
  const rows = skipped.map((f) => `| ${f.lens_id} | ${(f.evidence as { reason?: string }).reason ?? '—'} |`)
  return ['## Skipped Lenses', '', '| Lens | Reason |', '|---|---|', ...rows].join('\n')
}

export function renderAuditMarkdown(out: EngineOutput): string {
  const args = out.invocation.args as { profile?: string; scope?: string }
  const sections = [
    header(out, 'Audit'),
    '',
    `**Verdict:** ${out.verdict}`,
    `**Profile:** ${args.profile ?? '?'}`,
    `**Scope:** ${args.scope ?? '?'}`,
    `**Fix threshold:** ${out.fix_threshold}`,
    '',
    summaryTable(out),
    findingsSection(out),
    acknowledgedSection(out),
    skippedSection(out),
    availabilityTable(out.availability),
  ].filter(Boolean)
  return scrubSecrets(sections.join('\n\n')) + '\n'
}
