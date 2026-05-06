import type { EngineOutput, Verdict, Severity } from '../engine/types.js'
import { redactRendered } from '../engine/redact.js'

export function verdictToSeverityToken(v: Verdict): string {
  return ({ blocked: '--sev-p0', 'degraded-pass': '--sev-p2', pass: '--sev-pass' } as Record<string, string>)[v] ?? '--sev-p3'
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

export function renderProgressFragment(out: EngineOutput): string {
  const snap = out.snapshot
  const agents = (snap?.active_agents ?? []).map((a) => {
    const task = a.current_task ? `${escape(a.current_task.id ?? '(unplanned)')} — ${escape(a.current_task.title)}` : '<em>idle</em>'
    return `<li><code>${escape(a.actor_label)}</code> · ${escape(a.branch)} · ${task}</li>`
  }).join('') || '<li><em>none</em></li>'

  const decisions = (snap?.recent_decisions ?? []).slice(0, 5).map((d) =>
    `<li><code>${escape(d.key)}</code>: ${escape(d.summary)}</li>`
  ).join('') || '<li><em>none</em></li>'

  const fragment = `<section id="build-progress" class="panel">
  <header>
    <h2>Build Progress</h2>
    <span class="meta">last 24h · phase: ${escape(snap?.current_phase ?? '(unknown)')}</span>
  </header>
  <div class="grid grid-2">
    <div class="card"><h3>Active Agents</h3><ul>${agents}</ul></div>
    <div class="card"><h3>Recent Decisions</h3><ul>${decisions}</ul></div>
  </div>
</section>`
  return redactRendered(fragment)
}

export function renderAuditFragment(out: EngineOutput): string {
  const args = out.invocation.args as { profile?: string; scope?: string }
  const findings = out.findings.filter((f) => f.status !== 'skipped')

  const filterButtons = (['all', 'blocking', ...SEVERITIES] as const).map((f) => {
    const count = f === 'all' ? out.summary.total
      : f === 'blocking' ? out.summary.blocking
      : out.summary.by_severity[f as Severity]
    return `<button data-filter="${escape(String(f))}">${escape(String(f))} (${count})</button>`
  }).join(' ')

  const findingItems = findings.length === 0
    ? '<p class="empty">No findings.</p>'
    : `<ol class="findings">${findings.map((f) => {
        const idShort = escape(f.id.slice(0, 8))
        return `<li class="finding severity-${escape(f.severity)}" data-status="${escape(f.status)}" data-severity="${escape(f.severity)}">
          <header>
            <span class="badge" style="color: var(--sev-${f.severity.toLowerCase()})">${escape(f.severity)}</span>
            <code class="finding-id" title="run scaffold observe ack ${idShort} to acknowledge">${idShort}</code>
            <span class="lens">[${escape(f.lens_id)}]</span>
            <span class="title">${escape(f.title)}</span>
          </header>
          <p>${escape(f.description)}</p>
        </li>`
      }).join('')}</ol>`

  const fragment = `<section id="build-audit" class="panel" data-verdict="${escape(out.verdict)}" style="--verdict-color: var(${verdictToSeverityToken(out.verdict)})">
  <header>
    <h2>Audit</h2>
    <span class="badge" style="color: var(${verdictToSeverityToken(out.verdict)})">${escape(out.verdict)}</span>
    <span class="meta">${out.summary.blocking} blocking · threshold ${escape(out.fix_threshold)} · profile=${escape(args.profile ?? '?')} scope=${escape(args.scope ?? '?')}</span>
  </header>
  <div class="finding-filters">${filterButtons}</div>
  ${findingItems}
</section>`
  return redactRendered(fragment)
}
