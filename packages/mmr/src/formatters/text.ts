import type { ReconciledResults } from '../types.js'

function verdictLabel(verdict: ReconciledResults['verdict']): string {
  switch (verdict) {
    case 'pass': return 'PASSED'
    case 'degraded-pass': return 'PASSED'
    case 'blocked': return 'BLOCKED'
    case 'needs-user-decision': return 'NEEDS DECISION'
  }
}

export function formatText(results: ReconciledResults): string {
  const lines: string[] = []
  const gate = verdictLabel(results.verdict)

  lines.push(`MMR ${gate} — ${results.job_id}`)
  const chCount = `${results.metadata.channels_completed}/${results.metadata.channels_dispatched}`
  lines.push(
    `Threshold: ${results.fix_threshold} | Channels: ${chCount}` +
    ` | Elapsed: ${results.metadata.total_elapsed}`,
  )
  lines.push('')

  if (results.reconciled_findings.length > 0) {
    lines.push(`Findings (${results.reconciled_findings.length}):`)
    lines.push('')
    for (const f of results.reconciled_findings) {
      lines.push(`  [${f.severity}] ${f.location}`)
      lines.push(`    ${f.description}`)
      if (f.suggestion) {
        lines.push(`    Suggestion: ${f.suggestion}`)
      }
      lines.push(`    Sources: ${f.sources.join(', ')} (${f.agreement})`)
      lines.push('')
    }
  } else {
    lines.push('No findings.')
  }

  lines.push('Channels:')
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`  ${name}: ${ch.status} (${ch.elapsed})`)
  }

  return lines.join('\n')
}
