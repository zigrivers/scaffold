import type { ReconciledResults } from '../types.js'

export function formatMarkdown(results: ReconciledResults): string {
  const lines: string[] = []
  const gate = results.gate_passed ? 'PASSED' : 'FAILED'

  lines.push(`## Multi-Model Review — ${gate}`)
  lines.push('')
  lines.push(`**Job:** ${results.job_id} | **Threshold:** ${results.fix_threshold} | **Elapsed:** ${results.metadata.total_elapsed}`)
  lines.push('')

  if (results.reconciled_findings.length > 0) {
    lines.push('### Findings')
    lines.push('')
    lines.push('| Severity | Location | Description | Suggestion | Sources | Agreement |')
    lines.push('|----------|----------|-------------|------------|---------|-----------|')
    for (const f of results.reconciled_findings) {
      lines.push(`| ${f.severity} | ${f.location} | ${f.description} | ${f.suggestion} | ${f.sources.join(', ')} | ${f.agreement} |`)
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
