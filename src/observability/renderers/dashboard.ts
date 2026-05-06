import type { EngineOutput, Verdict, Severity } from '../engine/types.js'
import { redactRendered } from '../engine/redact.js'

export function verdictToSeverityToken(v: Verdict): string {
  const map: Record<Verdict, string> = { blocked: '--sev-p0', 'degraded-pass': '--sev-p2', pass: '--sev-pass' }
  return map[v]
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SEVERITIES: Severity[] = ['P0', 'P1', 'P2', 'P3']

function needsAttentionAside(out: EngineOutput): string {
  if (out.needs_attention.length === 0) return ''
  const items = out.needs_attention.map((i) => {
    const ageStr = i.signal === 'lens_skipped_repeatedly' ? `${i.threshold_hours}× streak` : `${i.age_hours}h`
    return `<li><code>${escape(i.signal)}</code> ${escape(i.summary)} <span class="age">[${ageStr}]</span></li>`
  }).join('')
  return `<aside class="needs-attention"><h3>Needs Attention</h3><ul>${items}</ul></aside>`
}

function timelineDetails(out: EngineOutput): string {
  if (!out.replay || out.replay.events.length === 0) return ''
  const rows = out.replay.events.slice(0, 100).map((e) =>
    `<tr><td>${escape(e.ts)}</td><td>${escape(e.source)}</td><td>${escape(e.kind)}</td>` +
    `<td>${escape(e.summary)}</td></tr>`,
  ).join('')
  return `<details class="timeline"><summary>Timeline (${out.replay.events.length} events)</summary>` +
    '<table><thead><tr><th>Time</th><th>Source</th><th>Kind</th><th>Summary</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></details>`
}

export function renderProgressFragment(out: EngineOutput): string {
  const snap = out.snapshot
  const agents = (snap?.active_agents ?? []).map((a) => {
    const task = a.current_task
      ? `${escape(a.current_task.id ?? '(unplanned)')} — ${escape(a.current_task.title)}`
      : '<em>idle</em>'
    return `<li><code>${escape(a.actor_label)}</code> · ${escape(a.branch)} · ${task}</li>`
  }).join('') || '<li><em>none</em></li>'

  const decisions = (snap?.recent_decisions ?? []).slice(0, 5).map((d) =>
    `<li><code>${escape(d.key)}</code>: ${escape(d.summary)}</li>`,
  ).join('') || '<li><em>none</em></li>'

  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  const fragment = `<section id="build-progress" class="panel">
  <header>
    <h2>Build Progress</h2>
    <span class="meta">last ${sinceHours}h · phase: ${escape(snap?.current_phase ?? '(unknown)')}</span>
  </header>
  ${needsAttentionAside(out)}
  <div class="grid grid-2">
    <div class="card"><h3>Active Agents</h3><ul>${agents}</ul></div>
    <div class="card"><h3>Recent Decisions</h3><ul>${decisions}</ul></div>
  </div>
  ${timelineDetails(out)}
</section>`
  return redactRendered(fragment)
}

export function renderAuditFragment(out: EngineOutput): string {
  const args = out.invocation.args as { profile?: string; scope?: string }
  const findings = out.findings.filter((f) => f.status !== 'skipped' && f.status !== 'acknowledged')

  const threshIdx = SEVERITIES.indexOf(out.fix_threshold as Severity)
  const filterButtons = (['all', 'blocking', ...SEVERITIES] as const).map((f) => {
    const count = f === 'all' ? findings.length
      : f === 'blocking' ? findings.filter((fi) => SEVERITIES.indexOf(fi.severity) <= threshIdx).length
        : findings.filter((fi) => fi.severity === (f as Severity)).length
    return `<button data-filter="${escape(String(f))}">${escape(String(f))} (${count})</button>`
  }).join(' ')

  const findingItems = findings.length === 0
    ? '<p class="empty">No findings.</p>'
    : `<ol class="findings">${findings.map((f) => {
      const idShort = escape(f.id.slice(0, 8))
      const sevCls = `severity-${escape(f.severity)}`
      return `<li class="finding ${sevCls}" data-status="${escape(f.status)}" data-severity="${escape(f.severity)}">
          <header>
            <span class="badge" style="color: var(--sev-${f.severity.toLowerCase()})">${escape(f.severity)}</span>
            <code class="finding-id" title="run scaffold observe ack ${idShort} to acknowledge">${idShort}</code>
            <span class="lens">[${escape(f.lens_id)}]</span>
            <span class="title">${escape(f.title)}</span>
          </header>
          <p>${escape(f.description)}</p>
        </li>`
    }).join('')}</ol>`

  const verdictToken = verdictToSeverityToken(out.verdict)
  const metaText = `${out.summary.blocking} blocking · threshold ${escape(out.fix_threshold)}` +
    ` · profile=${escape(args.profile ?? '?')} scope=${escape(args.scope ?? '?')}`
  const fragment = '<section id="build-audit" class="panel"' +
    ` data-verdict="${escape(out.verdict)}" data-threshold="${escape(out.fix_threshold)}"` +
    ` style="--verdict-color: var(${verdictToken})">
  <header>
    <h2>Audit</h2>
    <span class="badge" style="color: var(${verdictToken})">${escape(out.verdict)}</span>
    <span class="meta">${metaText}</span>
  </header>
  <div class="finding-filters">${filterButtons}</div>
  ${findingItems}
</section>`
  return redactRendered(fragment)
}
