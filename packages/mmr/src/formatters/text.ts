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

export function formatText(results: ReconciledResults): string {
  const lines: string[] = []
  const gate = verdictLabel(results.verdict)

  lines.push(`MMR ${gate} — ${results.job_id}`)
  const chCount = `${results.metadata.channels_completed}/${results.metadata.channels_dispatched}`
  const segments = [
    `Threshold: ${results.fix_threshold}`,
  ]
  if (results.advisory_count > 0) {
    segments.push(`Advisory: ${results.advisory_count}`)
  }
  segments.push(
    `Channels: ${chCount}`,
    `Elapsed: ${results.metadata.total_elapsed}`,
  )
  lines.push(segments.join(' | '))
  if (results.trust_mode !== undefined) {
    const trust = [`Trust: ${results.trust_mode}`]
    if (results.proposed_config_change) trust.push('proposed .mmr.yaml change')
    if (results.proposed_acks && results.proposed_acks.length > 0) {
      trust.push(`proposed acks: ${results.proposed_acks.length}`)
    }
    lines.push(trust.join(' | '))
  }
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
  const DEGRADED = new Set(['not_installed', 'auth_failed', 'failed', 'timeout', 'skipped'])
  let anyDegraded = false
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`  ${name}: ${ch.status} (${ch.elapsed})`)
    if (DEGRADED.has(ch.status)) {
      anyDegraded = true
      if (ch.status === 'not_installed') {
        lines.push(`    → not installed — install it, or silence: mmr config disable ${name}`)
      } else if (ch.recovery) {
        lines.push(`    → ${ch.recovery}`)
      }
    }
  }
  if (anyDegraded) {
    lines.push('')
    lines.push('Some channels were unavailable — run `mmr config test` to diagnose install + auth.')
  }

  return lines.join('\n')
}
