import type { CritiqueReport, ReconciledCritiqueItem } from '../types/critique.js'

export function formatCritiqueJson(report: CritiqueReport): string {
  return JSON.stringify(report, null, 2)
}

function renderItem(item: ReconciledCritiqueItem): string {
  const lines: string[] = []
  const srcs = item.sources.join(', ')
  lines.push(`  • [${item.kind} · ${item.agreement}] ${item.theme} — ${item.observation}`)
  if (item.recommendation) lines.push(`      ↳ ${item.recommendation}`)
  lines.push(`      sources: ${srcs}`)
  return lines.join('\n')
}

/**
 * Render the advisory critique report as text. Phase 1 groups items into
 * CONVERGENCE (consensus/majority — multiple models agreed) and PERSPECTIVES
 * (unique — one model raised it). There is deliberately no verdict or gate.
 * Phase 2 reshapes this into the split/crux + synthesis layout.
 */
export function formatCritiqueText(report: CritiqueReport): string {
  const out: string[] = []
  const channelCount = Object.keys(report.per_channel).length
  out.push(`CRITIQUE · ${report.artifact_source} · ${channelCount} channels · advisory (no gate)`)
  out.push('')

  const converged = report.items.filter((i) => i.agreement !== 'unique')
  const unique = report.items.filter((i) => i.agreement === 'unique')

  if (converged.length > 0) {
    out.push('CONVERGENCE — independent models agreed (high signal)')
    for (const item of converged) out.push(renderItem(item))
    out.push('')
  }

  if (unique.length > 0) {
    out.push('PERSPECTIVES — raised by a single model (worth considering)')
    for (const item of unique) out.push(renderItem(item))
    out.push('')
  }

  if (report.items.length === 0) {
    out.push('No critique items were returned.')
    out.push('')
  }

  out.push('CHANNELS')
  for (const [name, ch] of Object.entries(report.per_channel)) {
    const detail = ch.status === 'completed'
      ? `${ch.item_count} item(s)`
      : `${ch.status}${ch.recovery ? ` — ${ch.recovery}` : ''}`
    out.push(`  ${name}: ${detail}`)
  }
  out.push('')

  out.push('SUMMARY')
  out.push(`  ${report.summary}`)
  return out.join('\n')
}
