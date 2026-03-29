import type { DashboardData } from './generator.js'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* eslint-disable max-len */
export function buildTemplate(dataJson: string, data: DashboardData): string {
  const completedPct = data.progress.percentage
  const skippedPct = data.progress.total > 0
    ? Math.round(data.progress.skipped / data.progress.total * 100)
    : 0

  // Stale notice (server-side rendered)
  const generatedAt = new Date(data.generatedAt)
  const ageMs = Date.now() - generatedAt.getTime()
  const staleNotice = ageMs > 3600000
    ? [
      '<div id="stale-notice" class="stale-notice">',
      '&#9888; Data may be stale (generated more than 1 hour ago)',
      '</div>',
    ].join('')
    : ''

  // What's Next banner (server-side rendered)
  const whatsNextBanner = data.nextEligible
    ? [
      '<div class="whats-next" id="whats-next">',
      '  <div class="whats-next-label">What\'s Next</div>',
      `  <div class="whats-next-title">${escapeHtml(data.nextEligible.slug)}</div>`,
      data.nextEligible.summary
        ? `  <div class="whats-next-summary">${escapeHtml(data.nextEligible.summary)}</div>`
        : '',
      `  <div class="whats-next-desc">${escapeHtml(data.nextEligible.description)}</div>`,
      `  <code class="whats-next-cmd" onclick="copyCommand('${escapeHtml(data.nextEligible.command)}')">${escapeHtml(data.nextEligible.command)}</code>`,
      '</div>',
    ].filter(Boolean).join('\n')
    : ''

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
/* --- Dark theme (default) --- */
[data-theme="dark"] {
  --bg: #0f172a;
  --card-bg: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --faint: #64748b;
  --status-completed: #4ade80;
  --status-skipped: #818cf8;
  --status-in-progress: #fbbf24;
  --status-pending: #64748b;
  --accent: #6366f1;
  --accent-light: #818cf8;
  --modal-backdrop: rgba(0,0,0,0.6);
  --stale-bg: #451a03;
  --stale-text: #fef3c7;
  --badge-prov-bg: #451a03;
  --badge-prov-text: #fbbf24;
}

/* --- Light theme --- */
[data-theme="light"] {
  --bg: #f8fafc;
  --card-bg: #ffffff;
  --border: #e2e8f0;
  --text: #1e293b;
  --muted: #64748b;
  --faint: #94a3b8;
  --status-completed: #4ade80;
  --status-skipped: #818cf8;
  --status-in-progress: #fbbf24;
  --status-pending: #64748b;
  --accent: #6366f1;
  --accent-light: #818cf8;
  --modal-backdrop: rgba(0,0,0,0.4);
  --stale-bg: #fef3c7;
  --stale-text: #92400e;
  --badge-prov-bg: #fef3c7;
  --badge-prov-text: #92400e;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 24px;
  line-height: 1.5;
}

.container { max-width: 960px; margin: 0 auto; }

/* --- Header --- */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.header h1 { margin: 0 0 4px; font-size: 1.5rem; }
.header-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.methodology-badge {
  background: var(--accent);
  color: #fff;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}
.pct-label { color: var(--muted); font-size: 0.9rem; }
.theme-toggle {
  cursor: pointer;
  background: var(--card-bg);
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: 6px;
  color: var(--text);
  font-size: 0.85rem;
}
.theme-toggle:hover { border-color: var(--accent); }

/* --- Stale notice --- */
.stale-notice {
  background: var(--stale-bg);
  color: var(--stale-text);
  padding: 10px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

/* --- Progress bar --- */
.progress-bar {
  height: 10px;
  background: var(--border);
  border-radius: 5px;
  margin: 0 0 24px;
  overflow: hidden;
  display: flex;
}
.progress-completed { height: 100%; background: var(--status-completed); }
.progress-skipped { height: 100%; background: var(--status-skipped); }

/* --- Summary cards --- */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.card {
  background: var(--card-bg);
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: center;
}
.card-number { font-size: 2rem; font-weight: 700; }
.card-label { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.card-completed .card-number { color: var(--status-completed); }
.card-skipped .card-number { color: var(--status-skipped); }
.card-pending .card-number { color: var(--status-pending); }
.card-in-progress .card-number { color: var(--status-in-progress); }

/* --- What's Next banner --- */
.whats-next {
  background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
  border-left: 5px solid var(--accent-light);
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 28px;
  color: #fff;
}
.whats-next-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.85;
  margin-bottom: 4px;
}
.whats-next-title { font-size: 1.15rem; font-weight: 700; margin-bottom: 4px; }
.whats-next-summary { font-size: 0.9rem; opacity: 0.9; margin-bottom: 4px; }
.whats-next-desc { font-size: 0.85rem; opacity: 0.8; margin-bottom: 10px; }
.whats-next-cmd {
  display: inline-block;
  background: rgba(255,255,255,0.15);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}
.whats-next-cmd:hover { background: rgba(255,255,255,0.25); }

/* --- Phase sections --- */
.phase-section { margin-bottom: 16px; }
.phase-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}
.phase-header:hover { border-color: var(--accent); }
.phase-arrow {
  transition: transform 0.2s;
  font-size: 0.8rem;
  color: var(--muted);
}
.phase-arrow.collapsed { transform: rotate(-90deg); }
.phase-title { font-weight: 600; flex: 1; }
.phase-number {
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 600;
  min-width: 28px;
}
.count-pill {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.count-completed { background: var(--status-completed); color: #064e3b; }
.count-skipped { background: var(--status-skipped); color: #1e1b4b; }
.count-pending { background: var(--border); color: var(--muted); }
.count-in-progress { background: var(--status-in-progress); color: #451a03; }

.phase-description {
  padding: 8px 16px 4px;
  color: var(--muted);
  font-size: 0.85rem;
}
.phase-steps { padding: 4px 0 8px; }
.phase-steps.hidden, .phase-description.hidden { display: none; }

/* --- Step cards --- */
.step-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin: 4px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.step-card:hover { background: var(--card-bg); }
.step-icon { font-size: 1rem; flex-shrink: 0; width: 20px; text-align: center; }
.step-info { flex: 1; min-width: 0; }
.step-name { font-weight: 500; }
.step-summary { color: var(--muted); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step-meta { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.step-badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
}
.status-completed .step-icon { color: var(--status-completed); }
.status-skipped .step-icon { color: var(--status-skipped); }
.status-in-progress .step-icon { color: var(--status-in-progress); }
.status-pending .step-icon { color: var(--status-pending); }
.badge-completed { background: var(--status-completed); color: #064e3b; }
.badge-skipped { background: var(--status-skipped); color: #1e1b4b; }
.badge-in-progress { background: var(--status-in-progress); color: #451a03; }
.badge-pending { background: var(--border); color: var(--muted); }
.badge-conditional { background: var(--border); color: var(--faint); font-size: 0.65rem; }

/* --- Modal --- */
.modal-overlay {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--modal-backdrop);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal-overlay.visible { display: flex; }
.modal-dialog {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 680px;
  width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-header .step-icon { font-size: 1.3rem; }
.modal-header-info { flex: 1; }
.modal-header-info h2 { margin: 0; font-size: 1.15rem; }
.modal-header-info .modal-phase { color: var(--muted); font-size: 0.8rem; }
.modal-close {
  cursor: pointer;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.5rem;
  padding: 0 4px;
  line-height: 1;
}
.modal-close:hover { color: var(--text); }
.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}
.modal-summary { color: var(--muted); font-size: 0.9rem; margin-bottom: 16px; }
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}
.meta-item label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 2px;
  letter-spacing: 0.03em;
}
.meta-item .meta-value { font-size: 0.85rem; }
.prompt-section { margin-top: 16px; }
.prompt-toggle {
  cursor: pointer;
  background: none;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
}
.prompt-toggle:hover { border-color: var(--accent); }
.prompt-body {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  padding: 16px;
  margin-top: -1px;
  max-height: 300px;
  overflow-y: auto;
}
.prompt-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--text);
}
.prompt-body.hidden { display: none; }
.cmd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 14px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border);
}
.cmd-row code { flex: 1; font-size: 0.85rem; }
.cmd-copy {
  cursor: pointer;
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.cmd-copy:hover { opacity: 0.9; }
.scaffold-hint {
  color: var(--faint);
  font-size: 0.75rem;
  margin-top: 12px;
}

/* --- Decisions --- */
.decisions-section { margin-top: 32px; }
.decisions-header {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  padding: 12px 0;
}
.decisions-header h2 { margin: 0; font-size: 1.1rem; }
.decisions-arrow {
  transition: transform 0.2s;
  font-size: 0.8rem;
  color: var(--muted);
}
.decisions-arrow.collapsed { transform: rotate(-90deg); }
.decisions-count {
  font-size: 0.75rem;
  background: var(--border);
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 10px;
}
.decisions-body.hidden { display: none; }
.decision-entry {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.decision-step-tag {
  color: var(--accent-light);
  font-weight: 600;
  margin-right: 6px;
}
.decision-text { color: var(--text); }
.decision-meta { color: var(--faint); font-size: 0.75rem; margin-top: 2px; }
.provisional-badge {
  background: var(--badge-prov-bg);
  color: var(--badge-prov-text);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: 6px;
}

/* --- Footer --- */
.footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--faint);
  font-size: 0.75rem;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

/* --- Responsive --- */
@media (max-width: 768px) {
  .meta-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  body { padding: 16px; }
  .header { flex-direction: column; }
  .summary-cards { grid-template-columns: 1fr; }
  .step-card { flex-wrap: wrap; }
}

/* Body scroll lock when modal open */
body.modal-open { overflow: hidden; }
</style>
</head>
<body>
<script>
  var stored = localStorage.getItem('scaffold-theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
</script>
<div class="container">
  <div class="header">
    <div>
      <h1>Scaffold Pipeline</h1>
      <div class="header-meta">
        <span class="methodology-badge">${methodology}</span>
        <span class="pct-label">${pct}% complete</span>
      </div>
    </div>
    <button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
  </div>
  ${staleNotice}
  <div class="progress-bar">
    <div class="progress-completed" style="width:${completedPct}%"></div>
    <div class="progress-skipped" style="width:${skippedPct}%"></div>
  </div>
  <div class="summary-cards">
    <div class="card card-completed">
      <div class="card-number">${data.progress.completed}</div>
      <div class="card-label">Completed</div>
    </div>
    <div class="card card-skipped">
      <div class="card-number">${data.progress.skipped}</div>
      <div class="card-label">Skipped</div>
    </div>
    <div class="card card-pending">
      <div class="card-number">${data.progress.pending}</div>
      <div class="card-label">Pending</div>
    </div>
    <div class="card card-in-progress">
      <div class="card-number">${data.progress.inProgress}</div>
      <div class="card-label">In Progress</div>
    </div>
  </div>
  ${whatsNextBanner}
  <div id="phases"></div>
  <div id="decisions"></div>
  <div class="footer">
    <span>Generated ${escapeHtml(data.generatedAt)}</span>
    <span>Scaffold v${escapeHtml(data.scaffoldVersion)}</span>
  </div>
</div>
<div class="modal-overlay" id="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal-dialog">
    <div class="modal-header">
      <span class="step-icon" id="modal-icon"></span>
      <div class="modal-header-info">
        <h2 id="modal-title"></h2>
        <div class="modal-phase" id="modal-phase"></div>
      </div>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>
<script>
(function() {
  var icons = {
    completed: '&#10003;',
    skipped: '&#8594;',
    in_progress: '&#9679;',
    pending: '&#9675;'
  };

  var statusLabels = {
    completed: 'Completed',
    skipped: 'Skipped',
    in_progress: 'In Progress',
    pending: 'Pending'
  };

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('scaffold-theme', next);
  }
  window.toggleTheme = toggleTheme;

  function renderPhases(data) {
    var container = document.getElementById('phases');
    if (!container) return;
    var html = '';

    for (var i = 0; i < data.phases.length; i++) {
      var phase = data.phases[i];
      if (phase.counts.total === 0) continue;

      var allDone = (phase.counts.completed + phase.counts.skipped) === phase.counts.total;
      var collapsed = allDone;
      var arrowClass = 'phase-arrow' + (collapsed ? ' collapsed' : '');
      var stepsClass = 'phase-steps' + (collapsed ? ' hidden' : '');
      var descClass = 'phase-description' + (collapsed ? ' hidden' : '');

      html += '<div class="phase-section" id="phase-' + escapeHtml(phase.slug) + '">';
      html += '<div class="phase-header" onclick="togglePhase(\\'' + escapeHtml(phase.slug) + '\\')">';
      html += '<span class="' + arrowClass + '" id="arrow-' + escapeHtml(phase.slug) + '">&#9660;</span>';
      html += '<span class="phase-number">P' + phase.number + '</span>';
      html += '<span class="phase-title">' + escapeHtml(phase.displayName) + '</span>';

      if (phase.counts.completed > 0)
        html += '<span class="count-pill count-completed">' + phase.counts.completed + '</span>';
      if (phase.counts.skipped > 0)
        html += '<span class="count-pill count-skipped">' + phase.counts.skipped + '</span>';
      if (phase.counts.inProgress > 0)
        html += '<span class="count-pill count-in-progress">' + phase.counts.inProgress + '</span>';
      if (phase.counts.pending > 0)
        html += '<span class="count-pill count-pending">' + phase.counts.pending + '</span>';

      html += '</div>';
      html += '<div class="' + descClass + '" id="desc-' + escapeHtml(phase.slug) + '">' + escapeHtml(phase.description) + '</div>';
      html += '<div class="' + stepsClass + '" id="steps-' + escapeHtml(phase.slug) + '">';

      for (var j = 0; j < phase.steps.length; j++) {
        var step = phase.steps[j];
        var statusClass = 'status-' + step.status.replace('_', '-');
        var icon = icons[step.status] || '?';
        html += '<div class="step-card ' + statusClass + '" onclick="openModal(\\'' + escapeHtml(step.slug) + '\\')">';
        html += '<span class="step-icon">' + icon + '</span>';
        html += '<div class="step-info">';
        html += '<div class="step-name">' + escapeHtml(step.slug) + '</div>';
        if (step.summary) html += '<div class="step-summary">' + escapeHtml(step.summary) + '</div>';
        html += '</div>';
        html += '<div class="step-meta">';
        if (step.conditional)
          html += '<span class="step-badge badge-conditional">' + escapeHtml(step.conditional) + '</span>';
        html += '<span class="step-badge badge-' + step.status.replace('_', '-') + '">' + (statusLabels[step.status] || step.status) + '</span>';
        html += '</div>';
        html += '</div>';
      }

      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  function togglePhase(slug) {
    var steps = document.getElementById('steps-' + slug);
    var desc = document.getElementById('desc-' + slug);
    var arrow = document.getElementById('arrow-' + slug);
    if (!steps) return;
    var isHidden = steps.classList.contains('hidden');
    if (isHidden) {
      steps.classList.remove('hidden');
      if (desc) desc.classList.remove('hidden');
      if (arrow) arrow.classList.remove('collapsed');
    } else {
      steps.classList.add('hidden');
      if (desc) desc.classList.add('hidden');
      if (arrow) arrow.classList.add('collapsed');
    }
  }
  window.togglePhase = togglePhase;

  function findStep(data, slug) {
    for (var i = 0; i < data.steps.length; i++) {
      if (data.steps[i].slug === slug) return data.steps[i];
    }
    return null;
  }

  function openModal(slug) {
    var dataEl = document.getElementById('scaffold-data');
    if (!dataEl) return;
    var data = JSON.parse(dataEl.textContent || '{}');
    var step = findStep(data, slug);
    if (!step) return;

    var icon = icons[step.status] || '?';
    document.getElementById('modal-icon').innerHTML = icon;
    document.getElementById('modal-icon').className = 'step-icon status-' + step.status.replace('_', '-');
    document.getElementById('modal-title').textContent = step.slug;
    document.getElementById('modal-phase').textContent = step.phase ? ('Phase: ' + step.phase) : '';

    var body = '';
    if (step.summary) {
      body += '<div class="modal-summary">' + escapeHtml(step.summary) + '</div>';
    }

    body += '<div class="meta-grid">';
    body += '<div class="meta-item"><label>Status</label><div class="meta-value"><span class="step-badge badge-' + step.status.replace('_', '-') + '">' + (statusLabels[step.status] || step.status) + '</span></div></div>';
    body += '<div class="meta-item"><label>Completed</label><div class="meta-value">' + (step.completedAt ? formatDate(step.completedAt) : '&mdash;') + (step.depth != null ? ' (depth ' + step.depth + ')' : '') + '</div></div>';
    body += '<div class="meta-item"><label>Dependencies</label><div class="meta-value">' + (step.dependencies && step.dependencies.length > 0 ? step.dependencies.map(escapeHtml).join(', ') : 'None') + '</div></div>';
    body += '<div class="meta-item"><label>Outputs</label><div class="meta-value">' + (step.outputs && step.outputs.length > 0 ? step.outputs.map(escapeHtml).join(', ') : 'None') + '</div></div>';
    body += '</div>';

    if (step.metaPromptBody) {
      body += '<div class="prompt-section">';
      body += '<button class="prompt-toggle" onclick="togglePrompt()"><span id="prompt-arrow">&#9660;</span> Prompt Body</button>';
      body += '<div class="prompt-body" id="prompt-body"><pre>' + escapeHtml(step.metaPromptBody) + '</pre></div>';
      body += '</div>';
    }

    var cmd = '/scaffold ' + step.slug;
    body += '<div class="cmd-row"><code>' + escapeHtml(cmd) + '</code><button class="cmd-copy" id="copy-btn" onclick="copyCommand(\\'' + escapeHtml(cmd).replace(/'/g, "\\\\'") + '\\')"' + '>Copy</button></div>';
    body += '<div class="scaffold-hint">Run this command in Claude Code to execute this pipeline step.</div>';

    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-overlay').classList.add('visible');
    document.body.classList.add('modal-open');
  }
  window.openModal = openModal;

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
    document.body.classList.remove('modal-open');
  }
  window.closeModal = closeModal;

  function copyCommand(text) {
    navigator.clipboard.writeText(text).then(function() {
      var btn = document.getElementById('copy-btn');
      if (btn) {
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 1500);
      }
    });
  }
  window.copyCommand = copyCommand;

  function togglePrompt() {
    var body = document.getElementById('prompt-body');
    var arrow = document.getElementById('prompt-arrow');
    if (!body) return;
    var isHidden = body.classList.contains('hidden');
    if (isHidden) {
      body.classList.remove('hidden');
      if (arrow) arrow.innerHTML = '&#9660;';
    } else {
      body.classList.add('hidden');
      if (arrow) arrow.innerHTML = '&#9654;';
    }
  }
  window.togglePrompt = togglePrompt;

  function renderDecisions(data) {
    var container = document.getElementById('decisions');
    if (!container) return;

    if (!data.decisions || data.decisions.length === 0) {
      container.innerHTML = '<div class="decisions-section"><div class="decisions-header" onclick="toggleDecisions()"><span class="decisions-arrow collapsed" id="decisions-arrow">&#9660;</span><h2>Decision Log</h2><span class="decisions-count">0</span></div><div class="decisions-body hidden" id="decisions-body"><div style="padding:12px 0;color:var(--muted);font-size:0.85rem;">No decisions recorded yet.</div></div></div>';
      return;
    }

    var html = '<div class="decisions-section">';
    html += '<div class="decisions-header" onclick="toggleDecisions()">';
    html += '<span class="decisions-arrow collapsed" id="decisions-arrow">&#9660;</span>';
    html += '<h2>Decision Log</h2>';
    html += '<span class="decisions-count">' + data.decisions.length + '</span>';
    html += '</div>';
    html += '<div class="decisions-body hidden" id="decisions-body">';

    for (var i = 0; i < data.decisions.length; i++) {
      var d = data.decisions[i];
      html += '<div class="decision-entry">';
      html += '<span class="decision-step-tag">[' + escapeHtml(d.step) + ']</span>';
      html += '<span class="decision-text">' + escapeHtml(d.decision) + '</span>';
      if (d.provisional) html += '<span class="provisional-badge">provisional</span>';
      html += '<div class="decision-meta">' + escapeHtml(d.id) + ' &middot; ' + formatDate(d.timestamp) + '</div>';
      html += '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
  }

  function toggleDecisions() {
    var body = document.getElementById('decisions-body');
    var arrow = document.getElementById('decisions-arrow');
    if (!body) return;
    var isHidden = body.classList.contains('hidden');
    if (isHidden) {
      body.classList.remove('hidden');
      if (arrow) arrow.classList.remove('collapsed');
    } else {
      body.classList.add('hidden');
      if (arrow) arrow.classList.add('collapsed');
    }
  }
  window.toggleDecisions = toggleDecisions;

  // Stale check
  (function() {
    var dataEl = document.getElementById('scaffold-data');
    if (!dataEl) return;
    var data = JSON.parse(dataEl.textContent || '{}');
    if (data.generatedAt) {
      var age = Date.now() - new Date(data.generatedAt).getTime();
      if (age > 3600000) {
        var existing = document.getElementById('stale-notice');
        if (!existing) {
          var notice = document.createElement('div');
          notice.id = 'stale-notice';
          notice.className = 'stale-notice';
          notice.innerHTML = '&#9888; Data may be stale (generated more than 1 hour ago)';
          var container = document.querySelector('.container');
          if (container) container.insertBefore(notice, container.children[1]);
        }
      }
    }
  })();

  // Keyboard handler
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
  });

  // Init
  document.addEventListener('DOMContentLoaded', function() {
    var dataEl = document.getElementById('scaffold-data');
    if (!dataEl) return;
    var data = JSON.parse(dataEl.textContent || '{}');
    renderPhases(data);
    renderDecisions(data);
  });
})();
</script>
</body>
</html>`
}
/* eslint-enable max-len */
