import type { ReconciledResults } from '../types.js'

function verdictLabel(verdict: ReconciledResults['verdict']): string {
  switch (verdict) {
    case 'pass': return 'PASSED'
    case 'degraded-pass': return 'PASSED'
    case 'blocked': return 'BLOCKED'
    case 'needs-user-decision': return 'NEEDS DECISION'
    default: return 'UNKNOWN'
  }
}

export function formatMarkdown(results: ReconciledResults): string {
  const lines: string[] = []
  const gate = verdictLabel(results.verdict)

  lines.push(`## Multi-Model Review — ${gate}`)
  lines.push('')
  lines.push(
    `**Job:** ${results.job_id} | **Threshold:** ${results.fix_threshold}` +
    ` | **Elapsed:** ${results.metadata.total_elapsed}`,
  )
  lines.push('')

  if (results.reconciled_findings.length > 0) {
    lines.push('### Findings')
    lines.push('')
    lines.push('| Severity | Location | Description | Suggestion | Sources | Agreement |')
    lines.push('|----------|----------|-------------|------------|---------|-----------|')
    for (const f of results.reconciled_findings) {
      const src = f.sources.join(', ')
      const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
      const row = [
        f.severity, f.location, esc(f.description),
        esc(f.suggestion), src, f.agreement,
      ].map((c) => ` ${c} `).join('|')
      lines.push(`|${row}|`)
    }
    lines.push('')
  } else {
    lines.push('No findings.')
    lines.push('')
  }

  lines.push('### Channels')
  lines.push('')
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`- **${name}:** ${ch.status} (${ch.elapsed})`)
  }

  return lines.join('\n')
}
