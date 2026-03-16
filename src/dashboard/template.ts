import type { DashboardData } from './generator.js'

export function buildTemplate(dataJson: string, data: DashboardData): string {
  const completedPct = data.progress.percentage
  const skippedPct = data.progress.total > 0
    ? Math.round(data.progress.skipped / data.progress.total * 100)
    : 0

  const icons: Record<string, string> = {
    completed: '&#10003;',
    skipped: '&#8594;',
    in_progress: '&#9679;',
    pending: '&#9675;',
  }

  const stepRows = data.steps.map(step => {
    const icon = icons[step.status] ?? '?'
    const statusClass = step.status.replace('_', '-')
    const name = escapeHtml(step.slug)
    return [
      `<div class="step-row status-${statusClass}">`,
      `<span class="step-icon">${icon}</span> `,
      `<span class="step-name">${name}</span></div>`,
    ].join('')
  }).join('\n')

  const decisionRows = data.decisions.map(d => {
    const prov = d.provisional
      ? ' <span class="provisional-badge">provisional</span>'
      : ''
    const id = escapeHtml(d.id)
    const step = escapeHtml(d.step)
    const decision = escapeHtml(d.decision)
    // eslint-disable-next-line max-len
    return `<div class="decision-row"><span class="decision-id">${id}</span> <span class="decision-step">[${step}]</span>${prov}: ${decision}</div>`
  }).join('\n')

  // Check if data is stale (older than 1 hour)
  const generatedAt = new Date(data.generatedAt)
  const ageMs = Date.now() - generatedAt.getTime()
  const staleHtml = [
    '<div id="stale-notice" class="stale-notice">',
    '&#9888; Data may be stale (generated more than 1 hour ago)',
    '</div>',
  ].join('')
  const staleNotice = ageMs > 3600000 ? staleHtml : ''

  const methodology = escapeHtml(data.methodology)
  const pct = data.progress.percentage

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scaffold Pipeline Dashboard</title>
<script id="scaffold-data" type="application/json">
${dataJson}
</script>
<style>
:root {
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-pending: #94a3b8;
  --color-skipped: #60a5fa;
  --color-bg: #ffffff;
  --color-text: #1e293b;
  --color-border: #e2e8f0;
  --max-width: 1200px;
}
[data-theme="dark"] {
  --color-bg: #0f172a;
  --color-text: #f1f5f9;
  --color-border: #334155;
}
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #0f172a; --color-text: #f1f5f9; --color-border: #334155; }
}
body {
  font-family: system-ui, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  margin: 0;
  padding: 16px;
}
.container { max-width: var(--max-width); margin: 0 auto; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.progress-bar {
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  margin: 16px 0;
  overflow: hidden;
}
.progress-completed { height: 100%; background: var(--color-success); float: left; }
.progress-skipped { height: 100%; background: var(--color-skipped); float: left; }
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.card { padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; text-align: center; }
.card-number { font-size: 2rem; font-weight: bold; }
.step-row { padding: 8px; border-bottom: 1px solid var(--color-border); }
.status-completed .step-icon { color: var(--color-success); }
.status-pending .step-icon { color: var(--color-pending); }
.status-in-progress .step-icon { color: var(--color-warning); }
.status-skipped .step-icon { color: var(--color-skipped); }
.stale-notice { background: #fef3c7; padding: 8px 16px; border-radius: 4px; margin-bottom: 16px; }
[data-theme="dark"] .stale-notice { background: #451a03; color: #fef3c7; }
.theme-toggle {
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border);
  padding: 6px 12px;
  border-radius: 6px;
  color: var(--color-text);
}
.section-heading { font-size: 1.25rem; font-weight: 600; margin: 24px 0 8px; }
.decision-row { padding: 8px; border-bottom: 1px solid var(--color-border); }
.decision-id { font-weight: bold; }
.provisional-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8em;
}
@media (max-width: 768px) { .summary-cards { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<script>
  const stored = localStorage.getItem('scaffold-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored || (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme')
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('scaffold-theme', next)
  }
</script>
<div class="container">
  <div class="header">
    <div>
      <h1>Scaffold Pipeline</h1>
      <div>Methodology: ${methodology} | ${pct}% complete</div>
    </div>
    <button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
  </div>
  ${staleNotice}
  <div class="progress-bar">
    <div class="progress-completed" style="width:${completedPct}%"></div>
    <div class="progress-skipped" style="width:${skippedPct}%"></div>
  </div>
  <div class="summary-cards">
    <div class="card">
      <div class="card-number">${data.progress.completed}</div>
      <div>Completed</div>
    </div>
    <div class="card">
      <div class="card-number">${data.progress.skipped}</div>
      <div>Skipped</div>
    </div>
    <div class="card">
      <div class="card-number">${data.progress.pending}</div>
      <div>Pending</div>
    </div>
    <div class="card">
      <div class="card-number">${data.progress.inProgress}</div>
      <div>In Progress</div>
    </div>
  </div>
  <div class="section-heading">Pipeline Steps</div>
  ${stepRows}
  <div class="section-heading">Decision Log</div>
  ${data.decisions.length > 0 ? decisionRows : '<div>No decisions recorded yet.</div>'}
</div>
</body>
</html>`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
